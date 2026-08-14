// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { TokenUsageSection } from '../src/client/TokenUsageSection.tsx'

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

    expect(inject).toEqual(['slots', 'locale', 'connection'])
    expect(registerLocale).toHaveBeenCalledTimes(1)
    expect(injectSlot).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(registerSlot).toHaveBeenCalledWith(expect.objectContaining({
      name: 'settings.section',
      id: 'token-usage',
      order: 30,
      locale: 'settings.tokenUsage',
    }), TokenUsageSection)
    const options = registerSlot.mock.calls[0]?.[0] as {
      label: () => string
      inject: () => { analyzeTrajectory: unknown; setBudget: unknown; download: unknown }
    }
    expect(options.label()).toBe('Token 用量')
    expect(options.inject()).toEqual(expect.objectContaining({
      analyzeTrajectory: expect.any(Function),
      setBudget: expect.any(Function),
      download: expect.any(Object),
    }))
    expect(rpcCall).toHaveBeenCalledWith('/token-usage', 'budget/read', {})
  })
})
