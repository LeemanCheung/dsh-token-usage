import { describe, expect, it } from 'vitest'
import { usageEfficiencyInsight } from '../src/client/efficiency.ts'

const usage = (uncachedInputTokens: number, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0) => ({
  uncachedInputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
})

describe('aggregate usage efficiency', () => {
  it('derives exact assistant efficiency, compaction tax, and stable top route shares', () => {
    const insight = usageEfficiencyInsight(
      usage(100, 50, 50, 10),
      usage(20, 10, 0, 0),
      [
        { provider: 'b', model: 'route', assistantRequests: 1, compactionRequests: 1, usage: usage(50, 30, 0, 0) },
        { provider: 'a', model: 'route', assistantRequests: 2, compactionRequests: 0, usage: usage(50, 20, 50, 0) },
        { provider: '', model: '', assistantRequests: 0, compactionRequests: 0, usage: usage(0, 0, 0, 10) },
      ],
      3,
      2,
    )

    expect(insight).toMatchObject({
      assistantAttempts: 3,
      compactionAttempts: 2,
      assistantTokens: 180,
      tokensPerAssistantAttempt: undefined,
      compactionTokenShare: 1 / 7,
      cacheReadInputShare: 0.3125,
      cacheWriteInputShare: 0.0625,
      uncachedInputShare: 0.625,
      outputToInputRatio: 0.3125,
      unattributedTokenShare: 1 / 21,
      topRoutes: [
        { provider: 'a', model: 'route', tokens: 120, share: 4 / 7 },
        { provider: 'b', model: 'route', tokens: 80, share: 8 / 21 },
      ],
    })
    expect(insight.compactionsPerHundredAssistantAttempts).toBeCloseTo(200 / 3)
  })

  it('computes a per-attempt assistant average with fully attributed usage', () => {
    const insight = usageEfficiencyInsight(
      usage(10, 10),
      usage(2, 2),
      [{ provider: 'provider', model: 'model', assistantRequests: 2, compactionRequests: 1, usage: usage(10, 10) }],
      2,
      1,
    )

    expect(insight.tokensPerAssistantAttempt).toBe(8)
  })

  it('returns undefined instead of dividing zero-count or zero-input records', () => {
    const insight = usageEfficiencyInsight(usage(0), usage(0), [], 0, 0)

    expect(insight).toMatchObject({
      tokensPerAssistantAttempt: undefined,
      compactionsPerHundredAssistantAttempts: undefined,
      compactionTokenShare: undefined,
      cacheReadInputShare: undefined,
      outputToInputRatio: undefined,
      topRoutes: [],
    })
  })
})
