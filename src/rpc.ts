/** Shared private RPC names used by the Host and browser halves. */
export const TOKEN_USAGE_RPC_CHANNEL = '/token-usage'

/** Version-stable endpoint names for Token usage preferences and analysis. */
export const TOKEN_USAGE_RPC_ENDPOINT = {
  budgetRead: 'budget/read',
  budgetWrite: 'budget/write',
  trajectoryAnalyze: 'trajectory/analyze',
} as const
