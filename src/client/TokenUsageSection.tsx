import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ObservableSnapshot, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type {
  DailyTokenUsageRecord,
  ModelTokenUsageRecord,
  TokenUsageAnalysis,
  TokenUsageAnalysisInput,
  TokenUsageAnalysisModel,
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
  TokenUsageRecorderProjection,
  TrajectoryAnalysis,
} from '../types.ts'
import type { TokenUsageBudgetSnapshot } from './budget-controller.ts'
import { dailyContributors, periodInsight } from './analytics.ts'
import { dailyUsageCsv, modelUsageCsv, tokenUsageJson, type DownloadPort } from './export.ts'
import type { TokenUsageAnalysisModelCatalog } from './usage-analysis-client.ts'
import { NS } from './locales.ts'
import css from './TokenUsageSection.module.css'

interface TokenUsageSectionInjected {
  hooks: {
    budget: ObservableSnapshot<TokenUsageBudgetSnapshot>
  }
  setBudget(value: number): Promise<void>
  download: DownloadPort
  listAnalysisModels(signal: AbortSignal): Promise<TokenUsageAnalysisModelCatalog>
  analyzeTokenUsage(
    input: TokenUsageAnalysisInput,
    model: TokenUsageAnalysisModelSelection,
    signal: AbortSignal,
  ): Promise<TokenUsageAnalysis>
  analyzeTrajectory(
    sessionId: string,
    model: TokenUsageAnalysisModelSelection,
    signal: AbortSignal,
  ): Promise<TrajectoryAnalysis>
}

/** Full props assembled by the root-scoped Settings section renderer. */
export type TokenUsageSectionProps = PropsRuntime<'settings.section'>
  & PropsLocale<typeof NS>
  & InjectFace<TokenUsageSectionInjected>

interface SessionUsageRow {
  id: string
  title: string
  updatedAt: number
  usage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
}

interface DashboardData {
  usage: TokenUsageBuckets
  sessions: SessionUsageRow[]
  models: ModelTokenUsageRecord[]
  days: DailyTokenUsageRecord[]
}

type InsightRange = 7 | 30 | 90

type TrajectoryAnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; sessionId: string; title: string }
  | { status: 'ready'; title: string; value: TrajectoryAnalysis }
  | { status: 'error'; sessionId: string; title: string; message: string }

type AnalysisCatalogState =
  | { status: 'loading' }
  | { status: 'ready'; value: TokenUsageAnalysisModelCatalog }
  | { status: 'error'; message: string }

type TokenUsageAnalysisState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; value: TokenUsageAnalysis }
  | { status: 'error'; message: string }

/** Detached zero buckets for dashboard folds. */
function zeroBuckets(): TokenUsageBuckets {
  return {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

/** Add four disjoint token buckets. */
function addBuckets(left: TokenUsageBuckets, right: TokenUsageBuckets): TokenUsageBuckets {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  }
}

/** Stable UTC day key used by durable Host records and legacy fallbacks. */
function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** Prompt-side total across uncached input and cache traffic. */
export function inputTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Complete request/response total without double-counting reasoning output. */
export function totalTokens(usage: TokenUsageBuckets): number {
  return inputTokens(usage) + usage.outputTokens
}

/** Locale-aware exact integer formatting. */
function formatTokens(value: number): string {
  return new Intl.NumberFormat().format(value)
}

/** Compact a token count with a stable K/M/B suffix for dense dashboard cells. */
function formatCompactTokens(value: number): string {
  const unit = [
    { divisor: 1_000_000_000, suffix: 'B' },
    { divisor: 1_000_000, suffix: 'M' },
    { divisor: 1_000, suffix: 'K' },
  ].find(candidate => value >= candidate.divisor)
  if (unit === undefined) return formatTokens(value)
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value / unit.divisor)}${unit.suffix}`
}

/** Format deterministic tool latency for one compact metric card. */
function formatLatency(value: number): string {
  if (value < 1_000) return `${Math.round(value)}ms`
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value / 1_000)}s`
}

/** Whether a dashboard-only row contains usage whose model route is unavailable. */
function isUnattributed(model: ModelTokenUsageRecord): boolean {
  return model.provider === '' && model.model === ''
}

/** Stable provider/model identity for React lists and aggregation. */
function modelKey(model: Pick<ModelTokenUsageRecord, 'provider' | 'model'>): string {
  return JSON.stringify([model.provider, model.model])
}

/** Compact route label retained in the session table. */
function routeLabel(model: ModelTokenUsageRecord): string {
  return `${model.provider}/${model.model}`
}

/** Attribute a built-in projection fallback to an explicit dashboard remainder row. */
function unattributedModel(usage: TokenUsageBuckets): ModelTokenUsageRecord {
  return {
    provider: '',
    model: '',
    assistantRequests: 0,
    compactionRequests: 0,
    usage: { ...usage },
  }
}

/** Built-in projection fallback for a cache created before this plugin was installed. */
function fallbackUsage(value: TokenUsageProjection): TokenUsageBuckets {
  return {
    uncachedInputTokens: value.uncachedInputTokens,
    outputTokens: value.outputTokens,
    cacheReadTokens: value.cacheReadTokens,
    cacheWriteTokens: value.cacheWriteTokens,
  }
}

/** One session summary projected into a usage row, or null when it has no usage. */
function sessionRow(summary: SessionSummary): SessionUsageRow | null {
  const recorded: TokenUsageRecorderProjection | undefined = summary.projectionValues?.tokenUsageRecorder
  const builtIn = summary.projectionValues?.tokenUsage
  const usage = recorded?.usage ?? (builtIn === undefined ? undefined : fallbackUsage(builtIn))
  if (usage === undefined || totalTokens(usage) === 0) return null
  return {
    id: String(summary.id),
    title: summary.displayTitle,
    updatedAt: summary.updatedAt,
    usage,
    models: recorded?.models ?? [unattributedModel(usage)],
    days: recorded?.days ?? [{ date: dayKey(summary.updatedAt), usage }],
  }
}

/** Aggregate session summaries into totals and provider/model records. */
export function aggregateUsage(summaries: readonly SessionSummary[]): DashboardData {
  const sessions: SessionUsageRow[] = []
  const models = new Map<string, ModelTokenUsageRecord>()
  const days = new Map<string, TokenUsageBuckets>()
  let usage = zeroBuckets()

  for (const summary of summaries) {
    const row = sessionRow(summary)
    if (row === null) continue
    sessions.push(row)
    usage = addBuckets(usage, row.usage)
    for (const day of row.days) {
      days.set(day.date, addBuckets(days.get(day.date) ?? zeroBuckets(), day.usage))
    }
    for (const model of row.models) {
      const key = modelKey(model)
      const current = models.get(key)
      models.set(key, current === undefined ? {
        ...model,
        usage: { ...model.usage },
      } : {
        ...current,
        assistantRequests: current.assistantRequests + model.assistantRequests,
        compactionRequests: current.compactionRequests + model.compactionRequests,
        usage: addBuckets(current.usage, model.usage),
      })
    }
  }

  sessions.sort((left, right) => right.updatedAt - left.updatedAt)
  return {
    usage,
    sessions,
    models: [...models.values()].sort((left, right) =>
      totalTokens(right.usage) - totalTokens(left.usage)
      || left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model)),
    days: [...days.entries()]
      .map(([date, usage]): DailyTokenUsageRecord => ({ date, usage }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  }
}

/** Return only detached aggregate buckets, route records, and UTC dates for AI usage analysis. */
export function usageAnalysisInput(data: Pick<DashboardData, 'usage' | 'models' | 'days'>): TokenUsageAnalysisInput {
  return {
    usage: { ...data.usage },
    models: data.models.map(model => ({
      provider: model.provider,
      model: model.model,
      assistantRequests: model.assistantRequests,
      compactionRequests: model.compactionRequests,
      usage: { ...model.usage },
    })),
    days: data.days.map(day => ({ date: day.date, usage: { ...day.usage } })),
  }
}

/** Render a summary metric card with exact token counts available on hover. */
function Metric({ label, value }: { label: string; value: number | string }): ReactNode {
  const display = typeof value === 'number' ? formatCompactTokens(value) : value
  const exact = typeof value === 'number' ? formatTokens(value) : undefined
  return (
    <div className={css.metric}>
      <span>{label}</span>
      <strong {...exact === undefined ? {} : { title: exact }}>{display}</strong>
    </div>
  )
}

/** Render a compact table count with an exact-count tooltip. */
function TokenValue({ value }: { value: number }): ReactNode {
  return <span className={css.tokenValue} title={formatTokens(value)}>{formatCompactTokens(value)}</span>
}

interface ActivityDay {
  date: string
  usage: TokenUsageBuckets
  tokens: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/** Build exactly 30 Monday-first calendar weeks, including blank future days this week. */
function activityCalendar(days: readonly DailyTokenUsageRecord[], now = Date.now()): ActivityDay[] {
  const byDate = new Map(days.map(day => [day.date, day.usage]))
  const today = dayKey(now)
  const end = new Date(`${today}T00:00:00.000Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 29 * 7)

  const dates: string[] = []
  for (const cursor = new Date(start); dates.length < 30 * 7; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(dayKey(cursor.getTime()))
  }
  const maximum = Math.max(0, ...dates
    .filter(date => date <= today)
    .map(date => totalTokens(byDate.get(date) ?? zeroBuckets())))
  return dates.map((date) => {
    const future = date > today
    const usage = byDate.get(date) ?? zeroBuckets()
    const tokens = future ? 0 : totalTokens(usage)
    const level = tokens === 0 || maximum === 0 ? 0 : Math.ceil(tokens / maximum * 4) as ActivityDay['level']
    return { date, usage, tokens, level, future }
  })
}

/** Render a GitHub-style calendar heatmap of daily Token activity. */
function ActivityHeatmap({
  days,
  selectedDate,
  onSelectDate,
  t,
}: {
  days: readonly DailyTokenUsageRecord[]
  selectedDate: string | undefined
  onSelectDate(date: string): void
  t: TokenUsageSectionProps['t']
}): ReactNode {
  const calendar = useMemo(() => activityCalendar(days), [days])
  return (
    <div className={css.activity}>
      <div className={css.activityHead}>
        <div>
          <h3>{t('activity')}</h3>
          <p>{t('activityIntro')}</p>
        </div>
        <div className={css.activityLegend} aria-label={t('activity')}>
          <span>{t('less')}</span>
          {[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}
          <span>{t('more')}</span>
        </div>
      </div>
      <div className={css.activityGrid} role="grid" aria-label={t('activity')}>
        {calendar.map((day) => {
          const details = day.future ? undefined : t('activityTooltip', {
            date: day.date,
            total: formatTokens(day.tokens),
            input: formatTokens(inputTokens(day.usage)),
            output: formatTokens(day.usage.outputTokens),
            cacheRead: formatTokens(day.usage.cacheReadTokens),
            cacheWrite: formatTokens(day.usage.cacheWriteTokens),
          })
          return (
            <button
              key={day.date}
              className={css.activityCell}
              type="button"
              role="gridcell"
              data-level={day.level}
              data-future={day.future ? 'true' : undefined}
              data-selected={selectedDate === day.date ? 'true' : undefined}
              disabled={day.future}
              aria-selected={selectedDate === day.date}
              {...details === undefined ? {} : { title: details, 'aria-label': details }}
              onClick={() => { onSelectDate(day.date) }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Render a selected day's exact totals and contributing sessions. */
function DayDrilldown({
  day,
  sessions,
  t,
  onClose,
}: {
  day: DailyTokenUsageRecord
  sessions: readonly SessionUsageRow[]
  t: TokenUsageSectionProps['t']
  onClose(): void
}): ReactNode {
  const contributors = useMemo(() => dailyContributors(sessions, day.date), [day.date, sessions])
  return (
    <div className={css.dayDrilldown}>
      <div className={css.blockHead}>
        <div>
          <h3>{t('dayDetails', { date: day.date })}</h3>
          <p>{t('dayDetailsIntro')}</p>
        </div>
        <button className={css.quietButton} type="button" onClick={onClose}>{t('closeDayDetails')}</button>
      </div>
      <div className={css.detailMetrics}>
        <Metric label={t('total')} value={totalTokens(day.usage)} />
        <Metric label={t('input')} value={inputTokens(day.usage)} />
        <Metric label={t('output')} value={day.usage.outputTokens} />
        <Metric label={t('cacheHit')} value={inputTokens(day.usage) === 0 ? '—' : `${Math.round(day.usage.cacheReadTokens / inputTokens(day.usage) * 100)}%`} />
      </div>
      <div className={css.contributors}>
        <strong>{t('contributors', { count: contributors.length })}</strong>
        {contributors.length === 0 ? <p>{t('noContributors')}</p> : (
          <ol>
            {contributors.slice(0, 5).map(contributor => (
              <li key={contributor.id} title={contributor.id}>
                <span>{contributor.title}</span>
                <TokenValue value={totalTokens(contributor.usage)} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/** Render period-aware trend and activity summaries from daily records. */
function PeriodInsights({
  days,
  range,
  onRangeChange,
  t,
}: {
  days: readonly DailyTokenUsageRecord[]
  range: InsightRange
  onRangeChange(range: InsightRange): void
  t: TokenUsageSectionProps['t']
}): ReactNode {
  const insight = useMemo(() => periodInsight(days, range), [days, range])
  const current = totalTokens(insight.usage)
  const previous = totalTokens(insight.previousUsage)
  const delta = previous === 0 ? undefined : Math.round((current - previous) / previous * 100)
  const peak = insight.peak
  return (
    <div className={css.insights}>
      <div className={css.blockHead}>
        <div>
          <h3>{t('trend')}</h3>
          <p>{t('trendIntro')}</p>
        </div>
        <div className={css.rangeTabs} aria-label={t('trend')}>
          {([7, 30, 90] as const).map(value => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => { onRangeChange(value) }}
            >{t('rangeDays', { count: value })}</button>
          ))}
        </div>
      </div>
      <div className={css.detailMetrics}>
        <Metric label={t('periodTokens', { count: range })} value={current} />
        <Metric label={t('periodChange')} value={delta === undefined ? '—' : `${delta > 0 ? '+' : ''}${delta}%`} />
        <Metric label={t('activeDays')} value={`${insight.activeDays}/${range}`} />
        <Metric label={t('peakDay')} value={peak === undefined ? '—' : formatCompactTokens(totalTokens(peak.usage))} />
      </div>
      {peak === undefined ? null : <p className={css.insightNote}>{t('peakDayNote', { date: peak.date, total: formatTokens(totalTokens(peak.usage)) })}</p>}
    </div>
  )
}

/** Render the persistent trailing-30-day budget setting and progress. */
function BudgetPanel({
  days,
  snapshot,
  setBudget,
  t,
}: {
  days: readonly DailyTokenUsageRecord[]
  snapshot: TokenUsageBudgetSnapshot
  setBudget(value: number): Promise<void>
  t: TokenUsageSectionProps['t']
}): ReactNode {
  const insight = useMemo(() => periodInsight(days, 30), [days])
  const used = totalTokens(insight.usage)
  const budget = snapshot.budget
  const enabled = budget > 0
  const ratio = enabled ? used / budget : 0
  const save = (value: string): void => {
    const next = value.trim() === '' ? 0 : Number(value)
    if (!Number.isSafeInteger(next) || next < 0) return
    void setBudget(next)
  }
  return (
    <div className={css.budget}>
      <div className={css.blockHead}>
        <div>
          <h3>{t('budget')}</h3>
          <p>{t('budgetIntro')}</p>
        </div>
        <label className={css.budgetInput}>
          <span>{t('budgetInput')}</span>
          <input
            key={`${snapshot.status}:${budget}`}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            defaultValue={enabled ? String(budget) : ''}
            placeholder="0"
            aria-label={t('budgetInput')}
            disabled={snapshot.status !== 'ready'}
            onBlur={(event) => { save(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </label>
      </div>
      {snapshot.status !== 'ready' ? <p className={css.insightNote}>{t('budgetUnavailable')}</p>
        : !enabled ? <p className={css.insightNote}>{t('budgetDisabled')}</p>
          : <>
            <div className={css.budgetProgress}>
              <progress value={Math.min(used, budget)} max={budget} />
              <strong>{t('budgetProgress', { used: formatCompactTokens(used), budget: formatCompactTokens(budget), percent: Math.round(ratio * 100) })}</strong>
            </div>
            {ratio > 1 ? <p className={css.budgetWarning}>{t('budgetExceeded', { excess: formatCompactTokens(used - budget) })}</p> : null}
          </>}
    </div>
  )
}

/** Render export controls that only receive aggregate, privacy-safe dashboard data. */
function ExportControls({
  data,
  download,
  t,
}: {
  data: DashboardData
  download: DownloadPort
  t: TokenUsageSectionProps['t']
}): ReactNode {
  const save = (kind: 'json' | 'daily' | 'models'): void => {
    const generatedAt = new Date().toISOString()
    const date = generatedAt.slice(0, 10)
    switch (kind) {
      case 'json':
        download.save(`dsh-token-usage-${date}.json`, 'application/json;charset=utf-8', tokenUsageJson(data, generatedAt))
        return
      case 'daily':
        download.save(`dsh-token-usage-daily-${date}.csv`, 'text/csv;charset=utf-8', dailyUsageCsv(data))
        return
      case 'models':
        download.save(`dsh-token-usage-models-${date}.csv`, 'text/csv;charset=utf-8', modelUsageCsv(data))
    }
  }
  return (
    <div className={css.exportControls} aria-label={t('export')}>
      <span>{t('export')}</span>
      <button type="button" onClick={() => { save('json') }}>{t('exportJson')}</button>
      <button type="button" onClick={() => { save('daily') }}>{t('exportDaily')}</button>
      <button type="button" onClick={() => { save('models') }}>{t('exportModels')}</button>
    </div>
  )
}

/** Encode one provider/model route for the native selector without displaying an opaque id. */
function analysisModelKey(model: TokenUsageAnalysisModelSelection): string {
  return `${model.provider}\u0000${model.model}`
}

/** Render a manual integrated-model picker and one aggregate-only Token optimization report. */
function UsageAnalysisPanel({
  catalog,
  selectedModel,
  state,
  onSelectModel,
  onAnalyze,
  t,
}: {
  catalog: AnalysisCatalogState
  selectedModel: TokenUsageAnalysisModelSelection | undefined
  state: TokenUsageAnalysisState
  onSelectModel(model: TokenUsageAnalysisModelSelection): void
  onAnalyze(): void
  t: TokenUsageSectionProps['t']
}): ReactNode {
  if (catalog.status === 'loading') {
    return <div className={css.analysisEmpty}><h3>{t('usageAnalysis')}</h3><p>{t('analysisModelsLoading')}</p></div>
  }
  if (catalog.status === 'error') {
    return <div className={css.analysisError}><h3>{t('usageAnalysis')}</h3><p>{t('analysisModelsFailed', { message: catalog.message })}</p></div>
  }
  if (catalog.value.models.length === 0 || selectedModel === undefined) {
    return <div className={css.analysisEmpty}><h3>{t('usageAnalysis')}</h3><p>{t('analysisModelsUnavailable')}</p></div>
  }
  const report = state.status === 'ready' ? state.value : undefined
  const analysisTokens = report?.analysisUsage === undefined ? undefined : totalTokens(report.analysisUsage)
  return (
    <div className={css.analysisPanel}>
      <div className={css.blockHead}>
        <div>
          <h3>{t('usageAnalysis')}</h3>
          <p>{t('usageAnalysisIntro')}</p>
        </div>
        <label className={css.analysisModelSelect}>
          <span>{t('analysisModel')}</span>
          <select
            value={analysisModelKey(selectedModel)}
            aria-label={t('analysisModel')}
            disabled={state.status === 'loading'}
            onChange={(event) => {
              const model = catalog.value.models.find(entry => analysisModelKey(entry) === event.currentTarget.value)
              if (model !== undefined) onSelectModel({ provider: model.provider, model: model.model })
            }}
          >
            {catalog.value.models.map(model => (
              <option key={analysisModelKey(model)} value={analysisModelKey(model)}>
                {model.providerName} · {model.modelName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={css.analysisPrivacy}>{t('usageAnalysisPrivacy')}</p>
      <p className={css.analysisScope}>{t('analysisModelScope')}</p>
      <button
        className={css.analysisButton}
        type="button"
        disabled={state.status === 'loading'}
        onClick={onAnalyze}
      >{state.status === 'loading' ? t('usageAnalyzing') : t('analyzeUsage')}</button>
      {state.status === 'error' ? <p className={css.analysisErrorText}>{t('usageAnalysisFailed', { message: state.message })}</p> : null}
      {report === undefined ? null : <>
        <div className={css.blockHead}>
          <div>
            <h3>{t('usageAnalysisReport')}</h3>
            <p>{t('analysisMeta', {
              provider: report.model.provider,
              model: report.model.model,
              time: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.generatedAt)),
            })}</p>
          </div>
          {analysisTokens === undefined ? null : <span className={css.analysisCost}>{t('analysisCost', { total: formatTokens(analysisTokens) })}</span>}
        </div>
        <pre className={css.analysisReport}>{report.report}</pre>
      </>}
    </div>
  )
}

/** Render one ephemeral model-generated review and its deterministic measurements. */
function TrajectoryAnalysisPanel({ state, t }: {
  state: TrajectoryAnalysisState
  t: TokenUsageSectionProps['t']
}): ReactNode {
  if (state.status === 'idle') {
    return <div className={css.analysisEmpty}><h3>{t('trajectoryAnalysis')}</h3><p>{t('trajectoryAnalysisIntro')}</p></div>
  }
  if (state.status === 'loading') {
    return <div className={css.analysisEmpty}><h3>{t('trajectoryAnalysis')}</h3><p>{t('analysisRunning', { title: state.title })}</p></div>
  }
  if (state.status === 'error') {
    return <div className={css.analysisError}><h3>{t('trajectoryAnalysis')}</h3><p>{t('analysisFailed', { message: state.message })}</p></div>
  }
  const analysis = state.value
  const metrics = analysis.metrics
  const analysisTokens = analysis.analysisUsage === undefined ? undefined : totalTokens(analysis.analysisUsage)
  const largestSpan = metrics.largestSpanId === undefined
    ? undefined
    : metrics.spans.find(span => span.id === metrics.largestSpanId)
  const reconciliationDelta = Object.values(metrics.reconciliation.delta)
    .reduce((total, value) => total + Math.abs(value), 0)
  return (
    <div className={css.analysisPanel}>
      <div className={css.blockHead}>
        <div>
          <h3>{t('analysisFor', { title: state.title })}</h3>
          <p>{t('analysisMeta', {
            provider: analysis.model.provider,
            model: analysis.model.model,
            time: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(analysis.generatedAt)),
          })}</p>
        </div>
        {analysisTokens === undefined ? null : <span className={css.analysisCost}>{t('analysisCost', { total: formatTokens(analysisTokens) })}</span>}
      </div>
      <div className={css.analysisMetrics}>
        <Metric label={t('analysisTurns')} value={`${metrics.turnCount} / ${metrics.openTurns}`} />
        <Metric label={t('analysisTools')} value={`${metrics.toolCalls} / ${metrics.toolResults} / ${metrics.toolErrors}`} />
        <Metric label={t('analysisIntegrity')} value={`${metrics.orphanToolCalls + metrics.orphanToolResults} / ${metrics.openSteps}`} />
        <Metric label={t('analysisToolLatency')} value={metrics.averageToolLatencyMs === 0
          ? '—'
          : `${formatLatency(metrics.averageToolLatencyMs)} / ${formatLatency(metrics.maxToolLatencyMs)}`} />
        <Metric label={t('analysisRetries')} value={metrics.retries} />
        <Metric label={t('analysisRetryTokens')} value={totalTokens(metrics.retryUsage)} />
        <Metric label={t('analysisLargest')} value={largestSpan === undefined
          ? '—'
          : `${largestSpan.id} · ${formatTokens(totalTokens(largestSpan.usage))}`} />
        <Metric label={t('analysisReconciliation')} value={metrics.reconciliation.status === 'matched'
          ? t('analysisMatched')
          : t('analysisMismatch', { count: formatTokens(reconciliationDelta) })} />
        <Metric label={t('analysisRate')} value={metrics.activeTokensPerMinute === 0 ? '—' : `${formatCompactTokens(metrics.activeTokensPerMinute)}/min`} />
        <Metric label={t('analysisApprovals')} value={`${metrics.approvalsAsked} / ${metrics.approvalsRejected}`} />
      </div>
      {analysis.truncated ? <p className={css.analysisWarning}>{t('analysisTruncated')}</p> : null}
      <pre className={css.analysisReport}>{analysis.report}</pre>
      <p className={css.analysisPrivacy}>{t('analysisPrivacy')}</p>
    </div>
  )
}

/** Render durable Token usage across all listed sessions. */
export function TokenUsageSection({
  useSessions,
  useBudget,
  setBudget,
  download,
  listAnalysisModels,
  analyzeTokenUsage,
  analyzeTrajectory,
  t,
}: TokenUsageSectionProps): ReactNode {
  const phase = useSessions(state => state.phase)
  const ids = useSessions(state => state.ids)
  const byId = useSessions(state => state.byId)
  const budget = useBudget(snapshot => snapshot)
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<InsightRange>(30)
  const [selectedDate, setSelectedDate] = useState<string>()
  const [analysis, setAnalysis] = useState<TrajectoryAnalysisState>({ status: 'idle' })
  const [analysisCatalog, setAnalysisCatalog] = useState<AnalysisCatalogState>({ status: 'loading' })
  const [selectedAnalysisModel, setSelectedAnalysisModel] = useState<TokenUsageAnalysisModelSelection>()
  const [usageReport, setUsageReport] = useState<TokenUsageAnalysisState>({ status: 'idle' })
  const trajectoryController = useRef<AbortController>()
  const usageController = useRef<AbortController>()
  useEffect(() => () => {
    trajectoryController.current?.abort()
    usageController.current?.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void listAnalysisModels(controller.signal).then((catalog) => {
      if (controller.signal.aborted) return
      setAnalysisCatalog({ status: 'ready', value: catalog })
      setSelectedAnalysisModel(current => current !== undefined
        && catalog.models.some(model => model.provider === current.provider && model.model === current.model)
        ? current
        : catalog.default ?? catalog.models[0])
    }, (error: unknown) => {
      if (!controller.signal.aborted) {
        setAnalysisCatalog({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
    return () => { controller.abort() }
  }, [])

  const runAnalysis = (row: SessionUsageRow): void => {
    if (selectedAnalysisModel === undefined) return
    trajectoryController.current?.abort()
    const controller = new AbortController()
    trajectoryController.current = controller
    setAnalysis({ status: 'loading', sessionId: row.id, title: row.title })
    void analyzeTrajectory(row.id, selectedAnalysisModel, controller.signal).then((value) => {
      if (trajectoryController.current === controller && !controller.signal.aborted) {
        setAnalysis({ status: 'ready', title: row.title, value })
      }
    }, (error: unknown) => {
      if (trajectoryController.current === controller && !controller.signal.aborted) {
        setAnalysis({
          status: 'error',
          sessionId: row.id,
          title: row.title,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  const data = useMemo(
    () => aggregateUsage(ids.map(id => byId[id]).filter((value): value is SessionSummary => value !== undefined)),
    [byId, ids],
  )
  const runUsageAnalysis = (): void => {
    if (selectedAnalysisModel === undefined) return
    usageController.current?.abort()
    const controller = new AbortController()
    usageController.current = controller
    setUsageReport({ status: 'loading' })
    void analyzeTokenUsage(usageAnalysisInput(data), selectedAnalysisModel, controller.signal).then((value) => {
      if (usageController.current === controller && !controller.signal.aborted) {
        setUsageReport({ status: 'ready', value })
      }
    }, (error: unknown) => {
      if (usageController.current === controller && !controller.signal.aborted) {
        setUsageReport({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredSessions = useMemo(() => data.sessions.filter(row => {
    if (normalizedQuery.length === 0) return true
    return row.title.toLocaleLowerCase().includes(normalizedQuery)
      || row.id.toLocaleLowerCase().includes(normalizedQuery)
      || row.models.some(model => routeLabel(model).toLocaleLowerCase().includes(normalizedQuery))
  }), [data.sessions, normalizedQuery])
  const selectedDay = useMemo(
    () => selectedDate === undefined ? undefined : data.days.find(day => day.date === selectedDate),
    [data.days, selectedDate],
  )
  const billedInput = inputTokens(data.usage)
  const cacheHit = billedInput === 0 ? '—' : `${Math.round(data.usage.cacheReadTokens / billedInput * 100)}%`

  if (phase !== 'ready' && ids.length === 0) {
    return <p className={css.status}>{t('loading')}</p>
  }

  return (
    <section className={css.section}>
      <header className={css.header}>
        <div>
          <h2>{t('title')}</h2>
          <p>{t('intro')}</p>
        </div>
        <ExportControls data={data} download={download} t={t} />
      </header>

      {data.sessions.length === 0 ? <p className={css.status}>{t('empty')}</p> : (
        <>
          <div className={css.metrics}>
            <Metric label={t('totalTokens')} value={totalTokens(data.usage)} />
            <Metric label={t('inputTokens')} value={billedInput} />
            <Metric label={t('outputTokens')} value={data.usage.outputTokens} />
            <Metric label={t('cacheHit')} value={cacheHit} />
            <Metric label={t('sessions')} value={data.sessions.length} />
          </div>

          <PeriodInsights days={data.days} range={range} onRangeChange={setRange} t={t} />
          <BudgetPanel days={data.days} snapshot={budget} setBudget={setBudget} t={t} />
          <UsageAnalysisPanel
            catalog={analysisCatalog}
            selectedModel={selectedAnalysisModel}
            state={usageReport}
            onSelectModel={setSelectedAnalysisModel}
            onAnalyze={runUsageAnalysis}
            t={t}
          />
          <ActivityHeatmap days={data.days} selectedDate={selectedDate} onSelectDate={setSelectedDate} t={t} />
          {selectedDay === undefined ? null : <DayDrilldown day={selectedDay} sessions={data.sessions} t={t} onClose={() => { setSelectedDate(undefined) }} />}

          <div className={css.block}>
            <h3>{t('modelBreakdown')}</h3>
            {data.models.length === 0 ? <p className={css.status}>{t('unknownRoute')}</p> : (
              <div className={css.tableWrap}>
                <table className={css.modelTable}>
                  <thead>
                    <tr>
                      <th>{t('providerModel')}</th>
                      <th>{t('calls')}</th>
                      <th>{t('total')}</th>
                      <th>{t('input')}</th>
                      <th>{t('output')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.models.map(model => (
                      <tr key={modelKey(model)}>
                        <td>{isUnattributed(model)
                          ? <strong>{t('unattributed')}</strong>
                          : <><strong>{model.model}</strong><span>{model.provider}</span></>}</td>
                        <td>{isUnattributed(model) ? '—' : (
                          <>
                            <span>{t('assistantCalls', { count: model.assistantRequests })}</span>
                            {model.compactionRequests > 0
                              ? <span>{t('compactionCalls', { count: model.compactionRequests })}</span>
                              : null}
                          </>
                        )}</td>
                        <td><TokenValue value={totalTokens(model.usage)} /></td>
                        <td>
                          <TokenValue value={inputTokens(model.usage)} />
                          {(model.usage.cacheReadTokens > 0 || model.usage.cacheWriteTokens > 0) ? (
                            <span className={css.cacheDetail} title={t('cacheDetail', {
                              read: formatTokens(model.usage.cacheReadTokens),
                              write: formatTokens(model.usage.cacheWriteTokens),
                            })}>{t('cacheDetail', {
                              read: formatCompactTokens(model.usage.cacheReadTokens),
                              write: formatCompactTokens(model.usage.cacheWriteTokens),
                            })}</span>
                          ) : null}
                        </td>
                        <td><TokenValue value={model.usage.outputTokens} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <TrajectoryAnalysisPanel state={analysis} t={t} />

          <div className={css.block}>
            <div className={css.blockHead}>
              <h3>{t('recentSessions')}</h3>
              <input
                type="search"
                value={query}
                placeholder={t('search')}
                aria-label={t('search')}
                onChange={(event) => { setQuery(event.currentTarget.value) }}
              />
            </div>
            {filteredSessions.length === 0 ? <p className={css.status}>{t('emptySearch')}</p> : (
              <div className={css.tableWrap}>
                <table className={css.sessionTable}>
                  <thead>
                    <tr>
                      <th>{t('session')}</th>
                      <th>{t('updated')}</th>
                      <th>{t('routes')}</th>
                      <th>{t('total')}</th>
                      <th>{t('input')}</th>
                      <th>{t('output')}</th>
                      <th>{t('analysis')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map(row => (
                      <tr key={row.id}>
                        <td><strong title={row.id}>{row.title}</strong><span>{row.id}</span></td>
                        <td>{new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(row.updatedAt)}</td>
                        <td>{row.models.length === 0 || row.models.every(isUnattributed)
                          ? <span>{t('unknownRoute')}</span>
                          : row.models.filter(model => !isUnattributed(model))
                            .map(model => <span key={modelKey(model)}>{routeLabel(model)}</span>)}</td>
                        <td><TokenValue value={totalTokens(row.usage)} /></td>
                        <td><TokenValue value={inputTokens(row.usage)} /></td>
                        <td><TokenValue value={row.usage.outputTokens} /></td>
                        <td>
                          <button
                            className={css.analysisButton}
                            type="button"
                            disabled={selectedAnalysisModel === undefined || (analysis.status === 'loading' && analysis.sessionId === row.id)}
                            onClick={() => { runAnalysis(row) }}
                          >{analysis.status === 'loading' && analysis.sessionId === row.id ? t('analyzing') : t('analyze')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
