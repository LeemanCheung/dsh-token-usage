import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import {
  analyzeTrajectory,
  prepareTrajectory,
  redactTrajectoryText,
} from '../src/trajectory-analysis.ts'

function event(seq: number, time: number, type: string, data: Record<string, unknown>): SessionEvent {
  return { seq, time, type, data } as unknown as SessionEvent
}

const events = [
  event(0, 0, 'turn/start', { turn: 1 }),
  event(1, 2_000, 'step/start', { turn: 1, step: 1 }),
  event(2, 4_000, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'x' } }),
  event(3, 10_000, 'assistant/message', {
    turn: 1,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 5 },
  }),
  event(4, 15_000, 'tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"apiKey":"secret"}' }),
  event(5, 30_000, 'tool/result', { turn: 1, step: 1, error: { name: 'Error', code: 'FAILED' } }),
  event(6, 35_000, 'llm/retry', { turn: 1, step: 1, retry: 1 }),
  event(7, 40_000, 'approval/asked', { id: 'approval-1', toolName: 'bash' }),
  event(8, 45_000, 'approval/decided', { id: 'approval-1', outcome: 'rejected' }),
  event(9, 50_000, 'subagent/descriptor', { version: 2, mode: 'one-shot', provider: 'in-process' }),
  event(10, 60_000, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
]

describe('trajectory analysis', () => {
  it('extracts deterministic rates, failures, approvals, and bounded rows', () => {
    const prepared = prepareTrajectory(events)

    expect(prepared.metrics).toMatchObject({
      eventCount: 11,
      includedEventCount: 10,
      omittedChunkEvents: 1,
      turnCount: 1,
      completedTurns: 1,
      failedTurns: 0,
      stepCount: 1,
      assistantRequests: 1,
      toolCalls: 1,
      toolErrors: 1,
      retries: 1,
      approvalsAsked: 1,
      approvalsRejected: 1,
      subagents: 1,
      durationMs: 60_000,
      eventsPerMinute: 11,
      tokensPerMinute: 155,
      usage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 5 },
    })
    expect(prepared.timeline).not.toContain('assistant/chunk')
    expect(prepared.timeline).toContain('<redacted>')
    expect(prepared.truncated).toBe(false)
  })

  it('redacts common bearer, key, and password forms', () => {
    expect(redactTrajectoryText('Bearer abcdefghijkl sk-abcdefgh password=hunter2'))
      .toBe('Bearer <redacted> sk-<redacted> password=<redacted>')
  })

  it('uses the configured model through one prepared call and returns its usage', async () => {
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# Executive summary\nEvidence: seq 0-10.' }
      yield { type: 'usage' as const, usage: { inputTokens: 200, outputTokens: 40 } }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    })
    const prepareCall = vi.fn(async (config: { provider: string; model: string; maxTokens: number }) => ({
      config,
      retryPolicy: {},
      adapterDefaults: {},
      stream,
    }))
    const ctx = {
      agentDefaultModel: { currentSelection: () => ({ provider: 'configured', model: 'audit-model' }) },
      llm: { prepareCall },
    } as unknown as Context

    const result = await analyzeTrajectory(
      ctx,
      SessionId('session-a'),
      events,
      { provider: 'configured', model: 'audit-model' },
      'en',
      new AbortController().signal,
    )

    expect(prepareCall).toHaveBeenCalledWith({
      provider: 'configured',
      model: 'audit-model',
      maxTokens: 3_000,
    }, expect.any(AbortSignal))
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'configured',
      model: 'audit-model',
      sessionId: 'session-a',
      system: expect.stringContaining('Call chain and delegation'),
      messages: expect.any(Array),
    }))
    expect(result).toMatchObject({
      schema: 'dsh-token-usage/trajectory-analysis-v1',
      sessionId: 'session-a',
      model: { provider: 'configured', model: 'audit-model' },
      analysisUsage: { uncachedInputTokens: 200, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
      report: '# Executive summary\nEvidence: seq 0-10.',
    })
  })
})
