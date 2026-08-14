import { describe, expect, it } from 'vitest'
import { dailyUsageCsv, modelUsageCsv, tokenUsageExport, tokenUsageJson, type UsageExportSource } from '../src/client/export.ts'

const source: UsageExportSource = {
  usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 },
  models: [{
    provider: '=formula-provider',
    model: 'model, "quoted"',
    assistantRequests: 2,
    compactionRequests: 1,
    usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 },
  }],
  days: [{ date: '2026-08-14', usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 } }],
}

describe('privacy-safe usage export', () => {
  it('exports only detached aggregate fields and no session identity or content', () => {
    const extended = {
      ...source,
      sessions: [{ id: 'session-private', title: '私密会话标题', prompt: 'secret prompt', response: 'secret response' }],
    }
    const exported = tokenUsageExport(extended, '2026-08-14T12:00:00.000Z')
    const json = tokenUsageJson(extended, '2026-08-14T12:00:00.000Z')

    expect(exported).toEqual({
      schema: 'dsh-token-usage/export-v1',
      generatedAt: '2026-08-14T12:00:00.000Z',
      timezone: 'UTC',
      totals: source.usage,
      models: source.models,
      days: source.days,
    })
    expect(json).not.toContain('session-private')
    expect(json).not.toContain('私密会话标题')
    expect(json).not.toContain('secret prompt')
    exported.totals.outputTokens = 99
    expect(source.usage.outputTokens).toBe(2)
  })

  it('produces stable CSV with escaped and formula-neutralized route fields', () => {
    expect(dailyUsageCsv(source)).toBe([
      'date,uncachedInputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,inputTokens,totalTokens',
      '2026-08-14,10,2,5,1,16,18',
      '',
    ].join('\r\n'))
    expect(modelUsageCsv(source)).toContain("'=formula-provider,\"model, \"\"quoted\"\"\",2,1,10,2,5,1,16,18")
  })
})
