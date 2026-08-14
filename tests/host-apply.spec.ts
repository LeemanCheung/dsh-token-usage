import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'

describe('host apply', () => {
  it('registers before warming live and persisted sessions', async () => {
    let cleanup: (() => Promise<void>) | undefined
    const live = { id: 'live' }
    const register = vi.fn()
    const write = vi.fn(async () => {})
    const coldSnapshot = vi.fn(async () => ({ values: {}, asOfSeq: -1 }))
    const ctx = {
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
