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

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Provider usage, including ordinary assistant requests and compaction summaries. */
    tokenUsageRecorder: TokenUsageRecorderProjection
  }
}
