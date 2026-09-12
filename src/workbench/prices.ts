import { bucketKeys, bucketsSchema, cardsSchema, rateCardSchema, stamp, type Buckets, type RateCard, type Rates } from './schema.ts'

export interface Quote {
  currency: 'USD' | 'CNY'; mode: 'historical-reference' | 'revaluation' | 'scenario';
  amount: number | null; lower: number | null; upper: number | null;
  coveredTokens: number; totalTokens: number; status: 'complete' | 'partial' | 'unavailable' | 'range';
  cards: string[]; verifiedAt: string[]; unavailable: string[];
}
export const zero = (): Buckets => ({ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
export const total = (usage: Buckets): number => bucketKeys.reduce((sum, key) => sum + usage[key], 0)
export function add(left: Buckets, right: Buckets): Buckets {
  return bucketsSchema.parse(Object.fromEntries(bucketKeys.map(key => [key, left[key] + right[key]])))
}
const clocks = new Map<string, Intl.DateTimeFormat>()
export function localClock(time: number, timezone: string): { day: number; minute: number } {
  let formatter = clocks.get(timezone)
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); if (clocks.size >= 64) clocks.clear(); clocks.set(timezone, formatter) }
  const parts = formatter.formatToParts(time)
  const read = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(read('weekday')), minute: Number(read('hour')) * 60 + Number(read('minute')) }
}
function applies(card: RateCard, time: number): boolean {
  return time >= Date.parse(card.effectiveFrom) && (!card.effectiveTo || time < Date.parse(card.effectiveTo))
}
export function ratesAt(card: RateCard, usage: Buckets, time: number, cacheWriteClass?: 'short' | 'long'): Rates {
  let rates = { ...card.rates }
  const clock = localClock(time, card.timezone)
  const period = card.periods.find(period => period.days.includes(clock.day) && clock.minute >= period.startMinute && clock.minute < period.endMinute)
  if (period) rates = { ...period.rates }
  const input = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const tier = [...card.tiers].sort((a, b) => b.minimumInput - a.minimumInput).find(tier => input >= tier.minimumInput)
  if (tier) rates = { ...tier.rates }
  if (card.cacheWriteVariants) rates.cacheWriteTokens = cacheWriteClass ? card.cacheWriteVariants[cacheWriteClass] : null
  return rates
}
function cost(usage: Buckets, rates: Rates): { amount: number; covered: number; missing: string[] } {
  let amount = 0, covered = 0
  const missing: string[] = []
  for (const key of bucketKeys) {
    if (rates[key] === null) { if (usage[key]) missing.push(key); continue }
    amount += usage[key] * rates[key]! / 1_000_000
    covered += usage[key]
  }
  if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER) throw new Error('Cost estimate overflow')
  return { amount, covered, missing }
}
export function quote(
  cards: readonly RateCard[], route: { provider: string; model: string }, usage: Buckets,
  options: { currency: 'USD' | 'CNY'; mode: Quote['mode']; at: string; timingKnown?: boolean; cacheWriteClass?: 'short' | 'long'; requestInputKnown?: boolean },
): Quote {
  bucketsSchema.parse(usage); stamp.parse(options.at)
  const time = Date.parse(options.at)
  const matches = cards.filter(card => card.provider === route.provider && card.model === route.model && card.currency === options.currency && applies(card, time))
  const base = { currency: options.currency, mode: options.mode, totalTokens: total(usage), cards: matches.map(card => card.id), verifiedAt: matches.map(card => card.verifiedAt) }
  if (matches.length !== 1) return { ...base, amount: null, lower: null, upper: null, coveredTokens: 0, status: 'unavailable', unavailable: [matches.length ? 'ambiguous-price-card' : 'unpriced-route'] }
  const card = matches[0]!
  if (card.tiers.length && options.requestInputKnown !== true) return { ...base, amount: null, lower: null, upper: null, coveredTokens: 0, status: 'unavailable', unavailable: ['request-context-size-unavailable'] }
  const rates = ratesAt(card, usage, time, options.cacheWriteClass)
  const variants = options.timingKnown || !card.periods.length ? [rates] : [card.rates, ...card.periods.map(period => period.rates)].map(value => ({ ...value, ...card.cacheWriteVariants ? { cacheWriteTokens: options.cacheWriteClass ? card.cacheWriteVariants[options.cacheWriteClass] : null } : {} }))
  const results = variants.map(rates => cost(usage, rates))
  const coveredTokens = Math.min(...results.map(result => result.covered))
  const unavailable = [...new Set(results.flatMap(result => result.missing))]
  const lower = Math.min(...results.map(result => result.amount)), upper = Math.max(...results.map(result => result.amount))
  const unknown = coveredTokens < total(usage)
  return { ...base, amount: unknown || lower !== upper ? null : lower,
    lower: coveredTokens > 0 || total(usage) === 0 ? lower : null,
    upper: unknown ? null : upper, coveredTokens,
    status: unknown ? coveredTokens ? 'partial' : 'unavailable' : lower === upper ? 'complete' : 'range',
    unavailable: [...unavailable, ...!options.timingKnown && card.periods.length ? ['billing-instant-unverified'] : []],
  }
}
export function sumQuotes(quotes: readonly Quote[], currency: Quote['currency']): Quote {
  const items = quotes.filter(item => item.currency === currency)
  const totalTokens = items.reduce((sum, item) => sum + item.totalTokens, 0)
  const coveredTokens = items.reduce((sum, item) => sum + item.coveredTokens, 0)
  const lower = items.length ? items.reduce((sum, item) => sum + (item.lower ?? 0), 0) : null
  const upper = items.length && items.every(item => item.upper !== null) ? items.reduce((sum, item) => sum + item.upper!, 0) : null
  if ([totalTokens, coveredTokens, lower ?? 0, upper ?? 0].some(value => !Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)) throw new Error('Quote total overflow')
  const complete = items.length > 0 && items.every(item => item.status === 'complete')
  const range = items.length > 0 && items.every(item => item.status === 'complete' || item.status === 'range')
  return { currency, mode: items[0]?.mode ?? 'revaluation', amount: complete ? lower : null,
    lower: coveredTokens || totalTokens === 0 && items.length ? lower : null, upper,
    coveredTokens, totalTokens, status: complete ? 'complete' : range ? 'range' : coveredTokens ? 'partial' : 'unavailable',
    cards: [...new Set(items.flatMap(item => item.cards))], verifiedAt: [...new Set(items.flatMap(item => item.verifiedAt))], unavailable: [...new Set(items.flatMap(item => item.unavailable))] }
}
export function simulateCache(usage: Buckets, share: number): Buckets {
  bucketsSchema.parse(usage)
  if (!Number.isFinite(share) || share < 0 || share > 1) throw new Error('Cache migration share must be between zero and one')
  const moved = Math.floor(usage.uncachedInputTokens * share)
  return bucketsSchema.parse({ ...usage, uncachedInputTokens: usage.uncachedInputTokens - moved, cacheReadTokens: usage.cacheReadTokens + moved })
}
export function tariffClock(cards: readonly RateCard[], card: RateCard, now = Date.now()): { current: Rates | null; next: string | null; timezone: string } {
  const candidates = cards.filter(value => value.provider === card.provider && value.model === card.model && value.currency === card.currency)
  const signature = (time: number) => {
    const value = candidates.find(value => applies(value, time))
    return value ? JSON.stringify({ id: value.id, rates: ratesAt(value, zero(), time) }) : 'unavailable'
  }
  const currentCard = candidates.find(value => applies(value, now))
  const current = currentCard ? ratesAt(currentCard, zero(), now) : null
  const initial = signature(now)
  const boundaries = candidates.flatMap(value => [Date.parse(value.effectiveFrom), ...value.effectiveTo ? [Date.parse(value.effectiveTo)] : []]).filter(time => time > now)
  let next = boundaries.sort((a, b) => a - b).find(time => signature(time) !== initial) ?? Infinity
  if (candidates.some(value => value.periods.length)) for (let time = Math.floor(now / 60000) * 60000 + 60000; time <= now + 8 * 86400000 && time < next; time += 60000) {
    if (signature(time) !== initial) { next = time; break }
  }
  return { current, next: Number.isFinite(next) ? new Date(next).toISOString() : null, timezone: currentCard?.timezone ?? card.timezone }
}
/** Empty route templates: never claim a remotely changing tariff was verified by installing this plugin. */
export function publicTemplates(): RateCard[] {
  const now = new Date().toISOString()
  return ['deepseek-v4-flash', 'deepseek-v4-pro'].map(model => rateCardSchema.parse({
    id: `template-${model}`, label: `${model} — configure rates`, provider: 'deepseek', model,
    currency: 'USD', effectiveFrom: now, verifiedAt: now, source: 'user-defined',
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    rates: { uncachedInputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null },
    timezone: 'UTC', periods: [], tiers: [],
  }))
}
