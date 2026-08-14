import { describe, expect, it } from 'vitest'
import { trajectoryAnalysisOf } from '../src/client/trajectory-analysis-client.ts'

const zero = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

function report() {
  return {
    schema: 'dsh-token-usage/trajectory-analysis-v2',
    sessionId: 'session-a',
    generatedAt: '2026-08-15T00:00:00.000Z',
    model: { provider: 'provider', model: 'model' },
    truncated: false,
    metrics: {
      eventCount: 2,
      includedEventCount: 2,
      omittedChunkEvents: 0,
      omittedContentEvents: 1,
      turnCount: 1,
      completedTurns: 1,
      failedTurns: 0,
      stepCount: 1,
      assistantRequests: 1,
      toolCalls: 0,
      toolResults: 0,
      toolErrors: 0,
      orphanToolCalls: 0,
      orphanToolResults: 0,
      averageToolLatencyMs: 0,
      maxToolLatencyMs: 0,
      retries: 0,
      compactions: 0,
      approvalsAsked: 0,
      approvalsRejected: 0,
      subagents: 0,
      modelSwitches: 0,
      openTurns: 0,
      openSteps: 0,
      durationMs: 1,
      activeDurationMs: 1,
      eventsPerMinute: 120_000,
      tokensPerMinute: 600_000,
      activeTokensPerMinute: 600_000,
      usage: { ...zero, uncachedInputTokens: 10 },
      retryUsage: zero,
      spans: [{
        id: 'model:1:1:0',
        kind: 'model',
        seq: 1,
        turn: 1,
        step: 1,
        attempt: 0,
        provider: 'provider',
        model: 'model',
        status: 'completed',
        valueKind: 'actual',
        finality: 'authoritative',
        usage: { ...zero, uncachedInputTokens: 10 },
      }],
      largestSpanId: 'model:1:1:0',
      reconciliation: {
        status: 'matched',
        providerUsage: { ...zero, uncachedInputTokens: 10 },
        attributedUsage: { ...zero, uncachedInputTokens: 10 },
        delta: zero,
      },
    },
    report: '# Resource summary',
  }
}

describe('trajectory analysis client decoder', () => {
  it('preserves metadata spans and reconciliation', () => {
    expect(trajectoryAnalysisOf(report())?.metrics).toMatchObject({
      omittedContentEvents: 1,
      largestSpanId: 'model:1:1:0',
      spans: [expect.objectContaining({ id: 'model:1:1:0', valueKind: 'actual' })],
      reconciliation: { status: 'matched', delta: zero },
    })
  })

  it('decodes an older v1 report with explicit unavailable reconciliation', () => {
    const legacy = report() as unknown as Record<string, unknown>
    legacy.schema = 'dsh-token-usage/trajectory-analysis-v1'
    const metrics = legacy.metrics as Record<string, unknown>
    for (const key of [
      'omittedContentEvents', 'toolResults', 'orphanToolCalls', 'orphanToolResults', 'averageToolLatencyMs',
      'maxToolLatencyMs', 'modelSwitches', 'openTurns', 'openSteps', 'activeDurationMs', 'activeTokensPerMinute',
      'retryUsage', 'spans', 'largestSpanId', 'reconciliation',
    ]) delete metrics[key]

    expect(trajectoryAnalysisOf(legacy)?.metrics).toMatchObject({
      omittedContentEvents: 0,
      toolResults: 0,
      retryUsage: zero,
      spans: [],
      reconciliation: { status: 'unavailable', providerUsage: { ...zero, uncachedInputTokens: 10 } },
    })
  })

  it('rejects malformed reliability metrics at the wire boundary', () => {
    const value = report()
    value.metrics.orphanToolCalls = -1
    expect(trajectoryAnalysisOf(value)).toBeUndefined()
  })

  it('rejects reports that omit reconciliation evidence', () => {
    const value = report()
    delete (value.metrics as Partial<typeof value.metrics>).reconciliation
    expect(trajectoryAnalysisOf(value)).toBeUndefined()
  })
})
