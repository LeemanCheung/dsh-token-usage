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
      assistantRequests: 3,
      compactionRequests: 1,
      compactionUsage: usage(0),
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

    expect(evidence).toMatchObject({ assistantRequests: 3, compactionRequests: 1 })
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

  it('stably bounds anonymous model evidence and keeps the latest 366 UTC days', () => {
    const models = Array.from({ length: 60 }, (_, index) => ({
      provider: `private-provider-${index}`,
      model: `private-model-${index}`,
      assistantRequests: 1,
      compactionRequests: 0,
      usage: usage(10, 2),
    }))
    const days = Array.from({ length: 400 }, (_, index) => ({
      date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
      usage: usage(index + 1),
    })).reverse()
    const input = {
      usage: usage(1_000, 200),
      assistantRequests: 60,
      compactionRequests: 0,
      compactionUsage: usage(0),
      models,
      days,
    }

    const evidence = usageAnalysisEvidence(input)
    const renamed = usageAnalysisEvidence({
      ...input,
      models: models.map((model, index) => ({
        ...model,
        provider: `renamed-provider-${index}`,
        model: `renamed-model-${index}`,
      })),
    })

    const sortedDays = days.slice().sort((left, right) => left.date.localeCompare(right.date))
    expect(evidence.models).toHaveLength(48)
    expect(evidence.models.map(model => model.model)).toEqual(Array.from({ length: 48 }, (_, index) => `route-${index + 1}`))
    expect(renamed).toEqual(evidence)
    expect(JSON.stringify(evidence.models)).not.toContain('private-')
    expect(evidence.days).toHaveLength(366)
    expect(evidence.days[0]?.date).toBe(sortedDays[34]?.date)
    expect(evidence.days.at(-1)?.date).toBe(sortedDays.at(-1)?.date)
  })

  it('does not let local price matches fingerprint raw routes in model evidence', () => {
    const input = {
      usage: usage(1_000_000, 1_000_000),
      assistantRequests: 1,
      compactionRequests: 1,
      compactionUsage: usage(100),
      models: [{
        provider: 'openai', model: 'gpt-5-mini', assistantRequests: 1, compactionRequests: 0,
        usage: { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 },
      }],
      days: [],
    }
    const pricedRoute = usageAnalysisEvidence(input)
    const renamedRoute = usageAnalysisEvidence({
      ...input,
      models: input.models.map(model => ({ ...model, provider: 'private-relay', model: 'internal' })),
    })

    expect(renamedRoute).toEqual(pricedRoute)
    expect(pricedRoute.compactionUsage).toEqual(usage(100))
    expect(pricedRoute).not.toHaveProperty('pricing')
    expect(JSON.stringify(pricedRoute)).not.toContain('gpt-5-mini')
  })

  it('rejects a stream that ends without a terminal finish reason', async () => {
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# Partial report' }
    })
    const ctx = { llm: { prepareCall: async (config: { provider: string; model: string; maxTokens: number }) => ({
      config,
      retryPolicy: {},
      adapterDefaults: {},
      stream,
    }) } } as unknown as Context

    await expect(analyzeTokenUsage(ctx, {
      usage: usage(100, 20),
      assistantRequests: 1,
      compactionRequests: 0,
      compactionUsage: usage(0),
      models: [],
      days: [],
    }, { provider: 'chosen', model: 'finops-model' }, 'en', new AbortController().signal))
      .rejects.toThrow('without a terminal finish reason')
  })

  it('rejects model data emitted after the terminal finish reason', async () => {
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# Report' }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
      yield { type: 'text-delta' as const, index: 0, text: '\nlate data' }
    })
    const ctx = { llm: { prepareCall: async (config: { provider: string; model: string; maxTokens: number }) => ({
      config,
      retryPolicy: {},
      adapterDefaults: {},
      stream,
    }) } } as unknown as Context

    await expect(analyzeTokenUsage(ctx, {
      usage: usage(100, 20),
      assistantRequests: 1,
      compactionRequests: 0,
      compactionUsage: usage(0),
      models: [],
      days: [],
    }, { provider: 'chosen', model: 'finops-model' }, 'en', new AbortController().signal))
      .rejects.toThrow('after its terminal finish reason')
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
      assistantRequests: 2,
      compactionRequests: 0,
      compactionUsage: usage(0),
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
