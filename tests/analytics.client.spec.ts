import { describe, expect, it } from 'vitest'
import { dailyContributors, periodInsight } from '../src/client/analytics.ts'

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
