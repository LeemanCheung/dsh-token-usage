// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { TokenUsageSection } from '../src/client/TokenUsageSection.tsx'
import { TrajectoryAnalysisAction } from '../src/client/TrajectoryAnalysisAction.tsx'

describe('client apply', () => {
  it('registers the localized Token usage settings section and private capabilities', async () => {
    const registerLocale = vi.fn(() => () => {})
    const bind = vi.fn(() => (key: string) => key === 'nav' ? 'Token 用量' : key)
    const registerSlot = vi.fn(() => () => {})
    const injectSlot = vi.fn((_name: string, install: () => unknown) => install())
    const effect = vi.fn((install: () => unknown) => install())
    const rpcCall = vi.fn(async () => ({ ok: true as const, value: { rolling30DayBudget: 0 } }))
    const connection = {
      isLoopback: true,
      rpc: { call: rpcCall },
    }
    const ctx = {
      get: vi.fn(() => connection),
      locale: {
        register: registerLocale,
        bind,
        getLocale: () => ({ active: 'zh' }),
      },
      slots: { register: registerSlot, inject: injectSlot },
      effect,
    } as unknown as ClientContext

    apply(ctx)
    await Promise.resolve()

    expect(inject).toEqual(['slots', 'locale', 'connection', 'sessions'])
    expect(registerLocale).toHaveBeenCalledTimes(1)
    expect(injectSlot).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(injectSlot).toHaveBeenCalledWith('conversation.session.header.actions', expect.any(Function))
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
    const options = registerSlot.mock.calls[0]?.[0] as {
      label: () => string
      inject: () => {
        analyzeTrajectory: unknown
        analyzeTokenUsage: unknown
        listAnalysisModels: unknown
        openSession: unknown
        setBudget: unknown
        download: unknown
      }
    }
    expect(options.label()).toBe('Token 用量')
    expect(options.inject()).toEqual(expect.objectContaining({
      analyzeTrajectory: expect.any(Function),
      analyzeTokenUsage: expect.any(Function),
      listAnalysisModels: expect.any(Function),
      openSession: expect.any(Function),
      setBudget: expect.any(Function),
      download: expect.any(Object),
    }))
    const actionOptions = registerSlot.mock.calls[1]?.[0] as { inject: () => Record<string, unknown> }
    expect(actionOptions.inject()).toEqual(expect.objectContaining({
      hooks: expect.objectContaining({ trajectoryHistory: expect.any(Object) }),
      analyzeTrajectory: expect.any(Function),
      saveTrajectoryAnalysis: expect.any(Function),
      removeTrajectoryAnalysis: expect.any(Function),
    }))
    expect(rpcCall).toHaveBeenCalledWith('/token-usage', 'budget/read', {})
  })
})
