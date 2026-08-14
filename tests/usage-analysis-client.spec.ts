import { describe, expect, it, vi } from 'vitest'
import {
  analysisModelCatalogOf,
  requestAnalysisModels,
  requestTokenUsageAnalysis,
} from '../src/client/usage-analysis-client.ts'

const input = {
  usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 1 },
  compactionUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  models: [],
  days: [],
}

describe('usage analysis client', () => {
  it('accepts only catalog defaults that belong to its selectable models', () => {
    expect(analysisModelCatalogOf({
      models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }],
      default: { provider: 'deepseek', model: 'chat' },
    })).toEqual({
      models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }],
      default: { provider: 'deepseek', model: 'chat' },
    })
    expect(analysisModelCatalogOf({
      models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }],
      default: { provider: 'other', model: 'other' },
    })).toEqual({
      models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }],
    })
  })

  it('uses loopback RPC endpoints with a selected route and aggregate payload', async () => {
    const call = vi.fn(async (_channel: string, endpoint: string) => endpoint === 'analysis/models'
      ? { ok: true as const, value: { models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }] } }
      : {
          ok: true as const,
          value: {
            schema: 'dsh-token-usage/usage-analysis-v1',
            generatedAt: '2026-08-14T00:00:00.000Z',
            model: { provider: 'deepseek', model: 'chat' },
            report: '# Report',
          },
        })
    const connection = { isLoopback: true, rpc: { call } } as never

    await expect(requestAnalysisModels(connection, new AbortController().signal)).resolves.toMatchObject({ models: [{ model: 'chat' }] })
    await expect(requestTokenUsageAnalysis(
      connection,
      input,
      { provider: 'deepseek', model: 'chat' },
      'en',
      new AbortController().signal,
    )).resolves.toMatchObject({ report: '# Report' })
    expect(call).toHaveBeenNthCalledWith(1, '/token-usage', 'analysis/models', {}, expect.any(AbortSignal))
    expect(call).toHaveBeenNthCalledWith(2, '/token-usage', 'usage/analyze', {
      input,
      model: { provider: 'deepseek', model: 'chat' },
      language: 'en',
    }, expect.any(AbortSignal))
  })
})
