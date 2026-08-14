import { useMemo, useState, type ReactNode } from 'react'
import type { SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type {
  DailyTokenUsageRecord,
  ModelTokenUsageRecord,
  TokenUsageBuckets,
  TokenUsageRecorderProjection,
} from '../types.ts'
import { NS } from './locales.ts'
import css from './TokenUsageSection.module.css'

/** Full props assembled by the root-scoped Settings section renderer. */
export type TokenUsageSectionProps = PropsRuntime<'settings.section'> & PropsLocale<typeof NS>

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
  tokens: number
  level: 0 | 1 | 2 | 3 | 4
}

/** Build Monday-first calendar cells for the previous 52 weeks. */
function activityCalendar(days: readonly DailyTokenUsageRecord[], now = Date.now()): ActivityDay[] {
  const byDate = new Map(days.map(day => [day.date, totalTokens(day.usage)]))
  const end = new Date(`${dayKey(now)}T00:00:00.000Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 364)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))

  const dates: string[] = []
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(dayKey(cursor.getTime()))
  }
  const maximum = Math.max(0, ...dates.map(date => byDate.get(date) ?? 0))
  return dates.map((date) => {
    const tokens = byDate.get(date) ?? 0
    const level = tokens === 0 || maximum === 0 ? 0 : Math.ceil(tokens / maximum * 4) as ActivityDay['level']
    return { date, tokens, level }
  })
}

/** Render a GitHub-style calendar heatmap of daily Token activity. */
function ActivityHeatmap({ days, t }: { days: readonly DailyTokenUsageRecord[]; t: TokenUsageSectionProps['t'] }): ReactNode {
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
        {calendar.map(day => (
          <i
            key={day.date}
            role="gridcell"
            data-level={day.level}
            title={t('activityTooltip', { date: day.date, tokens: formatTokens(day.tokens) })}
            aria-label={t('activityTooltip', { date: day.date, tokens: formatTokens(day.tokens) })}
          />
        ))}
      </div>
    </div>
  )
}

/** Render durable Token usage across all listed sessions. */
export function TokenUsageSection({ useSessions, t }: TokenUsageSectionProps): ReactNode {
  const phase = useSessions(state => state.phase)
  const ids = useSessions(state => state.ids)
  const byId = useSessions(state => state.byId)
  const [query, setQuery] = useState('')

  const data = useMemo(
    () => aggregateUsage(ids.map(id => byId[id]).filter((value): value is SessionSummary => value !== undefined)),
    [byId, ids],
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredSessions = useMemo(() => data.sessions.filter(row => {
    if (normalizedQuery.length === 0) return true
    return row.title.toLocaleLowerCase().includes(normalizedQuery)
      || row.id.toLocaleLowerCase().includes(normalizedQuery)
      || row.models.some(model => routeLabel(model).toLocaleLowerCase().includes(normalizedQuery))
  }), [data.sessions, normalizedQuery])
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

          <ActivityHeatmap days={data.days} t={t} />

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
