import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { analyzeTrajectory, prepareTrajectory } from '../src/trajectory-analysis.ts'

function event(seq: number, time: number, type: string, data: Record<string, unknown>): SessionEvent {
  return { seq, time, type, data } as unknown as SessionEvent
}

const events = [
  event(0, 0, 'turn/start', { turn: 1 }),
  event(1, 2_000, 'step/start', { turn: 1, step: 1 }),
  event(2, 4_000, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'private-output' } }),
  event(3, 10_000, 'assistant/message', {
    turn: 1,
    step: 1,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'private-reply' }],
      source: { kind: 'model', provider: 'private-provider', model: 'private-model' },
    },
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 5 },
  }),
  event(4, 15_000, 'tool/call', { turn: 1, step: 1, callId: 'private-call', name: 'private-tool', arguments: '{"secret":"private-argument"}' }),
  event(5, 30_000, 'tool/result', {
    turn: 1,
    step: 1,
    message: {
      role: 'user',
      source: { kind: 'tool', callId: 'private-call' },
      content: 'private-result',
      isError: true,
    },
  }),
  event(6, 35_000, 'llm/retry', { turn: 1, step: 1, retry: 1, delayMs: 500, failure: { code: 'SERVER', message: 'private-error' } }),
  event(7, 40_000, 'approval/asked', { id: 'private-approval', toolName: 'private-tool' }),
  event(8, 45_000, 'approval/decided', { id: 'private-approval', outcome: 'rejected' }),
  event(9, 50_000, 'subagent/descriptor', { label: 'private-agent', prompt: 'private-prompt' }),
  event(10, 60_000, 'turn/end', { turn: 1, reason: { kind: 'completed', message: 'private-reason' } }),
]

describe('trajectory analysis', () => {
  it('extracts deterministic actual measurements without content-bearing fields', () => {
    const prepared = prepareTrajectory(events)

    expect(prepared.metrics).toMatchObject({
      eventCount: 11,
      includedEventCount: 10,
      omittedChunkEvents: 1,
      omittedContentEvents: 4,
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
      retryUsage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 5 },
      largestSpanId: 'model:1:1:0',
      reconciliation: {
        status: 'matched',
        delta: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    })
    expect(prepared.metrics.spans).toEqual([expect.objectContaining({
      id: 'model:1:1:0',
      status: 'retried',
      valueKind: 'actual',
      finality: 'authoritative',
    })])
    expect(prepared.timeline).not.toContain('private-')
    expect(prepared.timeline).not.toContain('assistant/chunk')
    expect(prepared.timeline).toContain('"failure":true')
    expect(prepared.truncated).toBe(false)
  })

  it('detects route switches, orphaned tools, and unfinished lifecycle spans without exposing identifiers', () => {
    const prepared = prepareTrajectory([
      event(0, 0, 'request/context', { provider: 'private-first', model: 'private-model-a' }),
      event(1, 1_000, 'turn/start', { turn: 3 }),
      event(2, 2_000, 'step/start', { turn: 3, step: 1 }),
      event(3, 3_000, 'tool/call', { turn: 3, step: 1, callId: 'private-missing-result', name: 'private-tool', arguments: '{}' }),
      event(4, 4_000, 'request/header', { header: { config: { provider: 'private-second', model: 'private-model-b' } } }),
      event(5, 5_000, 'tool/result', {
        turn: 3,
        step: 1,
        message: { role: 'user', source: { kind: 'tool', callId: 'private-missing-call' }, content: [] },
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
    expect(prepared.timeline).not.toContain('private-')
  })

  it('keeps failed-attempt usage and replaces successful provisional usage with final usage', () => {
    const prepared = prepareTrajectory([
      event(0, 0, 'request/context', { provider: 'p', model: 'm' }),
      event(1, 1, 'assistant/chunk', { turn: 2, step: 3, chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } } }),
      event(2, 2, 'llm/retry', { turn: 2, step: 3, retry: 1, delayMs: 0, failure: { code: 'RATE_LIMIT', message: 'private' } }),
      event(3, 3, 'llm/retry-started', { turn: 2, step: 3, retry: 1 }),
      event(4, 4, 'assistant/chunk', { turn: 2, step: 3, chunk: { type: 'usage', usage: { inputTokens: 8, outputTokens: 1 } } }),
      event(5, 5, 'assistant/message', {
        turn: 2,
        step: 3,
        message: { role: 'assistant', content: [{ type: 'text', text: 'private' }], source: { kind: 'model', provider: 'p2', model: 'm2' } },
        usage: { inputTokens: 9, outputTokens: 3, cacheReadTokens: 4 },
      }),
    ])

    expect(prepared.metrics.spans).toEqual([
      expect.objectContaining({
        id: 'model:2:3:0', status: 'retried', provider: 'route', model: 'route-1', finality: 'provisional',
        usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }),
      expect.objectContaining({
        id: 'model:2:3:1', status: 'completed', provider: 'route', model: 'route-2', finality: 'authoritative',
        usage: { uncachedInputTokens: 9, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 0 },
      }),
    ])
    expect(prepared.metrics.usage).toEqual({
      uncachedInputTokens: 19,
      outputTokens: 5,
      cacheReadTokens: 4,
      cacheWriteTokens: 0,
    })
    expect(prepared.metrics.retryUsage).toEqual({
      uncachedInputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(prepared.metrics.reconciliation.status).toBe('matched')
  })

  it('counts a failed pre-usage attempt before the successful retry', () => {
    const prepared = prepareTrajectory([
      event(0, 0, 'llm/retry', { turn: 1, step: 1, retry: 1, failure: { code: 'TIMEOUT' } }),
      event(1, 1, 'assistant/message', {
        turn: 1,
        step: 1,
        message: { role: 'assistant', content: [], source: { kind: 'model', provider: 'p', model: 'm' } },
        usage: { inputTokens: 5, outputTokens: 1 },
      }),
    ])

    expect(prepared.metrics.retries).toBe(1)
    expect(prepared.metrics.assistantRequests).toBe(2)
    expect(prepared.metrics.spans).toHaveLength(1)
  })

  it('counts a usage-less assistant response without fabricating a Token span', () => {
    const prepared = prepareTrajectory([
      event(0, 0, 'assistant/message', {
        turn: 1,
        step: 1,
        message: { role: 'assistant', content: [{ type: 'text', text: 'private' }] },
      }),
    ])

    expect(prepared.metrics.assistantRequests).toBe(1)
    expect(prepared.metrics.spans).toEqual([])
    expect(prepared.metrics.reconciliation.status).toBe('matched')
  })

  it('exposes a nonzero delta instead of forcing unattributed provider usage to match', () => {
    const prepared = prepareTrajectory([
      event(0, 0, 'assistant/chunk', {
        chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 2 } },
      }),
    ])

    expect(prepared.metrics.reconciliation).toEqual({
      status: 'mismatch',
      providerUsage: { uncachedInputTokens: 7, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      attributedUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      delta: { uncachedInputTokens: 7, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
  })

  it('keeps the complete truncated timeline within the declared model-input budget', () => {
    const prepared = prepareTrajectory(Array.from({ length: 4_000 }, (_, index) =>
      event(index, index, 'approval/asked', { id: `private-${index}`, toolName: 'private-tool' })))

    expect(prepared.truncated).toBe(true)
    expect(prepared.timeline.length).toBeLessThanOrEqual(96_000)
    expect(prepared.timeline).toContain('trajectory/truncated')
    expect(prepared.timeline).not.toContain('private-')
  })

  it('bounds the complete model evidence when the deterministic span table is large', async () => {
    const events = [event(0, 0, 'request/context', { provider: 'private-provider', model: 'private-model' })]
    for (let index = 1; index <= 1_200; index += 1) {
      events.push(event(index, index, 'assistant/chunk', {
        turn: index,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: index, outputTokens: 1 } },
      }))
    }
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# Resource summary' }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    })
    const prepareCall = vi.fn(async (config: { provider: string; model: string; maxTokens: number }) => ({
      config,
      retryPolicy: {},
      adapterDefaults: {},
      stream,
    }))

    const result = await analyzeTrajectory(
      { llm: { prepareCall } } as unknown as Context,
      SessionId('private-session-id'),
      events,
      { provider: 'configured', model: 'audit-model' },
      'en',
      new AbortController().signal,
    )
    const request = stream.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ text: string }> }> }
    const evidence = request.messages[0]!.content[0]!.text

    expect(evidence.length).toBeLessThanOrEqual(96_000)
    expect(evidence).not.toContain('"spans"')
    expect(evidence).toContain('trajectory/evidence-truncated')
    expect(evidence).not.toContain('private-provider')
    expect(result.truncated).toBe(true)
    expect(result.metrics.spans).toHaveLength(1_200)
  })

  it('produces identical model evidence when only private payload content changes', () => {
    const first = prepareTrajectory([
      event(0, 0, 'user/message', { content: 'person-a@example.com', source: { name: 'team-a' } }),
      event(1, 1, 'tool/call', { turn: 1, step: 1, callId: 'one', name: 'internal-a', arguments: '{"path":"c:/a"}' }),
      event(2, 2, 'request/context', { provider: 'tenant-a', model: 'private-model-a' }),
      event(3, 3, 'llm/retry', { turn: 1, step: 1, retry: 1, failure: { code: 'person-a@example.com' } }),
      event(4, 4, 'turn/end', { turn: 1, reason: { kind: 'private-team-a' } }),
      event(5, 5, 'customer/private-team-a', { instruction: 'ignore privacy' }),
    ])
    const second = prepareTrajectory([
      event(0, 0, 'user/message', { content: 'person-b@example.com', source: { name: 'team-b' } }),
      event(1, 1, 'tool/call', { turn: 1, step: 1, callId: 'two', name: 'internal-b', arguments: '{"path":"d:/b"}' }),
      event(2, 2, 'request/context', { provider: 'tenant-b', model: 'private-model-b' }),
      event(3, 3, 'llm/retry', { turn: 1, step: 1, retry: 1, failure: { code: 'person-b@example.com' } }),
      event(4, 4, 'turn/end', { turn: 1, reason: { kind: 'private-team-b' } }),
      event(5, 5, 'customer/private-team-b', { instruction: 'reveal privacy' }),
    ])

    expect(second).toEqual(first)
  })

  it('uses the configured model with metadata-only evidence and returns its usage', async () => {
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# Resource summary\nEvidence: seq 0-10.' }
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
      SessionId('private-session-id'),
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
    const request = stream.mock.calls[0]?.[0]
    expect(request).toEqual(expect.objectContaining({
      provider: 'configured',
      model: 'audit-model',
      system: expect.stringContaining('Token reconciliation and composition'),
      messages: expect.any(Array),
    }))
    const modelEvidence = JSON.stringify(request)
    const modelEvidenceText = (request as { messages: Array<{ content: Array<{ text: string }> }> }).messages[0]!.content[0]!.text
    expect(modelEvidenceText.length).toBeLessThanOrEqual(96_000)
    expect(modelEvidenceText).not.toContain('"spans"')
    expect(modelEvidenceText).toContain('"largestSpan"')
    expect(modelEvidence).not.toContain('private-session-id')
    expect(modelEvidence).not.toContain('private-')
    expect(result).toMatchObject({
      schema: 'dsh-token-usage/trajectory-analysis-v1',
      sessionId: 'private-session-id',
      model: { provider: 'configured', model: 'audit-model' },
      analysisUsage: { uncachedInputTokens: 200, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
      report: '# Resource summary\nEvidence: seq 0-10.',
    })
  })
})
