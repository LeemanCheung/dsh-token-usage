// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { prepareTrajectory } from '../src/trajectory-analysis.ts'
import { TrajectoryHistoryController } from '../src/client/trajectory-history.ts'
import type { TrajectoryAnalysis } from '../src/types.ts'

function report(index: number): TrajectoryAnalysis {
  return {
    schema: 'dsh-token-usage/trajectory-analysis-v3',
    sessionId: String(SessionId(index % 2 === 0 ? 'session-a' : 'session-b')),
    generatedAt: new Date(Date.UTC(2026, 7, 14, 0, 0, index)).toISOString(),
    model: { provider: 'deepseek', model: 'chat' },
    truncated: false,
    metrics: prepareTrajectory([]).metrics,
    report: `# Report ${index}`,
  }
}

beforeEach(() => { localStorage.clear() })

describe('trajectory analysis history', () => {
  it('persists, rehydrates, bounds, and removes reports in browser-local storage', () => {
    const first = new TrajectoryHistoryController()
    first.load()
    for (let index = 0; index < 30; index += 1) first.save(report(index))

    expect(first.store.getSnapshot()).toMatchObject({ status: 'ready' })
    expect(first.store.getSnapshot().entries).toHaveLength(24)

    const second = new TrajectoryHistoryController()
    second.load()
    const entries = second.store.getSnapshot().entries
    expect(entries).toHaveLength(24)
    expect(entries[0]?.analysis.report).toBe('# Report 29')

    second.remove(entries[0]!.id)
    expect(second.store.getSnapshot().entries).toHaveLength(23)
  })

  it('ignores invalid timestamps and recovers malformed local JSON', () => {
    const key = 'dsh-token-usage.trajectory-history.v1'
    localStorage.setItem(key, JSON.stringify([{ id: 'x', savedAt: 'not-a-date', analysis: report(0) }]))
    const invalidTimestamp = new TrajectoryHistoryController()
    invalidTimestamp.load()
    expect(invalidTimestamp.store.getSnapshot()).toEqual({ status: 'ready', entries: [] })

    localStorage.setItem(key, '{')
    const malformed = new TrajectoryHistoryController()
    malformed.load()
    expect(malformed.store.getSnapshot()).toEqual({ status: 'ready', entries: [] })
    expect(localStorage.getItem(key)).toBeNull()
    malformed.save(report(1))
    expect(malformed.store.getSnapshot().entries).toHaveLength(1)
  })
})
