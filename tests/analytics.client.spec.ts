import { describe, expect, it } from 'vitest'
import { dailyAnomalyInsight, dailyContributors, periodInsight, runRateInsight } from '../src/client/analytics.ts'

const usage = (uncachedInputTokens: number, outputTokens = 0) => ({
  uncachedInputTokens,
  outputTokens,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

describe('dashboard analytics', () => {
  it('compares a UTC period with its preceding period and selects its peak', () => {
    const insight = periodInsight([
      { date: '2026-08-07', usage: usage(50) },
      { date: '2026-08-10', usage: usage(20, 5) },
      { date: '2026-08-14', usage: usage(100) },
    ], 7, Date.UTC(2026, 7, 14, 12))

    expect(insight.usage).toEqual(usage(120, 5))
    expect(insight.previousUsage).toEqual(usage(50))
    expect(insight.activeDays).toBe(2)
    expect(insight.peak).toEqual({ date: '2026-08-14', usage: usage(100) })
  })

  it('projects a 30-day run rate from seven complete UTC days only', () => {
    const insight = runRateInsight([
      ...['08', '09', '10', '11', '12', '13', '14'].map(date => ({ date: `2026-08-${date}`, usage: usage(10) })),
      { date: '2026-08-15', usage: usage(9_999) },
    ], Date.UTC(2026, 7, 15, 12))

    expect(insight).toEqual({ observedDays: 7, averageDailyTokens: 10, projectedThirtyDayTokens: 300 })
  })

  it('detects an elevated latest complete day from the preceding active-day median and rejects sparse baselines', () => {
    const now = Date.UTC(2026, 7, 30, 12)
    const records = [
      ...['01', '08', '14', '20', '28'].map(date => ({ date: `2026-08-${date}`, usage: usage(100) })),
      { date: '2026-08-29', usage: usage(1_000) },
    ]

    expect(dailyAnomalyInsight(records, now)).toMatchObject({
      date: '2026-08-29',
      tokens: 1_000,
      baselineMedianTokens: 100,
      baselineMadTokens: 0,
      activeBaselineDays: 5,
      ratio: 10,
      excessTokens: 900,
      status: 'elevated',
    })
    expect(dailyAnomalyInsight(records.slice(1), now)).toBeUndefined()
    expect(dailyAnomalyInsight([
      ...records.slice(0, -1),
      { date: '2026-08-29', usage: usage(200) },
    ], now)).toMatchObject({ status: 'normal', ratio: 2, excessTokens: 100 })
  })

  it('sorts selected-day contributors and detaches their buckets', () => {
    const sessions = [
      { id: 'b', title: '较少', days: [{ date: '2026-08-14', usage: usage(20) }] },
      { id: 'a', title: '较多', days: [{ date: '2026-08-14', usage: usage(100) }] },
      { id: 'c', title: '其他日期', days: [{ date: '2026-08-13', usage: usage(999) }] },
    ]

    const contributors = dailyContributors(sessions, '2026-08-14')

    expect(contributors.map(contributor => contributor.id)).toEqual(['a', 'b'])
    contributors[0]!.usage.outputTokens = 7
    expect(sessions[1]!.days[0]!.usage.outputTokens).toBe(0)
  })
})
