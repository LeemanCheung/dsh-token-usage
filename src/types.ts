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
  usage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
}

/** Deterministic measurements extracted before model-driven trajectory review. */
export interface TrajectoryMetrics {
  eventCount: number
  includedEventCount: number
  omittedChunkEvents: number
  turnCount: number
  completedTurns: number
  failedTurns: number
  stepCount: number
  assistantRequests: number
  toolCalls: number
  toolErrors: number
  retries: number
  compactions: number
  approvalsAsked: number
  approvalsRejected: number
  subagents: number
  durationMs: number
  eventsPerMinute: number
  tokensPerMinute: number
  usage: TokenUsageBuckets
}

/** One ephemeral configured-model review of a bounded DSH session trajectory. */
export interface TrajectoryAnalysis {
  schema: 'dsh-token-usage/trajectory-analysis-v1'
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
