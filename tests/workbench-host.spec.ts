import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { createWorkbenchHost } from '../src/workbench/host.ts'
import { emptyState, stateSchema, snapshotSchema, type WorkbenchState } from '../src/workbench/schema.ts'
import { total } from '../src/workbench/prices.ts'
import { fixtureSessionId, workbenchEvents } from './workbench.fixture.ts'

export function hostFixture(initial = '', failWrites = false) {
  let stored = initial
  const storage = { get: () => ({ data: stored }), update: vi.fn(async (patch: { data: string }) => { if (failWrites) throw new Error('disk unavailable'); stored = patch.data }) }
  const context = {
    settings: { register: vi.fn(() => storage) }, logger: { warn: vi.fn() },
    sessions: { get: vi.fn(() => ({ snapshotEvents: () => workbenchEvents() })) },
    sessionQuery: { readSession: vi.fn(async () => ({ events: workbenchEvents() })) },
  } as unknown as Context
  return { host: createWorkbenchHost(context), context, storage, stored: () => stored }
}
const signal = () => new AbortController().signal
async function read(host: ReturnType<typeof createWorkbenchHost>): Promise<WorkbenchState> {
  const result = await host.handle('workbench/read', {}, signal())
  if (!result.ok) throw new Error(result.error.message)
  return stateSchema.parse(result.value)
}
function llmFixture(options: { fail?: boolean; onUsage?: () => void } = {}): Context['llm'] {
  return { prepareCall: async () => ({ stream: async function* () {
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 3 } }
    options.onUsage?.()
    if (options.fail) throw new Error('provider disconnected')
    yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 3 } }
  } }) } as unknown as Context['llm']
}
async function consume(llm: Context['llm']) {
  const prepared = await (llm.prepareCall as (...args: unknown[]) => Promise<{ stream(): AsyncIterable<unknown> }>)({})
  for await (const _chunk of prepared.stream()) { /* provider metadata observed by the tracker */ }
}

describe('workbench Host persistence and RPC', () => {
  it('persists configuration and recovers it in a new Host instance', async () => {
    const fixture = hostFixture(), state = await read(fixture.host)
    state.config.projects = [{ id: 'p', name: 'Persistent project', tokenBudget: 100, moneyBudgets: [] }]
    const saved = await fixture.host.handle('workbench/config', { revision: 0, config: state.config }, signal())
    expect(saved.ok).toBe(true)
    expect((await read(hostFixture(fixture.stored()).host)).config.projects[0]?.name).toBe('Persistent project')
  })
  it('serializes writes and rejects the second stale revision without data loss', async () => {
    const { host } = hostFixture(), state = await read(host)
    const results = await Promise.all([host.handle('workbench/config', { revision: 0, config: { ...state.config, shareSummary: true } }, signal()), host.handle('workbench/config', { revision: 0, config: state.config }, signal())])
    expect(results.map(result => result.ok)).toEqual([true, false])
    expect((await read(host)).revision).toBe(1); expect((await read(host)).config.shareSummary).toBe(true)
  })
  it('preserves corrupt storage instead of silently overwriting it', async () => {
    const fixture = hostFixture('{not valid json')
    expect((await fixture.host.handle('workbench/read', {}, signal())).ok).toBe(false)
    expect((await fixture.host.handle('workbench/config', { revision: 0, config: emptyState().config }, signal())).ok).toBe(false)
    expect(fixture.stored()).toBe('{not valid json'); expect(fixture.storage.update).not.toHaveBeenCalled()
  })
  it('does not advance configuration when persistence fails', async () => {
    const fixture = hostFixture('', true)
    expect((await fixture.host.handle('workbench/config', { revision: 0, config: emptyState().config }, signal())).ok).toBe(false)
    expect((await read(fixture.host)).revision).toBe(0)
  })
  it('rejects unexpected payload fields, malformed sessions and cancelled operations', async () => {
    const { host } = hostFixture()
    expect((await host.handle('workbench/read', { secret: 'not accepted' }, signal())).ok).toBe(false)
    expect((await host.handle('workbench/snapshot', { sessionId: '', offset: 0 }, signal())).ok).toBe(false)
    const controller = new AbortController(); controller.abort()
    await expect(host.handle('workbench/read', {}, controller.signal)).rejects.toBeDefined()
  })
  it('inspects from live events with no LLM dependency and keeps cache identities separate', async () => {
    const { host } = hostFixture()
    const result = await host.handle('workbench/snapshot', { sessionId: fixtureSessionId }, signal())
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('inspection failed')
    const snapshot = snapshotSchema.parse(result.value)
    expect(snapshot.totals.usage.outputTokens).toBe(20)
    expect((await read(host)).ledger).toHaveLength(0)
    expect((await host.handle('workbench/snapshot', { sessionId: fixtureSessionId, offset: 0, revision: snapshot.revision }, signal())).ok).toBe(true)
    expect((await host.handle('workbench/snapshot', { sessionId: fixtureSessionId, offset: 0, revision: 'wrong' }, signal())).ok).toBe(false)
    host.dispose()
    expect((await host.handle('workbench/snapshot', { sessionId: fixtureSessionId, offset: 0, revision: snapshot.revision }, signal())).ok).toBe(false)
  })
  it('marks recovered in-flight ledger entries interrupted', async () => {
    const state = emptyState()
    state.ledger.push({ id: 'running', routeId: '0'.repeat(32), kind: 'usage-analysis', startedAt: '2026-09-01T00:00:00Z', status: 'running', usage: null, finality: 'unknown' })
    expect((await read(hostFixture(JSON.stringify(state)).host)).ledger[0]?.status).toBe('interrupted')
  })
})

describe('auxiliary analysis tracking', () => {
  const route = { provider: 'private-provider', model: 'private-model' }
  it('replaces cumulative usage updates instead of double-counting them', async () => {
    const fixture = hostFixture()
    await fixture.host.track(llmFixture(), 'usage-analysis', route, signal(), consume)
    const state = await read(fixture.host)
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]).toMatchObject({ status: 'completed', finality: 'authoritative', usage: { uncachedInputTokens: 20, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 0 } })
    expect(JSON.stringify(state)).not.toContain('private-provider'); expect(JSON.stringify(state)).not.toContain('private-model')
    expect(hostFixture(fixture.stored()).stored()).toBe(fixture.stored())
  })
  it('retains partial usage on provider failure', async () => {
    const { host } = hostFixture()
    await expect(host.track(llmFixture({ fail: true }), 'trajectory-analysis', route, signal(), consume)).rejects.toThrow('provider disconnected')
    const entry = (await read(host)).ledger[0]!
    expect(entry.status).toBe('failed'); expect(entry.finality).toBe('provisional'); expect(total(entry.usage!)).toBe(15)
  })
  it('distinguishes cancelled analysis from provider errors', async () => {
    const { host } = hostFixture(), controller = new AbortController()
    await expect(host.track(llmFixture({ fail: true, onUsage: () => controller.abort() }), 'usage-analysis', route, controller.signal, consume)).rejects.toBeDefined()
    expect((await read(host)).ledger[0]?.status).toBe('cancelled')
  })
  it('keeps unreported usage unknown and does not block analysis on storage failure', async () => {
    const first = hostFixture()
    await first.host.track(llmFixture(), 'usage-analysis', route, signal(), async () => 42)
    expect((await read(first.host)).ledger[0]).toMatchObject({ status: 'completed', usage: null, finality: 'unknown' })
    const failedStorage = hostFixture('', true)
    await expect(failedStorage.host.track(llmFixture(), 'usage-analysis', route, signal(), async () => 42)).resolves.toBe(42)
    expect((await failedStorage.host.handle('workbench/read', {}, signal())).ok).toBe(false)
  })
  it('requires explicit clearing and never clears an active analysis', async () => {
    const { host } = hostFixture()
    expect((await host.handle('workbench/ledger-clear', {}, signal())).ok).toBe(false)
    await host.track(llmFixture(), 'usage-analysis', route, signal(), async () => {
      expect((await host.handle('workbench/ledger-clear', { confirm: 'clear-analysis-ledger' }, signal())).ok).toBe(false)
    })
    expect((await host.handle('workbench/ledger-clear', { confirm: 'clear-analysis-ledger' }, signal())).ok).toBe(true)
    expect((await read(host)).ledger).toHaveLength(0)
  })
})
