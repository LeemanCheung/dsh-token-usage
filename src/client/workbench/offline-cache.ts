import { z } from 'zod'
import { boundedParse, snapshotSchema, type LocalSnapshot } from '../../workbench/schema.ts'

export const OFFLINE_KEY = 'dsh-token-usage/offline-receipts-v1'
const cacheSchema = z.object({ schema: z.literal(OFFLINE_KEY), snapshots: z.array(snapshotSchema).max(8), evicted: z.number().int().nonnegative() }).strict()
export interface CacheStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export function readOffline(storage: CacheStorage) {
  const raw = storage.getItem(OFFLINE_KEY)
  if (!raw) return cacheSchema.parse({ schema: OFFLINE_KEY, snapshots: [], evicted: 0 })
  if (raw.length > 1_000_000) throw new Error('Offline receipt cache exceeds its size limit')
  return boundedParse(cacheSchema, JSON.parse(raw), 1_000_000)
}
export function saveOffline(storage: CacheStorage, snapshot: LocalSnapshot) {
  const parsed = snapshotSchema.parse(snapshot)
  const previous = readOffline(storage)
  const snapshots = [...previous.snapshots.filter(value => value.sessionId !== parsed.sessionId || value.revision !== parsed.revision || value.offset !== parsed.offset), parsed]
  let evicted = previous.evicted
  while (snapshots.length > 8 || JSON.stringify({ schema: OFFLINE_KEY, snapshots, evicted }).length > 1_000_000) {
    if (snapshots.length === 1) throw new Error('This receipt page is too large to store offline')
    snapshots.shift(); evicted++
  }
  const next = cacheSchema.parse({ schema: OFFLINE_KEY, snapshots, evicted })
  storage.setItem(OFFLINE_KEY, JSON.stringify(next))
  return next
}
export function removeOffline(storage: CacheStorage, revision: string, offset: number) {
  const current = readOffline(storage)
  const next = { ...current, snapshots: current.snapshots.filter(value => value.revision !== revision || value.offset !== offset) }
  storage.setItem(OFFLINE_KEY, JSON.stringify(next)); return next
}
