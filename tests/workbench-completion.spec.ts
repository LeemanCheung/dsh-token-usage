import { costAttribution } from '../src/workbench/cost-attribution.ts'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { emptyState, emptyConfiguration, migrateState, stateSchema, rateCardSchema, type ExperimentRun } from '../src/workbench/schema.ts'
import { buildSnapshot, pageSnapshot } from '../src/workbench/snapshot.ts'
import { createWorkbenchHost } from '../src/workbench/host.ts'
import { priceDigest, revisePrices } from '../src/workbench/price-history.ts'
import { intervalScenario } from '../src/workbench/scenarios.ts'
import { budgetFindings, observableTotals } from '../src/workbench/reporting.ts'
import { experimentComparison } from '../src/workbench/insights.ts'
import { improvementSummary, richSummary, numericOutput, improvementSvg } from '../src/workbench/weekly.ts'
import { readOffline, saveOffline, removeOffline, OFFLINE_KEY } from '../src/client/workbench/offline-cache.ts'
import { installSummaryBridge } from '../src/client/workbench/summary-bridge.ts'
import { insightFixture, fixtureNow, workbenchEvents } from './workbench.fixture.ts'

const signal = () => new AbortController().signal
const usage = { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 }
const rates = { uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 0.1, cacheWriteTokens: 1 }
function card(extra: Record<string, unknown> = {}) {
  return rateCardSchema.parse({ id: 'p', label: 'Private rate label', provider: 'fixture-provider', model: 'fixture-model', currency: 'USD', effectiveFrom: '2026-01-01T00:00:00Z', verifiedAt: '2026-09-11T00:00:00Z', source: 'user-defined', rates, ...extra })
}
function host(initial = '', fail = false) {
  let data = initial
  const update = vi.fn(async (next: { data: string }) => { if (fail) throw new Error('unavailable storage'); data = next.data })
  const ctx = { settings: { register: () => ({ get: () => ({ data }), update }) }, logger: { warn: vi.fn() }, sessions: { get: () => ({ snapshotEvents: () => workbenchEvents() }) } } as unknown as Context
  const value = createWorkbenchHost(ctx)
  return { value, data: () => data, update }
}
async function read(h: ReturnType<typeof host>['value']) {
  const result = await h.handle('workbench/read', {}, signal())
  if (!result.ok) throw new Error(result.error.message)
  return stateSchema.parse(result.value)
}
function run(variant: 'baseline'|'candidate', tokens: number, patch: Partial<ExperimentRun> = {}): ExperimentRun {
  return { id: variant, experiment: 'SECRET_EXPERIMENT', variant, pair: 'SECRET_PAIR', task: 'PRIVATE_TASK', size: 'small', conditions: 'PRIVATE_CONDITION', configLabel: 'PRIVATE_PRESET', accepted: true, generatedAt: '2026-09-10T12:00:00Z', revision: variant, usage: { ...usage, outputTokens: tokens }, retries: variant === 'baseline' ? 3 : 1, requests: 10, retryUsage: { ...usage, outputTokens: 0 }, durationMs: 3000, complete: true, costs: [{ currency: 'USD', amount: 1, complete: true, basis: 'reference', fingerprint: 'fixed' }], ...patch }
}

describe('0.5 diagnostics and coverage', () => {
  it('provides a scope and bilingual action for every finding', () => {
    const snapshot = pageSnapshot(buildSnapshot('session', workbenchEvents(), emptyConfiguration().thresholds, fixtureNow),0)
    expect(snapshot.findings.length).toBeGreaterThan(0)
    for (const f of snapshot.findings) { expect(f.scope).toBe('session'); expect(f.suggestedAction.zh.length).toBeGreaterThan(3); expect(f.suggestedAction.en.length).toBeGreaterThan(3) }
    expect(snapshot.timeCoverage).toBe('complete'); expect(snapshot.routeCoverage).toBe('complete')
  })
  it('joins project budget evidence without reading prompts or blocking work', () => {
    const config = emptyConfiguration(), session = insightFixture()
    config.projects = [{ id: 'p', name: 'secret project', tokenBudget: 100, moneyBudgets: [] }]
    config.assignments = [{ projectId: 'p', sessionId: session.id, tags: [] }]
    const findings = budgetFindings([session],config,session.id,new Date(fixtureNow).toISOString())
    expect(findings).toHaveLength(1); expect(findings[0]).toMatchObject({ ruleId: 'budget-pressure', scope: 'project', severity: 'error', value: 180 })
    expect(JSON.stringify(findings)).not.toContain('secret project')
  })
  it('does not invent a budget decision from undated session data', () => {
    const config = emptyConfiguration(); config.moneyBudgets = [{ currency: 'USD', amount: 1 }]
    expect(budgetFindings([{ ...insightFixture(), dailyUsageReliable: false }],config,'x',new Date(fixtureNow).toISOString())[0]).toMatchObject({ ruleId: 'budget-coverage', coverage: 'partial' })
  })
})

describe('price history and safe migration', () => {
  it('migrates a v1 state while preserving its configuration and unknown usage', () => {
    const original = { schema: 'dsh-token-usage/workbench-v1', revision: 4, config: emptyConfiguration(), ledger: [], evictedEntries: 3 }
    const migrated = migrateState(original)
    expect(migrated.schema).toBe('dsh-token-usage/workbench-v2'); expect(migrated.revision).toBe(4); expect(migrated.evictedEntries).toBe(3)
    expect(original.schema).toBe('dsh-token-usage/workbench-v1')
    expect(() => migrateState({ ...original, inventedSecret: 'x' })).toThrow()
  })
  it('is invariant to key insertion order and card order', () => {
    const first = card(), second = card({ id:'cny', currency:'CNY' })
    expect(priceDigest([first,second])).toBe(priceDigest([second,{ ...first, rates: { outputTokens:2, cacheWriteTokens:1, uncachedInputTokens:1, cacheReadTokens:0.1 } }]))
  })
  it('appends changes, leaves old objects immutable and reports evictions', () => {
    const state = emptyState(); revisePrices(state,[card()],'edit',fixtureNow)
    const original = JSON.stringify(state.priceHistory[1])
    for (let n=2;n<22;n++) revisePrices(state,[card({ rates: { ...rates, outputTokens:n+1 } })],'edit',fixtureNow+n)
    expect(state.priceHistory).toHaveLength(16); expect(state.evictedPriceRevisions).toBeGreaterThan(0)
    expect(JSON.parse(original).cards[0].rates.outputTokens).toBe(2)
  })
  it('restores an old book as a new revision without changing experiment costs', async () => {
    const h = host(), first = await read(h.value)
    const config = { ...first.config, cards:[card()], experiments:[run('baseline',20)] }
    await h.value.handle('workbench/config',{ revision:0, config },signal())
    await h.value.handle('workbench/config',{ revision:1, config:{ ...config, cards:[card({ rates:{...rates,outputTokens:9} })] } },signal())
    const restored = await h.value.handle('workbench/price-rollback',{ revision:2,targetPriceRevision:1,confirm:'restore-price-revision' },signal())
    expect(restored.ok).toBe(true)
    const value = await read(h.value)
    expect(value.priceRevision).toBe(3); expect(value.config.cards[0]?.rates.outputTokens).toBe(2)
    expect(value.config.experiments[0]?.costs[0]?.amount).toBe(1)
    expect(value.priceHistory.at(-1)?.reason).toBe('rollback')
    expect((await read(host(h.data()).value)).priceRevision).toBe(3)
  })
  it('rejects stale or unavailable rollbacks and does not advance price revision for project edits', async () => {
    const h = host(), state = await read(h.value)
    await h.value.handle('workbench/config',{ revision:0, config:{...state.config,shareSummary:true} },signal())
    expect((await read(h.value)).priceRevision).toBe(0)
    expect((await h.value.handle('workbench/price-rollback',{revision:0,targetPriceRevision:0,confirm:'restore-price-revision'},signal())).ok).toBe(false)
    expect((await h.value.handle('workbench/price-rollback',{revision:1,targetPriceRevision:999,confirm:'restore-price-revision'},signal())).ok).toBe(false)
  })
})

describe('durable request identity', () => {
  const route = {provider:'p',model:'m'}, identity = {requestId:'request-1',fingerprint:'private input'}
  const llm = {} as Context['llm']
  it('executes once across duplicate calls, restart and ledger clearing', async () => {
    const h = host(), execute = vi.fn(async () => 42)
    await h.value.track(llm,'usage-analysis',route,signal(),execute,identity)
    await expect(h.value.track(llm,'usage-analysis',route,signal(),execute,identity)).rejects.toThrow('already recorded')
    const restarted = host(h.data())
    await restarted.value.handle('workbench/ledger-clear',{confirm:'clear-analysis-ledger'},signal())
    await expect(restarted.value.track(llm,'usage-analysis',route,signal(),execute,identity)).rejects.toThrow('already recorded')
    expect(execute).toHaveBeenCalledTimes(1)
    const serialized = h.data(); expect(serialized).not.toContain('private input'); expect(serialized).not.toContain('request-1')
  })
  it('rejects a reused ID with different input before another model call', async () => {
    const h=host(), execute=vi.fn(async()=>1)
    await h.value.track(llm,'usage-analysis',route,signal(),execute,identity)
    await expect(h.value.track(llm,'usage-analysis',route,signal(),execute,{...identity,fingerprint:'changed'})).rejects.toThrow('different')
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('serializes concurrent reservation of the same request', async () => {
    const h=host(), execute=vi.fn(async()=>1)
    const values=await Promise.allSettled([h.value.track(llm,'usage-analysis',route,signal(),execute,identity),h.value.track(llm,'usage-analysis',route,signal(),execute,identity)])
    expect(values.filter(v=>v.status==='fulfilled')).toHaveLength(1); expect(execute).toHaveBeenCalledTimes(1)
  })
  it('fails closed when a stable request cannot be durably reserved', async () => {
    const h=host('',true), execute=vi.fn(async()=>1)
    await expect(h.value.track(llm,'usage-analysis',route,signal(),execute,identity)).rejects.toThrow('unavailable storage')
    expect(execute).not.toHaveBeenCalled()
  })
  it('leaves failed and cancelled request identities reserved', async () => {
    const h=host(), execute=vi.fn(async()=>{throw new Error('model failed')})
    await expect(h.value.track(llm,'usage-analysis',route,signal(),execute,identity)).rejects.toThrow('model failed')
    await expect(h.value.track(llm,'usage-analysis',route,signal(),execute,identity)).rejects.toThrow('already recorded')
    expect((await read(h.value)).ledger[0]?.status).toBe('failed')
  })
})

describe('observable totals and interval scenarios', () => {
  it('adds both ledgers in a visible date scope without inventing untracked history', () => {
    const state=emptyState();state.ledgerStartedAt='2026-09-10T12:00:00Z'
    state.ledger=[{ id:'x', routeId:'0'.repeat(32),kind:'usage-analysis',startedAt:'2026-09-10T12:00:00Z',status:'completed',usage,finality:'authoritative' }]
    const combined=observableTotals([insightFixture()],state,7,fixtureNow)
    expect(combined.combined.outputTokens).toBe(40);expect(combined.analysisShare).toBe(0.5)
    expect(combined.reasons).toContain('analysis-tracking-started-after-window');expect(combined.complete).toBe(false)
  })
  it('separates unknown from explicit zero and excludes out-of-window records', () => {
    const state=emptyState();state.ledgerStartedAt='2026-01-01T00:00:00Z'
    state.ledger=[{id:'old',routeId:'0'.repeat(32),kind:'usage-analysis',startedAt:'2026-01-01T00:00:00Z',status:'completed',usage,finality:'authoritative'}, {id:'new',routeId:'0'.repeat(32),kind:'usage-analysis',startedAt:'2026-09-10T00:00:00Z',status:'failed',usage:null,finality:'unknown'}]
    const result=observableTotals([{...insightFixture(),dailyUsageReliable:false}],state,7,fixtureNow)
    expect(result.unknownAnalysis).toBe(1);expect(result.unknownSessions).toBe(1);expect(result.combined.outputTokens).toBe(0);expect(result.complete).toBe(false)
  })
  it('bounds cross-tariff and cross-version requests without uniform-emission assumptions', () => {
    const first=card({effectiveTo:'2026-09-11T12:30:00Z'}),second=card({id:'new',effectiveFrom:'2026-09-11T12:30:00Z',rates:{...rates,outputTokens:4}})
    const value=intervalScenario([first,second],first,usage,'USD','2026-09-11T12:00:00Z','2026-09-11T13:00:00Z')
    expect(value.estimate.status).toBe('range');expect(value.estimate.upper!-value.estimate.lower!).toBeCloseTo(40/1e6,12)
    expect(value.estimate.cards).toEqual(['p','new'])
  })
  it('respects explicitly chosen start/end assumptions', () => {
    const timeCard=card({periods:[{days:[5],startMinute:780,endMinute:840,rates:{...rates,outputTokens:4}}]})
    const start=intervalScenario([timeCard],timeCard,usage,'USD','2026-09-11T12:00:00Z','2026-09-11T13:00:00Z','start')
    const end=intervalScenario([timeCard],timeCard,usage,'USD','2026-09-11T12:00:00Z','2026-09-11T13:00:00Z','end')
    expect(end.estimate.amount!-start.estimate.amount!).toBeCloseTo(40/1e6,12)
  })
  it('handles provider timezone, weekends and DST transition bounds', () => {
    const timeCard=card({timezone:'America/New_York',periods:[{days:[0],startMinute:60,endMinute:120,rates:{...rates,outputTokens:4}}]})
    const value=intervalScenario([timeCard],timeCard,usage,'USD','2026-11-01T04:30:00Z','2026-11-01T07:30:00Z')
    expect(value.estimate.status).toBe('range');expect(value.segmentCount).toBeGreaterThan(1)
    const saturday=intervalScenario([timeCard],timeCard,usage,'USD','2026-09-12T12:00:00Z','2026-09-12T13:00:00Z')
    expect(saturday.estimate.status).toBe('complete')
  })
  it('does not price missing intervals, unknown write classes or aggregated context tiers', () => {
    const gap=card({effectiveTo:'2026-09-11T12:30:00Z'})
    expect(intervalScenario([gap],gap,usage,'USD','2026-09-11T12:00:00Z','2026-09-11T13:00:00Z').estimate.upper).toBeNull()
    const tier=card({tiers:[{minimumInput:1,rates}]})
    expect(intervalScenario([tier],tier,usage,'USD','2026-09-11T12:00:00Z','2026-09-11T13:00:00Z').estimate.status).toBe('unavailable')
    const ttl=card({cacheWriteVariants:{short:1,long:2}})
    expect(intervalScenario([ttl],ttl,usage,'USD','2026-09-11T12:00:00Z','2026-09-11T13:00:00Z').estimate.status).toBe('partial')
  })
  it('rejects invalid and excessive intervals', () => {
    expect(()=>intervalScenario([card()],card(),usage,'USD','invalid','invalid')).toThrow()
    expect(()=>intervalScenario([card()],card(),usage,'USD','2026-09-11T12:00:00Z','2026-09-10T13:00:00Z')).toThrow()
    expect(()=>intervalScenario([card()],card(),usage,'USD','2026-09-11T12:00:00Z','2026-10-10T13:00:00Z')).toThrow()
  })
})

describe('experiment metrics, outcome sharing and offline receipts', () => {
  it('exposes ratio denominators and all comparability conditions', () => {
    const a=run('baseline',20),b=run('candidate',10)
    const comparison=experimentComparison([a,b],'SECRET_EXPERIMENT')
    expect(comparison.groups[0]?.requestRetryShare.mean).toBe(0.3)
    expect(comparison.groups[0]?.retryTokenShare.n).toBe(1)
    expect(comparison.observations[0]?.conditions).toBe('PRIVATE_CONDITION')
  })
  it('marks old snapshots without ratio evidence unavailable, not zero', () => {
    const a=run('baseline',20);delete a.requests;delete a.retryUsage
    const comparison=experimentComparison([a],'SECRET_EXPERIMENT')
    expect(comparison.groups[0]?.retryTokenShare.n).toBe(0);expect(comparison.groups[0]?.retryTokenShare.mean).toBeNull()
  })
  it('does not count duplicate snapshots as independent trials', () => {
    const a=run('baseline',20),b=run('candidate',10,{revision:'baseline'})
    expect(experimentComparison([a,b],'SECRET_EXPERIMENT').comparable).toBe(false)
    expect(improvementSummary([a,b],'2026-09-01','2026-09-12').pairs).toBe(0)
  })
  it('includes only complete pairs accepted in both groups, with signed reduction', () => {
    const a=run('baseline',20),b=run('candidate',30)
    const summary=improvementSummary([a,b],'2026-09-01','2026-09-12')
    expect(summary.pairs).toBe(1);expect(summary.tokenReduction).toBe(-10);expect(summary.retryReduction).toBe(2)
    expect(improvementSummary([a,{...b,accepted:false}],'2026-09-01','2026-09-12').pairs).toBe(0)
    expect(improvementSummary([a,{...b,accepted:null}],'2026-09-01','2026-09-12').pairs).toBe(0)
  })
  it('exports numeric outcomes and budget statuses without labels, routes or IDs', () => {
    const state=emptyState();state.config.experiments=[run('baseline',20),run('candidate',10)];state.config.cards=[card()]
    const result=richSummary([insightFixture()],state,numericOutput({status:'ready',allTokensPerSecond:42},fixtureNow),fixtureNow)
    expect(result.confirmedOutput.tokensPerSecond).toBe(42);expect(result.budgets.money).toHaveLength(2)
    const text=JSON.stringify(result)+improvementSvg(result,false)
    for(const secret of ['SECRET_','PRIVATE_','fixture-provider','fixture-model','Private rate label'])expect(text).not.toContain(secret)
  })
  it('publishes v1 and v2 separately only after consent and cleans up both listeners', async () => {
    const state=emptyState();state.config.shareSummary=true
    const target=new EventTarget(),v1=vi.fn(),v2=vi.fn()
    target.addEventListener('dsh-token-usage:summary',v1);target.addEventListener('dsh-token-usage:summary-v2',v2)
    const dispose=installSummaryBridge(target,{read:async()=>state},()=>[insightFixture()],()=>fixtureNow)
    target.dispatchEvent(new Event('dsh-token-usage:summary-v2-request'));await new Promise(r=>setTimeout(r,0))
    expect(v1).toHaveBeenCalledTimes(1);expect(v2).toHaveBeenCalledTimes(1)
    expect(v1.mock.calls[0]?.[0].detail.schema).toBe('dsh-token-usage/public-summary-v1');expect(v2.mock.calls[0]?.[0].detail.schema).toBe('dsh-token-usage/public-summary-v2')
    dispose();target.dispatchEvent(new Event('dsh-token-usage:summary-v2-request'));expect(v2).toHaveBeenCalledTimes(1)
  })
  it('explicitly saves bounded metadata for offline use and never retains bodies', () => {
    const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}
    const snapshot=pageSnapshot(buildSnapshot('session',workbenchEvents(),emptyConfiguration().thresholds,fixtureNow),0)
    expect(readOffline(storage).snapshots).toHaveLength(0)
    for(let i=0;i<10;i++)saveOffline(storage,{...snapshot,revision:'rev-'+i})
    const cached=readOffline(storage);expect(cached.snapshots).toHaveLength(8);expect(cached.evicted).toBe(2)
    expect(data.get(OFFLINE_KEY)).not.toContain('SECRET_')
    expect(removeOffline(storage,'rev-9',0).snapshots).toHaveLength(7)
  })
  it('preserves corrupt or inaccessible local storage instead of silently clearing it', () => {
    const storage={getItem:()=>'{bad',setItem:vi.fn(),removeItem:vi.fn()}
    expect(()=>readOffline(storage)).toThrow();expect(storage.removeItem).not.toHaveBeenCalled()
  })
})

describe('ordered reference-cost effects', () => {
  it('conserves the delta across volume, cache mix and rate effects', () => {
    const config=emptyConfiguration(); config.cards=[card()]
    const session=insightFixture(),previous={...usage,uncachedInputTokens:200,cacheReadTokens:0}
    session.days=[...session.days,{date:'2026-08-30',usage:previous}]
    session.modelDays=[...session.modelDays,{date:'2026-08-30',provider:'fixture-provider',model:'fixture-model',usage:previous}]
    const report=costAttribution([session],config,7,'USD',fixtureNow)
    expect(report.complete).toBe(true)
    const effects=report.knownSubset
    expect(effects.volume+effects.cacheMix+effects.rate).toBeCloseTo(effects.after-effects.before,12)
    expect(effects.cacheMix).toBeLessThan(0)
  })
  it('keeps missing prices and currencies out of complete monetary conclusions', () => {
    const report=costAttribution([insightFixture()],emptyConfiguration(),7,'CNY',fixtureNow)
    expect(report.complete).toBe(false); expect(report.totalDelta).toBeNull(); expect(report.missingRoutes).toBe(1)
  })
})
