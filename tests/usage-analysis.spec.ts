import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { analyzeTokenUsage, usageAnalysisEvidence } from '../src/usage-analysis.ts'

const usage = (uncachedInputTokens: number, outputTokens = 0) => ({
  uncachedInputTokens,
  outputTokens,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

describe('aggregate Token usage analysis', () => {
  it('keeps only detached aggregate model and date evidence in bounded contribution order', () => {
    const input = {
      usage: usage(120, 30),
      models: [
        { provider: 'small', model: 'model', assistantRequests: 1, compactionRequests: 0, usage: usage(1) },
        { provider: 'large', model: 'model', assistantRequests: 2, compactionRequests: 1, usage: usage(100, 10) },
      ],
      days: [
        { date: '2026-08-14', usage: usage(100) },
        { date: '2026-08-12', usage: usage(20) },
      ],
    }

    const evidence = usageAnalysisEvidence(input)

    expect(evidence.models.map(model => [model.provider, model.model])).toEqual([
      ['route', 'route-1'],
      ['route', 'route-2'],
    ])
    expect(JSON.stringify(evidence)).not.toContain('large')
    expect(JSON.stringify(evidence)).not.toContain('small')
    expect(usageAnalysisEvidence({
      ...input,
      models: input.models.map((model, index) => ({
        ...model,
        provider: `private-tenant-${index}`,
        model: `private-model-${index}`,
      })),
    })).toEqual(evidence)
    expect(evidence.days.map(day => day.date)).toEqual(['2026-08-12', '2026-08-14'])
    evidence.models[0]!.usage.outputTokens = 99
    expect(input.models[1]!.usage.outputTokens).toBe(10)
    expect(JSON.stringify(evidence)).not.toContain('session')
  })

  it('keeps public cost evidence route-anonymous and marks partial coverage', () => {
    const evidence = usageAnalysisEvidence({
      usage: usage(1_000_000, 1_000_000),
      models: [
        {
          provider: 'openai', model: 'gpt-5-mini', assistantRequests: 1, compactionRequests: 0,
          usage: { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 },
        },
        { provider: 'private-relay', model: 'internal', assistantRequests: 1, compactionRequests: 0, usage: usage(10) },
      ],
      days: [],
    })

    expect(evidence.pricing).toMatchObject({
      currency: 'USD',
      estimatedCostUSD: 2.525,
      coveredTokens: 4_000_000,
      totalTokens: 4_000_010,
      coveredModels: 1,
      totalModels: 2,
      routes: [
        { route: 'route-1', estimatedCostUSD: 2.525 },
        { route: 'route-2' },
      ],
    })
    expect(JSON.stringify(evidence)).not.toContain('gpt-5-mini')
    expect(JSON.stringify(evidence)).not.toContain('private-relay')
  })

  it('dispatches one selected model call with aggregate-only evidence and returns its Token usage', async () => {
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# Usage overview\n\nCache efficiency is high.' }
      yield { type: 'usage' as const, usage: { inputTokens: 200, outputTokens: 40 } }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    })
    const prepareCall = vi.fn(async (config: { provider: string; model: string; maxTokens: number }) => ({
      config,
      retryPolicy: {},
      adapterDefaults: {},
      stream,
    }))
    const ctx = { llm: { prepareCall } } as unknown as Context

    const result = await analyzeTokenUsage(ctx, {
      usage: usage(100, 20),
      models: [{ provider: 'provider-a', model: 'model-a', assistantRequests: 2, compactionRequests: 0, usage: usage(100, 20) }],
      days: [{ date: '2026-08-14', usage: usage(100, 20) }],
    }, { provider: 'chosen', model: 'finops-model' }, 'en', new AbortController().signal)

    expect(prepareCall).toHaveBeenCalledWith({ provider: 'chosen', model: 'finops-model', maxTokens: 2_600 }, expect.any(AbortSignal))
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'chosen',
      model: 'finops-model',
      messages: expect.any(Array),
      system: expect.stringContaining('Prioritized optimization recommendations'),
    }))
    const request = stream.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ text: string }> }> }
    const evidenceRequest = request.messages[0]?.content[0]?.text
    expect(evidenceRequest).not.toContain('sessionId')
    expect(evidenceRequest).not.toContain('provider-a')
    expect(evidenceRequest).not.toContain('model-a')
    expect(result).toMatchObject({
      schema: 'dsh-token-usage/usage-analysis-v1',
      model: { provider: 'chosen', model: 'finops-model' },
      analysisUsage: usage(200, 40),
      report: '# Usage overview\n\nCache efficiency is high.',
    })
  })
})
