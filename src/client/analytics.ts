import type { DailyTokenUsageRecord, TokenUsageBuckets } from '../types.ts'

/** A session contribution to one selected UTC day. */
export interface DailySessionContributor {
  id: string
  title: string
  usage: TokenUsageBuckets
}

/** Minimum session data required to find one day's contributors. */
export interface DailySessionSource {
  id: string
  title: string
  days: readonly DailyTokenUsageRecord[]
}

/** Aggregate comparison for one trailing UTC period. */
export interface PeriodInsight {
  days: number
  usage: TokenUsageBuckets
  previousUsage: TokenUsageBuckets
  activeDays: number
  peak: DailyTokenUsageRecord | undefined
}

/** Complete-UTC-day burn rate projected to a rolling 30-day period. */
export interface RunRateInsight {
  observedDays: number
  averageDailyTokens: number
  projectedThirtyDayTokens: number
}

/** A robust comparison of yesterday's complete usage with preceding active days. */
export interface DailyAnomalyInsight {
  date: string
  tokens: number
  baselineMedianTokens: number
  baselineMadTokens: number
  activeBaselineDays: number
  ratio: number
  excessTokens: number
  status: 'normal' | 'elevated'
}

/** Detached zero buckets for analytics calculations. */
function zeroBuckets(): TokenUsageBuckets {
  return {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

/** Add two disjoint Token bucket sets. */
function addBuckets(left: TokenUsageBuckets, right: TokenUsageBuckets): TokenUsageBuckets {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  }
}

/** Full request/response total without counting reasoning output twice. */
function totalTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens
}

/** Stable UTC day key shared with the durable projection. */
function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** Build a newest-inclusive UTC date range. */
function datesEndingOn(now: number, length: number): string[] {
  const end = new Date(`${dayKey(now)}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() - length + 1)
  const dates: string[] = []
  for (let offset = 0; offset < length; offset += 1) {
    const date = new Date(end)
    date.setUTCDate(date.getUTCDate() + offset)
    dates.push(dayKey(date.getTime()))
  }
  return dates
}

/** Aggregate a fixed sequence of UTC dates from a daily bucket lookup. */
function aggregateDates(byDate: ReadonlyMap<string, TokenUsageBuckets>, dates: readonly string[]): TokenUsageBuckets {
  return dates.reduce((usage, date) => addBuckets(usage, byDate.get(date) ?? zeroBuckets()), zeroBuckets())
}

/** Derive period totals, comparison totals, activity, and the highest-use day. */
export function periodInsight(
  records: readonly DailyTokenUsageRecord[],
  days: number,
  now = Date.now(),
): PeriodInsight {
  const byDate = new Map(records.map(record => [record.date, record.usage]))
  const currentDates = datesEndingOn(now, days)
  const previousDates = datesEndingOn(now - days * 86_400_000, days)
  const currentRecords = currentDates.map(date => ({
    date,
    usage: { ...(byDate.get(date) ?? zeroBuckets()) },
  }))
  const active = currentRecords.filter(record => totalTokens(record.usage) > 0)
  const peak = active.reduce<DailyTokenUsageRecord | undefined>((highest, record) =>
    highest === undefined || totalTokens(record.usage) > totalTokens(highest.usage) ? record : highest,
  undefined)
  return {
    days,
    usage: aggregateDates(byDate, currentDates),
    previousUsage: aggregateDates(byDate, previousDates),
    activeDays: active.length,
    peak,
  }
}

/** Return the median of a non-empty numeric list without retaining a source reference. */
function median(values: readonly number[]): number {
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

/** Aggregate one complete UTC day range ending before the current partial day. */
function completeDaysEndingBefore(now: number, length: number): string[] {
  return datesEndingOn(now - 86_400_000, length)
}

/** Project a 30-day run rate from the latest seven complete UTC calendar days. */
export function runRateInsight(records: readonly DailyTokenUsageRecord[], now = Date.now()): RunRateInsight {
  const byDate = new Map(records.map(record => [record.date, record.usage]))
  const dates = completeDaysEndingBefore(now, 7)
  const tokens = dates.reduce((sum, date) => sum + totalTokens(byDate.get(date) ?? zeroBuckets()), 0)
  const averageDailyTokens = tokens / dates.length
  return {
    observedDays: dates.length,
    averageDailyTokens,
    projectedThirtyDayTokens: Math.round(averageDailyTokens * 30),
  }
}

/** Detect an elevated latest complete UTC day using the preceding 28 days' active-day median and MAD. */
export function dailyAnomalyInsight(
  records: readonly DailyTokenUsageRecord[],
  now = Date.now(),
): DailyAnomalyInsight | undefined {
  const byDate = new Map(records.map(record => [record.date, record.usage]))
  const [date] = completeDaysEndingBefore(now, 1)
  if (date === undefined) return undefined
  const tokens = totalTokens(byDate.get(date) ?? zeroBuckets())
  const baselineDates = datesEndingOn(now - 2 * 86_400_000, 28)
  const activeBaseline = baselineDates
    .map(baselineDate => totalTokens(byDate.get(baselineDate) ?? zeroBuckets()))
    .filter(value => value > 0)
  if (tokens === 0 || activeBaseline.length < 5) return undefined
  const baselineMedianTokens = median(activeBaseline)
  const baselineMadTokens = median(activeBaseline.map(value => Math.abs(value - baselineMedianTokens)))
  const robustThreshold = baselineMadTokens === 0
    ? baselineMedianTokens * 3
    : baselineMedianTokens + 3 * 1.4826 * baselineMadTokens
  const ratio = baselineMedianTokens === 0 ? 0 : tokens / baselineMedianTokens
  const excessTokens = Math.max(0, tokens - baselineMedianTokens)
  return {
    date,
    tokens,
    baselineMedianTokens,
    baselineMadTokens,
    activeBaselineDays: activeBaseline.length,
    ratio,
    excessTokens,
    status: tokens > robustThreshold ? 'elevated' : 'normal',
  }
}

/** List sessions contributing usage to one UTC day, highest usage first. */
export function dailyContributors(
  sessions: readonly DailySessionSource[],
  date: string,
): DailySessionContributor[] {
  return sessions.flatMap((session) => {
    const record = session.days.find(day => day.date === date)
    if (record === undefined || totalTokens(record.usage) === 0) return []
    return [{
      id: session.id,
      title: session.title,
      usage: { ...record.usage },
    }]
  }).sort((left, right) => totalTokens(right.usage) - totalTokens(left.usage)
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id))
}
