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

  it('defaults pre-v3 compliance metrics and requires the complete v3 audit set', () => {
    expect(trajectoryAnalysisOf(report())?.metrics).toMatchObject({
      approvalsResolved: 0,
      approvalsAllowedOnce: 0,
      approvalsAllowedAlways: 0,
      approvalsCancelled: 0,
      approvalsUnavailable: 0,
      unresolvedApprovals: 0,
      orphanApprovalDecisions: 0,
    })
    const current = report()
    current.schema = 'dsh-token-usage/trajectory-analysis-v3'
    Object.assign(current.metrics, {
      approvalsResolved: 4,
      approvalsAllowedOnce: 1,
      approvalsAllowedAlways: 1,
      approvalsCancelled: 1,
      approvalsUnavailable: 1,
      unresolvedApprovals: 2,
      orphanApprovalDecisions: 1,
    })
    expect(trajectoryAnalysisOf(current)?.metrics).toMatchObject({
      approvalsResolved: 4,
      approvalsAllowedAlways: 1,
      unresolvedApprovals: 2,
      orphanApprovalDecisions: 1,
    })
    delete (current.metrics as Record<string, unknown>).approvalsResolved
    expect(trajectoryAnalysisOf(current)).toBeUndefined()
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

  it('rejects malformed timestamps or reliability metrics at the wire boundary', () => {
    const invalidDate = report()
    invalidDate.generatedAt = 'not-a-date'
    expect(trajectoryAnalysisOf(invalidDate)).toBeUndefined()
    const value = report()
    value.metrics.orphanToolCalls = -1
    expect(trajectoryAnalysisOf(value)).toBeUndefined()
  })

  it('rejects reconciliation status or deltas that contradict the bucket totals', () => {
    const value = report()
    value.metrics.reconciliation.delta.uncachedInputTokens = 1
    expect(trajectoryAnalysisOf(value)).toBeUndefined()
  })

  it('rejects reconciliation totals that disagree with canonical usage or decoded spans', () => {
    const providerMismatch = report()
    providerMismatch.metrics.usage.uncachedInputTokens = 11
    expect(trajectoryAnalysisOf(providerMismatch)).toBeUndefined()

    const spanMismatch = report()
    spanMismatch.metrics.reconciliation.status = 'mismatch'
    spanMismatch.metrics.reconciliation.attributedUsage.uncachedInputTokens = 9
    spanMismatch.metrics.reconciliation.delta.uncachedInputTokens = 1
    expect(trajectoryAnalysisOf(spanMismatch)).toBeUndefined()
  })

  it('requires the largest span id to reference a truly largest decoded span', () => {
    const omitted = report()
    delete (omitted.metrics as Partial<typeof omitted.metrics>).largestSpanId
    expect(trajectoryAnalysisOf(omitted)).toBeUndefined()

    const absent = report()
    absent.metrics.largestSpanId = 'model:missing'
    expect(trajectoryAnalysisOf(absent)).toBeUndefined()

    const smaller = report()
    smaller.metrics.spans.push({
      ...smaller.metrics.spans[0]!,
      id: 'model:2:1:0',
      seq: 2,
      turn: 2,
      usage: zero,
    })
    smaller.metrics.largestSpanId = 'model:2:1:0'
    expect(trajectoryAnalysisOf(smaller)).toBeUndefined()
  })

  it('rejects reports that omit reconciliation evidence', () => {
    const value = report()
    delete (value.metrics as Partial<typeof value.metrics>).reconciliation
    expect(trajectoryAnalysisOf(value)).toBeUndefined()
  })
})
