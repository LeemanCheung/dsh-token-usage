import { describe, expect, it, vi } from 'vitest'
import { bucketKeys, boundedParse, bucketsSchema, cardsSchema, configurationSchema, emptyConfiguration, emptyState, rateCardSchema, snapshotSchema, stateSchema, type Buckets, type ExperimentRun } from '../src/workbench/schema.ts'
import { add, publicTemplates, quote, ratesAt, simulateCache, sumQuotes, tariffClock, total, zero } from '../src/workbench/prices.ts'
import { changes, diagnose, experimentComparison, ledgerTotals, projectTotals, shareSummary, shareSvg, windows } from '../src/workbench/insights.ts'
import { changesCsv, csvCell, moneyBudgetStatus, receiptDocument, receiptMarkdown, rollingMoney, selectSessions } from '../src/workbench/reporting.ts'
import { buildSnapshot, intervalUnion, pageSnapshot } from '../src/workbench/snapshot.ts'
import { makeWorkbenchPort } from '../src/workbench/port.ts'
import { installSummaryBridge } from '../src/client/workbench/summary-bridge.ts'
import { fixtureNow, fixtureSessionId, insightFixture, workbenchEvents } from './workbench.fixture.ts'

const at = '2026-09-11T12:00:00Z'
const rates = { uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 0.1, cacheWriteTokens: 1.25 }
const card = (patch: Record<string, unknown> = {}) => rateCardSchema.parse({ id: 'test-card', label: 'Reference', provider: 'fixture-provider', model: 'fixture-model', currency: 'USD', effectiveFrom: '2026-01-01T00:00:00Z', verifiedAt: at, source: 'user-defined', rates, ...patch })
const options = { currency: 'USD' as const, mode: 'revaluation' as const, at, timingKnown: true }
const usage: Buckets = { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 }

describe('workbench validation', () => {
  it('rejects negative, fractional and overflowing token buckets', () => {
    for (const value of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(bucketsSchema.safeParse({ ...zero(), outputTokens: value }).success).toBe(false)
    expect(bucketsSchema.safeParse({ ...zero(), outputTokens: Number.MAX_SAFE_INTEGER, cacheReadTokens: 1 }).success).toBe(false)
  })
  it('distinguishes null rates from zero rates', () => {
    expect(card({ rates: { ...rates, outputTokens: null } }).rates.outputTokens).toBeNull()
    expect(card({ rates: { ...rates, outputTokens: 0 } }).rates.outputTokens).toBe(0)
  })
  it('applies output defaults without admitting unknown fields', () => {
    expect(card().periods).toEqual([]); expect(card().timezone).toBe('UTC')
    expect(() => card({ apiKey: 'secret' })).toThrow()
    expect(() => boundedParse(stateSchema, undefined)).toThrow()
    expect(() => boundedParse(stateSchema, emptyState(), 2)).toThrow()
  })
  it('rejects overlapping tariff periods and invalid timezones', () => {
    expect(() => card({ periods: [{ days: [5], startMinute: 0, endMinute: 100, rates }, { days: [5], startMinute: 50, endMinute: 101, rates }] })).toThrow()
    expect(() => card({ timezone: 'not/a-zone' })).toThrow()
    expect(() => card({ sourceUrl: 'https://secret:password@example.com/' })).toThrow()
  })
  it('rejects price versions with overlapping validity but accepts adjacent versions', () => {
    expect(() => cardsSchema.parse([card(), card({ id: 'second' })])).toThrow()
    expect(cardsSchema.parse([card({ effectiveTo: at }), card({ id: 'second', effectiveFrom: at })])).toHaveLength(2)
    expect(cardsSchema.parse([card(), card({ id: 'cny', currency: 'CNY' })])).toHaveLength(2)
  })
  it('requires one valid primary project and unique ids', () => {
    const config = emptyConfiguration(); config.projects.push({ id: 'p', name: 'Project', tokenBudget: 100, moneyBudgets: [] })
    config.assignments = [{ sessionId: 's', projectId: 'p', tags: [] }, { sessionId: 's', projectId: 'p', tags: [] }]
    expect(configurationSchema.safeParse(config).success).toBe(false)
    config.assignments = [{ sessionId: 's', projectId: 'missing', tags: [] }]
    expect(configurationSchema.safeParse(config).success).toBe(false)
  })
})

describe('price engine', () => {
  it('prices four disjoint buckets and requires an exact route', () => {
    const result = quote([card()], card(), usage, options)
    expect(result.amount).toBeCloseTo((100 + 40 + 5 + 12.5) / 1e6, 12)
    expect(result.coveredTokens).toBe(180)
    expect(quote([card()], { provider: 'another-provider', model: 'fixture-model' }, usage, options).status).toBe('unavailable')
  })
  it('does not apply a future price version early', () => {
    expect(quote([card({ effectiveFrom: '2026-09-12T00:00:00Z' })], card(), usage, options).amount).toBeNull()
    expect(quote([card({ effectiveTo: at })], card(), usage, options).status).toBe('unavailable')
  })
  it('never sums different currencies', () => {
    const usd = quote([card()], card(), usage, options)
    const cny = quote([card({ currency: 'CNY' })], card(), usage, { ...options, currency: 'CNY' })
    expect(sumQuotes([usd, cny], 'USD').amount).toBe(usd.amount)
    expect(sumQuotes([usd, cny], 'USD').totalTokens).toBe(180)
  })
  it('reports partial coverage instead of silently treating missing rates as free', () => {
    const result = quote([card({ rates: { ...rates, outputTokens: null } })], card(), usage, options)
    expect(result.status).toBe('partial'); expect(result.amount).toBeNull(); expect(result.upper).toBeNull(); expect(result.coveredTokens).toBe(160)
    expect(quote([card({ rates: { ...rates, outputTokens: 0 } })], card(), usage, options).status).toBe('complete')
  })
  it('conserves tokens in cache scenarios without mutating real usage', () => {
    const changed = simulateCache(usage, 0.5)
    expect(total(changed)).toBe(total(usage)); expect(changed.cacheReadTokens).toBe(100); expect(usage.cacheReadTokens).toBe(50)
    expect(() => simulateCache(usage, 1.01)).toThrow()
    expect(() => add({ ...zero(), outputTokens: Number.MAX_SAFE_INTEGER }, { ...zero(), outputTokens: 1 })).toThrow()
  })
  it('uses a range for an uncertain billing instant and half-open tariff intervals', () => {
    const peak = { ...rates, outputTokens: 4 }
    const timeCard = card({ periods: [{ days: [5], startMinute: 720, endMinute: 780, rates: peak }] })
    expect(ratesAt(timeCard, usage, Date.parse(at)).outputTokens).toBe(4)
    expect(ratesAt(timeCard, usage, Date.parse('2026-09-11T13:00:00Z')).outputTokens).toBe(2)
    const result = quote([timeCard], timeCard, usage, { ...options, mode: 'historical-reference', timingKnown: false })
    expect(result.status).toBe('range'); expect(result.lower).toBeLessThan(result.upper!); expect(result.amount).toBeNull()
  })
  it('evaluates tariff timezone instead of the viewer timezone', () => {
    const timeCard = card({ timezone: 'Asia/Shanghai', periods: [{ days: [5], startMinute: 1200, endMinute: 1260, rates: { ...rates, outputTokens: 9 } }] })
    expect(ratesAt(timeCard, usage, fixtureNow).outputTokens).toBe(9)
  })
  it('requires request-level evidence for context tiers and cache-write class', () => {
    const tier = card({ tiers: [{ minimumInput: 150, rates: { ...rates, outputTokens: 4 } }] })
    expect(quote([tier], tier, usage, options).status).toBe('unavailable')
    expect(quote([tier], tier, usage, { ...options, requestInputKnown: true }).status).toBe('complete')
    const ttl = card({ cacheWriteVariants: { short: 1, long: 2 } })
    expect(quote([ttl], ttl, usage, options).status).toBe('partial')
    expect(quote([ttl], ttl, usage, { ...options, cacheWriteClass: 'long' }).status).toBe('complete')
  })
  it('never ships unverified numeric prices as reviewed presets', () => {
    expect(publicTemplates().every(template => bucketKeys.every(key => template.rates[key] === null))).toBe(true)
  })
  it('finds a version boundary without applying it early', () => {
    const first = card({ effectiveTo: '2026-09-12T00:00:00Z' }), second = card({ id: 'future', effectiveFrom: '2026-09-12T00:00:00Z', rates: { ...rates, outputTokens: 4 } })
    expect(tariffClock([first, second], first, fixtureNow).next).toBe('2026-09-12T00:00:00.000Z')
  })
})

describe('local receipts and diagnostics', () => {
  it('reconciles provider usage and never exports prompt or tool bodies', () => {
    const snapshot = pageSnapshot(buildSnapshot(String(fixtureSessionId), workbenchEvents(), emptyConfiguration().thresholds, fixtureNow), 0)
    expect(snapshot.totals.usage).toEqual(usage); expect(snapshot.reconciliation).toBe('matched')
    expect(snapshot.provisionalNodeCount).toBe(0)
    expect(snapshot.findings.some(finding => finding.ruleId === 'tool-errors')).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain('SECRET_'); expect(JSON.stringify(snapshot)).not.toContain('private-request-')
    expect(JSON.stringify(receiptDocument(snapshot, [], true))).not.toContain(String(fixtureSessionId))
    expect(JSON.stringify(receiptDocument(snapshot, [], true))).not.toContain('fixture-provider')
    expect(receiptMarkdown(snapshot, [])).toContain('| uncachedInputTokens | 100 |')
  })
  it('returns stable pages and rejects invalid offsets and overlarge inspections', () => {
    const archive = buildSnapshot(String(fixtureSessionId), workbenchEvents(205), emptyConfiguration().thresholds, fixtureNow)
    const first = pageSnapshot(archive, 0), next = pageSnapshot(archive, 200)
    expect(first.nodes).toHaveLength(200); expect(next.nodes).toHaveLength(5); expect(first.revision).toBe(next.revision)
    expect(next.totals.usage).toEqual(first.totals.usage); expect(first.provisionalNodeCount).toBe(0)
    expect(() => pageSnapshot(archive, -1)).toThrow(); expect(() => pageSnapshot(archive, 206)).toThrow()
    expect(() => buildSnapshot('s', new Array(200001).fill(workbenchEvents()[0]), emptyConfiguration().thresholds)).toThrow()
  })
  it('uses interval union for concurrent active duration', () => {
    expect(intervalUnion([[0, 10], [5, 20], [30, 40], [40, 45], [100, 99]])).toBe(35)
    expect(intervalUnion([])).toBe(0)
  })
  it('includes rule versions, thresholds and evidence', () => {
    const snapshot = pageSnapshot(buildSnapshot(String(fixtureSessionId), workbenchEvents(), emptyConfiguration().thresholds), 0)
    const totals = { ...snapshot.totals, retry: usage, compaction: zero() }
    const findings = diagnose(totals, { retryShare: 0.5, compactionShare: 0.9 })
    expect(findings.find(value => value.ruleId === 'retry-share')).toMatchObject({ ruleVersion: '1', threshold: 0.5, value: 1 })
  })
})

describe('attribution, projects and budgets', () => {
  it('compares complete UTC days and makes contributor, route and bucket deltas additive', () => {
    const session = insightFixture(), before = { ...zero(), outputTokens: 10 }
    session.usage = add(session.usage, before); session.days = [...session.days, { date: '2026-08-30', usage: before }]
    session.modelDays = [...session.modelDays, { date: '2026-08-30', provider: 'fixture-provider', model: 'fixture-model', usage: before }]
    const report = changes([session], 7, fixtureNow)
    expect(report.delta).toBe(170)
    for (const rows of [report.contributors, report.routes, report.buckets]) expect(rows.reduce((sum, row) => sum + row.delta, 0)).toBe(report.delta)
    expect(windows(7, fixtureNow)).toMatchObject({ start: '2026-09-04', end: '2026-09-11', previousStart: '2026-08-28' })
  })
  it('excludes undated history and preserves explicit unknown-route residuals', () => {
    const undated = { ...insightFixture('unknown'), dailyUsageReliable: false }
    const missingRoute = { ...insightFixture('route'), modelDailyUsageReliable: false }
    const report = changes([undated, missingRoute], 7, fixtureNow)
    expect(total(report.excludedUndated)).toBe(180); expect(report.complete).toBe(false)
    expect(report.routes.find(row => row.model === '')?.current).toBe(180)
  })
  it('counts a session once even with multiple tags and keeps unassigned usage', () => {
    const sessions = [insightFixture('a'), insightFixture('b', 2)]
    const config = emptyConfiguration(); config.projects = [{ id: 'p', name: 'Project', tokenBudget: 100, moneyBudgets: [] }]
    config.assignments = [{ sessionId: 'a', projectId: 'p', tags: ['tag-a', 'tag-b'] }]
    const rows = projectTotals(sessions, config, fixtureNow)
    expect(rows.reduce((sum, row) => sum + total(row.total), 0)).toBe(540)
    expect(rows.find(row => row.id === 'p')?.status).toBe('exceeded')
    expect(selectSessions(sessions, config, 'p', 'tag-b').map(row => row.id)).toEqual(['a'])
  })
  it('never labels an incomplete money estimate within budget', () => {
    const config = emptyConfiguration(); config.cards = [card()]
    const estimate = rollingMoney([insightFixture()], config, 'USD', fixtureNow)
    expect(estimate.status).toBe('complete'); expect(moneyBudgetStatus(estimate, 1)).toBe('within')
    const unknown = rollingMoney([{ ...insightFixture(), dailyUsageReliable: false }], config, 'USD', fixtureNow)
    expect(unknown.amount).toBeNull(); expect(moneyBudgetStatus(unknown, 1)).toBe('unavailable')
    expect(rollingMoney([insightFixture()], config, 'CNY', fixtureNow).status).toBe('unavailable')
  })
  it('neutralizes spreadsheet formula injection in identifiers', () => {
    expect(csvCell('  =HYPERLINK("x")')).toStartWith('"\'')
    expect(changesCsv([insightFixture('=malicious')], 7, fixtureNow)).toContain('"\'=malicious"')
  })
})

function run(variant: ExperimentRun['variant'], accepted: boolean | null, amount = 1): ExperimentRun {
  return { id: variant, experiment: 'comparison', variant, pair: 'task-1', task: 'coding', size: 'small', conditions: 'same fixtures', configLabel: variant, accepted, generatedAt: at, revision: variant,
    usage, retries: 0, durationMs: 100, complete: true, costs: [{ currency: 'USD', amount, complete: true, basis: 'frozen reference' }] }
}
describe('experiments and auxiliary totals', () => {
  it('requires matching task, size and conditions for pairs', () => {
    expect(experimentComparison([run('baseline', true), run('candidate', true)], 'comparison')).toMatchObject({ comparable: true, pairedCount: 1, exploratory: true })
    expect(experimentComparison([run('baseline', true), { ...run('candidate', true), size: 'large' }], 'comparison').comparable).toBe(false)
  })
  it('does not equate completion with acceptance, or invent statistics for one sample', () => {
    const result = experimentComparison([run('baseline', null)], 'comparison')
    expect(result.qualityObserved).toBe(false); expect(result.groups[0]?.tokens.sd).toBeNull(); expect(result.groups[0]?.costs[0]?.perAccepted).toBeNull()
  })
  it('includes failed attempts in cost per accepted task and handles zero passes', () => {
    const result = experimentComparison([run('baseline', true, 2), { ...run('baseline', false, 3), id: 'failed', pair: 'task-2' }], 'comparison')
    expect(result.groups[0]?.costs[0]?.perAccepted).toBe(5)
    expect(experimentComparison([run('baseline', false)], 'comparison').groups[0]?.costs[0]?.perAccepted).toBeNull()
  })
  it('keeps unknown auxiliary usage distinct from observed zero', () => {
    const entries = [{ id: 'a', routeId: '0'.repeat(32), kind: 'usage-analysis' as const, startedAt: at, status: 'completed' as const, usage: null, finality: 'unknown' as const }]
    expect(ledgerTotals(entries)).toMatchObject({ unknown: 1, provisional: 0, usage: zero() })
  })
})

describe('RPC and sharing boundaries', () => {
  it('rejects snapshot identity mismatches and stale revisions', async () => {
    const snapshot = pageSnapshot(buildSnapshot(String(fixtureSessionId), workbenchEvents(), emptyConfiguration().thresholds), 0)
    const port = makeWorkbenchPort(async () => snapshot)
    await expect(port.snapshot('another-session', new AbortController().signal)).rejects.toThrow('identity')
    await expect(port.snapshot(String(fixtureSessionId), new AbortController().signal, 0, 'stale')).rejects.toThrow('identity')
  })
  it('supports schema-defaulted output on read and cancellation before RPC', async () => {
    const call = vi.fn(async () => emptyState()), port = makeWorkbenchPort(call)
    expect(await port.read(new AbortController().signal)).toEqual(emptyState())
    const controller = new AbortController(); controller.abort()
    await expect(port.read(controller.signal)).rejects.toBeDefined()
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('shares only allowlisted numerical aggregates, never labels or routes', () => {
    const summary = shareSummary([insightFixture('secret-session')], fixtureNow)
    const serialized = JSON.stringify(summary) + shareSvg(summary, true)
    for (const secret of ['secret-session', 'PRIVATE TITLE', 'fixture-provider', 'fixture-model', 'SECRET_']) expect(serialized).not.toContain(secret)
    expect(Object.keys(summary).sort()).toEqual(['schema', 'from', 'to', 'timezone', 'complete', 'sessions', 'tokens', 'delta', 'cacheReadShare'].sort())
  })
  it('requires opt-in, throttles requests and removes listeners on disposal', async () => {
    let state = emptyState(), time = fixtureNow
    const target = new EventTarget(), listener = vi.fn(), read = vi.fn(async () => state)
    target.addEventListener('dsh-token-usage:summary', listener)
    const dispose = installSummaryBridge(target, { read }, () => [insightFixture()], () => time)
    target.dispatchEvent(new Event('dsh-token-usage:summary-request')); await new Promise(resolve => setTimeout(resolve, 0))
    expect(listener).not.toHaveBeenCalled()
    state = { ...state, config: { ...state.config, shareSummary: true } }; time += 1001
    target.dispatchEvent(new Event('dsh-token-usage:summary-request')); target.dispatchEvent(new Event('dsh-token-usage:summary-request'))
    await new Promise(resolve => setTimeout(resolve, 0)); expect(listener).toHaveBeenCalledTimes(1)
    dispose(); time += 1001; target.dispatchEvent(new Event('dsh-token-usage:summary-request'))
    await new Promise(resolve => setTimeout(resolve, 0)); expect(read).toHaveBeenCalledTimes(2)
  })
})
