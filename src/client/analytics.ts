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
