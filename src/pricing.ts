/** Built-in public API price estimates for exact model routes. */

import type {
  ModelTokenUsageRecord,
  PricedModelTokenUsageRecord,
  TokenUsageBuckets,
  TokenUsageCostSummary,
  TokenUsagePriceRate,
} from './types.ts'

const TOKENS_PER_MILLION = 1_000_000
const OPENAI_PRICING_URL = 'https://developers.openai.com/api/docs/pricing'

interface CatalogRate extends TokenUsagePriceRate {
  provider: string
  model: string
}

/**
 * OpenAI public USD API rates per million Tokens, retrieved from the official price page on 2025-08-07.
 *
 * Cache writes use the ordinary input price because these routes publish no separate cache-write tariff.
 * The catalog intentionally requires an exact provider/model match: relay, subscription, custom, and unknown
 * routes remain unpriced rather than borrowing a superficially similar rate.
 */
const PUBLIC_USD_RATES: readonly CatalogRate[] = [
  { provider: 'openai', model: 'gpt-5', currency: 'USD', inputPerMillion: 1.25, cacheReadPerMillion: 0.125, cacheWritePerMillion: 1.25, outputPerMillion: 10, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-08-07' },
  { provider: 'openai', model: 'gpt-5-2025-08-07', currency: 'USD', inputPerMillion: 1.25, cacheReadPerMillion: 0.125, cacheWritePerMillion: 1.25, outputPerMillion: 10, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-08-07' },
  { provider: 'openai', model: 'gpt-5-mini', currency: 'USD', inputPerMillion: 0.25, cacheReadPerMillion: 0.025, cacheWritePerMillion: 0.25, outputPerMillion: 2, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-08-07' },
  { provider: 'openai', model: 'gpt-5-mini-2025-08-07', currency: 'USD', inputPerMillion: 0.25, cacheReadPerMillion: 0.025, cacheWritePerMillion: 0.25, outputPerMillion: 2, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-08-07' },
  { provider: 'openai', model: 'gpt-5-nano', currency: 'USD', inputPerMillion: 0.05, cacheReadPerMillion: 0.005, cacheWritePerMillion: 0.05, outputPerMillion: 0.4, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-08-07' },
  { provider: 'openai', model: 'gpt-5-nano-2025-08-07', currency: 'USD', inputPerMillion: 0.05, cacheReadPerMillion: 0.005, cacheWritePerMillion: 0.05, outputPerMillion: 0.4, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-08-07' },
  { provider: 'openai', model: 'gpt-4.1', currency: 'USD', inputPerMillion: 2, cacheReadPerMillion: 0.5, cacheWritePerMillion: 2, outputPerMillion: 8, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-04-14' },
  { provider: 'openai', model: 'gpt-4.1-mini', currency: 'USD', inputPerMillion: 0.4, cacheReadPerMillion: 0.1, cacheWritePerMillion: 0.4, outputPerMillion: 1.6, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-04-14' },
  { provider: 'openai', model: 'gpt-4.1-nano', currency: 'USD', inputPerMillion: 0.1, cacheReadPerMillion: 0.025, cacheWritePerMillion: 0.1, outputPerMillion: 0.4, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-04-14' },
  { provider: 'openai', model: 'gpt-4o', currency: 'USD', inputPerMillion: 2.5, cacheReadPerMillion: 1.25, cacheWritePerMillion: 2.5, outputPerMillion: 10, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-04-14' },
  { provider: 'openai', model: 'gpt-4o-mini', currency: 'USD', inputPerMillion: 0.15, cacheReadPerMillion: 0.075, cacheWritePerMillion: 0.15, outputPerMillion: 0.6, sourceUrl: OPENAI_PRICING_URL, asOf: '2025-04-14' },
]

/** Version marker displayed with every estimate, not a live pricing feed. */
export const PUBLIC_PRICE_CATALOG_AS_OF = '2025-08-07'

/** Return a detached public rate only for an exact first-party API route. */
export function publicPriceFor(provider: string, model: string): TokenUsagePriceRate | undefined {
  const rate = PUBLIC_USD_RATES.find(entry => entry.provider === provider && entry.model === model)
  return rate === undefined ? undefined : {
    currency: rate.currency,
    inputPerMillion: rate.inputPerMillion,
    outputPerMillion: rate.outputPerMillion,
    cacheReadPerMillion: rate.cacheReadPerMillion,
    cacheWritePerMillion: rate.cacheWritePerMillion,
    sourceUrl: rate.sourceUrl,
    asOf: rate.asOf,
  }
}

/** Return complete Tokens across the four disjoint provider-reported buckets. */
export function totalTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Calculate one exact-route USD estimate from a fully published four-bucket rate. */
export function estimateCostUSD(usage: TokenUsageBuckets, rate: TokenUsagePriceRate): number {
  return (
    usage.uncachedInputTokens * rate.inputPerMillion
    + usage.outputTokens * rate.outputPerMillion
    + usage.cacheReadTokens * rate.cacheReadPerMillion
    + usage.cacheWriteTokens * rate.cacheWritePerMillion
  ) / TOKENS_PER_MILLION
}

/** Add built-in public USD pricing to model aggregates without pricing unknown routes. */
export function tokenUsageCostSummary(models: readonly ModelTokenUsageRecord[]): TokenUsageCostSummary {
  let totalCostUSD = 0
  let coveredTokens = 0
  let totalTokensCount = 0
  let coveredModels = 0
  const pricedModels: PricedModelTokenUsageRecord[] = models.map(model => {
    const usage = { ...model.usage }
    const total = totalTokens(usage)
    totalTokensCount += total
    const rate = publicPriceFor(model.provider, model.model)
    if (rate === undefined) {
      return {
        provider: model.provider,
        model: model.model,
        assistantRequests: model.assistantRequests,
        compactionRequests: model.compactionRequests,
        usage,
      }
    }
    const totalCost = estimateCostUSD(usage, rate)
    totalCostUSD += totalCost
    coveredTokens += total
    if (total > 0) coveredModels += 1
    return {
      provider: model.provider,
      model: model.model,
      assistantRequests: model.assistantRequests,
      compactionRequests: model.compactionRequests,
      usage,
      totalCostUSD: totalCost,
      rate,
    }
  })
  return {
    currency: 'USD',
    totalCostUSD,
    coveredTokens,
    totalTokens: totalTokensCount,
    coveredModels,
    totalModels: models.filter(model => totalTokens(model.usage) > 0).length,
    models: pricedModels,
  }
}
