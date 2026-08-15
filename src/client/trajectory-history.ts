/** Browser-local trajectory report history shared by Settings and conversation controls. */

import type { TrajectoryAnalysis } from '../types.ts'
import { trajectoryAnalysisOf } from './trajectory-analysis-client.ts'

const STORAGE_KEY = 'dsh-token-usage.trajectory-history.v1'
const MAX_ENTRIES = 24
const MAX_SERIALIZED_CHARS = 3_000_000

export interface TrajectoryHistoryEntry {
  id: string
  savedAt: string
  analysis: TrajectoryAnalysis
}

export interface TrajectoryHistorySnapshot {
  status: 'ready' | 'error' | 'unavailable'
  entries: readonly TrajectoryHistoryEntry[]
}

/** Stable observable source consumed through the slot inject hooks compartment. */
class TrajectoryHistoryStore {
  private snapshot: TrajectoryHistorySnapshot = { status: 'ready', entries: [] }
  private readonly listeners = new Set<() => void>()

  getSnapshot(): TrajectoryHistorySnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  set(snapshot: TrajectoryHistorySnapshot): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}

/** Return whether a durable timestamp is finite and renderable. */
function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

/** Decode only reports that still satisfy the current client wire validation. */
function storedEntriesOf(value: unknown): TrajectoryHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): TrajectoryHistoryEntry[] => {
    if (typeof candidate !== 'object' || candidate === null) return []
    const record = candidate as Record<string, unknown>
    const analysis = trajectoryAnalysisOf(record.analysis)
    return typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 512
      && validTimestamp(record.savedAt)
      && analysis !== undefined
      && validTimestamp(analysis.generatedAt)
      ? [{ id: record.id, savedAt: record.savedAt, analysis }]
      : []
  }).slice(0, MAX_ENTRIES)
}

/** Persist bounded report history in the current browser profile only. */
export class TrajectoryHistoryController {
  readonly store = new TrajectoryHistoryStore()

  load(): void {
    if (typeof localStorage === 'undefined') {
      this.store.set({ status: 'unavailable', entries: [] })
      return
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const entries = raw === null ? [] : storedEntriesOf(JSON.parse(raw) as unknown)
      this.store.set({ status: 'ready', entries })
    } catch (_invalidOrUnavailableStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY)
        this.store.set({ status: 'ready', entries: [] })
      } catch (_storageUnavailable) {
        this.store.set({ status: 'unavailable', entries: [] })
      }
    }
  }

  save(analysis: TrajectoryAnalysis): void {
    const snapshot = this.store.getSnapshot()
    if (snapshot.status === 'unavailable' || typeof localStorage === 'undefined') return
    const entry: TrajectoryHistoryEntry = {
      id: `${analysis.sessionId}\u0000${analysis.generatedAt}\u0000${analysis.model.provider}\u0000${analysis.model.model}`,
      savedAt: new Date().toISOString(),
      analysis,
    }
    const entries = [entry, ...snapshot.entries.filter(candidate => candidate.id !== entry.id)].slice(0, MAX_ENTRIES)
    while (entries.length > 1 && JSON.stringify(entries).length > MAX_SERIALIZED_CHARS) entries.pop()
    const serialized = JSON.stringify(entries)
    if (serialized.length > MAX_SERIALIZED_CHARS) {
      this.store.set({ status: 'error', entries: snapshot.entries })
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, serialized)
      this.store.set({ status: 'ready', entries })
    } catch (_storageQuotaOrPrivacyMode) {
      this.store.set({ status: 'error', entries: snapshot.entries })
    }
  }

  remove(id: string): void {
    const snapshot = this.store.getSnapshot()
    if (snapshot.status === 'unavailable' || typeof localStorage === 'undefined') return
    const entries = snapshot.entries.filter(entry => entry.id !== id)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
      this.store.set({ status: 'ready', entries })
    } catch (_storageQuotaOrPrivacyMode) {
      this.store.set({ status: 'error', entries: snapshot.entries })
    }
  }
}
