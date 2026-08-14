/** Client decoder and loopback request for configured-model trajectory analysis. */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {
  SignedTokenUsageBuckets,
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
  TrajectoryAnalysis,
  TrajectoryMetrics,
  TrajectoryReconciliation,
  TrajectoryUsageSpan,
} from '../types.ts'
import { TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT } from '../rpc.ts'

/** Return whether a wire value is an object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Decode the plugin's four disjoint buckets. */
function bucketsOf(value: unknown): TokenUsageBuckets | undefined {
  if (!isRecord(value)) return undefined
  const keys = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
  if (!keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0)) return undefined
  return Object.fromEntries(keys.map(key => [key, value[key]])) as unknown as TokenUsageBuckets
}

/** Decode a signed bucket delta. */
function signedBucketsOf(value: unknown): SignedTokenUsageBuckets | undefined {
  if (!isRecord(value)) return undefined
  const keys = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
  if (!keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))) return undefined
  return Object.fromEntries(keys.map(key => [key, value[key]])) as unknown as SignedTokenUsageBuckets
}

/** Decode one metadata-only provider usage span. */
function spanOf(value: unknown): TrajectoryUsageSpan | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || (value.kind !== 'model' && value.kind !== 'compaction')
    || typeof value.seq !== 'number'
    || !Number.isSafeInteger(value.seq)
    || value.seq < 0
    || typeof value.provider !== 'string'
    || typeof value.model !== 'string'
    || !['open', 'completed', 'retried'].includes(String(value.status))
    || value.valueKind !== 'actual'
    || (value.finality !== 'provisional' && value.finality !== 'authoritative')) return undefined
  const usage = bucketsOf(value.usage)
  if (usage === undefined) return undefined
  const optionalNumber = (key: 'turn' | 'step' | 'attempt'): number | undefined => {
    const candidate = value[key]
    return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : undefined
  }
  if (['turn', 'step', 'attempt'].some(key => value[key] !== undefined && optionalNumber(key as 'turn' | 'step' | 'attempt') === undefined)) {
    return undefined
  }
  const turn = optionalNumber('turn')
  const step = optionalNumber('step')
  const attempt = optionalNumber('attempt')
  return {
    id: value.id,
    kind: value.kind,
    seq: value.seq,
    ...turn === undefined ? {} : { turn },
    ...step === undefined ? {} : { step },
    ...attempt === undefined ? {} : { attempt },
    provider: value.provider,
    model: value.model,
    status: value.status as TrajectoryUsageSpan['status'],
    valueKind: 'actual',
    finality: value.finality,
    usage,
  }
}

/** Decode the explicit provider-ledger reconciliation result. */
function reconciliationOf(value: unknown): TrajectoryReconciliation | undefined {
  if (!isRecord(value) || (value.status !== 'matched' && value.status !== 'mismatch')) return undefined
  const providerUsage = bucketsOf(value.providerUsage)
  const attributedUsage = bucketsOf(value.attributedUsage)
  const delta = signedBucketsOf(value.delta)
  return providerUsage === undefined || attributedUsage === undefined || delta === undefined ? undefined : {
    status: value.status,
    providerUsage,
    attributedUsage,
    delta,
  }
}

const BASE_METRIC_KEYS = [
  'eventCount', 'includedEventCount', 'omittedChunkEvents', 'turnCount', 'completedTurns', 'failedTurns',
  'stepCount', 'assistantRequests', 'toolCalls', 'toolErrors', 'retries', 'compactions', 'approvalsAsked',
  'approvalsRejected', 'subagents', 'durationMs', 'eventsPerMinute', 'tokensPerMinute',
] as const
const ADDITIVE_METRIC_KEYS = [
  'omittedContentEvents', 'toolResults', 'orphanToolCalls', 'orphanToolResults', 'averageToolLatencyMs',
  'maxToolLatencyMs', 'modelSwitches', 'openTurns', 'openSteps', 'activeDurationMs', 'activeTokensPerMinute',
] as const

/** Decode deterministic analysis metrics while tolerating older v1 additive fields. */
function metricsOf(value: unknown, legacy: boolean): TrajectoryMetrics | undefined {
  if (!isRecord(value)) return undefined
  const validNumber = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
  if (!BASE_METRIC_KEYS.every(key => validNumber(value[key]))) return undefined
  const additive: Record<string, number> = {}
  for (const key of ADDITIVE_METRIC_KEYS) {
    if (value[key] === undefined && legacy) additive[key] = 0
    else if (validNumber(value[key])) additive[key] = value[key]
    else return undefined
  }

  const usage = bucketsOf(value.usage)
  if (usage === undefined) return undefined
  const retryUsage = value.retryUsage === undefined && legacy
    ? { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    : bucketsOf(value.retryUsage)
  if (retryUsage === undefined) return undefined
  const rawSpans = value.spans === undefined && legacy ? [] : value.spans
  if (!Array.isArray(rawSpans)) return undefined
  const spans = rawSpans.map(spanOf)
  if (spans.some(span => span === undefined)
    || (value.largestSpanId !== undefined && typeof value.largestSpanId !== 'string')) return undefined

  const reconciliation = value.reconciliation === undefined && legacy
    ? {
        status: 'unavailable' as const,
        providerUsage: usage,
        attributedUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        delta: { ...usage },
      }
    : reconciliationOf(value.reconciliation)
  if (reconciliation === undefined) return undefined
  return {
    ...Object.fromEntries(BASE_METRIC_KEYS.map(key => [key, value[key]])),
    ...additive,
    usage,
    retryUsage,
    spans: spans as TrajectoryUsageSpan[],
    ...value.largestSpanId === undefined ? {} : { largestSpanId: value.largestSpanId },
    reconciliation,
  } as unknown as TrajectoryMetrics
}

/** Decode one complete versioned trajectory report. */
export function trajectoryAnalysisOf(value: unknown): TrajectoryAnalysis | undefined {
  if (!isRecord(value)
    || (value.schema !== 'dsh-token-usage/trajectory-analysis-v1'
      && value.schema !== 'dsh-token-usage/trajectory-analysis-v2')
    || typeof value.sessionId !== 'string'
    || typeof value.generatedAt !== 'string'
    || typeof value.truncated !== 'boolean'
    || typeof value.report !== 'string'
    || !isRecord(value.model)
    || typeof value.model.provider !== 'string'
    || typeof value.model.model !== 'string') return undefined
  const metrics = metricsOf(value.metrics, value.schema === 'dsh-token-usage/trajectory-analysis-v1')
  const auxiliary = value.analysisUsage === undefined ? undefined : bucketsOf(value.analysisUsage)
  if (metrics === undefined || (value.analysisUsage !== undefined && auxiliary === undefined)) return undefined
  return {
    schema: value.schema,
    sessionId: value.sessionId,
    generatedAt: value.generatedAt,
    model: { provider: value.model.provider, model: value.model.model },
    truncated: value.truncated,
    metrics,
    ...auxiliary === undefined ? {} : { analysisUsage: auxiliary },
    report: value.report,
  }
}

/** Request an ephemeral report from the Host through the loopback-only plugin channel. */
export async function requestTrajectoryAnalysis(
  connection: ConnectionHandle,
  sessionId: string,
  model: TokenUsageAnalysisModelSelection,
  language: string,
  signal: AbortSignal,
): Promise<TrajectoryAnalysis> {
  if (!connection.isLoopback) throw new Error('Trajectory analysis is available only from the local DSH page.')
  const result = await connection.rpc.call(
    TOKEN_USAGE_RPC_CHANNEL,
    TOKEN_USAGE_RPC_ENDPOINT.trajectoryAnalyze,
    { sessionId, model, language },
    signal,
  )
  if (!result.ok) throw new Error(result.error.message)
  const analysis = trajectoryAnalysisOf(result.value)
  if (analysis === undefined) throw new Error('The Host returned an invalid trajectory analysis report.')
  return analysis
}
