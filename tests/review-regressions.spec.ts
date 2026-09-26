import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tokenUsageRecorderProjectionDefinition as projection } from '../src/projection.ts'
import { createWorkbenchHost } from '../src/workbench/host.ts'
import { observableTotals } from '../src/workbench/reporting.ts'
import { emptyState, stateSchema, type WorkbenchState } from '../src/workbench/schema.ts'

const now = Date.parse('2026-09-26T12:00:00Z')
const signal = () => new AbortController().signal
const usage = { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 }
function fixture(initial: WorkbenchState, failWrites = false) {
  let stored = JSON.stringify(initial)
  const update = vi.fn(async (next: { data: string }) => {
    if (failWrites) throw new Error('disk unavailable')
    stored = next.data
  })
  const ctx = { settings: { register: () => ({ get: () => ({ data: stored }), update }) }, logger: { warn: vi.fn() } } as unknown as Context
  return { host: createWorkbenchHost(ctx), stored: () => stateSchema.parse(JSON.parse(stored)), update }
}
async function read(host: ReturnType<typeof createWorkbenchHost>) {
  const result = await host.handle('workbench/read', {}, signal())
  if (!result.ok) throw new Error(result.error.message)
  return stateSchema.parse(result.value)
}
afterEach(() => vi.restoreAllMocks())

describe('merged review regressions', () => {
  it('reattributes identical finalized usage across UTC midnight without counting a second request', () => {
    let state = projection.init()
    for (const event of [
      { seq: 0, time: Date.parse('2026-09-25T23:59:00Z'), type: 'request/context', data: { provider: 'p', model: 'm' } },
      { seq: 1, time: Date.parse('2026-09-25T23:59:59Z'), type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } } } },
      { seq: 2, time: Date.parse('2026-09-26T00:00:01Z'), type: 'assistant/message', data: { turn: 1, step: 1, message: { id: 'message', role: 'assistant', content: [], source: { kind: 'model', provider: 'p', model: 'm' } }, usage: { inputTokens: 10, outputTokens: 2 } } },
    ]) state = projection.apply(state, event as SessionEvent)
    const view = projection.wire.view(state)
    expect(view.days).toEqual([{ date: '2026-09-26', usage }])
    expect(view.modelDays).toEqual([{ provider: 'p', model: 'm', date: '2026-09-26', usage }])
    expect(view.usage).toEqual(usage)
    expect(view.assistantRequests).toBe(1)
  })

  it('durably recovers interrupted entries once, without moving their end time on the next restart', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const state = emptyState()
    state.ledger = [{ id: 'running', routeId: '0'.repeat(32), kind: 'usage-analysis', startedAt: '2026-09-25T12:00:00Z', status: 'running', usage: null, finality: 'unknown' }]
    const first = fixture(state)
    const recovered = await read(first.host)
    expect(first.stored().ledger[0]).toEqual(recovered.ledger[0])
    expect(first.stored().ledger[0]?.status).toBe('interrupted')
    expect(first.update).toHaveBeenCalledTimes(1)
    vi.mocked(Date.now).mockReturnValue(now + 86400000)
    const second = fixture(first.stored())
    expect((await read(second.host)).ledger[0]?.endedAt).toBe(recovered.ledger[0]?.endedAt)
    expect(second.update).not.toHaveBeenCalled()
  })

  it('does not report recovery as durable if the startup write fails', async () => {
    const state = emptyState()
    state.ledger = [{ id: 'running', routeId: '0'.repeat(32), kind: 'usage-analysis', startedAt: '2026-09-25T12:00:00Z', status: 'running', usage: null, finality: 'unknown' }]
    const failed = fixture(state, true)
    expect((await failed.host.handle('workbench/read', {}, signal())).ok).toBe(false)
    expect(failed.stored().ledger[0]?.status).toBe('running')
  })

  it('retries a failed startup save without changing the first recovered end time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const initial = emptyState()
    initial.ledger = [{ id: 'running', routeId: '0'.repeat(32), kind: 'usage-analysis', startedAt: '2026-09-25T12:00:00Z', status: 'running', usage: null, finality: 'unknown' }]
    let stored = JSON.stringify(initial)
    const update = vi.fn(async (patch: { data: string }) => {
      if (update.mock.calls.length === 1) throw new Error('transient write failure')
      stored = patch.data
    })
    const ctx = { settings: { register: () => ({ get: () => ({ data: stored }), update }) }, logger: { warn: vi.fn() } } as unknown as Context
    const host = createWorkbenchHost(ctx)
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.mocked(Date.now).mockReturnValue(now + 86400000)
    expect((await read(host)).ledger[0]?.endedAt).toBe(new Date(now).toISOString())
    expect(stateSchema.parse(JSON.parse(stored)).ledger[0]?.endedAt).toBe(new Date(now).toISOString())
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('serializes concurrent configuration and reads behind a delayed startup recovery write', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const initial = emptyState()
    initial.ledger = [{ id: 'running', routeId: '0'.repeat(32), kind: 'usage-analysis', startedAt: '2026-09-25T12:00:00Z', status: 'running', usage: null, finality: 'unknown' }]
    let stored = JSON.stringify(initial), release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const update = vi.fn(async (patch: { data: string }) => {
      if (update.mock.calls.length === 1) await held
      stored = patch.data
    })
    const ctx = { settings: { register: () => ({ get: () => ({ data: stored }), update }) }, logger: { warn: vi.fn() } } as unknown as Context
    const host = createWorkbenchHost(ctx)
    const configuration = host.handle('workbench/config', { revision: 0, config: { ...initial.config, shareSummary: true } }, signal())
    const reading = read(host)
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
    expect(stateSchema.parse(JSON.parse(stored)).ledger[0]?.status).toBe('running')
    release()
    expect((await configuration).ok).toBe(true)
    const result = await reading
    expect(result.revision).toBe(1)
    expect(result.config.shareSummary).toBe(true)
    expect(result.ledger[0]).toMatchObject({ status: 'interrupted', endedAt: new Date(now).toISOString() })
    expect(stateSchema.parse(JSON.parse(stored))).toEqual(result)
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('prunes expired reservations and ledger identity copies on startup without an analysis', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const state = emptyState(), expired = 'a'.repeat(64), retained = 'b'.repeat(64)
    state.requestKeys = [
      { key: expired, fingerprint: 'c'.repeat(64), at: new Date(now - 30 * 86400000).toISOString() },
      { key: retained, fingerprint: 'd'.repeat(64), at: new Date(now - 30 * 86400000 + 1).toISOString() },
    ]
    state.ledger = [{ id: 'old', routeId: '0'.repeat(32), requestKey: expired, kind: 'usage-analysis', startedAt: state.requestKeys[0]!.at, status: 'completed', usage, finality: 'authoritative' }]
    const h = fixture(state)
    await read(h.host)
    expect(h.stored().requestKeys.map(item => item.key)).toEqual([retained])
    expect(h.stored().evictedRequestKeys).toBe(1)
    expect(h.stored().ledger[0]?.requestKey).toBeUndefined()
    expect(h.stored().ledger[0]?.usage).toEqual(usage)
  })

  it('expires reservations during later read-only use and configuration edits', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const state = emptyState()
    state.requestKeys = [{ key: 'a'.repeat(64), fingerprint: 'b'.repeat(64), at: new Date(now).toISOString() }]
    const h = fixture(state)
    await read(h.host)
    expect(h.update).not.toHaveBeenCalled()
    vi.mocked(Date.now).mockReturnValue(now + 30 * 86400000)
    await read(h.host)
    expect(h.stored().requestKeys).toEqual([])
    expect(h.stored().evictedRequestKeys).toBe(1)
    const configOnly = fixture({ ...state, requestKeys: [{ ...state.requestKeys[0]!, at: new Date(now + 30 * 86400000).toISOString() }] })
    await read(configOnly.host)
    vi.mocked(Date.now).mockReturnValue(now + 60 * 86400000)
    expect((await configOnly.host.handle('workbench/config', { revision: 0, config: state.config }, signal())).ok).toBe(true)
    expect(configOnly.stored().requestKeys).toEqual([])
  })

  it('does not restore an expired ledger request key when a long-running call checkpoints', async () => {
    const started = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(started)
    const h = fixture(emptyState())
    await h.host.track({} as Context['llm'], 'usage-analysis', { provider: 'p', model: 'm' }, signal(), async () => {
      vi.mocked(Date.now).mockReturnValue(started + 31 * 86400000)
      return 42
    }, { requestId: 'long-running-request', fingerprint: 'synthetic' })
    expect(h.stored().requestKeys).toEqual([])
    expect(h.stored().ledger[0]?.requestKey).toBeUndefined()
    expect(h.stored().ledger[0]?.status).toBe('completed')
  })

  it('does not let old ledger clears permanently invalidate future reporting windows', () => {
    const state = emptyState()
    state.ledgerStartedAt = '2026-01-01T00:00:00Z'
    state.ledgerClearedAt = '2026-01-31T00:00:00Z'
    expect(observableTotals([], state, 7, now).complete).toBe(true)
    state.ledgerClearedAt = '2026-09-20T00:00:00Z'
    expect(observableTotals([], state, 7, now).reasons).toContain('analysis-history-evicted-or-cleared')
  })

  it('limits known evictions to affected windows while leaving legacy unknown loss incomplete', () => {
    const state = emptyState()
    state.ledgerStartedAt = '2026-01-01T00:00:00Z'
    state.evictedEntries = 2
    expect(observableTotals([], state, 7, now).complete).toBe(false)
    Object.assign(state, { ledgerEvictedThrough: '2026-02-01T00:00:00Z' })
    expect(observableTotals([], state, 7, now).complete).toBe(true)
    Object.assign(state, { ledgerEvictedThrough: '2026-09-20T00:00:00Z' })
    expect(observableTotals([], state, 7, now).complete).toBe(false)
  })

  it('persists a conservative loss boundary for legacy evictions and eventually restores coverage', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const state = emptyState()
    state.ledgerStartedAt = '2026-01-01T00:00:00Z'
    state.evictedEntries = 3
    const h = fixture(state)
    const saved = await read(h.host)
    expect(h.stored()).toMatchObject({ ledgerEvictedThrough: new Date(now).toISOString() })
    expect(observableTotals([], saved, 7, now).complete).toBe(false)
    expect(observableTotals([], saved, 7, now + 8 * 86400000).complete).toBe(true)
  })

  it('records the date of removed usage when the bounded ledger evicts an entry', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const state = emptyState()
    state.ledgerStartedAt = '2026-01-01T00:00:00Z'
    state.ledger = Array.from({ length: 512 }, (_, i) => ({ id: `entry-${i}`, routeId: '0'.repeat(32), kind: 'usage-analysis', startedAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString(), status: 'completed', usage, finality: 'authoritative' }))
    const h = fixture(state)
    await h.host.track({} as Context['llm'], 'usage-analysis', { provider: 'p', model: 'm' }, signal(), async () => 42)
    expect(h.stored()).toMatchObject({ evictedEntries: 1, ledgerEvictedThrough: state.ledger[0]!.startedAt })
    expect(h.stored().ledger).toHaveLength(512)
  })
})
