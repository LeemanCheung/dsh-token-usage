import type {
  DailyTokenUsageRecord,
  ModelTokenUsageRecord,
  PricedModelTokenUsageRecord,
  TokenUsageAnalysis,
  TokenUsageBuckets,
  TokenUsageCostSummary,
  TrajectoryAnalysis,
} from '../types.ts'
import { PUBLIC_PRICE_CATALOG_AS_OF, tokenUsageCostSummary } from '../pricing.ts'
import { safeModelMarkdown } from './report-safety.ts'

/** Narrow aggregate-only source accepted by the privacy-safe export Module. */
export interface UsageExportSource {
  usage: TokenUsageBuckets
  compactionUsage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
}

/** Versioned aggregate-only JSON document with exact compaction and partial public-rate pricing. */
export interface TokenUsageExportV2 {
  schema: 'dsh-token-usage/export-v2'
  generatedAt: string
  timezone: 'UTC'
  totals: TokenUsageBuckets
  compactionUsage: TokenUsageBuckets
  pricingCatalogAsOf: string
  pricing: TokenUsageCostSummary
  models: PricedModelTokenUsageRecord[]
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

/** Return a detached public-price estimate that never retains source aggregates. */
function copiedPricing(models: readonly ModelTokenUsageRecord[]): TokenUsageCostSummary {
  const summary = tokenUsageCostSummary(models)
  return {
    ...summary,
    models: summary.models.map(model => ({
      provider: model.provider,
      model: model.model,
      assistantRequests: model.assistantRequests,
      compactionRequests: model.compactionRequests,
      usage: copyBuckets(model.usage),
      ...model.totalCostUSD === undefined ? {} : { totalCostUSD: model.totalCostUSD },
      ...model.cacheReadSavingsUSD === undefined ? {} : { cacheReadSavingsUSD: model.cacheReadSavingsUSD },
      ...model.rate === undefined ? {} : { rate: { ...model.rate } },
    })),
  }
}

/** Stable aggregate-only document that never accepts session data. */
export function tokenUsageExport(source: UsageExportSource, generatedAt: string): TokenUsageExportV2 {
  const pricing = copiedPricing(source.models)
  return {
    schema: 'dsh-token-usage/export-v2',
    generatedAt,
    timezone: 'UTC',
    totals: copyBuckets(source.usage),
    compactionUsage: copyBuckets(source.compactionUsage),
    pricingCatalogAsOf: PUBLIC_PRICE_CATALOG_AS_OF,
    pricing,
    models: pricing.models
      .slice()
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
  const models = tokenUsageCostSummary(source.models).models
  return csv([
    ['provider', 'model', 'assistantRequests', 'compactionRequests', 'uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'inputTokens', 'totalTokens', 'estimatedCostUSD', 'cacheReadSavingsUSD', 'pricingCatalogAsOf'],
    ...models
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
        model.totalCostUSD ?? '',
        model.cacheReadSavingsUSD ?? '',
        model.rate?.asOf ?? '',
      ]),
  ])
}

/** Create a filesystem-safe UTC suffix without embedding session identity. */
export function analysisReportFilename(kind: 'usage' | 'trajectory', generatedAt: string): string {
  const timestamp = generatedAt.replaceAll(/[^0-9A-Za-z]+/g, '-').replaceAll(/^-|-$/g, '')
  return `dsh-${kind}-analysis-${timestamp}.md`
}

/** Serialize one aggregate analysis as a portable Markdown report. */
export function tokenUsageAnalysisMarkdown(analysis: TokenUsageAnalysis): string {
  const auxiliary = analysis.analysisUsage === undefined
    ? 'Unavailable'
    : String(analysis.analysisUsage.uncachedInputTokens
      + analysis.analysisUsage.outputTokens
      + analysis.analysisUsage.cacheReadTokens
      + analysis.analysisUsage.cacheWriteTokens)
  const output = analysis.analysisUsage === undefined ? 'Unavailable' : String(analysis.analysisUsage.outputTokens)
  return [
    '# DSH Token Usage Analysis',
    '',
    `- Generated: ${analysis.generatedAt}`,
    `- Model: ${analysis.model.provider}/${analysis.model.model}`,
    `- Analysis tokens: ${auxiliary}`,
    `- Model output tokens: ${output}`,
    '',
    '## Model Report',
    '',
    safeModelMarkdown(analysis.report),
    '',
  ].join('\n')
}

/** Serialize one trajectory analysis with deterministic technical-control evidence. */
export function trajectoryAnalysisMarkdown(analysis: TrajectoryAnalysis): string {
  const metrics = analysis.metrics
  const auxiliary = analysis.analysisUsage === undefined
    ? 'Unavailable'
    : String(analysis.analysisUsage.uncachedInputTokens
      + analysis.analysisUsage.outputTokens
      + analysis.analysisUsage.cacheReadTokens
      + analysis.analysisUsage.cacheWriteTokens)
  const output = analysis.analysisUsage === undefined ? 'Unavailable' : String(analysis.analysisUsage.outputTokens)
  return [
    '# DSH Session Trajectory Analysis',
    '',
    `- Generated: ${analysis.generatedAt}`,
    `- Model: ${analysis.model.provider}/${analysis.model.model}`,
    `- Analysis tokens: ${auxiliary}`,
    `- Model output tokens: ${output}`,
    `- Evidence truncated: ${analysis.truncated ? 'yes' : 'no'}`,
    '',
    '## Deterministic Audit Summary',
    '',
    '| Control | Evidence |',
    '| --- | ---: |',
    `| Approval closure | ${metrics.approvalsResolved}/${metrics.approvalsAsked} |`,
    `| Persistent approvals | ${metrics.approvalsAllowedAlways} |`,
    `| Rejected/cancelled/unavailable | ${metrics.approvalsRejected + metrics.approvalsCancelled + metrics.approvalsUnavailable} |`,
    `| Unresolved/orphan approval records | ${metrics.unresolvedApprovals}/${metrics.orphanApprovalDecisions} |`,
    `| Orphan tool calls/results | ${metrics.orphanToolCalls}/${metrics.orphanToolResults} |`,
    `| Open turns/steps | ${metrics.openTurns}/${metrics.openSteps} |`,
    `| Accounting reconciliation | ${metrics.reconciliation.status} |`,
    '',
    '> This is a metadata-based technical-control review, not legal advice or compliance certification.',
    '',
    '## Model Report',
    '',
    safeModelMarkdown(analysis.report),
    '',
  ].join('\n')
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
