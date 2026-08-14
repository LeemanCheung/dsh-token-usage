/** Host projection and history warm-up for persistent Token usage records. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-session'
import { tokenUsageRecorderProjectionDefinition } from './projection.ts'
import type {} from './types.ts'

/** Cordis plugin name. */
export const name = 'token-usage-recorder'

/** Host services required for projection registration and historical replay. */
export const inject = [
  'sessionProjections',
  'sessionProjectionCache',
  'sessionQuery',
  'sessions',
]

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
  ctx.effect(() => {
    const controller = new AbortController()
    const operation = warmHistory(ctx, controller.signal)
    return async () => {
      controller.abort(new Error('token usage plugin disposed'))
      await operation
    }
  }, 'token usage: warm historical projections')
}
