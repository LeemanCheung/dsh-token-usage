/** Loopback client for selecting an integrated model and analyzing aggregate Token usage. */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {
  TokenUsageAnalysis,
  TokenUsageAnalysisInput,
  TokenUsageAnalysisModel,
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
} from '../types.ts'
import { TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT } from '../rpc.ts'

/** One server-provided selectable-model catalog and its eligible default route. */
export interface TokenUsageAnalysisModelCatalog {
  models: readonly TokenUsageAnalysisModel[]
  default?: TokenUsageAnalysisModelSelection
}

/** Return whether a wire value is a JSON record. */
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

/** Decode one provider/model selector row owned by the Host catalog. */
function modelOf(value: unknown): TokenUsageAnalysisModel | undefined {
  if (!isRecord(value)
    || typeof value.provider !== 'string'
    || typeof value.providerName !== 'string'
    || typeof value.model !== 'string'
    || typeof value.modelName !== 'string'
    || value.provider.length === 0
    || value.model.length === 0) return undefined
  return {
    provider: value.provider,
    providerName: value.providerName,
    model: value.model,
    modelName: value.modelName,
  }
}

/** Decode a server-selected default only when it belongs to the model catalog. */
function selectionOf(value: unknown, models: readonly TokenUsageAnalysisModel[]): TokenUsageAnalysisModelSelection | undefined {
  if (!isRecord(value) || typeof value.provider !== 'string' || typeof value.model !== 'string') return undefined
  return models.some(entry => entry.provider === value.provider && entry.model === value.model)
    ? { provider: value.provider, model: value.model }
    : undefined
}

/** Decode the Host's selectable integrated-model catalog. */
export function analysisModelCatalogOf(value: unknown): TokenUsageAnalysisModelCatalog | undefined {
  if (!isRecord(value) || !Array.isArray(value.models)) return undefined
  const models = value.models.map(modelOf)
  if (models.some(model => model === undefined)) return undefined
  const available = models as TokenUsageAnalysisModel[]
  const defaultSelection = selectionOf(value.default, available)
  return defaultSelection === undefined
    ? { models: available }
    : { models: available, default: defaultSelection }
}

/** Decode one complete versioned aggregate Token usage report. */
export function tokenUsageAnalysisOf(value: unknown): TokenUsageAnalysis | undefined {
  if (!isRecord(value)
    || value.schema !== 'dsh-token-usage/usage-analysis-v1'
    || typeof value.generatedAt !== 'string'
    || typeof value.report !== 'string'
    || !isRecord(value.model)
    || typeof value.model.provider !== 'string'
    || typeof value.model.model !== 'string') return undefined
  const auxiliary = value.analysisUsage === undefined ? undefined : bucketsOf(value.analysisUsage)
  if (value.analysisUsage !== undefined && auxiliary === undefined) return undefined
  return {
    schema: value.schema,
    generatedAt: value.generatedAt,
    model: { provider: value.model.provider, model: value.model.model },
    ...auxiliary === undefined ? {} : { analysisUsage: auxiliary },
    report: value.report,
  }
}

/** Read every currently registered model route eligible for a manual analysis selection. */
export async function requestAnalysisModels(
  connection: ConnectionHandle,
  signal: AbortSignal,
): Promise<TokenUsageAnalysisModelCatalog> {
  if (!connection.isLoopback) throw new Error('AI analysis is available only from the local DSH page.')
  const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.analysisModels, {}, signal)
  if (!result.ok) throw new Error(result.error.message)
  const catalog = analysisModelCatalogOf(result.value)
  if (catalog === undefined) throw new Error('The Host returned an invalid integrated-model catalog.')
  return catalog
}

/** Analyze aggregate-only Token usage through the manually selected integrated model. */
export async function requestTokenUsageAnalysis(
  connection: ConnectionHandle,
  input: TokenUsageAnalysisInput,
  model: TokenUsageAnalysisModelSelection,
  language: string,
  signal: AbortSignal,
): Promise<TokenUsageAnalysis> {
  if (!connection.isLoopback) throw new Error('AI analysis is available only from the local DSH page.')
  const result = await connection.rpc.call(
    TOKEN_USAGE_RPC_CHANNEL,
    TOKEN_USAGE_RPC_ENDPOINT.usageAnalyze,
    { input, model, language },
    signal,
  )
  if (!result.ok) throw new Error(result.error.message)
  const analysis = tokenUsageAnalysisOf(result.value)
  if (analysis === undefined) throw new Error('The Host returned an invalid Token usage analysis report.')
  return analysis
}
