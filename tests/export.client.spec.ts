import { describe, expect, it } from 'vitest'
import { dailyUsageCsv, modelDailyUsageCsv, modelUsageCsv, tokenUsageExport, tokenUsageJson, type UsageExportSource } from '../src/client/export.ts'

const source: UsageExportSource = {
  usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 },
  compactionUsage: { uncachedInputTokens: 3, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 0 },
  models: [{
    provider: '=formula-provider',
    model: 'model, "quoted"',
    assistantRequests: 2,
    compactionRequests: 1,
    usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 },
  }],
  days: [{ date: '2026-08-14', usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 } }],
  modelDays: [{
    date: '2026-08-14',
    provider: '=formula-provider',
    model: 'model, "quoted"',
    usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 },
  }],
  dailyCoverage: 'complete',
  modelDailyCoverage: 'complete',
}

describe('privacy-safe usage export', () => {
  it('exports only detached aggregate fields and no session identity or content', () => {
    const extended = {
      ...source,
      sessions: [{ id: 'session-private', title: '私密会话标题', prompt: 'secret prompt', response: 'secret response' }],
    }
    const exported = tokenUsageExport(extended, '2026-08-14T12:00:00.000Z')
    const json = tokenUsageJson(extended, '2026-08-14T12:00:00.000Z')

    expect(exported).toMatchObject({
      schema: 'dsh-token-usage/export-v3',
      generatedAt: '2026-08-14T12:00:00.000Z',
      timezone: 'UTC',
      totals: source.usage,
      compactionUsage: source.compactionUsage,
      pricingCatalogAsOf: '2025-08-07',
      coverage: { daily: 'complete', modelDaily: 'complete' },
      pricing: {
        totalCostUSD: 0,
        cacheReadSavingsUSD: 0,
        coveredTokens: 0,
        totalTokens: 18,
      },
      models: source.models,
      days: source.days,
      modelDays: source.modelDays,
    })
    expect(json).not.toContain('session-private')
    expect(json).not.toContain('私密会话标题')
    expect(json).not.toContain('secret prompt')
    exported.totals.outputTokens = 99
    expect(source.usage.outputTokens).toBe(2)
  })

  it('exports exact-route public cost and cache-read avoided cost without session data', () => {
    const priced: UsageExportSource = {
      usage: { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 },
      compactionUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      models: [{
        provider: 'openai', model: 'gpt-5-mini', assistantRequests: 1, compactionRequests: 0,
        usage: { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 },
      }],
      days: [],
      modelDays: [],
      dailyCoverage: 'complete',
      modelDailyCoverage: 'complete',
    }

    expect(tokenUsageExport(priced, '2026-08-14T12:00:00.000Z').pricing).toMatchObject({
      totalCostUSD: 2.525,
      cacheReadSavingsUSD: 0.225,
      coveredTokens: 4_000_000,
    })
    expect(modelUsageCsv(priced)).toContain('openai,gpt-5-mini,1,0,1000000,1000000,1000000,1000000,3000000,4000000,2.525,0.225,2025-08-07')
  })

  it('produces stable CSV with escaped and formula-neutralized route fields', () => {
    expect(dailyUsageCsv(source)).toBe([
      'date,uncachedInputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,inputTokens,totalTokens',
      '2026-08-14,10,2,5,1,16,18',
      '',
    ].join('\r\n'))
    expect(modelUsageCsv(source)).toContain("'=formula-provider,\"model, \"\"quoted\"\"\",2,1,10,2,5,1,16,18,,,")
    expect(modelDailyUsageCsv(source)).toContain("2026-08-14,'=formula-provider,\"model, \"\"quoted\"\"\",10,2,5,1,16,18")
    expect(modelDailyUsageCsv({
      modelDays: [{ ...source.modelDays[0]!, provider: '\t=1+1' }],
      modelDailyCoverage: 'complete',
    })).toContain(",'\t=1+1,")
  })

  it('discloses incomplete coverage in JSON and refuses misleading route-day CSV', () => {
    const partial = { ...source, dailyCoverage: 'partial' as const, modelDailyCoverage: 'partial' as const }

    expect(tokenUsageExport(partial, '2026-08-14T12:00:00.000Z').coverage).toEqual({
      daily: 'partial',
      modelDaily: 'partial',
    })
    expect(() => modelDailyUsageCsv(partial)).toThrow('requires complete and conserved route-day coverage')
  })
})
