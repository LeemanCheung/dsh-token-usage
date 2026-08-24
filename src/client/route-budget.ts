import type { TokenUsageRouteBudget } from '../budget-settings.ts'
import type { DailyTokenUsageRecord, ModelDailyTokenUsageRecord, TokenUsageBuckets } from '../types.ts'
import { periodInsight, runRateInsight } from './analytics.ts'

/** Fixed warning threshold before an exact route reaches its hard Token budget. */
export const ROUTE_BUDGET_WARNING_RATIO = 0.8

/** Actionable state for one exact provider/model rolling Token budget. */
export interface RouteBudgetInsight extends TokenUsageRouteBudget {
  usedTokens: number
  projectedThirtyDayTokens: number
  ratio: number
  status: 'healthy' | 'warning' | 'forecast-exceeded' | 'exceeded'
}

/** Sum all four disjoint provider Token buckets. */
function totalTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens
}

/** Evaluate one route budget from exact date-by-model buckets. */
export function routeBudgetInsight(
  budget: TokenUsageRouteBudget,
  records: readonly ModelDailyTokenUsageRecord[],
  now = Date.now(),
): RouteBudgetInsight {
  const days: DailyTokenUsageRecord[] = records
    .filter(record => record.provider === budget.provider && record.model === budget.model)
    .map(record => ({ date: record.date, usage: { ...record.usage } }))
  const usedTokens = totalTokens(periodInsight(days, 30, now).usage)
  const projectedThirtyDayTokens = runRateInsight(days, now).projectedThirtyDayTokens
  const ratio = usedTokens / budget.rolling30DayBudget
  const status = usedTokens >= budget.rolling30DayBudget
    ? 'exceeded'
    : projectedThirtyDayTokens > budget.rolling30DayBudget
      ? 'forecast-exceeded'
      : ratio >= ROUTE_BUDGET_WARNING_RATIO ? 'warning' : 'healthy'
  return {
    ...budget,
    usedTokens,
    projectedThirtyDayTokens,
    ratio,
    status,
  }
}

const STATUS_PRIORITY: Record<RouteBudgetInsight['status'], number> = {
  exceeded: 3,
  'forecast-exceeded': 2,
  warning: 1,
  healthy: 0,
}

/** Evaluate and risk-sort every persisted exact-route budget without mutating settings. */
export function routeBudgetInsights(
  budgets: readonly TokenUsageRouteBudget[],
  records: readonly ModelDailyTokenUsageRecord[],
  now = Date.now(),
): RouteBudgetInsight[] {
  return budgets
    .map(budget => routeBudgetInsight(budget, records, now))
    .sort((left, right) => STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status]
      || right.ratio - left.ratio
      || left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model))
}
