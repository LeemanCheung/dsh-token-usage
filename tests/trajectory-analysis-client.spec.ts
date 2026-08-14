import { describe, expect, it } from 'vitest'
import { trajectoryAnalysisOf } from '../src/client/trajectory-analysis-client.ts'

const baseReport = {
  schema: 'dsh-token-usage/trajectory-analysis-v1',
  sessionId: 'session-a',
  generatedAt: '2026-08-14T12:00:00.000Z',
  model: { provider: 'provider-a', model: 'model-a' },
  truncated: false,
  metrics: {
    eventCount: 10,
    includedEventCount: 8,
    omittedChunkEvents: 2,
    turnCount: 1,
    completedTurns: 1,
    failedTurns: 0,
    stepCount: 1,
    assistantRequests: 1,
    toolCalls: 1,
    toolErrors: 0,
    retries: 0,
    compactions: 0,
    approvalsAsked: 0,
    approvalsRejected: 0,
    subagents: 0,
    durationMs: 60_000,
    eventsPerMinute: 10,
    tokensPerMinute: 100,
    usage: { uncachedInputTokens: 60, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
  },
  report: '# Report',
}

describe('trajectory analysis client decoder', () => {
  it('defaults additive deterministic metrics from an older v1 Host to zero', () => {
    const decoded = trajectoryAnalysisOf(baseReport)

    expect(decoded?.metrics).toMatchObject({
      toolResults: 0,
      orphanToolCalls: 0,
      orphanToolResults: 0,
      averageToolLatencyMs: 0,
      maxToolLatencyMs: 0,
      modelSwitches: 0,
      openTurns: 0,
      openSteps: 0,
      activeDurationMs: 0,
      activeTokensPerMinute: 0,
    })
  })

  it('rejects malformed additive metric values at the wire boundary', () => {
    expect(trajectoryAnalysisOf({
      ...baseReport,
      metrics: { ...baseReport.metrics, orphanToolCalls: -1 },
    })).toBeUndefined()
  })
})
