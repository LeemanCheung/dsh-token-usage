import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { zero } from '../src/workbench/prices.ts'
import type { InsightSession } from '../src/workbench/insights.ts'

export const fixtureSessionId = SessionId('ses_00000000000000000000000000')
export const fixtureNow = Date.parse('2026-09-11T12:00:00Z')
/** Synthetic wire events matching the pinned DSH version and the existing trajectory regression fixtures. */
export function workbenchEvents(count = 1): SessionEvent[] {
  const events: SessionEvent[] = []
  const push = (type: string, data: Record<string, unknown>) => {
    events.push({ type, data, seq: events.length + 1, time: Date.parse('2026-09-10T12:00:00Z') + events.length * 1000 } as unknown as SessionEvent)
  }
  const route = { provider: 'fixture-provider', model: 'fixture-model' }
  const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 }
  push('request/context', route)
  for (let index = 0; index < count; index++) {
    const turn = index + 1, step = index + 1, callId = `private-request-${index}`
    push('turn/start', { turn, data: { message: 'SECRET_PROMPT_DO_NOT_EXPORT' } })
    push('step/start', { turn, step })
    push('assistant/chunk', { turn, step, chunk: { type: 'usage', usage } })
    push('assistant/message', { turn, step, message: {
      role: 'assistant', content: [{ type: 'text', text: 'SECRET_ASSISTANT_BODY' }],
      source: { kind: 'model', ...route },
    }, usage })
    push('tool/call', { turn, step, callId, name: 'terminal', arguments: 'SECRET_TOOL_ARGUMENTS' })
    push('tool/result', { turn, step, message: {
      role: 'user', source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: 'SECRET_TOOL_OUTPUT' }], isError: true }],
    } })
    push('step/end', { turn, step })
    push('turn/end', { turn, reason: { kind: 'completed' } })
  }
  return events
}
export function insightFixture(id = String(fixtureSessionId), multiplier = 1): InsightSession {
  const usage = { ...zero(), uncachedInputTokens: 100 * multiplier, outputTokens: 20 * multiplier, cacheReadTokens: 50 * multiplier, cacheWriteTokens: 10 * multiplier }
  return { id, title: `PRIVATE TITLE ${id}`, usage, days: [{ date: '2026-09-10', usage }],
    models: [{ provider: 'fixture-provider', model: 'fixture-model', usage }], modelDays: [{ date: '2026-09-10', provider: 'fixture-provider', model: 'fixture-model', usage }],
    dailyUsageReliable: true, modelDailyUsageReliable: true }
}
