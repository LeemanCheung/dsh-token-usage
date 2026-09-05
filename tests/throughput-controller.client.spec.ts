import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {} from '../src/types.ts'
import {
  formatTokensPerSecond, THROUGHPUT_SAMPLE_INTERVAL_MS, TokenThroughputController,
} from '../src/client/throughput-controller.ts'

function summary(id: string, output: number | undefined, builtInOutput?: number): SessionSummary {
  return {
    id: id as SessionSummary['id'],
    displayTitle: id,
    running: (output ?? builtInOutput ?? 0) > 0,
    blank: false,
    updatedAt: 0,
    projectionValues: {
      ...(output === undefined ? {} : { tokenUsageRecorder: {
        assistantRequests: 1,
        compactionRequests: 0,
        compactionUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        usage: { uncachedInputTokens: 100, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 },
        models: [],
        days: [],
        modelDays: [],
      } }),
      ...(builtInOutput === undefined ? {} : {
        tokenUsage: {
          uncachedInputTokens: 1_000,
          outputTokens: builtInOutput,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      }),
    },
  } as SessionSummary
}

function list(...summaries: SessionSummary[]): SessionListState {
  return {
    ids: summaries.map(value => value.id),
    byId: Object.fromEntries(summaries.map(value => [value.id, value])),
    current: summaries[0]?.id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as SessionListState
}

afterEach(() => { vi.useRealTimers() })

describe('TokenThroughputController', () => {
  it('publishes one shared rolling output rate across sessions and prefers the recorder projection', () => {
    let state = list(summary('a', 0, 9_999), summary('b', 0))
    const sessions: ObservableSnapshot<SessionListState> = {
      getSnapshot: () => state,
      subscribe: () => () => {},
    }
    const controller = new TokenThroughputController(sessions)
    const listener = vi.fn()
    controller.subscribe(listener)

    controller.sample(0)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'sampling', allTokensPerSecond: 0, activeSessions: 0,
      statusBySession: { a: 'sampling', b: 'sampling' },
    })

    state = list(summary('a', 50, 99_999), summary('b', 20))
    controller.sample(5_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready', allTokensPerSecond: 14, activeSessions: 2,
      bySession: { a: 10, b: 4 },
      statusBySession: { a: 'ready', b: 'ready' },
    })

    state = list(summary('a', 80), summary('b', 30))
    controller.sample(10_000)
    expect(controller.getSnapshot()).toMatchObject({
      allTokensPerSecond: 11, activeSessions: 2,
      bySession: { a: 8, b: 3 },
    })
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('resets a regressed session baseline and lets the 10-second window decay to zero', () => {
    let state = list(summary('a', 0))
    const controller = new TokenThroughputController({
      getSnapshot: () => state,
      subscribe: () => () => {},
    })

    controller.sample(0)
    state = list(summary('a', 100))
    controller.sample(5_000)
    state = list(summary('a', 10))
    controller.sample(10_000)
    expect(controller.getSnapshot().bySession.a).toBe(0)
    expect(controller.getSnapshot().statusBySession.a).toBe('sampling')

    state = list(summary('a', 30))
    controller.sample(15_000)
    expect(controller.getSnapshot().bySession.a).toBe(4)
    controller.sample(20_000)
    expect(controller.getSnapshot().bySession.a).toBe(2)
    controller.sample(25_000)
    expect(controller.getSnapshot().bySession.a).toBe(0)
  })

  it('starts a fresh baseline when the authoritative counter source changes', () => {
    let state = list(summary('a', undefined, 100))
    const controller = new TokenThroughputController({
      getSnapshot: () => state,
      subscribe: () => () => {},
    })

    controller.sample(0)
    state = list(summary('a', 10, 110))
    controller.sample(5_000)
    expect(controller.getSnapshot().bySession.a).toBe(0)
    expect(controller.getSnapshot().statusBySession.a).toBe('sampling')

    state = list(summary('a', 30, 130))
    controller.sample(10_000)
    expect(controller.getSnapshot().bySession.a).toBe(4)

    state = list(summary('a', undefined, 140))
    controller.sample(15_000)
    expect(controller.getSnapshot().bySession.a).toBe(0)
    expect(controller.getSnapshot().statusBySession.a).toBe('sampling')
    state = list(summary('a', undefined, 160))
    controller.sample(20_000)
    expect(controller.getSnapshot().bySession.a).toBe(4)
  })

  it('requires a fresh per-session baseline after absence and reappearance', () => {
    let state = list(summary('a', 0))
    const controller = new TokenThroughputController({
      getSnapshot: () => state,
      subscribe: () => () => {},
    })

    controller.sample(0)
    state = list()
    controller.sample(5_000)
    state = list(summary('a', 100))
    controller.sample(10_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'sampling',
      bySession: { a: 0 },
      statusBySession: { a: 'sampling' },
    })
    state = list(summary('a', 120))
    controller.sample(15_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      bySession: { a: 4 },
      statusBySession: { a: 'ready' },
    })
  })

  it('never reaches past the ten-second window after a suspended timer', () => {
    let state = list(summary('a', 0))
    const controller = new TokenThroughputController({
      getSnapshot: () => state,
      subscribe: () => () => {},
    })

    controller.sample(0)
    state = list(summary('a', 100))
    controller.sample(12_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'sampling',
      bySession: { a: 0 },
      statusBySession: { a: 'sampling' },
    })

    state = list(summary('a', 120))
    controller.sample(17_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      bySession: { a: 4 },
      statusBySession: { a: 'ready' },
    })
  })

  it('keeps aggregate status sampling while any listed session lacks a counter', () => {
    let state = list(summary('a', 0), summary('b', undefined))
    const controller = new TokenThroughputController({
      getSnapshot: () => state,
      subscribe: () => () => {},
    })

    controller.sample(0)
    state = list(summary('a', 50), summary('b', undefined))
    controller.sample(5_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'sampling',
      allTokensPerSecond: 10,
      bySession: { a: 10 },
      statusBySession: { a: 'ready' },
    })
  })

  it('does not report an empty aggregate ready before session.list arrives', () => {
    const pending = { ...list(), phase: 'pending' as const }
    const controller = new TokenThroughputController({
      getSnapshot: () => pending,
      subscribe: () => () => {},
    })

    controller.sample(0)
    controller.sample(5_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'sampling',
      allTokensPerSecond: 0,
      bySession: {},
    })
  })

  it('re-baselines instead of producing a spike when sample time regresses', () => {
    let state = list(summary('a', 0))
    const controller = new TokenThroughputController({
      getSnapshot: () => state,
      subscribe: () => () => {},
    })

    controller.sample(10_000)
    state = list(summary('a', 50))
    controller.sample(15_000)
    state = list(summary('a', 100))
    controller.sample(11_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'sampling',
      allTokensPerSecond: 0,
      bySession: { a: 0 },
      statusBySession: { a: 'sampling' },
    })
    state = list(summary('a', 120))
    controller.sample(16_000)
    expect(controller.getSnapshot().bySession.a).toBe(4)
  })

  it('includes a strict addressed session supplied outside session.list', () => {
    const controller = new TokenThroughputController({
      getSnapshot: () => list(),
      subscribe: () => () => {},
    })
    const usage = (outputTokens: number) => ({
      uncachedInputTokens: 0,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })

    let dispose = controller.setScopedCounter('child', undefined, usage(0))
    controller.sample(0)
    dispose()
    dispose = controller.setScopedCounter('child', undefined, usage(20))
    controller.sample(5_000)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      allTokensPerSecond: 4,
      bySession: { child: 4 },
      statusBySession: { child: 'ready' },
    })
    dispose()
  })

  it('owns and disposes its five-second timer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const controller = new TokenThroughputController({
      getSnapshot: () => list(summary('a', 0)),
      subscribe: () => () => {},
    })
    const listener = vi.fn()
    controller.subscribe(listener)

    const dispose = controller.start()
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(THROUGHPUT_SAMPLE_INTERVAL_MS)
    expect(listener).toHaveBeenCalledTimes(2)
    dispose()
    vi.advanceTimersByTime(THROUGHPUT_SAMPLE_INTERVAL_MS)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('formats dense rates without overstating low-rate precision', () => {
    expect(formatTokensPerSecond(7.56)).toBe('7.6')
    expect(formatTokensPerSecond(72.4)).toBe('72')
    expect(formatTokensPerSecond(1_250)).toBe('1.3K')
  })
})
