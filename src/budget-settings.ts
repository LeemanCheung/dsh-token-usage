/** User-owned settings namespace for the Token usage dashboard. */
export const TOKEN_USAGE_SETTINGS_NAMESPACE = 'token-usage'

/** One exact provider/model rolling-window Token budget. */
export interface TokenUsageRouteBudget {
  provider: string
  model: string
  /** Zero is never persisted; removing a rule disables its budget. */
  rolling30DayBudget: number
}

/** Persisted global and route-scoped rolling-window Token budgets. */
export interface TokenUsageBudgetSettings {
  /** Zero disables the global budget. */
  rolling30DayBudget: number
  /** Exact-route budgets evaluated only when date-by-model coverage is complete. */
  routeBudgets: TokenUsageRouteBudget[]
}
