/** Shared browser-side sampler for the recent confirmed provider-output rate. */

import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { TokenUsageRecorderProjection } from '../types.ts'

/** Sampling cadence shared by the header and sidebar indicators. */
export const THROUGHPUT_SAMPLE_INTERVAL_MS = 5_000
/** Rolling observation window used to smooth bursty provider usage updates. */
export const THROUGHPUT_WINDOW_MS = 10_000

/** One immutable confirmed-output reading shared across every browser surface. */
export interface TokenThroughputSnapshot {
  status: 'sampling' | 'ready'
  allTokensPerSecond: number
  activeSessions: number
  bySession: Readonly<Record<string, number>>
  statusBySession: Readonly<Record<string, 'sampling' | 'ready'>>
}

interface ThroughputSample {
  at: number
  countersBySession: ReadonlyMap<string, OutputCounter>
}

type CounterSource = 'recorder' | 'built-in'

interface RawOutputCounter {
  source: CounterSource
  tokens: number
}

interface OutputCounter extends RawOutputCounter {
  epoch: number
}

const EMPTY_SNAPSHOT: TokenThroughputSnapshot = Object.freeze({
  status: 'sampling',
  allTokensPerSecond: 0,
  activeSessions: 0,
  bySession: Object.freeze({}),
  statusBySession: Object.freeze({}),
})

/** Read one cumulative output counter, retaining its source identity. */
function projectionCounter(
  recorded: TokenUsageRecorderProjection | undefined,
  builtIn: TokenUsageProjection | undefined,
): RawOutputCounter | undefined {
  if (recorded !== undefined) return { source: 'recorder', tokens: recorded.usage.outputTokens }
  if (builtIn !== undefined) return { source: 'built-in', tokens: builtIn.outputTokens }
  return undefined
}

function outputCounter(summary: SessionSummary): RawOutputCounter | undefined {
  return projectionCounter(
    summary.projectionValues?.tokenUsageRecorder,
    summary.projectionValues?.tokenUsage,
  )
}

/** Format a compact Token-per-second value without implying integer precision below ten. */
export function formatTokensPerSecond(value: number): string {
  const clamped = Math.max(0, value)
  if (clamped >= 1_000) {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(clamped / 1_000)}K`
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: clamped < 10 ? 1 : 0,
  }).format(clamped)
}

/**
 * Samples the client session projection feed on one timer and publishes a
 * shared, at-most-10-second output Token rate. Projection regressions reset that
 * session's baseline instead of producing a negative rate.
 */
export class TokenThroughputController implements ObservableSnapshot<TokenThroughputSnapshot> {
  private snapshot: TokenThroughputSnapshot = EMPTY_SNAPSHOT
  private readonly listeners = new Set<() => void>()
  private samples: ThroughputSample[] = []
  private readonly epochs = new Map<string, number>()
  private previousCounters = new Map<string, RawOutputCounter>()
  private readonly scopedCounters = new Map<string, RawOutputCounter>()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly sessions: ObservableSnapshot<SessionListState>) {}

  /** Return the stable reading until the next sample. */
  getSnapshot = (): TokenThroughputSnapshot => this.snapshot

  /** Subscribe one renderer-bound hook source. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Start with an immediate baseline and return lifecycle-complete cleanup. */
  start(): () => void {
    this.sample()
    this.timer = setInterval(() => { this.sample() }, THROUGHPUT_SAMPLE_INTERVAL_MS)
    return () => {
      if (this.timer !== undefined) clearInterval(this.timer)
      this.timer = undefined
      this.samples = []
      this.epochs.clear()
      this.previousCounters.clear()
      this.scopedCounters.clear()
      this.listeners.clear()
    }
  }

  /**
   * Supply the strict current session's projection face. Addressed children
   * can be rendered without a projection-bearing session.list row, while the
   * slot-scoped useProjection hook still has their authoritative values.
   */
  setScopedCounter = (
    sessionId: string,
    recorded: TokenUsageRecorderProjection | undefined,
    builtIn: TokenUsageProjection | undefined,
  ): (() => void) => {
    const counter = projectionCounter(recorded, builtIn)
    if (counter === undefined) {
      this.scopedCounters.delete(sessionId)
      return () => {}
    }
    this.scopedCounters.set(sessionId, counter)
    return () => {
      if (this.scopedCounters.get(sessionId) === counter) this.scopedCounters.delete(sessionId)
    }
  }

  /** Capture one deterministic sample; the optional monotonic instant exists for tests. */
  sample(at: number = performance.now()): void {
    const previousInstant = this.samples.at(-1)?.at
    if (previousInstant !== undefined && at <= previousInstant) {
      // A caller-supplied or platform-clock regression cannot share an epoch
      // with earlier samples: discard the time series and re-baseline.
      for (const sessionId of this.previousCounters.keys()) {
        this.epochs.set(sessionId, (this.epochs.get(sessionId) ?? 0) + 1)
      }
      this.samples = []
      this.previousCounters.clear()
    }

    const state = this.sessions.getSnapshot()
    const rawCounters = new Map<string, RawOutputCounter>()
    for (const summary of Object.values(state.byId)) {
      const sessionId = String(summary.id)
      const counter = outputCounter(summary)
      if (counter !== undefined) rawCounters.set(sessionId, counter)
    }
    for (const [sessionId, counter] of this.scopedCounters) {
      rawCounters.set(sessionId, counter)
    }

    // A counter reset, source switch, or temporary disappearance starts a new
    // epoch. Older totals must never become a baseline for the new sequence.
    for (const sessionId of this.previousCounters.keys()) {
      if (!rawCounters.has(sessionId)) {
        this.epochs.set(sessionId, (this.epochs.get(sessionId) ?? 0) + 1)
      }
    }
    const current = new Map<string, OutputCounter>()
    for (const [sessionId, counter] of rawCounters) {
      const previous = this.previousCounters.get(sessionId)
      if (
        previous !== undefined
        && (previous.source !== counter.source || counter.tokens < previous.tokens)
      ) {
        this.epochs.set(sessionId, (this.epochs.get(sessionId) ?? 0) + 1)
      }
      current.set(sessionId, { ...counter, epoch: this.epochs.get(sessionId) ?? 0 })
    }
    this.previousCounters = rawCounters

    this.samples.push({ at, countersBySession: current })
    const retainedAfter = at - THROUGHPUT_WINDOW_MS
    this.samples = this.samples.filter(sample => sample.at >= retainedAfter)

    const bySession: Record<string, number> = {}
    const statusBySession: Record<string, 'sampling' | 'ready'> = {}
    let ready = false
    for (const [sessionId, counter] of current) {
      const valid = this.samples.filter(sample => {
        const previous = sample.countersBySession.get(sessionId)
        return sample.at < at
          && previous !== undefined
          && previous.epoch === counter.epoch
          && previous.source === counter.source
          && previous.tokens <= counter.tokens
      })
      if (valid.length === 0) {
        bySession[sessionId] = 0
        statusBySession[sessionId] = 'sampling'
        continue
      }
      const target = at - THROUGHPUT_WINDOW_MS
      const baseline = valid.find(sample => sample.at >= target)
      if (baseline === undefined) {
        bySession[sessionId] = 0
        statusBySession[sessionId] = 'sampling'
        continue
      }
      ready = true
      statusBySession[sessionId] = 'ready'
      const previous = baseline?.countersBySession.get(sessionId)
      const elapsedSeconds = (at - baseline.at) / 1_000
      bySession[sessionId] = previous === undefined || elapsedSeconds <= 0
        ? 0
        : Math.max(0, counter.tokens - previous.tokens) / elapsedSeconds
    }

    const rates = Object.values(bySession)
    const hasPriorSample = this.samples.some(sample => sample.at < at)
    const everyCurrentReady = current.size > 0
      && Object.values(statusBySession).every(status => status === 'ready')
    this.snapshot = Object.freeze({
      // A ready Session list may legitimately contain old, blank, or pre-plugin
      // rows with no Token projection. They contribute zero until an
      // authoritative counter appears and must not keep the global indicator
      // in a permanent sampling state.
      status: state.phase !== 'ready'
        ? 'sampling'
        : current.size === 0
        ? (hasPriorSample ? 'ready' : 'sampling')
        : (ready && everyCurrentReady ? 'ready' : 'sampling'),
      allTokensPerSecond: rates.reduce((sum, rate) => sum + rate, 0),
      activeSessions: rates.filter(rate => rate > 0).length,
      bySession: Object.freeze(bySession),
      statusBySession: Object.freeze(statusBySession),
    })
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[dsh-token-usage] throughput subscriber failed:', error)
      }
    }
  }
}
