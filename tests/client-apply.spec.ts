// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ClientContext, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { TokenUsageSection } from '../src/client/TokenUsageSection.tsx'
import { AllSessionsThroughput, CurrentSessionThroughput } from '../src/client/TokenThroughput.tsx'
import { TrajectoryAnalysisAction } from '../src/client/TrajectoryAnalysisAction.tsx'

describe('client apply', () => {
  it('registers localized settings, trajectory, and shared throughput surfaces', async () => {
    vi.useFakeTimers()
    const cleanups: (() => void)[] = []
    const registerLocale = vi.fn(() => () => {})
    const bind = vi.fn(() => (key: string) => key === 'nav' ? 'Token 用量' : key)
    const registerSlot = vi.fn(() => () => {})
    const injectSlot = vi.fn((_name: string, install: () => unknown) => install())
    const effect = vi.fn((install: () => unknown) => {
      const cleanup = install()
      if (typeof cleanup === 'function') cleanups.push(cleanup as () => void)
      return cleanup
    })
    const rpcCall = vi.fn(async () => ({ ok: true as const, value: { rolling30DayBudget: 0, routeBudgets: [] } }))
    const connection = {
      isLoopback: true,
      rpc: { call: rpcCall },
    }
    const sessionState = {
      ids: [], byId: {}, current: undefined, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    } as SessionListState
    const ctx = {
      get: vi.fn(() => connection),
      locale: {
        register: registerLocale,
        bind,
        getLocale: () => ({ active: 'zh' }),
      },
      sessions: {
        list: { getSnapshot: () => sessionState, subscribe: () => () => {} },
        open: vi.fn(),
      },
      slots: { register: registerSlot, inject: injectSlot },
      effect,
    } as unknown as ClientContext

    apply(ctx)
    await Promise.resolve()

    expect(inject).toEqual(['slots', 'locale', 'connection', 'sessions'])
    expect(registerLocale).toHaveBeenCalledTimes(1)
    expect(injectSlot).toHaveBeenCalledWith('sidebar.footer.action', expect.any(Function))
    expect(injectSlot).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(injectSlot).toHaveBeenCalledWith('conversation.session.header.actions', expect.any(Function))
    expect(registerSlot).toHaveBeenCalledWith(expect.objectContaining({
      name: 'sidebar.footer.action',
      id: 'token-usage-throughput-all',
      order: 100,
      locale: 'settings.tokenUsage',
    }), AllSessionsThroughput)
    expect(registerSlot).toHaveBeenCalledWith(expect.objectContaining({
      name: 'conversation.session.header.actions',
      id: 'token-usage-throughput-current',
      order: 50,
      locale: 'settings.tokenUsage',
    }), CurrentSessionThroughput)
    expect(registerSlot).toHaveBeenCalledWith(expect.objectContaining({
      name: 'settings.section',
      id: 'token-usage',
      order: 30,
      locale: 'settings.tokenUsage',
    }), TokenUsageSection)
    expect(registerSlot).toHaveBeenCalledWith(expect.objectContaining({
      name: 'conversation.session.header.actions',
      id: 'token-usage-trajectory-analysis',
      order: 40,
      locale: 'settings.tokenUsage',
    }), TrajectoryAnalysisAction)

    const registration = (id: string) => registerSlot.mock.calls
      .find(call => (call[0] as { id?: string }).id === id)?.[0] as { inject: () => Record<string, unknown>; label?: () => string }
    const settings = registration('token-usage')
    expect(settings.label?.()).toBe('Token 用量')
    expect(settings.inject()).toEqual(expect.objectContaining({
      analyzeTrajectory: expect.any(Function),
      analyzeTokenUsage: expect.any(Function),
      listAnalysisModels: expect.any(Function),
      openSession: expect.any(Function),
      setBudget: expect.any(Function),
      setRouteBudget: expect.any(Function),
      download: expect.any(Object),
    }))
    expect(registration('token-usage-trajectory-analysis').inject()).toEqual(expect.objectContaining({
      hooks: expect.objectContaining({ trajectoryHistory: expect.any(Object) }),
      analyzeTrajectory: expect.any(Function),
      saveTrajectoryAnalysis: expect.any(Function),
      removeTrajectoryAnalysis: expect.any(Function),
    }))
    expect(registration('token-usage-throughput-all').inject()).toEqual({
      hooks: { throughput: expect.any(Object) },
      observeProjection: expect.any(Function),
    })
    expect(registration('token-usage-throughput-current').inject()).toEqual({
      hooks: { throughput: expect.any(Object) },
      observeProjection: expect.any(Function),
    })
    expect(rpcCall).toHaveBeenCalledWith('/token-usage', 'budget/read', {})

    for (const cleanup of cleanups.reverse()) cleanup()
    vi.useRealTimers()
  })
})
