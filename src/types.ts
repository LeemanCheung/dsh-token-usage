/** Disjoint provider-reported token buckets. */
export interface TokenUsageBuckets {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Usage attributed to one provider/model route. */
export interface ModelTokenUsageRecord {
  provider: string
  model: string
  assistantRequests: number
  compactionRequests: number
  usage: TokenUsageBuckets
}

/** Token usage attributed to one UTC calendar date. */
export interface DailyTokenUsageRecord {
  /** Calendar date in YYYY-MM-DD form. */
  date: string
  usage: TokenUsageBuckets
}

/** Durable per-session usage record served to Host and Web projection consumers. */
export interface TokenUsageRecorderProjection {
  assistantRequests: number
  compactionRequests: number
  /** Exact provider-reported usage spent by context compaction summaries. */
  compactionUsage: TokenUsageBuckets
  usage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
}

/** Signed bucket delta used to expose accounting mismatches without normalization. */
export interface SignedTokenUsageBuckets {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** One provider-reported model or compaction usage node in a session trajectory. */
export interface TrajectoryUsageSpan {
  id: string
  kind: 'model' | 'compaction'
  seq: number
  turn?: number
  step?: number
  attempt?: number
  provider: string
  model: string
  status: 'open' | 'completed' | 'retried'
  valueKind: 'actual'
  finality: 'provisional' | 'authoritative'
  usage: TokenUsageBuckets
}

/** Comparison between the provider event ledger and attributed usage spans. */
export interface TrajectoryReconciliation {
  status: 'matched' | 'mismatch' | 'unavailable'
  providerUsage: TokenUsageBuckets
  attributedUsage: TokenUsageBuckets
  delta: SignedTokenUsageBuckets
}

/** Deterministic metadata-only measurements extracted before model-driven trajectory review. */
export interface TrajectoryMetrics {
  eventCount: number
  includedEventCount: number
  omittedChunkEvents: number
  omittedContentEvents: number
  turnCount: number
  completedTurns: number
  failedTurns: number
  stepCount: number
  assistantRequests: number
  toolCalls: number
  toolResults: number
  toolErrors: number
  orphanToolCalls: number
  orphanToolResults: number
  averageToolLatencyMs: number
  maxToolLatencyMs: number
  retries: number
  compactions: number
  approvalsAsked: number
  approvalsRejected: number
  subagents: number
  modelSwitches: number
  openTurns: number
  openSteps: number
  durationMs: number
  activeDurationMs: number
  eventsPerMinute: number
  tokensPerMinute: number
  activeTokensPerMinute: number
  usage: TokenUsageBuckets
  retryUsage: TokenUsageBuckets
  spans: readonly TrajectoryUsageSpan[]
  largestSpanId?: string
  reconciliation: TrajectoryReconciliation
}

/** One registered provider/model route the user may select for an auxiliary analysis. */
export interface TokenUsageAnalysisModel {
  provider: string
  providerName: string
  model: string
  modelName: string
}

/** A provider whose live model list could not be read; details remain in the Host log. */
export interface TokenUsageAnalysisCatalogFailure {
  provider: string
  providerName: string
}

/** Public USD rates per one million Tokens for one exact provider/model route. */
export interface TokenUsagePriceRate {
  currency: 'USD'
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion: number
  cacheWritePerMillion: number
  sourceUrl: string
  asOf: string
}

/** One model aggregate with matched public pricing, when its exact route is covered. */
export interface PricedModelTokenUsageRecord extends ModelTokenUsageRecord {
  totalCostUSD?: number
  /** Estimated public-rate savings from cache-read pricing versus uncached input pricing. */
  cacheReadSavingsUSD?: number
  rate?: TokenUsagePriceRate
}

/** One detached USD estimate and its explicit Token coverage. */
export interface TokenUsageCostSummary {
  currency: 'USD'
  totalCostUSD: number
  /** Estimated public-rate savings achieved by priced cache reads. */
  cacheReadSavingsUSD: number
  coveredTokens: number
  totalTokens: number
  coveredModels: number
  totalModels: number
  models: readonly PricedModelTokenUsageRecord[]
}

/** User-selected model route for one auxiliary analysis call. */
export interface TokenUsageAnalysisModelSelection {
  provider: string
  model: string
}

/** Aggregate Token fields sent to an on-demand usage-analysis model call. */
export interface TokenUsageAnalysisInput {
  usage: TokenUsageBuckets
  assistantRequests: number
  compactionRequests: number
  /** Exact aggregate provider usage consumed by context compaction. */
  compactionUsage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
}

/** One ephemeral configured-model review of aggregate Token usage. */
export interface TokenUsageAnalysis {
  schema: 'dsh-token-usage/usage-analysis-v1'
  generatedAt: string
  model: TokenUsageAnalysisModelSelection
  analysisUsage?: TokenUsageBuckets
  report: string
}

/** One ephemeral configured-model review of a bounded DSH session trajectory. */
export interface TrajectoryAnalysis {
  schema: 'dsh-token-usage/trajectory-analysis-v1' | 'dsh-token-usage/trajectory-analysis-v2'
  sessionId: string
  generatedAt: string
  model: { provider: string; model: string }
  truncated: boolean
  metrics: TrajectoryMetrics
  analysisUsage?: TokenUsageBuckets
  report: string
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Provider usage, including ordinary assistant requests and compaction summaries. */
    tokenUsageRecorder: TokenUsageRecorderProjection
  }
}
