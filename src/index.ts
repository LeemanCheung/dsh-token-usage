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
import { TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT } from './rpc.ts'
import { analyzeTrajectory } from './trajectory-analysis.ts'
import { analyzeTokenUsage } from './usage-analysis.ts'
import type {
  DailyTokenUsageRecord,
  ModelTokenUsageRecord,
  TokenUsageAnalysisInput,
  TokenUsageAnalysisModel,
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
} from './types.ts'

/** Cordis plugin name. */
export const name = 'token-usage-recorder'

/** Host services required for core projection registration and historical replay. */
export const inject = [
  'sessionProjections',
  'sessionProjectionCache',
  'sessionQuery',
  'sessions',
]

/** Budget RPC surface; trajectory-only services are resolved lazily per request. */
const auxiliaryPlugin = {
  name: 'token-usage-auxiliary',
  inject: ['settings', 'connection'],
  apply: installRpc,
}

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

/** Return whether one wire value is a plain JSON record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read one bounded string from a client wire record. */
function text(value: unknown, maximum: number, allowEmpty = false): string | undefined {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0) ? value : undefined
}

/** Read one non-negative whole Token count from the client wire. */
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** Read exactly four detached Token buckets from the client wire. */
function usageFrom(payload: unknown): TokenUsageBuckets | undefined {
  if (!isRecord(payload)) return undefined
  const uncachedInputTokens = count(payload.uncachedInputTokens)
  const outputTokens = count(payload.outputTokens)
  const cacheReadTokens = count(payload.cacheReadTokens)
  const cacheWriteTokens = count(payload.cacheWriteTokens)
  if (uncachedInputTokens === undefined || outputTokens === undefined
    || cacheReadTokens === undefined || cacheWriteTokens === undefined) return undefined
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/** Read one detached model aggregate from the client wire. */
function modelUsageFrom(payload: unknown): ModelTokenUsageRecord | undefined {
  if (!isRecord(payload)) return undefined
  const provider = text(payload.provider, 256, true)
  const model = text(payload.model, 256, true)
  const assistantRequests = count(payload.assistantRequests)
  const compactionRequests = count(payload.compactionRequests)
  const usage = usageFrom(payload.usage)
  if (provider === undefined || model === undefined || assistantRequests === undefined || compactionRequests === undefined || usage === undefined) return undefined
  return { provider, model, assistantRequests, compactionRequests, usage }
}

/** Read one UTC calendar-day aggregate from the client wire. */
function dailyUsageFrom(payload: unknown): DailyTokenUsageRecord | undefined {
  if (!isRecord(payload)) return undefined
  const date = text(payload.date, 10)
  const usage = usageFrom(payload.usage)
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date) || usage === undefined) return undefined
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return undefined
  return { date, usage }
}

/** Read one model route selected from the server-provided integrated-model catalog. */
function modelSelectionFrom(payload: unknown): TokenUsageAnalysisModelSelection | undefined {
  if (!isRecord(payload)) return undefined
  const provider = text(payload.provider, 256)
  const model = text(payload.model, 256)
  return provider === undefined || model === undefined ? undefined : { provider, model }
}

/** Read and validate one trajectory-analysis request from the private wire. */
function trajectoryAnalysisRequest(payload: unknown): {
  sessionId: SessionId
  language: string
  model: TokenUsageAnalysisModelSelection
} | undefined {
  if (!isRecord(payload)) return undefined
  const sessionId = text(payload.sessionId, 256)
  const language = text(payload.language, 32)
  const model = modelSelectionFrom(payload.model)
  if (sessionId === undefined || language === undefined || model === undefined) return undefined
  return { sessionId: SessionId(sessionId), language, model }
}

/** Read and validate one aggregate-only Token usage analysis request. */
function usageAnalysisRequest(payload: unknown): {
  input: TokenUsageAnalysisInput
  language: string
  model: TokenUsageAnalysisModelSelection
} | undefined {
  if (!isRecord(payload)) return undefined
  const language = text(payload.language, 32)
  const model = modelSelectionFrom(payload.model)
  const input = payload.input
  if (language === undefined || model === undefined || !isRecord(input)) return undefined
  const usage = usageFrom(input.usage)
  const rawModels = input.models
  const rawDays = input.days
  if (usage === undefined || !Array.isArray(rawModels) || rawModels.length > 512 || !Array.isArray(rawDays) || rawDays.length > 3_660) {
    return undefined
  }
  const models = rawModels.map(modelUsageFrom)
  const days = rawDays.map(dailyUsageFrom)
  if (models.some(model => model === undefined) || days.some(day => day === undefined)) return undefined
  return {
    language,
    model,
    input: {
      usage,
      models: models as ModelTokenUsageRecord[],
      days: days as DailyTokenUsageRecord[],
    },
  }
}

/** List every registered model the user may explicitly select for an auxiliary analysis. */
async function analysisModels(ctx: Pick<Context, 'llm' | 'logger'>): Promise<TokenUsageAnalysisModel[]> {
  const groups = await Promise.all(ctx.llm.listProviders().map(async (provider) => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      return models.map(model => ({
        provider: provider.id,
        providerName: provider.name,
        model: model.id,
        modelName: model.name,
      }))
    } catch (error) {
      ctx.logger.warn(`token usage: failed to list analysis models for "${provider.id}": ${String(error)}`)
      return []
    }
  }))
  const seen = new Set<string>()
  return groups.flat()
    .filter(entry => {
      const key = `${entry.provider}\u0000${entry.model}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => left.providerName.localeCompare(right.providerName)
      || left.modelName.localeCompare(right.modelName)
      || left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model))
}

/** Return whether a user-selected route still belongs to the integrated-model catalog. */
function isKnownModel(models: readonly TokenUsageAnalysisModel[], selection: TokenUsageAnalysisModelSelection): boolean {
  return models.some(model => model.provider === selection.provider && model.model === selection.model)
}

/** Expose persistent preferences and explicit configured-model trajectory analysis to the local Web client. */
function installRpc(ctx: Context): void {
  const budget = ctx.settings.register(BUDGET_NAMESPACE, BudgetSettingsSchema)
  ctx.effect(() => {
    const lifecycle = new AbortController()
    const dispose = ctx.connection.rpc.handle(TOKEN_USAGE_RPC_CHANNEL, async (endpoint, payload, signal) => {
      const operationSignal = AbortSignal.any([signal, lifecycle.signal])
      switch (endpoint) {
      case TOKEN_USAGE_RPC_ENDPOINT.budgetRead:
        return { ok: true, value: budget.get() }
      case TOKEN_USAGE_RPC_ENDPOINT.budgetWrite: {
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
      case TOKEN_USAGE_RPC_ENDPOINT.analysisModels: {
        const llm = ctx.get('llm')
        if (llm === undefined) return rpcError('Analysis requires an available model service.')
        const models = await analysisModels({ llm, logger: ctx.logger })
        const defaultSelection = ctx.get('agentDefaultModel')?.currentSelection()
        return {
          ok: true,
          value: {
            models,
            ...defaultSelection !== undefined && isKnownModel(models, defaultSelection) ? {
              default: { provider: defaultSelection.provider, model: defaultSelection.model },
            } : {},
          },
        }
      }
      case TOKEN_USAGE_RPC_ENDPOINT.usageAnalyze: {
        const request = usageAnalysisRequest(payload)
        if (request === undefined) return rpcError('A valid aggregate Token usage payload, selected model, and language are required.')
        try {
          const llm = ctx.get('llm')
          if (llm === undefined) return rpcError('Usage analysis requires an available model service.')
          const models = await analysisModels({ llm, logger: ctx.logger })
          if (!isKnownModel(models, request.model)) return rpcError('Select one of the currently integrated models before starting analysis.')
          return {
            ok: true,
            value: await analyzeTokenUsage({ llm }, request.input, request.model, request.language, operationSignal),
          }
        } catch (error) {
          if (operationSignal.aborted) throw error
          return rpcError(error instanceof Error ? error.message : String(error))
        }
      }
      case TOKEN_USAGE_RPC_ENDPOINT.trajectoryAnalyze: {
        const request = trajectoryAnalysisRequest(payload)
        if (request === undefined) return rpcError('A valid session id, selected model, and language are required.')
        try {
          const llm = ctx.get('llm')
          if (llm === undefined) return rpcError('Trajectory analysis requires an available model service.')
          const models = await analysisModels({ llm, logger: ctx.logger })
          if (!isKnownModel(models, request.model)) return rpcError('Select one of the currently integrated models before starting analysis.')
          const live = ctx.sessions.get(request.sessionId)
          const persistence = live === undefined ? ctx.get('sessionPersistence') : undefined
          if (live === undefined && persistence === undefined) {
            return rpcError('Trajectory analysis cannot read cold sessions because persistence is unavailable.')
          }
          const events = live?.events
            ?? (await persistence!.inspect(request.sessionId, operationSignal)).events
          if (events.length === 0) return rpcError('This session has no trajectory events to analyze.')
          return {
            ok: true,
            value: await analyzeTrajectory(
              { llm },
              request.sessionId,
              events,
              request.model,
              request.language,
              operationSignal,
            ),
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
  ctx.plugin(auxiliaryPlugin)
  ctx.effect(() => {
    const controller = new AbortController()
    const operation = warmHistory(ctx, controller.signal)
    return async () => {
      controller.abort(new Error('token usage plugin disposed'))
      await operation
    }
  }, 'token usage: warm historical projections')
}
