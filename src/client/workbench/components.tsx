import { Children, cloneElement, isValidElement, useId } from 'react'
import { useMemo, useState, type ReactNode } from 'react'
import { bucketKeys, cardsSchema, configurationSchema, experimentRunSchema, rateCardSchema, type Configuration, type ExperimentRun, type LocalSnapshot, type RateCard } from '../../workbench/schema.ts'
import { experimentComparison } from '../../workbench/insights.ts'
import { publicTemplates, quote, simulateCache, tariffClock, total } from '../../workbench/prices.ts'
import type { ReceiptCost } from '../../workbench/port.ts'

export { Field, JsonDetails, download, number, type Text } from './parts.tsx'
import { Field, JsonDetails, download, number, type Text } from './parts.tsx'
import { LongScenario, ExperimentDetails } from './completion.tsx'

export function PriceEditor({ config, save, busy, t, reportError }: { config: Configuration; save(config: Configuration): Promise<void>; busy: boolean; t: Text; reportError(message: string): void }) {
  // Empty drafts are intentionally not validated until the user submits the form.
  const draftValue = (): RateCard => ({ id: `rate-${crypto.randomUUID()}`, label: '', provider: '', model: '', currency: 'USD', effectiveFrom: new Date().toISOString(), verifiedAt: new Date().toISOString(), source: 'user-defined', rates: { uncachedInputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null }, timezone: 'UTC', periods: [], tiers: [] })
  const [importConfirmed, setImportConfirmed] = useState(false)
  const [draft, setDraft] = useState<RateCard>(draftValue), [editing, setEditing] = useState(false), [json, setJson] = useState('')
  const attempt = async (action: () => Promise<void>) => { try { await action() } catch (error) { reportError(error instanceof Error ? error.message : String(error)) } }
  const update = (cards: unknown) => save(configurationSchema.parse({ ...config, cards: cardsSchema.parse(cards) }))
  return <section aria-label={t('价卡管理', 'Price cards')}>
    <h2>{t('版本化价卡', 'Versioned price cards')}</h2>
    <p>{t('按精确 provider/model、币种和生效区间匹配。空白单价表示未知，0 表示明确免费。估算不等于提供方账单。', 'Exact provider/model, currency and validity matching. A blank rate is unknown; zero is explicitly free. Estimates are not provider invoices.')}</p>
    <div className="wbActions"><button disabled={busy} onClick={() => void attempt(() => update([...config.cards, ...publicTemplates().filter(template => !config.cards.some(card => card.id === template.id))] ))}>{t('载入 DeepSeek 空白模板', 'Load blank DeepSeek templates')}</button>
      <button onClick={() => download('token-price-cards.json', JSON.stringify({ schema: 'dsh-token-usage/price-cards-v1', cards: config.cards }, null, 2), 'application/json')}>{t('导出价卡', 'Export price cards')}</button></div>
    <p>{t('模板不预填价格。请核对提供方官方价目表、实际路由与生效时间后填写；空白费率不可用，不会按零计费。', 'Templates contain no prices. Verify the official tariff, actual route and validity before entering rates. Unknown rates are not zero.')}</p>
    <div className="wbTable"><table><thead><tr><th>{t('名称 / 路由', 'Name / route')}</th><th>{t('币种 / 有效期', 'Currency / validity')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{config.cards.map(card => <tr key={card.id}><td>{card.label}<small>{card.provider} / {card.model}</small></td><td>{card.currency}<small>{card.effectiveFrom} → {card.effectiveTo ?? '∞'}</small></td><td><button onClick={() => { setDraft(structuredClone(card)); setEditing(true) }}>{t('编辑', 'Edit')}</button> <button disabled={busy} onClick={() => void attempt(() => update(config.cards.filter(value => value.id !== card.id)))}>{t('删除价卡', 'Delete card')}</button><JsonDetails label={t('费率与来源', 'Rates and provenance')} value={card}/></td></tr>)}</tbody></table></div>
    <form onSubmit={event => { event.preventDefault(); void attempt(async () => { const parsed = rateCardSchema.parse({ ...draft, verifiedAt: new Date().toISOString() }); await update([...config.cards.filter(card => card.id !== parsed.id), parsed]); setDraft(draftValue()); setEditing(false) }) }}>
      <h3>{editing ? t('编辑所选版本（已有实验快照不变）', 'Edit selected version (experiment snapshots stay unchanged)') : t('新增价卡', 'Add a price card')}</h3>
      <div className="wbGrid"><Field label={t('价卡名称', 'Card name')}><input required maxLength={100} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })}/></Field>
        <Field label="Provider"><input required maxLength={256} value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.target.value })}/></Field>
        <Field label="Model"><input required maxLength={256} value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })}/></Field>
        <Field label={t('币种', 'Currency')}><select value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value as 'USD' | 'CNY' })}><option>USD</option><option>CNY</option></select></Field>
        <Field label={t('生效时间（ISO 8601，含时区）', 'Effective from (ISO 8601 with timezone)')}><input required value={draft.effectiveFrom} onChange={event => setDraft({ ...draft, effectiveFrom: event.target.value })}/></Field>
        <Field label={t('结束时间（留空表示持续有效）', 'Effective until (blank for open-ended)')}><input value={draft.effectiveTo ?? ''} onChange={event => { const next = { ...draft }; if (event.target.value) next.effectiveTo = event.target.value; else delete next.effectiveTo; setDraft(next) }}/></Field>
        {bucketKeys.map(key => <Field key={key} label={`${key} / 1M`}><input type="number" step="any" min="0" max="1000000" value={draft.rates[key] ?? ''} onChange={event => setDraft({ ...draft, rates: { ...draft.rates, [key]: event.target.value === '' ? null : Number(event.target.value) } })}/></Field>)}</div>
      <p>{t('编辑保留该版本原有的分时、阶梯和缓存写入规则；高级规则可在下方 JSON 编辑器中完整修改。', 'Editing preserves the selected version’s time, context-tier and cache-write rules. Advanced rules can be edited in the JSON editor below.')}</p>
      <div className="wbGrid"><Field label={t('价格来源（无查询参数的官方 HTTPS 链接）', 'Price source (official HTTPS URL without query parameters)')}><input type="url" value={draft.sourceUrl ?? ''} onChange={event => { const next = { ...draft }; if (event.target.value) next.sourceUrl = event.target.value; else delete next.sourceUrl; setDraft(next) }}/></Field><Field label={t('来源类别', 'Source type')}><select value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value as 'public' | 'user-defined' })}><option value="user-defined">{t('自定义/合同费率', 'Custom / contracted')}</option><option value="public">{t('人工核对的公开参考价', 'Manually reviewed public reference')}</option></select></Field></div>
      <p>{t('保存表示你已核对本次费率和生效日期；插件不会声称自动核验。历史修订可在下方查看与回滚。', 'Saving confirms your manual review of rates and validity. The plugin does not claim automatic verification. Revisions can be inspected and restored below.')}</p>
      <button disabled={busy} type="submit">{t('保存价卡', 'Save price card')}</button> <button type="button" onClick={() => { setDraft(draftValue()); setEditing(false) }}>{t('清空表单', 'Reset form')}</button>
    </form>
    <details><summary>{t('高级规则 / 导入 JSON', 'Advanced rules / JSON import')}</summary><p>{t('支持分时 periods、上下文 tiers、cacheWriteVariants。只接受白名单结构；重叠时段、非法数值和超限数组会被拒绝。', 'Supports periods, context tiers and cacheWriteVariants. Overlapping periods, invalid rates and oversized arrays are rejected.')}</p>
      <button onClick={() => setJson(JSON.stringify(config.cards, null, 2))}>{t('载入当前价卡', 'Load current cards')}</button>
      <Field label={t('价卡 JSON', 'Price-card JSON')}><textarea rows={12} maxLength={1000000} value={json} onChange={event => { setJson(event.target.value); setImportConfirmed(false) }}/></Field>
      <Field label={t('已检查导入价卡的路由、来源、费率和生效区间', 'I reviewed imported routes, sources, rates and validity')}><input type="checkbox" checked={importConfirmed} onChange={event => setImportConfirmed(event.target.checked)}/></Field>
      <button disabled={busy || !importConfirmed} onClick={() => void attempt(async () => { const parsed: unknown = JSON.parse(json); await update(Array.isArray(parsed) ? parsed : (parsed as { cards?: unknown })?.cards) })}>{t('校验并替换价卡', 'Validate and replace cards')}</button>
    </details>
  </section>
}
export const Scenario = LongScenario
export function Experiments({ config, snapshot, costs, save, busy, t, reportError }: { config: Configuration; snapshot: LocalSnapshot | undefined; costs: readonly ReceiptCost[]; save(config: Configuration): Promise<void>; busy: boolean; t: Text; reportError(message: string): void }) {
  const [name, setName] = useState(''), [variant, setVariant] = useState<'baseline' | 'candidate'>('baseline'), [pair, setPair] = useState(''), [task, setTask] = useState(''), [size, setSize] = useState(''), [conditions, setConditions] = useState(''), [label, setLabel] = useState(''), [accepted, setAccepted] = useState('unknown')
  const [selected, setSelected] = useState('')
  const names = [...new Set(config.experiments.map(run => run.experiment))]
  const comparison = experimentComparison(config.experiments, selected || names[0] || '')
  const submit = async () => {
    if (!snapshot) return
    try {
      const run: ExperimentRun = experimentRunSchema.parse({ id: crypto.randomUUID(), experiment: name, variant, pair, task, size, conditions, configLabel: label,
        accepted: accepted === 'unknown' ? null : accepted === 'yes', generatedAt: snapshot.generatedAt, revision: snapshot.revision,
        requests: snapshot.totals.requests, retryUsage: snapshot.totals.retry, toolCalls: snapshot.totals.toolCalls, toolErrors: snapshot.totals.toolErrors,
        usage: snapshot.totals.usage, retries: snapshot.totals.retries, durationMs: snapshot.totals.activeDurationMs,
        complete: snapshot.nodeCount > 0 && snapshot.reconciliation === 'matched' && snapshot.totals.openTurns === 0 && snapshot.totals.openSteps === 0 && snapshot.provisionalNodeCount === 0,
        costs: costs.filter(cost => cost.revision === snapshot.revision).map(cost => ({ currency: cost.estimate.currency, amount: cost.estimate.amount ?? cost.estimate.lower ?? 0, complete: cost.estimate.status === 'complete', ...(cost.priceDigest ? { fingerprint: cost.priceDigest + ':' + cost.estimate.mode } : {}), basis: `${cost.estimate.mode}; price revision ${cost.priceRevision}; ${cost.estimate.verifiedAt.join(',')}`.slice(0, 200) })),
      })
      await save({ ...config, experiments: [...config.experiments, run] }); setSelected(name)
    } catch (error) { reportError(error instanceof Error ? error.message : String(error)) }
  }
  return <section><h2>{t('优化实验室', 'Optimization experiments')}</h2><p>{t('为可比任务保存不可变统计快照。验收由你标注，回合完成不等于业务正确。结果是探索性对比，不是模型能力排名或因果证明。', 'Capture immutable statistics for comparable tasks. Acceptance is explicitly labeled by you. A completed turn is not proof of task correctness. Comparisons are exploratory, not rankings or causal proof.')}</p>
    <form onSubmit={event => { event.preventDefault(); void submit() }}><div className="wbGrid">
      <Field label={t('实验名称', 'Experiment name')}><input required maxLength={80} value={name} onChange={event => setName(event.target.value)}/></Field>
      <Field label={t('分组', 'Variant')}><select value={variant} onChange={event => setVariant(event.target.value as typeof variant)}><option value="baseline">{t('基线', 'Baseline')}</option><option value="candidate">{t('候选', 'Candidate')}</option></select></Field>
      <Field label={t('配对任务编号', 'Paired task ID')}><input required maxLength={80} value={pair} onChange={event => setPair(event.target.value)}/></Field>
      <Field label={t('任务类别', 'Task category')}><input required maxLength={80} value={task} onChange={event => setTask(event.target.value)}/></Field>
      <Field label={t('输入规模区间', 'Input size band')}><input required maxLength={40} value={size} onChange={event => setSize(event.target.value)}/></Field>
      <Field label={t('运行条件标签', 'Run conditions label')}><input required maxLength={160} value={conditions} onChange={event => setConditions(event.target.value)}/></Field>
      <Field label={t('配置 / preset 版本标签（非正文）', 'Configuration / preset version label (not content)')}><input required maxLength={80} value={label} onChange={event => setLabel(event.target.value)}/></Field>
      <Field label={t('人工验收', 'Human acceptance')}><select value={accepted} onChange={event => setAccepted(event.target.value)}><option value="unknown">{t('未验收', 'Not evaluated')}</option><option value="yes">{t('通过', 'Passed')}</option><option value="no">{t('未通过', 'Failed')}</option></select></Field>
    </div><button type="submit" disabled={busy || !snapshot}>{t('保存当前会话快照', 'Save current session snapshot')}</button></form>
    {!snapshot && <p>{t('请先在本地体检中读取一个会话。', 'Inspect a session first.')}</p>}
    <Field label={t('选择实验', 'Select experiment')}><select value={selected || names[0] || ''} onChange={event => setSelected(event.target.value)}><option value="">—</option>{names.map(name => <option key={name}>{name}</option>)}</select></Field>
    <p>{t('有效配对', 'Valid pairs')}: {comparison.pairedCount} · {t('可比条件完整', 'Comparable conditions complete')}: {String(comparison.comparable)} · {t('验收信号完整', 'Acceptance observed')}: {String(comparison.qualityObserved)}</p>
    <div className="wbTable"><table><thead><tr><th>{t('分组', 'Variant')}</th><th>N</th><th>{t('平均 / 中位 Token', 'Mean / median Tokens')}</th><th>{t('标准差', 'Standard deviation')}</th><th>{t('验收通过率', 'Acceptance')}</th><th>{t('每个通过任务费用', 'Cost per accepted task')}</th></tr></thead><tbody>{comparison.groups.map(group => <tr key={group.variant}><td>{group.variant}</td><td>{group.n}</td><td>{number(group.tokens.mean)} / {number(group.tokens.median)}</td><td>{number(group.tokens.sd)}</td><td>{group.acceptance === null ? '—' : `${number(group.acceptance * 100)}%`}</td><td>{group.costs.map(cost => <div key={cost.currency}>{cost.currency} {number(cost.perAccepted)}</div>)}</td></tr>)}</tbody></table></div>
    <p>{t('每个通过任务费用包含失败尝试的已知费用；零通过、未验收或价格覆盖不完整时不可用。', 'Cost per accepted task includes failed attempts. It is unavailable with zero passes, unevaluated runs or incomplete pricing.')}</p>
    <ExperimentDetails comparison={comparison} t={t}/>
    <JsonDetails label={t('配对差值与完整统计', 'Paired differences and full statistics')} value={comparison}/>
    <div className="wbTable"><table><thead><tr><th>{t('快照', 'Snapshot')}</th><th>{t('验收', 'Acceptance')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{config.experiments.filter(run => run.experiment === (selected || names[0])).map(run => <tr key={run.id}><td>{run.variant} · {run.pair} · {run.configLabel}<small>{run.generatedAt}</small></td><td><select aria-label={t('修改人工验收', 'Update human acceptance') + ' ' + run.id} disabled={busy} value={run.accepted === null ? 'unknown' : run.accepted ? 'yes' : 'no'} onChange={event => { const accepted = event.target.value === 'unknown' ? null : event.target.value === 'yes'; void save({ ...config, experiments: config.experiments.map(item => item.id === run.id ? { ...item, accepted, acceptanceAt: new Date().toISOString() } : item) }).catch(error => reportError(String(error))) }}><option value="unknown">{t('未验收', 'Not evaluated')}</option><option value="yes">{t('通过', 'Passed')}</option><option value="no">{t('失败', 'Failed')}</option></select></td><td><button disabled={busy} onClick={() => void save({ ...config, experiments: config.experiments.filter(item => item.id !== run.id) }).catch(error => reportError(String(error)))}>{t('删除快照', 'Delete snapshot')}</button></td></tr>)}</tbody></table></div>
    <button onClick={() => download('token-experiments.json', JSON.stringify({ schema: 'dsh-token-usage/experiments-v1', runs: config.experiments }, null, 2), 'application/json')}>{t('导出本地实验记录', 'Export local experiment records')}</button>
  </section>
}
