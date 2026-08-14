import type { DailyTokenUsageRecord, ModelTokenUsageRecord, TokenUsageBuckets } from '../types.ts'

/** Narrow aggregate-only source accepted by the privacy-safe export Module. */
export interface UsageExportSource {
  usage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
}

/** Versioned aggregate-only JSON document. */
export interface TokenUsageExportV1 {
  schema: 'dsh-token-usage/export-v1'
  generatedAt: string
  timezone: 'UTC'
  totals: TokenUsageBuckets
  models: ModelTokenUsageRecord[]
  days: DailyTokenUsageRecord[]
}

/** Browser download Adapter owned by the Client plugin registration. */
export interface DownloadPort {
  save(name: string, mime: string, content: string): void
}

/** Detached copy of one bucket object. */
function copyBuckets(usage: TokenUsageBuckets): TokenUsageBuckets {
  return {
    uncachedInputTokens: usage.uncachedInputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  }
}

/** Stable aggregate-only document that never accepts session data. */
export function tokenUsageExport(source: UsageExportSource, generatedAt: string): TokenUsageExportV1 {
  return {
    schema: 'dsh-token-usage/export-v1',
    generatedAt,
    timezone: 'UTC',
    totals: copyBuckets(source.usage),
    models: source.models
      .map(model => ({
        provider: model.provider,
        model: model.model,
        assistantRequests: model.assistantRequests,
        compactionRequests: model.compactionRequests,
        usage: copyBuckets(model.usage),
      }))
      .sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
    days: source.days
      .map(day => ({ date: day.date, usage: copyBuckets(day.usage) }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  }
}

/** Serialize the versioned aggregate-only export document. */
export function tokenUsageJson(source: UsageExportSource, generatedAt: string): string {
  return `${JSON.stringify(tokenUsageExport(source, generatedAt), null, 2)}\n`
}

/** Prevent spreadsheet applications from interpreting an untrusted cell as a formula. */
function spreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

/** Escape one scalar value as a CSV cell. */
function csvCell(value: number | string): string {
  const text = typeof value === 'string' ? spreadsheetText(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Encode a complete CSV table with a stable CRLF delimiter. */
function csv(rows: ReadonlyArray<ReadonlyArray<number | string>>): string {
  return `${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/** Export the daily aggregate buckets without session identity or conversation content. */
export function dailyUsageCsv(source: Pick<UsageExportSource, 'days'>): string {
  return csv([
    ['date', 'uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'inputTokens', 'totalTokens'],
    ...source.days
      .slice()
      .sort((left, right) => left.date.localeCompare(right.date))
      .map(day => [
        day.date,
        day.usage.uncachedInputTokens,
        day.usage.outputTokens,
        day.usage.cacheReadTokens,
        day.usage.cacheWriteTokens,
        day.usage.uncachedInputTokens + day.usage.cacheReadTokens + day.usage.cacheWriteTokens,
        day.usage.uncachedInputTokens + day.usage.cacheReadTokens + day.usage.cacheWriteTokens + day.usage.outputTokens,
      ]),
  ])
}

/** Export model aggregate buckets without session identity or conversation content. */
export function modelUsageCsv(source: Pick<UsageExportSource, 'models'>): string {
  return csv([
    ['provider', 'model', 'assistantRequests', 'compactionRequests', 'uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'inputTokens', 'totalTokens'],
    ...source.models
      .slice()
      .sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
      .map(model => [
        model.provider,
        model.model,
        model.assistantRequests,
        model.compactionRequests,
        model.usage.uncachedInputTokens,
        model.usage.outputTokens,
        model.usage.cacheReadTokens,
        model.usage.cacheWriteTokens,
        model.usage.uncachedInputTokens + model.usage.cacheReadTokens + model.usage.cacheWriteTokens,
        model.usage.uncachedInputTokens + model.usage.cacheReadTokens + model.usage.cacheWriteTokens + model.usage.outputTokens,
      ]),
  ])
}

/** Save text content through browser-native download primitives. */
export const browserDownload: DownloadPort = {
  save(name, mime, content) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
  },
}
