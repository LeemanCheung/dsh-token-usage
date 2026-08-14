import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, inject } from '../src/index.ts'

function rpcServices() {
  const settings = { rolling30DayBudget: 0 }
  return {
    settings: {
      register: vi.fn(() => ({
        get: () => settings,
        update: vi.fn(async (next: typeof settings) => { settings.rolling30DayBudget = next.rolling30DayBudget }),
      })),
    },
    connection: { rpc: { handle: vi.fn(() => async () => {}) } },
    plugin: vi.fn(function (this: Context, plugin: { apply(ctx: Context): void }) {
      plugin.apply(this)
      return {}
    }),
    get: vi.fn(function (this: Record<string, unknown>, service: string) { return this[service] }),
  }
}

describe('host apply', () => {
  it('keeps optional settings and model services out of core activation dependencies', () => {
    expect(inject).toEqual(['sessionProjections', 'sessionProjectionCache', 'sessionQuery', 'sessions'])
  })

  it('persists valid rolling budgets and rejects invalid values through the loopback channel', async () => {
    const rpc = rpcServices()
    const ctx = {
      ...rpc,
      sessionProjections: { register: vi.fn() },
      sessionQuery: { listSessions: vi.fn(async () => []) },
      sessions: { get: vi.fn() },
      sessionProjectionCache: { write: vi.fn(), coldSnapshot: vi.fn() },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => unknown) => install()),
    } as unknown as Context

    apply(ctx)

    const handler = rpc.connection.rpc.handle.mock.calls[0]?.[1] as (
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<{ ok: boolean; value?: { rolling30DayBudget: number }; error?: { code: string } }>
    const written = await handler('budget/write', { rolling30DayBudget: 250 }, new AbortController().signal)
    const rejected = await handler('budget/write', { rolling30DayBudget: -1 }, new AbortController().signal)

    expect(written).toEqual({ ok: true, value: { rolling30DayBudget: 250 } })
    expect(rejected).toMatchObject({ ok: false, error: { code: 'settings-rejected' } })
  })

  it('registers before warming live and persisted sessions', async () => {
    let cleanup: (() => Promise<void>) | undefined
    const live = { id: 'live' }
    const register = vi.fn()
    const write = vi.fn(async () => {})
    const coldSnapshot = vi.fn(async () => ({ values: {}, asOfSeq: -1 }))
    const ctx = {
      ...rpcServices(),
      sessionProjections: { register },
      sessionQuery: {
        listSessions: vi.fn(async () => [
          { header: { id: 'live' }, live: true, persisted: true },
          { header: { id: 'cold' }, live: false, persisted: true },
          { header: { id: 'memory' }, live: false, persisted: false },
        ]),
      },
      sessions: { get: (id: string) => id === 'live' ? live : undefined },
      sessionProjectionCache: { write, coldSnapshot },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => () => Promise<void>) => {
        cleanup = install()
        return vi.fn()
      }),
    } as unknown as Context

    apply(ctx)

    expect(register).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(write).toHaveBeenCalledWith(live)
      expect(coldSnapshot).toHaveBeenCalledWith('cold', expect.any(AbortSignal))
    })
    expect(coldSnapshot).not.toHaveBeenCalledWith('memory', expect.anything())
    await cleanup?.()
  })

  it('writes the latest live checkpoint after a cold session attaches mid-warm-up', async () => {
    let cleanup: (() => Promise<void>) | undefined
    let releaseCold: (() => void) | undefined
    let attached: { id: string } | undefined
    const live = { id: 'cold' }
    const write = vi.fn(async () => {})
    const coldSnapshot = vi.fn(() => new Promise<{ values: {}; asOfSeq: number }>((resolve) => {
      releaseCold = () => { resolve({ values: {}, asOfSeq: -1 }) }
    }))
    const ctx = {
      ...rpcServices(),
      sessionProjections: { register: vi.fn() },
      sessionQuery: {
        listSessions: vi.fn(async () => [
          { header: { id: 'cold' }, live: false, persisted: true },
        ]),
      },
      sessions: { get: () => attached },
      sessionProjectionCache: { write, coldSnapshot },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => () => Promise<void>) => {
        cleanup = install()
        return vi.fn()
      }),
    } as unknown as Context

    apply(ctx)
    await vi.waitFor(() => { expect(coldSnapshot).toHaveBeenCalledTimes(1) })
    attached = live
    releaseCold?.()

    await vi.waitFor(() => { expect(write).toHaveBeenCalledWith(live) })
    await cleanup?.()
  })

  it('serves loopback trajectory analysis through the configured model', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# 分析\n\nseq 0 正常。' }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    })
    const rpc = rpcServices()
    rpc.connection.rpc.handle = vi.fn((_channel, next) => {
      handler = next as typeof handler
      return async () => {}
    }) as typeof rpc.connection.rpc.handle
    const ctx = {
      ...rpc,
      sessionProjections: { register: vi.fn() },
      sessionQuery: { listSessions: vi.fn(async () => []) },
      sessionProjectionCache: { write: vi.fn(), coldSnapshot: vi.fn() },
      sessions: {
        get: () => ({
          events: [
            { seq: 0, time: 1_000, type: 'turn/start', data: { turn: 1 } },
            { seq: 1, time: 2_000, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
          ],
        }),
      },
      sessionPersistence: { inspect: vi.fn() },
      agentDefaultModel: { currentSelection: () => ({ provider: 'configured', model: 'audit' }) },
      llm: {
        listProviders: () => [{ id: 'configured', name: 'Configured provider' }],
        listModels: async () => [{ provider: 'configured', id: 'audit', name: 'Audit model' }],
        prepareCall: vi.fn(async (config: Record<string, unknown>) => ({ config, stream })),
      },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => unknown) => install()),
    } as unknown as Context

    apply(ctx)
    const result = await handler?.(
      'trajectory/analyze',
      { sessionId: 'session-a', model: { provider: 'configured', model: 'audit' }, language: 'zh' },
      new AbortController().signal,
    ) as { ok: boolean; value?: { report: string; model: { provider: string; model: string } } }

    expect(result).toMatchObject({
      ok: true,
      value: {
        report: '# 分析\n\nseq 0 正常。',
        model: { provider: 'configured', model: 'audit' },
      },
    })
    expect(stream.mock.calls[0]?.[0]).not.toHaveProperty('sessionId')
  })

  it('keeps healthy catalog routes when a provider list fails and lets the adapter validate a selected route', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined
    const stream = vi.fn(async function* () {
      yield { type: 'text-delta' as const, index: 0, text: '# 用量概览\n\n缓存效率良好。' }
      yield { type: 'usage' as const, usage: { inputTokens: 20, outputTokens: 10 } }
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    })
    const rpc = rpcServices()
    rpc.connection.rpc.handle = vi.fn((_channel, next) => {
      handler = next as typeof handler
      return async () => {}
    }) as typeof rpc.connection.rpc.handle
    const prepareCall = vi.fn(async (config: Record<string, unknown>) => ({ config, stream }))
    const ctx = {
      ...rpc,
      sessionProjections: { register: vi.fn() },
      sessionQuery: { listSessions: vi.fn(async () => []) },
      sessionProjectionCache: { write: vi.fn(), coldSnapshot: vi.fn() },
      sessions: { get: vi.fn() },
      sessionPersistence: { inspect: vi.fn() },
      agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek', model: 'chat' }) },
      llm: {
        listProviders: () => [
          { id: 'deepseek', name: 'DeepSeek' },
          { id: 'offline', name: 'Offline provider' },
          { id: 'openai', name: 'OpenAI' },
        ],
        listModels: async (provider: string) => {
          if (provider === 'offline') throw new Error('adapter unavailable')
          return provider === 'deepseek'
            ? [{ provider, id: 'chat', name: 'DeepSeek Chat' }]
            : [{ provider, id: 'gpt', name: 'GPT' }]
        },
        prepareCall,
      },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => unknown) => install()),
    } as unknown as Context

    apply(ctx)
    const signal = new AbortController().signal
    const catalog = await handler?.('analysis/models', {}, signal) as { ok: boolean; value?: { models: unknown[]; default?: unknown } }
    const result = await handler?.('usage/analyze', {
      model: { provider: 'openai', model: 'gpt' },
      language: 'zh',
      input: {
        usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 1 },
        models: [{
          provider: 'deepseek', model: 'chat', assistantRequests: 2, compactionRequests: 0,
          usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 1 },
        }],
        days: [{ date: '2026-08-14', usage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 1 } }],
      },
    }, signal) as { ok: boolean; value?: { model: { provider: string; model: string }; report: string } }
    const adapterResolved = await handler?.('usage/analyze', {
      model: { provider: 'missing', model: 'route' }, language: 'zh', input: {
        usage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        compactionUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, models: [], days: [],
      },
    }, signal) as { ok: boolean }

    expect(catalog).toMatchObject({
      ok: true,
      value: {
        models: [
          { provider: 'deepseek', model: 'chat' },
          { provider: 'openai', model: 'gpt' },
        ],
        default: { provider: 'deepseek', model: 'chat' },
        failures: [{ provider: 'offline', providerName: 'Offline provider' }],
      },
    })
    expect(result).toMatchObject({ ok: true, value: { model: { provider: 'openai', model: 'gpt' }, report: '# 用量概览\n\n缓存效率良好。' } })
    expect(prepareCall).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt', maxTokens: 2_600 }, expect.any(AbortSignal))
    expect(adapterResolved).toMatchObject({ ok: true, value: { model: { provider: 'missing', model: 'route' } } })
    expect(prepareCall).toHaveBeenCalledWith({ provider: 'missing', model: 'route', maxTokens: 2_600 }, expect.any(AbortSignal))
    expect(prepareCall).toHaveBeenCalledTimes(2)
  })

  it('stops waiting for model enumeration when its injected LLM runtime is disposed', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined
    let runtimeCleanup: (() => void) | undefined
    const listModels = vi.fn(() => new Promise<never>(() => {}))
    const rpc = rpcServices()
    rpc.connection.rpc.handle = vi.fn((_channel, next) => {
      handler = next as typeof handler
      return async () => {}
    }) as typeof rpc.connection.rpc.handle
    const ctx = {
      ...rpc,
      sessionProjections: { register: vi.fn() },
      sessionQuery: { listSessions: vi.fn(async () => []) },
      sessionProjectionCache: { write: vi.fn(), coldSnapshot: vi.fn() },
      sessions: { get: vi.fn() },
      llm: {
        listProviders: () => [{ id: 'provider', name: 'Provider' }],
        listModels,
      },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => unknown, label?: string) => {
        const cleanup = install()
        if (label === 'token usage: analysis runtime') runtimeCleanup = cleanup as () => void
        return vi.fn()
      }),
    } as unknown as Context
    apply(ctx)

    const pending = handler?.('analysis/models', {}, new AbortController().signal)
    await vi.waitFor(() => { expect(listModels).toHaveBeenCalledWith('provider') })
    runtimeCleanup?.()

    await expect(pending).rejects.toThrow('token usage analysis service disposed')
  })

  it('does not start the next provider after disposal between catalog entries', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined
    let runtimeCleanup: (() => void) | undefined
    let resolveFirst: ((models: Array<{ provider: string; id: string; name: string }>) => void) | undefined
    const first = new Promise<Array<{ provider: string; id: string; name: string }>>(resolve => { resolveFirst = resolve })
    const listModels = vi.fn((provider: string) => provider === 'first' ? first : Promise.resolve([]))
    const rpc = rpcServices()
    rpc.connection.rpc.handle = vi.fn((_channel, next) => {
      handler = next as typeof handler
      return async () => {}
    }) as typeof rpc.connection.rpc.handle
    const ctx = {
      ...rpc,
      sessionProjections: { register: vi.fn() },
      sessionQuery: { listSessions: vi.fn(async () => []) },
      sessionProjectionCache: { write: vi.fn(), coldSnapshot: vi.fn() },
      sessions: { get: vi.fn() },
      llm: {
        listProviders: () => [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }],
        listModels,
      },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => unknown, label?: string) => {
        const cleanup = install()
        if (label === 'token usage: analysis runtime') runtimeCleanup = cleanup as () => void
        return vi.fn()
      }),
    } as unknown as Context
    apply(ctx)

    const pending = handler?.('analysis/models', {}, new AbortController().signal)
    await vi.waitFor(() => { expect(listModels).toHaveBeenCalledWith('first') })
    resolveFirst?.([])
    await Promise.resolve()
    runtimeCleanup?.()

    await expect(pending).rejects.toThrow('token usage analysis service disposed')
    expect(listModels).not.toHaveBeenCalledWith('second')
  })

  it('aborts an in-flight analysis when its injected LLM runtime is disposed', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined
    let runtimeCleanup: (() => void) | undefined
    let observedSignal: AbortSignal | undefined
    const rpc = rpcServices()
    rpc.connection.rpc.handle = vi.fn((_channel, next) => {
      handler = next as typeof handler
      return async () => {}
    }) as typeof rpc.connection.rpc.handle
    const stream = vi.fn(async function* (request: { signal: AbortSignal }) {
      observedSignal = request.signal
      await new Promise<never>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => { reject(request.signal.reason) }, { once: true })
      })
      yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
    })
    const ctx = {
      ...rpc,
      sessionProjections: { register: vi.fn() },
      sessionQuery: { listSessions: vi.fn(async () => []) },
      sessionProjectionCache: { write: vi.fn(), coldSnapshot: vi.fn() },
      sessions: { get: vi.fn() },
      llm: {
        listProviders: () => [{ id: 'provider', name: 'Provider' }],
        listModels: async () => [{ provider: 'provider', id: 'model', name: 'Model' }],
        prepareCall: async (config: Record<string, unknown>) => ({ config, stream }),
      },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => unknown, label?: string) => {
        const cleanup = install()
        if (label === 'token usage: analysis runtime') runtimeCleanup = cleanup as () => void
        return vi.fn()
      }),
    } as unknown as Context
    apply(ctx)

    const pending = handler?.('usage/analyze', {
      model: { provider: 'provider', model: 'model' },
      language: 'en',
      input: {
        usage: { uncachedInputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        models: [],
        days: [],
      },
    }, new AbortController().signal)
    await vi.waitFor(() => { expect(observedSignal).toBeInstanceOf(AbortSignal) })

    runtimeCleanup?.()

    await expect(pending).rejects.toThrow('token usage analysis service disposed')
    expect(observedSignal?.aborted).toBe(true)
  })

  it('cancels and drains history warming when its fiber is disposed', async () => {
    let cleanup: (() => Promise<void>) | undefined
    let observedSignal: AbortSignal | undefined
    const coldSnapshot = vi.fn((_id: string, signal?: AbortSignal) => {
      observedSignal = signal
      if (signal === undefined) return Promise.resolve({ values: {}, asOfSeq: -1 })
      return new Promise<{ values: {}; asOfSeq: number }>((resolve) => {
        signal.addEventListener('abort', () => { resolve({ values: {}, asOfSeq: -1 }) }, { once: true })
      })
    })
    const ctx = {
      ...rpcServices(),
      sessionProjections: { register: vi.fn() },
      sessionQuery: {
        listSessions: vi.fn(async () => [
          { header: { id: 'cold' }, live: false, persisted: true },
        ]),
      },
      sessions: { get: () => undefined },
      sessionProjectionCache: { write: vi.fn(), coldSnapshot },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => () => Promise<void>) => {
        cleanup = install()
        return vi.fn()
      }),
    } as unknown as Context

    apply(ctx)
    await Promise.resolve()
    await Promise.resolve()

    expect(cleanup).toBeTypeOf('function')
    expect(observedSignal).toBeInstanceOf(AbortSignal)
    await cleanup?.()
    expect(observedSignal?.aborted).toBe(true)
  })
})
