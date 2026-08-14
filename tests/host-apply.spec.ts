import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'

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
  }
}

describe('host apply', () => {
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
        prepareCall: vi.fn(async (config: Record<string, unknown>) => ({ config, stream })),
      },
      logger: { warn: vi.fn() },
      effect: vi.fn((install: () => unknown) => install()),
    } as unknown as Context

    apply(ctx)
    const result = await handler?.(
      'trajectory/analyze',
      { sessionId: 'session-a', language: 'zh' },
      new AbortController().signal,
    ) as { ok: boolean; value?: { report: string; model: { provider: string; model: string } } }

    expect(result).toMatchObject({
      ok: true,
      value: {
        report: '# 分析\n\nseq 0 正常。',
        model: { provider: 'configured', model: 'audit' },
      },
    })
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-a' }))
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
