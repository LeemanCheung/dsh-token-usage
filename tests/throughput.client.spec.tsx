// @vitest-environment jsdom

import type { ComponentProps } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AllSessionsThroughput, CurrentSessionThroughput } from '../src/client/TokenThroughput.tsx'
import { zh } from '../src/client/locales.ts'
import type { TokenThroughputSnapshot } from '../src/client/throughput-controller.ts'

function t(key: keyof typeof zh, params?: Record<string, unknown>): string {
  let text = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value))
  return text
}

function useSnapshot(snapshot: TokenThroughputSnapshot) {
  return <T,>(selector: (value: TokenThroughputSnapshot) => T): T => selector(snapshot)
}

function runtimeProps() {
  return {
    useSessions: () => { throw new Error('unused') },
    useWorkspaces: () => { throw new Error('unused') },
    useProjection: () => undefined,
  }
}

afterEach(cleanup)

describe('Token throughput indicators', () => {
  it('shows the current session rate in the conversation header', () => {
    render(<CurrentSessionThroughput {...{
      ...runtimeProps(),
      sessionId: 'session-a',
      useSession: () => { throw new Error('unused') },
      useThroughput: useSnapshot({
        status: 'ready',
        allTokensPerSecond: 21.4,
        activeSessions: 2,
        bySession: { 'session-a': 12.4, 'session-b': 9 },
        statusBySession: { 'session-a': 'ready', 'session-b': 'ready' },
      }),
      observeProjection: () => () => {},
      t,
    } as unknown as ComponentProps<typeof CurrentSessionThroughput>} />)

    expect(screen.getByText('当前会话')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('tok/s')).toBeTruthy()
    expect(screen.getByLabelText(/最近最多 10 秒已确认输出 12 tok\/s/)).toBeTruthy()
  })

  it('shows aggregate throughput and active-session count at the wide sidebar foot', () => {
    render(<AllSessionsThroughput {...{
      ...runtimeProps(),
      wide: true,
      useThroughput: useSnapshot({
        status: 'ready',
        allTokensPerSecond: 21.4,
        activeSessions: 2,
        bySession: { 'session-a': 12.4, 'session-b': 9 },
        statusBySession: { 'session-a': 'ready', 'session-b': 'ready' },
      }),
      observeProjection: () => () => {},
      t,
    } as unknown as ComponentProps<typeof AllSessionsThroughput>} />)

    expect(screen.getByText('全部会话速率')).toBeTruthy()
    expect(screen.getByText('21')).toBeTruthy()
    expect(screen.getByText('2 近期入账')).toBeTruthy()
    expect(screen.getByLabelText(/每 5 秒刷新/).getAttribute('data-token-throughput')).toBe('all')
  })

  it('keeps a labeled rail indicator and explicit sampling state', () => {
    render(<AllSessionsThroughput {...{
      ...runtimeProps(),
      wide: false,
      useThroughput: useSnapshot({
        status: 'sampling',
        allTokensPerSecond: 0,
        activeSessions: 0,
        bySession: {},
        statusBySession: {},
      }),
      observeProjection: () => () => {},
      t,
    } as unknown as ComponentProps<typeof AllSessionsThroughput>} />)

    const rail = screen.getByLabelText('全部会话输出速率正在采样')
    expect(rail.getAttribute('role')).toBe('status')
    expect(rail.getAttribute('aria-live')).toBe('off')
    expect(rail.tabIndex).toBe(0)
    expect(screen.queryByText('全部会话速率')).toBeNull()
  })
})
