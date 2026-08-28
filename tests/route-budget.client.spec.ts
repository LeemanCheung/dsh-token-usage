import { describe, expect, it } from 'vitest'
import { routeBudgetInsight, routeBudgetInsights } from '../src/client/route-budget.ts'
import type { ModelDailyTokenUsageRecord } from '../src/types.ts'

const NOW = Date.UTC(2026, 7, 15, 12)

function record(provider: string, model: string, date: string, tokens: number): ModelDailyTokenUsageRecord {
  return {
    provider,
    model,
    date,
    usage: { uncachedInputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  }
}

describe('route budget insight', () => {
  it('distinguishes healthy, 80% warning, forecast overage, and actual overage states', () => {
    expect(routeBudgetInsight(
      { provider: 'p', model: 'healthy', rolling30DayBudget: 100 },
      [record('p', 'healthy', '2026-08-14', 10)],
      NOW,
    )).toMatchObject({ usedTokens: 10, projectedThirtyDayTokens: 43, ratio: 0.1, status: 'healthy' })

    expect(routeBudgetInsight(
      { provider: 'p', model: 'warning', rolling30DayBudget: 100 },
      [record('p', 'warning', '2026-07-20', 80)],
      NOW,
    )).toMatchObject({ usedTokens: 80, projectedThirtyDayTokens: 0, ratio: 0.8, status: 'warning' })

    const recent = [8, 9, 10, 11, 12, 13, 14].map(day => record('p', 'forecast', `2026-08-${String(day).padStart(2, '0')}`, 10))
    expect(routeBudgetInsight(
      { provider: 'p', model: 'forecast', rolling30DayBudget: 200 },
      recent,
      NOW,
    )).toMatchObject({ usedTokens: 70, projectedThirtyDayTokens: 300, ratio: 0.35, status: 'forecast-exceeded' })

    expect(routeBudgetInsight(
      { provider: 'p', model: 'exceeded', rolling30DayBudget: 100 },
      [record('p', 'exceeded', '2026-08-14', 100)],
      NOW,
    )).toMatchObject({ usedTokens: 100, projectedThirtyDayTokens: 429, ratio: 1, status: 'exceeded' })
  })

  it('uses exact provider/model identity and sorts the highest-risk routes first', () => {
    const budgets = [
      { provider: 'p', model: 'healthy', rolling30DayBudget: 1_000 },
      { provider: 'p', model: 'exceeded', rolling30DayBudget: 50 },
      { provider: 'other', model: 'exceeded', rolling30DayBudget: 50 },
    ]
    const records = [
      record('p', 'exceeded', '2026-08-14', 60),
      record('other', 'exceeded', '2026-08-14', 20),
      record('p', 'healthy', '2026-08-14', 10),
    ]

    expect(routeBudgetInsights(budgets, records, NOW).map(insight => [insight.provider, insight.model, insight.status])).toEqual([
      ['p', 'exceeded', 'exceeded'],
      ['other', 'exceeded', 'forecast-exceeded'],
      ['p', 'healthy', 'healthy'],
    ])
  })
})
