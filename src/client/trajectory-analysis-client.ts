/** Client decoder and loopback request for configured-model trajectory analysis. */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
  TrajectoryAnalysis,
  TrajectoryMetrics,
} from '../types.ts'
import { TOKEN_USAGE_RPC_CHANNEL } from './budget-controller.ts'

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

/** Decode deterministic analysis metrics returned by the Host. */
function metricsOf(value: unknown): TrajectoryMetrics | undefined {
  if (!isRecord(value)) return undefined
  const baseNumericKeys = [
    'eventCount', 'includedEventCount', 'omittedChunkEvents', 'turnCount', 'completedTurns', 'failedTurns',
    'stepCount', 'assistantRequests', 'toolCalls', 'toolErrors', 'retries', 'compactions', 'approvalsAsked',
    'approvalsRejected', 'subagents', 'durationMs', 'eventsPerMinute', 'tokensPerMinute',
  ] as const
  const extendedNumericKeys = [
    'toolResults', 'orphanToolCalls', 'orphanToolResults', 'averageToolLatencyMs', 'maxToolLatencyMs',
    'modelSwitches', 'openTurns', 'openSteps', 'activeDurationMs', 'activeTokensPerMinute',
  ] as const
  const validNumber = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
  if (!baseNumericKeys.every(key => validNumber(value[key]))) return undefined
  if (!extendedNumericKeys.every(key => value[key] === undefined || validNumber(value[key]))) return undefined
  const usage = bucketsOf(value.usage)
  if (usage === undefined) return undefined
  return {
    ...Object.fromEntries(baseNumericKeys.map(key => [key, value[key]])),
    ...Object.fromEntries(extendedNumericKeys.map(key => [key, value[key] ?? 0])),
    usage,
  } as unknown as TrajectoryMetrics
}

/** Decode one complete versioned trajectory report. */
export function trajectoryAnalysisOf(value: unknown): TrajectoryAnalysis | undefined {
  if (!isRecord(value)
    || value.schema !== 'dsh-token-usage/trajectory-analysis-v1'
    || typeof value.sessionId !== 'string'
    || typeof value.generatedAt !== 'string'
    || typeof value.truncated !== 'boolean'
    || typeof value.report !== 'string'
    || !isRecord(value.model)
    || typeof value.model.provider !== 'string'
    || typeof value.model.model !== 'string') return undefined
  const metrics = metricsOf(value.metrics)
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
    'trajectory/analyze',
    { sessionId, model, language },
    signal,
  )
  if (!result.ok) throw new Error(result.error.message)
  const analysis = trajectoryAnalysisOf(result.value)
  if (analysis === undefined) throw new Error('The Host returned an invalid trajectory analysis report.')
  return analysis
}
