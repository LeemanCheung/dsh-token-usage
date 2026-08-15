import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ObservableSnapshot, SessionId, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type {
  DailyTokenUsageRecord,
  ModelTokenUsageRecord,
  PricedModelTokenUsageRecord,
  TokenUsageAnalysis,
  TokenUsageAnalysisInput,
  TokenUsageAnalysisModel,
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
  TokenUsageRecorderProjection,
  TrajectoryAnalysis,
} from '../types.ts'
import type { TokenUsageBudgetSnapshot } from './budget-controller.ts'
import { dailyAnomalyInsight, dailyContributors, periodInsight, runRateInsight } from './analytics.ts'
import { usageEfficiencyInsight } from './efficiency.ts'
import { dailyUsageCsv, modelUsageCsv, tokenUsageJson, type DownloadPort } from './export.ts'
import { PUBLIC_PRICE_CATALOG_AS_OF, PUBLIC_PRICE_CATALOG_URL, tokenUsageCostSummary } from '../pricing.ts'
import type { TokenUsageAnalysisModelCatalog } from './usage-analysis-client.ts'
import { NS } from './locales.ts'
import css from './TokenUsageSection.module.css'

interface TokenUsageSectionInjected {
  hooks: {
    budget: ObservableSnapshot<TokenUsageBudgetSnapshot>
  }
  setBudget(value: number): Promise<number>
  download: DownloadPort
  openSession(sessionId: SessionId): void
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
  id: SessionId
  title: string
  updatedAt: number
  assistantRequests: number
  compactionRequests: number
  compactionUsage: TokenUsageBuckets
  usage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
  dailyUsageReliable: boolean
}

interface DashboardData {
  usage: TokenUsageBuckets
  assistantRequests: number
  compactionRequests: number
  compactionUsage: TokenUsageBuckets
  sessions: SessionUsageRow[]
  models: ModelTokenUsageRecord[]
  days: DailyTokenUsageRecord[]
  operationalDays: DailyTokenUsageRecord[]
  dailyCoverage: 'complete' | 'partial' | 'unavailable'
}

type InsightRange = 7 | 30 | 90
type ModelSort = 'total' | 'cost' | 'tokensPerAttempt' | 'cacheReadShare'

const SESSION_PAGE_SIZE = 50

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

/** Format one public-rate estimate in USD without implying accounting precision. */
function formatUSD(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value)
}

/** Format a ratio without implying fractional measurement precision. */
function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** Format partial price coverage without ever rounding an incomplete estimate to 100%. */
function formatCoveragePercent(covered: number, total: number): string {
  if (total <= 0 || covered <= 0) return '0'
  if (covered >= total) return '100'
  const percent = covered / total * 100
  if (percent < 0.1) return '<0.1'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(Math.floor(percent * 10) / 10)
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

/** Count every provider-recorded assistant or compaction attempt for one route. */
function recordedAttempts(model: ModelTokenUsageRecord): number {
  return model.assistantRequests + model.compactionRequests
}

/** Return the selected stable sort value for one model hotspot row. */
function modelSortValue(model: PricedModelTokenUsageRecord, sort: ModelSort): number {
  switch (sort) {
    case 'total': return totalTokens(model.usage)
    case 'cost': return model.totalCostUSD ?? -1
    case 'tokensPerAttempt': {
      const attempts = recordedAttempts(model)
      return attempts === 0 ? -1 : totalTokens(model.usage) / attempts
    }
    case 'cacheReadShare': {
      const input = inputTokens(model.usage)
      return input === 0 ? -1 : model.usage.cacheReadTokens / input
    }
  }
}

/** Sort model hotspot rows deterministically without mutating cost-summary data. */
function sortedModelHotspots(models: readonly PricedModelTokenUsageRecord[], sort: ModelSort): PricedModelTokenUsageRecord[] {
  return models.slice().sort((left, right) => modelSortValue(right, sort) - modelSortValue(left, sort)
    || totalTokens(right.usage) - totalTokens(left.usage)
    || left.provider.localeCompare(right.provider)
    || left.model.localeCompare(right.model))
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
  const assistantRequests = recorded?.assistantRequests ?? 0
  const compactionRequests = recorded?.compactionRequests ?? 0
  if (usage === undefined || (totalTokens(usage) === 0 && assistantRequests === 0 && compactionRequests === 0)) return null
  return {
    id: summary.id,
    title: summary.displayTitle,
    updatedAt: summary.updatedAt,
    assistantRequests,
    compactionRequests,
    compactionUsage: recorded?.compactionUsage === undefined ? zeroBuckets() : { ...recorded.compactionUsage },
    usage,
    models: recorded?.models ?? [unattributedModel(usage)],
    days: recorded?.days ?? [{ date: dayKey(summary.updatedAt), usage }],
    dailyUsageReliable: recorded?.days !== undefined,
  }
}

/** Aggregate session summaries into totals and provider/model records. */
export function aggregateUsage(summaries: readonly SessionSummary[]): DashboardData {
  const sessions: SessionUsageRow[] = []
  const models = new Map<string, ModelTokenUsageRecord>()
  const days = new Map<string, TokenUsageBuckets>()
  const operationalDays = new Map<string, TokenUsageBuckets>()
  let usage = zeroBuckets()
  let assistantRequests = 0
  let compactionRequests = 0
  let compactionUsage = zeroBuckets()
  let reliableDailySessions = 0

  for (const summary of summaries) {
    const row = sessionRow(summary)
    if (row === null) continue
    sessions.push(row)
    usage = addBuckets(usage, row.usage)
    assistantRequests += row.assistantRequests
    compactionRequests += row.compactionRequests
    compactionUsage = addBuckets(compactionUsage, row.compactionUsage)
    if (row.dailyUsageReliable) reliableDailySessions += 1
    for (const day of row.days) {
      days.set(day.date, addBuckets(days.get(day.date) ?? zeroBuckets(), day.usage))
      if (row.dailyUsageReliable) {
        operationalDays.set(day.date, addBuckets(operationalDays.get(day.date) ?? zeroBuckets(), day.usage))
      }
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
    assistantRequests,
    compactionRequests,
    compactionUsage,
    sessions,
    models: [...models.values()].sort((left, right) =>
      totalTokens(right.usage) - totalTokens(left.usage)
      || left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model)),
    days: [...days.entries()]
      .map(([date, usage]): DailyTokenUsageRecord => ({ date, usage }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    operationalDays: [...operationalDays.entries()]
      .map(([date, usage]): DailyTokenUsageRecord => ({ date, usage }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    dailyCoverage: reliableDailySessions === 0
      ? 'unavailable'
      : reliableDailySessions === sessions.length ? 'complete' : 'partial',
  }
}

/** Return only detached aggregate buckets, route records, and UTC dates for AI usage analysis. */
export function usageAnalysisInput(data: Pick<DashboardData, 'usage' | 'assistantRequests' | 'compactionRequests' | 'compactionUsage' | 'models' | 'operationalDays' | 'dailyCoverage'>): TokenUsageAnalysisInput {
  return {
    usage: { ...data.usage },
    assistantRequests: data.assistantRequests,
    compactionRequests: data.compactionRequests,
    compactionUsage: { ...data.compactionUsage },
    models: data.models.map(model => ({
      provider: model.provider,
      model: model.model,
      assistantRequests: model.assistantRequests,
      compactionRequests: model.compactionRequests,
      usage: { ...model.usage },
    })),
    days: data.dailyCoverage === 'complete'
      ? data.operationalDays.map(day => ({ date: day.date, usage: { ...day.usage } }))
      : [],
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
  operationalDays,
  dailyCoverage,
  snapshot,
  setBudget,
  t,
}: {
  operationalDays: readonly DailyTokenUsageRecord[]
  dailyCoverage: DashboardData['dailyCoverage']
  snapshot: TokenUsageBudgetSnapshot
  setBudget(value: number): Promise<number>
  t: TokenUsageSectionProps['t']
}): ReactNode {
  const insight = useMemo(() => periodInsight(operationalDays, 30), [operationalDays])
  const runRate = useMemo(() => runRateInsight(operationalDays), [operationalDays])
  const runRateAvailable = dailyCoverage === 'complete'
  const used = totalTokens(insight.usage)
  const budget = snapshot.budget
  const enabled = budget > 0
  const durableValue = enabled ? String(budget) : ''
  const [draft, setDraft] = useState(durableValue)
  const editGeneration = useRef(0)
  const dirtyDraft = useRef(false)
  const ratio = enabled ? used / budget : 0
  useEffect(() => {
    if (!dirtyDraft.current) setDraft(durableValue)
  }, [durableValue, snapshot.status])
  const save = (value: string): void => {
    const next = value.trim() === '' ? 0 : Number(value)
    if (!Number.isSafeInteger(next) || next < 0) {
      dirtyDraft.current = false
      setDraft(durableValue)
      return
    }
    const generation = editGeneration.current + 1
    editGeneration.current = generation
    void setBudget(next).then(
      (saved) => {
        if (editGeneration.current !== generation) return
        dirtyDraft.current = false
        setDraft(saved > 0 ? String(saved) : '')
      },
      () => {
        if (editGeneration.current !== generation) return
        dirtyDraft.current = false
        setDraft(durableValue)
      },
    )
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
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={draft}
            placeholder="0"
            aria-label={t('budgetInput')}
            disabled={snapshot.status !== 'ready'}
            onChange={(event) => {
              editGeneration.current += 1
              dirtyDraft.current = true
              setDraft(event.currentTarget.value)
            }}
            onBlur={(event) => { save(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </label>
      </div>
      <p className={css.insightNote}>{runRateAvailable ? t('budgetRunRate', {
        average: formatCompactTokens(Math.round(runRate.averageDailyTokens)),
        projected: formatCompactTokens(runRate.projectedThirtyDayTokens),
      }) : t(dailyCoverage === 'partial' ? 'dailyCoveragePartial' : 'dailyCoverageUnavailable')}</p>
      {snapshot.status !== 'ready' ? <p className={css.insightNote}>{t('budgetUnavailable')}</p>
        : !enabled ? <p className={css.insightNote}>{t('budgetDisabled')}</p>
          : !runRateAvailable ? null
            : <>
            <div className={css.budgetProgress}>
              <progress value={Math.min(used, budget)} max={budget} />
              <strong>{t('budgetProgress', { used: formatCompactTokens(used), budget: formatCompactTokens(budget), percent: Math.round(ratio * 100) })}</strong>
            </div>
            {ratio > 1 ? <p className={css.budgetWarning}>{t('budgetExceeded', { excess: formatCompactTokens(used - budget) })}</p> : null}
            {runRateAvailable && ratio <= 1 && runRate.projectedThirtyDayTokens > budget ? <p className={css.budgetWarning}>{t('budgetForecastExceeded', {
              projected: formatCompactTokens(runRate.projectedThirtyDayTokens),
              budget: formatCompactTokens(budget),
            })}</p> : null}
          </>}
    </div>
  )
}

/** Render aggregate request efficiency, compaction overhead, and route concentration. */
function EfficiencyPanel({
  usage,
  compactionUsage,
  models,
  assistantAttempts,
  compactionAttempts,
  t,
}: {
  usage: TokenUsageBuckets
  compactionUsage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  assistantAttempts: number
  compactionAttempts: number
  t: TokenUsageSectionProps['t']
}): ReactNode {
  const insight = useMemo(
    () => usageEfficiencyInsight(usage, compactionUsage, models, assistantAttempts, compactionAttempts),
    [usage, compactionUsage, models, assistantAttempts, compactionAttempts],
  )
  const top = insight.topRoutes[0]
  const topThreeShare = insight.topRoutes.reduce((sum, route) => sum + route.share, 0)
  return (
    <div className={css.insights}>
      <div className={css.blockHead}>
        <div>
          <h3>{t('efficiency')}</h3>
          <p>{t('efficiencyIntro')}</p>
        </div>
      </div>
      <div className={css.detailMetrics}>
        <Metric label={t('assistantAttempts')} value={insight.assistantAttempts === 0 ? '—' : insight.assistantAttempts} />
        <Metric label={t('tokensPerAssistantAttempt')} value={insight.tokensPerAssistantAttempt === undefined ? '—' : insight.tokensPerAssistantAttempt} />
        <Metric label={t('compactionRate')} value={insight.compactionsPerHundredAssistantAttempts === undefined ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(insight.compactionsPerHundredAssistantAttempts)} / 100`} />
        <Metric label={t('compactionTokenShare')} value={insight.compactionTokenShare === undefined ? '—' : formatPercent(insight.compactionTokenShare)} />
        <Metric label={t('cacheReadShare')} value={insight.cacheReadInputShare === undefined ? '—' : formatPercent(insight.cacheReadInputShare)} />
        <Metric label={t('topRouteShare')} value={top === undefined ? '—' : formatPercent(top.share)} />
      </div>
      {top === undefined ? <p className={css.insightNote}>{t('noRouteAttribution')}</p>
        : <p className={css.insightNote}>{t('routeConcentration', {
          route: `${top.provider}/${top.model}`,
          topOne: formatPercent(top.share),
          topThree: formatPercent(topThreeShare),
        })}</p>}
      {insight.unattributedTokenShare > 0 ? <p className={css.insightNote}>{t('unattributedShare', { share: formatPercent(insight.unattributedTokenShare) })}</p> : null}
    </div>
  )
}

/** Render complete-day burn rate and robust recent spike signals. */
function OperationsPanel({
  days,
  dailyCoverage,
  onSelectDate,
  t,
}: {
  days: readonly DailyTokenUsageRecord[]
  dailyCoverage: DashboardData['dailyCoverage']
  onSelectDate(date: string): void
  t: TokenUsageSectionProps['t']
}): ReactNode {
  const runRate = useMemo(() => runRateInsight(days), [days])
  const anomaly = useMemo(
    () => dailyCoverage === 'complete' ? dailyAnomalyInsight(days) : undefined,
    [days, dailyCoverage],
  )
  const dailyCoverageAvailable = dailyCoverage === 'complete'
  return (
    <div className={css.insights}>
      <div className={css.blockHead}>
        <div>
          <h3>{t('usageSignals')}</h3>
          <p>{t('usageSignalsIntro')}</p>
        </div>
      </div>
      <div className={css.detailMetrics}>
        <Metric label={t('dailyRunRate')} value={dailyCoverageAvailable ? Math.round(runRate.averageDailyTokens) : '—'} />
        <Metric label={t('projectedThirtyDayUsage')} value={dailyCoverageAvailable ? runRate.projectedThirtyDayTokens : '—'} />
        <Metric label={t('anomalyRatio')} value={anomaly === undefined ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(anomaly.ratio)}×`} />
        <Metric label={t('anomalyExcess')} value={anomaly === undefined ? '—' : anomaly.excessTokens} />
      </div>
      {!dailyCoverageAvailable ? <p className={css.insightNote}>{t(dailyCoverage === 'partial' ? 'dailyCoveragePartial' : 'dailyCoverageUnavailable')}</p>
        : anomaly === undefined ? <p className={css.insightNote}>{t('anomalyInsufficient')}</p>
          : anomaly.status === 'normal' ? <p className={css.insightNote}>{t('anomalyNormal', {
          date: anomaly.date,
          baseline: formatCompactTokens(anomaly.baselineMedianTokens),
          active: anomaly.activeBaselineDays,
        })}</p>
          : <div className={css.anomalyNotice}>
            <p>{t('anomalyElevated', {
              date: anomaly.date,
              tokens: formatCompactTokens(anomaly.tokens),
              baseline: formatCompactTokens(anomaly.baselineMedianTokens),
              ratio: new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(anomaly.ratio),
              excess: formatCompactTokens(anomaly.excessTokens),
              active: anomaly.activeBaselineDays,
            })}</p>
            <button className={css.quietButton} type="button" onClick={() => { onSelectDate(anomaly.date) }}>{t('inspectAnomalyDay')}</button>
          </div>}
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
  onRefreshCatalog,
  onAnalyze,
  t,
}: {
  catalog: AnalysisCatalogState
  selectedModel: TokenUsageAnalysisModelSelection | undefined
  state: TokenUsageAnalysisState
  onSelectModel(model: TokenUsageAnalysisModelSelection): void
  onRefreshCatalog(): void
  onAnalyze(): void
  t: TokenUsageSectionProps['t']
}): ReactNode {
  if (catalog.status === 'loading') {
    return <div className={css.analysisEmpty}><h3>{t('usageAnalysis')}</h3><p>{t('analysisModelsLoading')}</p></div>
  }
  if (catalog.status === 'error') {
    return <div className={css.analysisError}><h3>{t('usageAnalysis')}</h3><p>{t('analysisModelsFailed', { message: catalog.message })}</p></div>
  }
  const catalogFailures = catalog.value.failures ?? []
  if (catalog.value.models.length === 0 || selectedModel === undefined) {
    return <div className={css.analysisEmpty}>
      <h3>{t('usageAnalysis')}</h3>
      <p>{t('analysisModelsUnavailable')}</p>
      {catalogFailures.length === 0 ? null : <p className={css.analysisWarning}>{t('analysisModelsAllFailed', {
        providers: catalogFailures.map(failure => failure.providerName).join(', '),
      })}</p>}
      <button className={css.quietButton} type="button" onClick={onRefreshCatalog}>{t('refreshAnalysisModels')}</button>
    </div>
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
      <button className={css.quietButton} type="button" disabled={state.status === 'loading'} onClick={onRefreshCatalog}>{t('refreshAnalysisModels')}</button>
      <p className={css.analysisPrivacy}>{t('usageAnalysisPrivacy')}</p>
      <p className={css.analysisScope}>{t('analysisModelScope')}</p>
      {catalogFailures.length === 0 ? null : <p className={css.analysisWarning}>{t('analysisModelsPartial', {
        providers: catalogFailures.map(failure => failure.providerName).join(', '),
      })}</p>}
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
          : metrics.reconciliation.status === 'unavailable'
            ? t('analysisUnavailable')
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
  close,
  useSessions,
  useBudget,
  setBudget,
  download,
  openSession,
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
  const [modelSort, setModelSort] = useState<ModelSort>('total')
  const [sessionLimit, setSessionLimit] = useState(SESSION_PAGE_SIZE)
  const [range, setRange] = useState<InsightRange>(30)
  const [selectedDate, setSelectedDate] = useState<string>()
  const [operationalDrilldown, setOperationalDrilldown] = useState(false)
  const [sessionOpenError, setSessionOpenError] = useState<string>()
  const [analysis, setAnalysis] = useState<TrajectoryAnalysisState>({ status: 'idle' })
  const [analysisCatalog, setAnalysisCatalog] = useState<AnalysisCatalogState>({ status: 'loading' })
  const [selectedAnalysisModel, setSelectedAnalysisModel] = useState<TokenUsageAnalysisModelSelection>()
  const [usageReport, setUsageReport] = useState<TokenUsageAnalysisState>({ status: 'idle' })
  const trajectoryController = useRef<AbortController>()
  const usageController = useRef<AbortController>()
  const catalogController = useRef<AbortController>()
  useEffect(() => () => {
    trajectoryController.current?.abort()
    usageController.current?.abort()
    catalogController.current?.abort()
  }, [])
  const refreshAnalysisModels = useCallback((): void => {
    catalogController.current?.abort()
    const controller = new AbortController()
    catalogController.current = controller
    setAnalysisCatalog({ status: 'loading' })
    void listAnalysisModels(controller.signal).then((catalog) => {
      if (catalogController.current !== controller || controller.signal.aborted) return
      setAnalysisCatalog({ status: 'ready', value: catalog })
      setSelectedAnalysisModel(current => current !== undefined
        && catalog.models.some(model => model.provider === current.provider && model.model === current.model)
        ? current
        : catalog.default ?? catalog.models[0])
    }, (error: unknown) => {
      if (catalogController.current === controller && !controller.signal.aborted) {
        setAnalysisCatalog({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
  }, [listAnalysisModels])
  useEffect(() => {
    refreshAnalysisModels()
  }, [refreshAnalysisModels])

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

  const openUsageSession = (row: SessionUsageRow): void => {
    try {
      openSession(row.id)
      close()
    } catch (error) {
      setSessionOpenError(error instanceof Error ? error.message : String(error))
    }
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

  const costSummary = useMemo(() => tokenUsageCostSummary(data.models), [data.models])
  const priceCoverage = formatCoveragePercent(costSummary.coveredTokens, costSummary.totalTokens)
  const sortedModels = useMemo(
    () => sortedModelHotspots(costSummary.models, modelSort),
    [costSummary.models, modelSort],
  )

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredSessions = useMemo(() => data.sessions.filter(row => {
    if (normalizedQuery.length === 0) return true
    return row.title.toLocaleLowerCase().includes(normalizedQuery)
      || row.id.toLocaleLowerCase().includes(normalizedQuery)
      || row.models.some(model => routeLabel(model).toLocaleLowerCase().includes(normalizedQuery))
  }), [data.sessions, normalizedQuery])
  const visibleSessions = useMemo(
    () => filteredSessions.slice(0, sessionLimit),
    [filteredSessions, sessionLimit],
  )
  const selectedDay = useMemo(
    () => selectedDate === undefined
      ? undefined
      : (operationalDrilldown ? data.operationalDays : data.days).find(day => day.date === selectedDate),
    [data.days, data.operationalDays, operationalDrilldown, selectedDate],
  )
  const selectedDaySessions = useMemo(
    () => operationalDrilldown ? data.sessions.filter(row => row.dailyUsageReliable) : data.sessions,
    [data.sessions, operationalDrilldown],
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
            <Metric label={t('estimatedCost')} value={costSummary.coveredTokens === 0 ? '—' : formatUSD(costSummary.totalCostUSD)} />
            <Metric label={t('cacheReadSavings')} value={costSummary.coveredTokens === 0 ? '—' : formatUSD(costSummary.cacheReadSavingsUSD)} />
            <Metric label={t('priceCoverage')} value={`${priceCoverage}%`} />
            <Metric label={t('sessions')} value={data.sessions.length} />
          </div>

          <ActivityHeatmap days={data.days} selectedDate={selectedDate} onSelectDate={(date) => {
            setOperationalDrilldown(false)
            setSelectedDate(date)
          }} t={t} />
          {selectedDay === undefined ? null : <DayDrilldown day={selectedDay} sessions={selectedDaySessions} t={t} onClose={() => {
            setSelectedDate(undefined)
            setOperationalDrilldown(false)
          }} />}
          <PeriodInsights days={data.days} range={range} onRangeChange={setRange} t={t} />
          <EfficiencyPanel
            usage={data.usage}
            compactionUsage={data.compactionUsage}
            models={data.models}
            assistantAttempts={data.assistantRequests}
            compactionAttempts={data.compactionRequests}
            t={t}
          />
          <OperationsPanel days={data.operationalDays} dailyCoverage={data.dailyCoverage} onSelectDate={(date) => {
            setOperationalDrilldown(true)
            setSelectedDate(date)
          }} t={t} />
          <BudgetPanel operationalDays={data.operationalDays} dailyCoverage={data.dailyCoverage} snapshot={budget} setBudget={setBudget} t={t} />
          <div className={css.pricingNotice}>
            <strong>{t('pricingTitle')}</strong>
            <p>{t('pricingIntro', {
              asOf: PUBLIC_PRICE_CATALOG_AS_OF,
              covered: formatTokens(costSummary.coveredTokens),
              total: formatTokens(costSummary.totalTokens),
              routes: costSummary.coveredModels,
              allRoutes: costSummary.totalModels,
            })}</p>
            <a href={PUBLIC_PRICE_CATALOG_URL} target="_blank" rel="noreferrer">{t('pricingSource')}</a>
          </div>
          <UsageAnalysisPanel
            catalog={analysisCatalog}
            selectedModel={selectedAnalysisModel}
            state={usageReport}
            onSelectModel={setSelectedAnalysisModel}
            onRefreshCatalog={refreshAnalysisModels}
            onAnalyze={runUsageAnalysis}
            t={t}
          />
          <div className={css.block}>
            <div className={css.blockHead}>
              <h3>{t('modelBreakdown')}</h3>
              <label className={css.modelSort}>
                <span>{t('modelSort')}</span>
                <select aria-label={t('modelSort')} value={modelSort} onChange={(event) => { setModelSort(event.currentTarget.value as ModelSort) }}>
                  <option value="total">{t('modelSortTotal')}</option>
                  <option value="cost">{t('modelSortCost')}</option>
                  <option value="tokensPerAttempt">{t('modelSortTokensPerAttempt')}</option>
                  <option value="cacheReadShare">{t('modelSortCacheRead')}</option>
                </select>
              </label>
            </div>
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
                      <th>{t('estimatedCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedModels.map(model => (
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
                        <td>{model.totalCostUSD === undefined || model.rate === undefined
                          ? <span className={css.priceUnknown} title={t('priceUnavailable')}>—</span>
                          : <span className={css.priceValue} title={t('priceRate', {
                            input: model.rate.inputPerMillion,
                            output: model.rate.outputPerMillion,
                            cacheRead: model.rate.cacheReadPerMillion,
                            cacheWrite: model.rate.cacheWritePerMillion,
                            asOf: model.rate.asOf,
                          })}>{formatUSD(model.totalCostUSD)}</span>}</td>
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
                onChange={(event) => {
                  setQuery(event.currentTarget.value)
                  setSessionLimit(SESSION_PAGE_SIZE)
                }}
              />
            </div>
            <p className={css.analysisPrivacy}>{t('analysisPrivacy')}</p>
            {sessionOpenError === undefined ? null : <p className={css.analysisErrorText}>{t('openSessionFailed', { message: sessionOpenError })}</p>}
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
                    {visibleSessions.map(row => (
                      <tr key={row.id}>
                        <td><button className={css.sessionLink} type="button" title={row.id} onClick={() => { openUsageSession(row) }}>{row.title}</button><span>{row.id}</span></td>
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
            {filteredSessions.length > visibleSessions.length ? <button
              className={css.quietButton}
              type="button"
              onClick={() => { setSessionLimit(current => current + SESSION_PAGE_SIZE) }}
            >{t('showMoreSessions', { shown: visibleSessions.length, total: filteredSessions.length })}</button> : null}
          </div>
        </>
      )}
    </section>
  )
}
