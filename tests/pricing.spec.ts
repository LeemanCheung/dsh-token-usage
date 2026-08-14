import { describe, expect, it } from 'vitest'
import { estimateCostUSD, publicPriceFor, tokenUsageCostSummary } from '../src/pricing.ts'

const usage = {
  uncachedInputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 1_000_000,
  cacheWriteTokens: 1_000_000,
}

describe('public Token price estimates', () => {
  it('uses all four disjoint buckets for an exact public route', () => {
    const rate = publicPriceFor('openai', 'gpt-5-mini')

    expect(rate).toMatchObject({
      currency: 'USD',
      inputPerMillion: 0.25,
      outputPerMillion: 2,
      cacheReadPerMillion: 0.025,
      cacheWritePerMillion: 0.25,
    })
    expect(estimateCostUSD(usage, rate!)).toBeCloseTo(2.525)
  })

  it('does not borrow a price for a relay or unknown model and reports partial coverage', () => {
    const summary = tokenUsageCostSummary([
      { provider: 'openai', model: 'gpt-5-mini', assistantRequests: 1, compactionRequests: 0, usage },
      {
        provider: 'openai-codex', model: 'gpt-5-mini', assistantRequests: 2, compactionRequests: 0,
        usage: { uncachedInputTokens: 100, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 400 },
      },
    ])

    expect(publicPriceFor('openai-codex', 'gpt-5-mini')).toBeUndefined()
    expect(summary).toMatchObject({
      currency: 'USD',
      totalCostUSD: 2.525,
      cacheReadSavingsUSD: 0.225,
      coveredTokens: 4_000_000,
      totalTokens: 4_001_000,
      coveredModels: 1,
      totalModels: 2,
    })
    expect(summary.models[0]).toMatchObject({ totalCostUSD: 2.525 })
    expect(summary.models[1]).not.toHaveProperty('totalCostUSD')
  })
})
