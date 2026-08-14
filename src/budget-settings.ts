/** User-owned settings namespace for the Token usage dashboard. */
export const TOKEN_USAGE_SETTINGS_NAMESPACE = 'token-usage'

/** Persisted rolling-window Token budget; zero disables the budget. */
export interface TokenUsageBudgetSettings {
  rolling30DayBudget: number
}
