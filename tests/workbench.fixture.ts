import { BuiltinEventType, SessionId, TurnId, StepId, ToolCallId, type SessionEvent, type SessionEventType, type EventDataOf } from '@deepseek-ai/dsh-session'
import { zero } from '../src/workbench/prices.ts'
import type { InsightSession } from '../src/workbench/insights.ts'

export const fixtureSessionId = SessionId('ses_00000000000000000000000000')
export const fixtureNow = Date.parse('2026-09-11T12:00:00Z')
export function workbenchEvents(count = 1): SessionEvent[] {
  const events: SessionEvent[] = []
  const push = <T extends SessionEventType>(type: T, data: EventDataOf<T>) => {
    events.push({ type, data, seq: events.length + 1, time: Date.parse('2026-09-10T12:00:00Z') + events.length * 1000, sessionId: fixtureSessionId, durability: 'persistent', version: 1 } as SessionEvent<T>)
  }
  push('session/create', { id: fixtureSessionId, parent: null, type: 'chat' })
  for (let index = 0; index < count; index++) {
    const turn = TurnId(index + 1), step = StepId(index + 1), call = ToolCallId(`tool-${index}`)
    push('turn/start', { turn, data: { message: 'SECRET_PROMPT_DO_NOT_EXPORT' } })
    push(BuiltinEventType.StepStart, { turn, step })
    push('step/llmStarted', { turn, step, provider: 'fixture-provider', model: 'fixture-model', purpose: 'response', requestId: `private-request-${index}` })
    push(BuiltinEventType.ContentAssistant, { turn, step, data: [{ type: 'tool-call', id: call, name: 'terminal', arguments: 'SECRET_TOOL_ARGUMENTS' }], usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 } })
    push(BuiltinEventType.ContentTool, { turn, call, output: { type: 'error-json', value: { secret: 'SECRET_TOOL_OUTPUT' } } })
    push(BuiltinEventType.StepUsage, { turn, step, provider: 'fixture-provider', model: 'fixture-model', purpose: 'response', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 } })
    push(BuiltinEventType.StepEnd, { turn, step })
    push('turn/end', { turn })
  }
  return events
}
export function insightFixture(id = String(fixtureSessionId), multiplier = 1): InsightSession {
  const usage = { ...zero(), uncachedInputTokens: 100 * multiplier, outputTokens: 20 * multiplier, cacheReadTokens: 50 * multiplier, cacheWriteTokens: 10 * multiplier }
  return { id, title: `PRIVATE TITLE ${id}`, usage, days: [{ date: '2026-09-10', usage }],
    models: [{ provider: 'fixture-provider', model: 'fixture-model', usage }], modelDays: [{ date: '2026-09-10', provider: 'fixture-provider', model: 'fixture-model', usage }],
    dailyUsageReliable: true, modelDailyUsageReliable: true }
}
