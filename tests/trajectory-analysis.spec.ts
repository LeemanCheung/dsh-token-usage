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
  event(5, 30_000, 'tool/result', {
    turn: 1,
    step: 1,
    message: { role: 'user', source: { kind: 'tool', callId: 'call-1' }, content: [] },
    error: { name: 'Error', code: 'FAILED' },
  }),
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
      toolResults: 1,
      toolErrors: 1,
      orphanToolCalls: 0,
      orphanToolResults: 0,
      averageToolLatencyMs: 15_000,
      maxToolLatencyMs: 15_000,
      retries: 1,
      approvalsAsked: 1,
      approvalsRejected: 1,
      subagents: 1,
      modelSwitches: 0,
      openTurns: 0,
      openSteps: 1,
      durationMs: 60_000,
      activeDurationMs: 60_000,
      eventsPerMinute: 11,
      tokensPerMinute: 155,
      activeTokensPerMinute: 155,
      usage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 5 },
    })
    expect(prepared.timeline).not.toContain('assistant/chunk')
    expect(prepared.timeline).toContain('<redacted>')
    expect(prepared.truncated).toBe(false)
  })

  it('detects route switches, orphaned tools, and unfinished lifecycle spans', () => {
    const prepared = prepareTrajectory([
      event(0, 0, 'request/context', { provider: 'first', model: 'model-a' }),
      event(1, 1_000, 'turn/start', { turn: 3 }),
      event(2, 2_000, 'step/start', { turn: 3, step: 1 }),
      event(3, 3_000, 'tool/call', { turn: 3, step: 1, callId: 'missing-result', name: 'read', arguments: '{}' }),
      event(4, 4_000, 'request/header', { header: { config: { provider: 'second', model: 'model-b' } } }),
      event(5, 5_000, 'tool/result', {
        turn: 3,
        step: 1,
        message: { role: 'user', source: { kind: 'tool', callId: 'missing-call' }, content: [] },
      }),
      event(6, 61_000, 'session/checkpoint', {}),
    ])

    expect(prepared.metrics).toMatchObject({
      modelSwitches: 1,
      toolCalls: 1,
      toolResults: 1,
      orphanToolCalls: 1,
      orphanToolResults: 1,
      averageToolLatencyMs: 0,
      maxToolLatencyMs: 0,
      openTurns: 1,
      openSteps: 1,
      activeDurationMs: 60_000,
    })
  })

  it('replaces streamed usage per attempt and retains failed retry costs', () => {
    const prepared = prepareTrajectory([
      event(0, 0, 'assistant/chunk', {
        turn: 1,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } },
      }),
      event(1, 10_000, 'assistant/chunk', {
        turn: 1,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: 120, outputTokens: 25 } },
      }),
      event(2, 20_000, 'llm/retry', { turn: 1, step: 1, retry: 1 }),
      event(3, 60_000, 'assistant/chunk', {
        turn: 1,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: 50, outputTokens: 10 } },
      }),
    ])

    expect(prepared.metrics.assistantRequests).toBe(2)
    expect(prepared.metrics.omittedChunkEvents).toBe(3)
    expect(prepared.metrics.usage).toEqual({
      uncachedInputTokens: 170,
      outputTokens: 35,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(prepared.metrics.tokensPerMinute).toBe(205)
  })

  it('redacts bearer, provider keys, JWTs, and sensitive JSON fields', () => {
    expect(redactTrajectoryText('Bearer abcdefghijkl sk-abcdefgh password=hunter2'))
      .toBe('Bearer <redacted> sk-<redacted> password=<redacted>')
    const prepared = prepareTrajectory([
      event(0, 0, 'tool/call', {
        turn: 1,
        step: 1,
        callId: 'call-secret',
        name: 'shell',
        arguments: JSON.stringify({
          OPENAI_API_KEY: 'openai-secret',
          'X-Api-Key': 'header-secret',
          inputTokens: 42,
          jwt: 'eyJabcdefgh.abcdefghij.abcdefghijk',
        }),
      }),
    ])
    expect(prepared.timeline).not.toContain('openai-secret')
    expect(prepared.timeline).not.toContain('header-secret')
    expect(prepared.timeline).not.toContain('eyJabcdefgh')
    expect(prepared.timeline).toContain('inputTokens')
    expect(prepared.timeline).toContain('42')
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
