import { costAttribution } from '../../workbench/cost-attribution.ts'
import { useMemo, useState } from 'react'
import { bucketKeys, type LocalSnapshot, type Configuration, type WorkbenchState } from '../../workbench/schema.ts'
import { total, simulateCache, tariffClock } from '../../workbench/prices.ts'
import { intervalScenario, type BillingHypothesis } from '../../workbench/scenarios.ts'
import { observableTotals } from '../../workbench/reporting.ts'
import { type InsightSession, type experimentComparison } from '../../workbench/insights.ts'
import { richSummary, improvementSvg, numericOutput } from '../../workbench/weekly.ts'
import { Field, JsonDetails, number, download, type Text } from './parts.tsx'

export function NodeExplorer({ snapshot, t }: { snapshot: LocalSnapshot; t: Text }) {
  const [view, setView] = useState<'nodes' | 'buckets' | 'kinds' | 'routes'>('nodes')
  const [selected, setSelected] = useState('')
  const node = snapshot.nodes.find(node => node.id === selected)
  const rows = view === 'nodes' ? snapshot.nodes.map(node => ({ id: node.id, label: `#${node.seq} · ${node.kind} · ${node.provider}/${node.model}`, value: total(node.usage), finality: node.finality }))
    : view === 'buckets' ? bucketKeys.map(key => ({ id: key, label: key, value: snapshot.totals.usage[key], finality: '' }))
    : view === 'kinds' ? (['ordinary', 'retry', 'compaction'] as const).map(key => ({ id: key, label: key, value: total(snapshot.totals[key]), finality: '' }))
    : snapshot.routes.map(route => ({ id: JSON.stringify([route.provider, route.model]), label: `${route.provider}/${route.model}`, value: total(route.usage), finality: '' }))
  const maximum = Math.max(1, ...rows.map(row => row.value))
  return <div className="wbExplorer" aria-label={t('Token 节点图', 'Token node explorer')}>
    <div className="wbActions">{([['nodes','节点','Nodes'], ['buckets','四类 Token','Buckets'], ['kinds','调用类别','Call kinds'], ['routes','模型路由','Routes']] as const).map(([id, zh, en]) => <button key={id} aria-pressed={view === id} onClick={() => { setView(id); setSelected('') }}>{t(zh,en)}</button>)}</div>
    <p>{t('条宽按当前视图最大值归一化。节点视图仅当前页，其余视图覆盖完整快照；不同分类不会混合相加。', 'Bar widths are normalized to this view’s largest value. Nodes show the current page; other views cover the full snapshot. Classification dimensions are not added together.')}</p>
    <div className="wbTable"><table><thead><tr><th>{t('项目（点击节点查看证据）','Item (select a node for evidence)')}</th><th>Token</th><th>{t('相对消耗','Relative usage')}</th><th>{t('最终性','Finality')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{view === 'nodes' ? <button onClick={() => setSelected(row.id)} aria-pressed={node?.id === row.id}>{row.label}</button> : row.label}</td><td>{number(row.value)}</td><td><progress aria-label={row.label + ' Token'} max={maximum} value={row.value}/></td><td>{row.finality}</td></tr>)}</tbody></table></div>
    {snapshot.reconciliation !== 'matched' && <p role="status">{t('对账存在差异；下面是有符号残差，不能视为普通请求或零费用。','Reconciliation differs. The signed residual is not an ordinary request or a zero cost.')}: {number(total(snapshot.totals.usage) - total(snapshot.totals.attributed))}</p>}
    {node && <section aria-label={t('节点证据','Node evidence')}><h4>#{node.seq} · {node.id}</h4><p>{node.status} · {node.finality} · {node.time ?? t('时间未知','Unknown time')}</p><dl>{bucketKeys.map(key => <div key={key}><dt>{key}</dt><dd>{number(node.usage[key])}</dd></div>)}</dl></section>}
    {!rows.length && <p>{t('此视图没有已观测节点。','No observed nodes in this view.')}</p>}
  </div>
}

export function ObservablePanel({ sessions, state, t }: { sessions: readonly InsightSession[]; state: WorkbenchState; t: Text }) {
  const [days, setDays] = useState<7|30|90>(30)
  const summary = observableTotals(sessions, state, days)
  return <section><h2>{t('合计可观测用量','Combined observable usage')}</h2><Field label={t('合计窗口（包含今天）','Combined window (including today)')}><select value={days} onChange={event => setDays(Number(event.target.value) as 7|30|90)}>{[7,30,90].map(n => <option key={n}>{n}</option>)}</select></Field>
    <p>{summary.start} → {summary.end} UTC · {t('右端不含；全部会话，不受浏览筛选影响。辅助调用按开始时间归属，跨日调用不会伪造分日 Token。','Exclusive end; all sessions, independent of browsing filters. Auxiliary calls are attributed by start time, without inventing intra-call daily splits.')}</p>
    <div className="wbMetricGrid">{[[t('会话已观测 Token','Observed session Tokens'), total(summary.sessionUsage)], [t('分析自身已观测 Token','Observed analysis Tokens'), total(summary.auxiliaryUsage)], [t('合计已观测 Token','Combined observed Tokens'), total(summary.combined)]].map(([label,value]) => <div key={String(label)}><small>{label}</small><strong>{number(Number(value))}</strong></div>)}</div>
    <p>{t('分析占已观测合计','Analysis / observed total')}: {summary.analysisShare === null ? '—' : number(summary.analysisShare*100)+'%'} · {t('日期未知会话 / 未上报分析','Undated sessions / unreported analyses')}: {summary.unknownSessions} / {summary.unknownAnalysis}</p>
    {!summary.complete && <p role="status">{t('仅为可观测子集，不是完整消费或提供方账单。缺口：','Observed subset only, not complete consumption or a provider invoice. Gaps: ')}{summary.reasons.join(' · ')}</p>}
    <p>{t('辅助记账最早记录 / 上次清空 / 淘汰条数','Earliest tracked analysis / last clear / evictions')}: {summary.ledgerStartedAt ?? '—'} / {summary.ledgerClearedAt ?? '—'} / {summary.evictedEntries}</p>
    <button onClick={() => download('observable-usage.json', JSON.stringify({ schema: 'dsh-token-usage/observable-v1', ...summary },null,2),'application/json')}>{t('导出合计口径','Export observable totals')}</button>
  </section>
}

export function PriceHistory({ state, restore, busy, t }: { state: WorkbenchState; restore(revision: number): Promise<void>; busy: boolean; t: Text }) {
  const [revision, setRevision] = useState(''), [confirmed, setConfirmed] = useState(false)
  const target = state.priceHistory.find(item => item.revision === Number(revision))
  const changes = target ? [...new Set([...state.config.cards.map(card => card.id), ...target.cards.map(card => card.id)])].flatMap(id => {
    const before = state.config.cards.find(card => card.id === id), after = target.cards.find(card => card.id === id)
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ id, operation: !before ? 'restore' : !after ? 'remove' : 'replace', before: before ?? null, after: after ?? null }]
  }) : []
  return <section><h2>{t('价卡修订记录与回滚','Price revisions and restore')}</h2><p>{t('每次费率变化追加新修订。回滚也生成新版本，不改写旧记录和实验费用。保留最近 16 份；淘汰数量明确显示，导出后可长期留存。','Each price change appends a revision. Restoring creates a new version without changing old records or experiment costs. The latest 16 books are retained; evictions are disclosed and history can be exported.')}</p>
    <p>{t('当前价卡修订 / 淘汰修订','Current price revision / evictions')}: {state.priceRevision} / {state.evictedPriceRevisions}</p>
    <div className="wbTable"><table><thead><tr><th>{t('修订','Revision')}</th><th>{t('记录时间','Recorded at')}</th><th>{t('原因','Reason')}</th><th>{t('价卡数量','Cards')}</th><th>{t('指纹','Digest')}</th></tr></thead><tbody>{[...state.priceHistory].reverse().map(item => <tr key={item.revision}><td>{item.revision}</td><td>{item.at}</td><td>{item.reason}</td><td>{item.cards.length}</td><td><code>{item.digest.slice(0,16)}</code></td></tr>)}</tbody></table></div>
    <Field label={t('要恢复的修订','Revision to restore')}><select value={revision} onChange={event => { setRevision(event.target.value); setConfirmed(false) }}><option value="">—</option>{state.priceHistory.filter(item => item.revision !== state.priceRevision).map(item => <option key={item.revision} value={item.revision}>{item.revision} · {item.at}</option>)}</select></Field>
    {revision !== '' && <JsonDetails label={t('恢复前差异预览','Restore diff preview')} value={changes}/>}
    <Field label={t('我已检查将被恢复或移除的价卡','I reviewed cards to restore or remove')}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/></Field>
    <div className="wbActions"><button disabled={busy || !confirmed || revision === '' || !target} onClick={() => void restore(Number(revision)).then(() => { setConfirmed(false); setRevision('') }).catch(() => {})}>{t('恢复并创建新修订','Restore as new revision')}</button><button onClick={() => download('price-revision-history.json', JSON.stringify({ schema: 'dsh-token-usage/price-history-v1', priceRevision: state.priceRevision, evicted: state.evictedPriceRevisions, revisions: state.priceHistory },null,2),'application/json')}>{t('导出价卡修订历史','Export price revision history')}</button></div>
  </section>
}

export function ExperimentDetails({ comparison, t }: { comparison: ReturnType<typeof experimentComparison>; t: Text }) {
  return <section aria-label={t('实验完整指标','Full experiment metrics')}>
    {!comparison.uniqueSnapshots && <p role="status">{t('存在重复快照，不能把同一次运行当作独立基线和候选。','Duplicate snapshots are present. The same run is not an independent baseline and candidate.')}</p>}
    {!comparison.samePriceBasis && <p>{t('价格依据缺失或不一致：费用可以逐项查看，但不据此宣称金额改善。','Pricing evidence is missing or differs. Recorded costs remain inspectable, but no monetary improvement is asserted.')}</p>}
    <div className="wbTable"><table><thead><tr><th>{t('分组','Variant')}</th><th>{t('平均重试 Token 占比','Mean retry Token share')}</th><th>{t('平均重试次数占请求','Mean retries / requests')}</th><th>{t('平均活跃秒数','Mean active seconds')}</th><th>{t('重试占比有效样本','Retry-share samples')}</th></tr></thead><tbody>{comparison.groups.map(group => <tr key={group.variant}><td>{group.variant}</td><td>{group.retryTokenShare.mean === null ? '—' : number(group.retryTokenShare.mean*100)+'%'}</td><td>{group.requestRetryShare.mean === null ? '—' : number(group.requestRetryShare.mean*100)+'%'}</td><td>{group.durationMs.mean === null ? '—' : number(group.durationMs.mean/1000)}</td><td>{group.retryTokenShare.n} / {group.n}</td></tr>)}</tbody></table></div>
    <div className="wbTable"><table><thead><tr><th>{t('配对 / 配置','Pair / configuration')}</th><th>{t('任务 / 输入规模','Task / input size')}</th><th>{t('运行条件','Conditions')}</th><th>{t('Token / 重试','Tokens / retries')}</th><th>{t('活跃秒数 / 人工验收','Active seconds / acceptance')}</th></tr></thead><tbody>{comparison.observations.map(run => <tr key={run.id}><td>{run.pair} · {run.variant}<small>{run.configLabel}</small></td><td>{run.task} / {run.size}</td><td>{run.conditions}</td><td>{number(total(run.usage))} / {run.retries}</td><td>{number(run.durationMs/1000)} / {run.accepted === null ? t('未验收','Not evaluated') : run.accepted ? t('通过','Passed') : t('失败','Failed')}</td></tr>)}</tbody></table></div>
  </section>
}

export function LongScenario({ config, usage, t }: { config: Configuration; usage: LocalSnapshot['totals']['usage']; t: Text }) {
  const [id, setId] = useState(''), [share, setShare] = useState(0), [start, setStart] = useState(new Date().toISOString()), [baseline, setBaseline] = useState(new Date().toISOString()), [minutes, setMinutes] = useState(60), [hypothesis, setHypothesis] = useState<BillingHypothesis>('unknown'), [now, setNow] = useState(Date.now())
  const card = config.cards.find(card => card.id === id) ?? config.cards[0]
  const result = useMemo(() => {
    if (!card) return null
    try {
      const finish = (value: string) => new Date(Date.parse(value) + minutes*60000).toISOString()
      return { baseline: intervalScenario(config.cards, card, usage, card.currency, baseline, finish(baseline), hypothesis), candidate: intervalScenario(config.cards, card, simulateCache(usage,share), card.currency, start, finish(start), hypothesis) }
    } catch { return null }
  }, [config.cards, card, usage, share, start, baseline, minutes, hypothesis])
  const clock = useMemo(() => card ? tariffClock(config.cards, card, now) : null, [config.cards, card, now])
  return <section><h2>{t('跨时段情景对比与错峰时钟','Interval scenarios and tariff clock')}</h2><p>{t('相同用量按不同运行时段和缓存假设比较，最长七天。默认不假设计费时点和 Token 发出速度：逐桶取覆盖区间的费率上下界。','Compare the same usage across execution intervals and cache hypotheses, up to seven days. The default makes no billing-instant or Token-emission assumption: bounds span all touched per-bucket rates.')}</p>
    <div className="wbGrid"><Field label={t('试算价卡','Scenario card')}><select value={card?.id ?? ''} onChange={event => setId(event.target.value)}><option value="">—</option>{config.cards.map(card => <option key={card.id} value={card.id}>{card.label} · {card.currency}</option>)}</select></Field><Field label={t('基线开始时刻','Baseline start time')}><input value={baseline} onChange={event => setBaseline(event.target.value)}/></Field><Field label={t('候选开始时刻（ISO 8601）','Candidate start time (ISO 8601)')}><input value={start} onChange={event => setStart(event.target.value)}/></Field><Field label={t('任务持续分钟','Duration in minutes')}><input type="number" min="0" max="10080" value={minutes} onChange={event => setMinutes(Number(event.target.value))}/></Field>
    <Field label={t('计费时点假设','Billing instant hypothesis')}><select value={hypothesis} onChange={event => setHypothesis(event.target.value as BillingHypothesis)}><option value="unknown">{t('未知：保守区间','Unknown: conservative range')}</option><option value="start">{t('假设按开始时刻','Assume request start')}</option><option value="end">{t('假设按结束时刻','Assume request end')}</option></select></Field><Field label={t('迁移为缓存读取的未缓存输入比例','Uncached input hypothetically moved to cache reads')}><input type="range" min="0" max="1" step="0.05" value={share} onChange={event => setShare(Number(event.target.value))}/><span>{Math.round(share*100)}%</span></Field></div>
    {result ? <><div className="wbGrid">{(['baseline','candidate'] as const).map(key => { const value = result[key]; return <div key={key} className="wbQuote"><h3>{key === 'baseline' ? t('基线','Baseline') : t('候选试算','Candidate scenario')}</h3><strong>{value.estimate.currency} {number(value.estimate.amount)}</strong><span>{value.estimate.status}</span><p>{t('下界 / 上界','Lower / upper')}: {number(value.estimate.lower)} / {number(value.estimate.upper)}</p><p>{value.start} → {value.end}</p><p>{value.estimate.unavailable.join(' · ')}</p><JsonDetails label={t('实际覆盖的费率版本与时点','Touched price versions and instants')} value={{ segments: value.segments, count: value.segmentCount }}/></div> })}</div><p>{t('原始 / 假设 Token（必须守恒）','Original / hypothetical Tokens (conserved)')}: {number(total(usage))} / {number(total(simulateCache(usage,share)))}</p><button onClick={() => download('interval-scenarios.json', JSON.stringify({ schema: 'dsh-token-usage/scenarios-v1', assumptions: { cacheMigrationShare: share, billingInstant: hypothesis, durationMinutes: minutes }, ...result },null,2),'application/json')}>{t('导出情景对比','Export scenario comparison')}</button></> : <p>{t('请选择有效价卡、ISO 时间和七天以内的持续时间。','Choose a valid card, ISO timestamps and duration no greater than seven days.')}</p>}
    {clock && <><p>{t('提供方时区 / 下次切换','Provider timezone / next transition')}: {clock.timezone} / {clock.next ?? '—'}</p><p>{t('本地时间','Local time')}: {clock.next ? new Date(clock.next).toLocaleString() : '—'}</p><JsonDetails label={t('当前四类参考费率','Current reference rates')} value={clock.current}/><button onClick={() => setNow(Date.now())}>{t('刷新时钟','Refresh clock')}</button></>}
    <p>{t('缓存命中、模型输出和任务质量不会因试算而得到保证。不会调用模型、修改真实账本或移动任务；缺少费率与上下文证据时保持不可用。','Cache hits, model output and task quality are not guaranteed. No model calls, ledger changes or task rescheduling occur; missing rates and context evidence remain unavailable.')}</p>
  </section>
}

export function OptimizationWeekly({ sessions, state, t, chinese }: { sessions: readonly InsightSession[]; state: WorkbenchState; t: Text; chinese: boolean }) {
  const summary = richSummary(sessions,state,numericOutput(null)), i = summary.improvements
  return <section><h3>{t('全局配对实验的优化成果','Global paired-experiment outcomes')}</h3><p>{t('活动窗口内的候选实验，与其基线配对；仅纳入不同快照、完整数据且双方人工验收通过的配对。不随上方项目筛选改变，不将 Token 减少自动等同于能力提高。','Candidates started in the activity window are paired with their baselines. Only distinct, complete snapshots accepted in both groups qualify. This global evidence is independent of browsing filters; fewer Tokens do not automatically mean better capability.')}</p>
    <div className="wbMetricGrid">{[[t('合格配对 / 排除','Qualified pairs / excluded'),`${i.pairs} / ${i.excluded}`],[t('Token 减少量','Token reduction'),i.pairs ? number(i.tokenReduction) : '—'],[t('重试减少次数','Retry reduction'),i.pairs ? number(i.retryReduction) : '—']].map(([label,value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
    <p>{t('负值表示增加，而不是节省；没有合格配对时不生成优化结论。','Negative values mean an increase, not savings. No improvement conclusion is produced without eligible pairs.')}</p>
    <JsonDetails label={t('优化与预算的全部脱敏字段','All numeric improvement and budget fields')} value={summary}/>
    <div className="wbActions"><button onClick={() => download('optimization-weekly.svg',improvementSvg(summary,chinese),'image/svg+xml')}>{t('导出优化成果卡 SVG','Export improvement SVG')}</button><button onClick={() => download('optimization-weekly.json',JSON.stringify(summary,null,2),'application/json')}>{t('导出优化成果 JSON','Export improvement JSON')}</button></div>
  </section>
}

export function CostChanges({ sessions, config, days, t }: { sessions: readonly InsightSession[]; config: Configuration; days:7|30|90; t:Text }) {
  const [currency,setCurrency]=useState<'USD'|'CNY'>('USD')
  const result=costAttribution(sessions,config,days,currency)
  return <details><summary>{t('参考费用变化拆解：用量、缓存结构、费率','Reference cost changes: volume, cache mix, rates')}</summary><p>{t('双基准重估，不是历史账单。按路由先改变用量，再改变输入缓存结构，最后改变参考费率；基准是各完整周期末的 UTC 时点。顺序影响分解结果。','Two-benchmark revaluation, not historical billing. Per route: change volume, then input cache mix, then reference rates. Benchmarks are the UTC ends of the complete windows. Attribution depends on this order.')}</p><Field label={t('参考变化币种','Reference change currency')}><select value={currency} onChange={event=>setCurrency(event.target.value as 'USD'|'CNY')}><option>USD</option><option>CNY</option></select></Field><p>{result.beforeAt} → {result.afterAt}</p>
    {!result.complete&&<p role="status">{t('仅展示可定价子集，缺失路由不会被当作零费用。','Only the priceable subset is shown. Missing routes are not treated as zero cost.')} {result.missingRoutes}</p>}
    <div className="wbTable"><table><thead><tr><th>{t('模型路由','Route')}</th><th>{t('用量效应','Volume effect')}</th><th>{t('缓存结构效应','Cache-mix effect')}</th><th>{t('费率效应','Rate effect')}</th><th>{t('总变化','Delta')}</th></tr></thead><tbody>{result.rows.map(row=><tr key={JSON.stringify([row.provider,row.model])}><td>{row.provider}/{row.model}</td><td>{number(row.volume)}</td><td>{number(row.cacheMix)}</td><td>{number(row.rate)}</td><td>{number(row.after-row.before)}</td></tr>)}</tbody></table></div><button onClick={()=>download('reference-cost-attribution.json',JSON.stringify(result,null,2),'application/json')}>{t('导出参考费用拆解','Export reference cost attribution')}</button></details>
}
