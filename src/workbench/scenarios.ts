import { bucketKeys, bucketsSchema, stamp, type Buckets, type RateCard, type Rates } from './schema.ts'
import { quote, ratesAt, total, type Quote } from './prices.ts'

export type BillingHypothesis = 'unknown' | 'start' | 'end'
export interface IntervalScenario {
  estimate: Quote
  start: string
  end: string
  hypothesis: BillingHypothesis
  segments: { at: string; cardId: string | null }[]
  segmentCount: number
}

/** Bounds across every tariff/version touched by a hypothetical request (maximum seven days).
 * Unknown billing semantics use per-bucket extremes, not invented uniform Token emission. */
export function intervalScenario(cards: readonly RateCard[], route: { provider: string; model: string }, usage: Buckets, currency: Quote['currency'], start: string, end: string, hypothesis: BillingHypothesis = 'unknown'): IntervalScenario {
  bucketsSchema.parse(usage); stamp.parse(start); stamp.parse(end)
  const from = Date.parse(start), to = Date.parse(end)
  if (to < from || to - from > 7 * 86400000) throw new Error('Scenario interval must be between zero and seven days')
  if (hypothesis !== 'unknown' && hypothesis !== 'start' && hypothesis !== 'end') throw new Error('Unknown billing hypothesis')
  if (hypothesis !== 'unknown') return {
    start, end, hypothesis, segments: [], segmentCount: 0,
    estimate: quote(cards, route, usage, { currency, mode: 'scenario', at: hypothesis === 'start' ? start : end, timingKnown: true, requestInputKnown: false }),
  }
  const matching = cards.filter(card => card.provider === route.provider && card.model === route.model && card.currency === currency)
  const instants = new Set([from, to])
  for (const card of matching) for (const time of [Date.parse(card.effectiveFrom), ...(card.effectiveTo ? [Date.parse(card.effectiveTo)] : [])]) {
    if (time >= from && time <= to) { instants.add(time); if (time > from) instants.add(time - 1) }
  }
  if (matching.some(card => card.periods.length)) for (let time = Math.floor(from / 60000) * 60000 + 60000; time <= to; time += 60000) instants.add(time)
  const samples: Rates[] = []
  const segments: IntervalScenario['segments'] = []
  const used = new Map<string, RateCard>()
  let previous = '', contextMissing = false
  const missingRates: Rates = { uncachedInputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null }
  for (const time of [...instants].sort((a, b) => a - b)) {
    const active = matching.filter(card => time >= Date.parse(card.effectiveFrom) && (!card.effectiveTo || time < Date.parse(card.effectiveTo)))
    const card = active.length === 1 ? active[0] : undefined
    if (card) used.set(card.id, card)
    if (card?.tiers.length) contextMissing = true
    const rates = card && !card.tiers.length ? ratesAt(card, usage, time) : missingRates
    const signature = JSON.stringify([card?.id, rates])
    if (signature !== previous) { samples.push(rates); segments.push({ at: new Date(time).toISOString(), cardId: card?.id ?? null }); previous = signature }
  }
  let covered = 0, lower = 0, upper = 0, unavailable = false
  for (const key of bucketKeys) {
    if (!usage[key]) continue
    const values = samples.map(rate => rate[key])
    if (values.some(value => value === null)) {
      unavailable = true
      // A missing rate can be zero or unbounded; neither end can be invented.
      continue
    }
    covered += usage[key]
    lower += usage[key] * Math.min(...values as number[]) / 1e6
    upper += usage[key] * Math.max(...values as number[]) / 1e6
  }
  if (![lower, upper].every(value => Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER)) throw new Error('Scenario amount overflow')
  const status = unavailable ? covered ? 'partial' : 'unavailable' : lower === upper ? 'complete' : 'range'
  return { start, end, hypothesis, segments: segments.slice(0, 256), segmentCount: segments.length, estimate: {
    currency, mode: 'scenario', amount: status === 'complete' ? lower : null,
    lower: covered || total(usage) === 0 ? lower : null, upper: unavailable ? null : upper,
    coveredTokens: covered, totalTokens: total(usage), status, cards: [...used.keys()], verifiedAt: [...new Set([...used.values()].map(card => card.verifiedAt))],
    unavailable: [...(unavailable ? ['interval-price-coverage-incomplete'] : []), ...(contextMissing ? ['request-context-size-unavailable'] : []), 'billing-instant-hypothetical'],
  } }
}
