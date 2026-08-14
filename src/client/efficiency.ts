/** Aggregate-only efficiency and attribution metrics for the Token dashboard. */

import type { ModelTokenUsageRecord, TokenUsageBuckets } from '../types.ts'

/** One route's stable share of all dashboard Tokens. */
export interface RouteContribution {
  provider: string
  model: string
  tokens: number
  share: number
}

/** Derived efficiency signals that never inspect session content. */
export interface UsageEfficiencyInsight {
  assistantAttempts: number
  compactionAttempts: number
  assistantTokens: number
  tokensPerAssistantAttempt: number | undefined
  compactionsPerHundredAssistantAttempts: number | undefined
  compactionTokenShare: number | undefined
  cacheReadInputShare: number | undefined
  cacheWriteInputShare: number | undefined
  uncachedInputShare: number | undefined
  outputToInputRatio: number | undefined
  unattributedTokenShare: number
  topRoutes: readonly RouteContribution[]
}

/** Return one full disjoint-bucket total. */
function totalTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Return the prompt-side total across uncached and cache buckets. */
function inputTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Identify legacy fallback rows with no source route attribution. */
function isUnattributed(model: ModelTokenUsageRecord): boolean {
  return model.provider === '' && model.model === ''
}

/** Derive request efficiency, compaction overhead, and stable top-route shares. */
export function usageEfficiencyInsight(
  usage: TokenUsageBuckets,
  compactionUsage: TokenUsageBuckets,
  models: readonly ModelTokenUsageRecord[],
): UsageEfficiencyInsight {
  const total = totalTokens(usage)
  const input = inputTokens(usage)
  const attributed = models.filter(model => !isUnattributed(model))
  const unattributedTokens = models
    .filter(isUnattributed)
    .reduce((sum, model) => sum + totalTokens(model.usage), 0)
  const assistantAttempts = attributed.reduce((sum, model) => sum + model.assistantRequests, 0)
  const compactionAttempts = attributed.reduce((sum, model) => sum + model.compactionRequests, 0)
  const assistantTokens = Math.max(0, total - totalTokens(compactionUsage))
  const topRoutes = attributed
    .map(model => ({
      provider: model.provider,
      model: model.model,
      tokens: totalTokens(model.usage),
    }))
    .sort((left, right) => right.tokens - left.tokens
      || left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model))
    .slice(0, 3)
    .map(route => ({ ...route, share: total === 0 ? 0 : route.tokens / total }))
  return {
    assistantAttempts,
    compactionAttempts,
    assistantTokens,
    tokensPerAssistantAttempt: assistantAttempts === 0 || unattributedTokens > 0
      ? undefined
      : assistantTokens / assistantAttempts,
    compactionsPerHundredAssistantAttempts: assistantAttempts === 0
      ? undefined
      : compactionAttempts / assistantAttempts * 100,
    compactionTokenShare: total === 0 ? undefined : totalTokens(compactionUsage) / total,
    cacheReadInputShare: input === 0 ? undefined : usage.cacheReadTokens / input,
    cacheWriteInputShare: input === 0 ? undefined : usage.cacheWriteTokens / input,
    uncachedInputShare: input === 0 ? undefined : usage.uncachedInputTokens / input,
    outputToInputRatio: input === 0 ? undefined : usage.outputTokens / input,
    unattributedTokenShare: total === 0 ? 0 : unattributedTokens / total,
    topRoutes,
  }
}
