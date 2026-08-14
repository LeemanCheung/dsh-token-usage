/** Host projection and history warm-up for persistent Token usage records. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import { TOKEN_USAGE_SETTINGS_NAMESPACE, type TokenUsageBudgetSettings } from './budget-settings.ts'
import { tokenUsageRecorderProjectionDefinition } from './projection.ts'
import { analyzeTrajectory } from './trajectory-analysis.ts'
import type {} from './types.ts'

/** Cordis plugin name. */
export const name = 'token-usage-recorder'

/** Host services required for projection registration and historical replay. */
export const inject = [
  'sessionProjections',
  'sessionProjectionCache',
  'sessionQuery',
  'sessions',
  'sessionPersistence',
  'settings',
  'connection',
  'llm',
  'agentDefaultModel',
]

const BUDGET_NAMESPACE = settingsNamespace(TOKEN_USAGE_SETTINGS_NAMESPACE)
const BudgetSettingsSchema: z<TokenUsageBudgetSettings> = z.object({
  rolling30DayBudget: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(0),
})

/** Read one safe whole-token budget from a client RPC payload. */
function budgetFrom(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const budget = (payload as { rolling30DayBudget?: unknown }).rolling30DayBudget
  return typeof budget === 'number' && Number.isSafeInteger(budget) && budget >= 0 ? budget : undefined
}

/** Build one standard internal error response for the private loopback channel. */
function rpcError(message: string) {
  return {
    ok: false as const,
    error: { code: 'internal' as const, message, details: {} },
  }
}

/** Build one settings-rejected response for an invalid budget preference. */
function budgetError(message: string) {
  return {
    ok: false as const,
    error: { code: 'settings-rejected' as const, message, details: { ns: BUDGET_NAMESPACE } },
  }
}

/** Read and validate one trajectory-analysis request from the private wire. */
function analysisRequest(payload: unknown): { sessionId: SessionId; language: string } | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const { sessionId, language } = payload as { sessionId?: unknown; language?: unknown }
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 256) return undefined
  if (typeof language !== 'string' || language.length === 0 || language.length > 32) return undefined
  return { sessionId: SessionId(sessionId), language }
}

/** Expose persistent preferences and explicit configured-model trajectory analysis to the local Web client. */
function installRpc(ctx: Context): void {
  const budget = ctx.settings.register(BUDGET_NAMESPACE, BudgetSettingsSchema)
  ctx.effect(() => {
    const lifecycle = new AbortController()
    const dispose = ctx.connection.rpc.handle('/token-usage', async (endpoint, payload, signal) => {
      const operationSignal = AbortSignal.any([signal, lifecycle.signal])
      switch (endpoint) {
      case 'budget/read':
        return { ok: true, value: budget.get() }
      case 'budget/write': {
        const rolling30DayBudget = budgetFrom(payload)
        if (rolling30DayBudget === undefined) {
          return budgetError('Budget must be a non-negative whole Token count.')
        }
        try {
          await budget.update({ rolling30DayBudget })
        } catch (error) {
          return budgetError(error instanceof Error ? error.message : String(error))
        }
        return { ok: true, value: budget.get() }
      }
      case 'trajectory/analyze': {
        const request = analysisRequest(payload)
        if (request === undefined) return rpcError('A valid session id and language are required.')
        try {
          const live = ctx.sessions.get(request.sessionId)
          const events = live?.events
            ?? (await ctx.sessionPersistence.inspect(request.sessionId, operationSignal)).events
          if (events.length === 0) return rpcError('This session has no trajectory events to analyze.')
          return {
            ok: true,
            value: await analyzeTrajectory(ctx, request.sessionId, events, request.language, operationSignal),
          }
        } catch (error) {
          if (operationSignal.aborted) throw error
          return rpcError(error instanceof Error ? error.message : String(error))
        }
      }
      default:
        return rpcError(`Unknown Token usage endpoint: ${endpoint}`)
      }
    }, { authority: 'loopback' })
    return async () => {
      lifecycle.abort(new Error('token usage plugin disposed'))
      await dispose()
    }
  }, 'token usage: private RPC')
}

/** Refresh one readable session without letting an operational failure stop later records or leave an attach race stale. */
async function warmRecord(ctx: Context, record: SessionRecord, signal: AbortSignal): Promise<void> {
  try {
    const live = ctx.sessions.get(record.header.id)
    if (live !== undefined) {
      await ctx.sessionProjectionCache.write(live)
    } else if (record.persisted) {
      await ctx.sessionProjectionCache.coldSnapshot(record.header.id, signal)
      if (signal.aborted) return
      const attached = ctx.sessions.get(record.header.id)
      if (attached !== undefined) await ctx.sessionProjectionCache.write(attached)
    }
  } catch (error) {
    if (signal.aborted) return
    ctx.logger.warn(`token usage: failed to refresh session "${record.header.id}": ${String(error)}`)
  }
}

/** Populate the new projection's cache sequentially without delaying plugin activation. */
async function warmHistory(ctx: Context, signal: AbortSignal): Promise<void> {
  let records: SessionRecord[]
  try {
    records = await ctx.sessionQuery.listSessions(signal)
  } catch (error) {
    if (signal.aborted) return
    ctx.logger.warn(`token usage: failed to list historical sessions: ${String(error)}`)
    return
  }

  for (const record of records) {
    if (signal.aborted) return
    await warmRecord(ctx, record, signal)
  }
}

/** Register the projection and start cancellable fail-soft history warming. */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(tokenUsageRecorderProjectionDefinition)
  installRpc(ctx)
  ctx.effect(() => {
    const controller = new AbortController()
    const operation = warmHistory(ctx, controller.signal)
    return async () => {
      controller.abort(new Error('token usage plugin disposed'))
      await operation
    }
  }, 'token usage: warm historical projections')
}
