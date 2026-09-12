import { createHash } from 'node:crypto'
import { cardsSchema, type RateCard, type WorkbenchState } from './schema.ts'

/** Canonical JSON ignores object-key insertion order but preserves semantic array order. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => JSON.stringify(key) + ':' + stableJson(item)).join(',') + '}'
  return JSON.stringify(value) ?? 'null'
}
export function priceDigest(cards: readonly RateCard[]): string {
  return createHash('sha256').update(stableJson([...cards].sort((a, b) => a.id.localeCompare(b.id)))).digest('hex')
}
export function ensurePriceHistory(state: WorkbenchState, now = Date.now()): void {
  if (!state.priceHistory.length) state.priceHistory.push({ revision: state.priceRevision, at: new Date(now).toISOString(), reason: 'initial', digest: priceDigest(state.config.cards), cards: structuredClone(state.config.cards) })
}
export function revisePrices(state: WorkbenchState, cards: readonly RateCard[], reason: 'edit' | 'rollback', now = Date.now()): void {
  const parsed = cardsSchema.parse(cards)
  ensurePriceHistory(state, now)
  if (priceDigest(parsed) === priceDigest(state.config.cards) && reason !== 'rollback') return
  state.priceRevision++
  state.priceHistory.push({ revision: state.priceRevision, at: new Date(now).toISOString(), reason, digest: priceDigest(parsed), cards: structuredClone(parsed) })
  state.config.cards = parsed
  while (state.priceHistory.length > 16 || state.priceHistory.length > 1 && JSON.stringify(state.priceHistory).length > 1_500_000) { state.priceHistory.shift(); state.evictedPriceRevisions++ }
}
