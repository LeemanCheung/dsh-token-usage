import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { TokenUsageSection } from '../src/client/TokenUsageSection.tsx'

describe('client apply', () => {
  it('registers the localized Token usage settings section', () => {
    const registerLocale = vi.fn(() => () => {})
    const bind = vi.fn(() => (key: string) => key === 'nav' ? 'Token 用量' : key)
    const registerSlot = vi.fn(() => () => {})
    const injectSlot = vi.fn((_name: string, install: () => unknown) => install())
    const effect = vi.fn((install: () => unknown) => install())
    const ctx = {
      locale: { register: registerLocale, bind },
      slots: { register: registerSlot, inject: injectSlot },
      effect,
    } as unknown as ClientContext

    apply(ctx)

    expect(inject).toEqual(['slots', 'locale'])
    expect(registerLocale).toHaveBeenCalledTimes(1)
    expect(injectSlot).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(registerSlot).toHaveBeenCalledWith(expect.objectContaining({
      name: 'settings.section',
      id: 'token-usage',
      order: 30,
      locale: 'settings.tokenUsage',
    }), TokenUsageSection)
    const options = registerSlot.mock.calls[0]?.[0] as { label: () => string }
    expect(options.label()).toBe('Token 用量')
  })
})
