import { useEffect, useMemo, useRef, useState } from 'react'
import { bucketKeys, configurationSchema, type Configuration, type LocalSnapshot, type WorkbenchState } from '../../workbench/schema.ts'
import { changes, ledgerTotals, projectTotals, shareSummary, shareSvg, type InsightSession } from '../../workbench/insights.ts'
import { changesCsv, moneyBudgetStatus, receiptDocument, receiptMarkdown, rollingMoney, selectSessions, sumSessionUsage } from '../../workbench/reporting.ts'
import { total, type Quote } from '../../workbench/prices.ts'
import type { ReceiptCost, WorkbenchPort } from '../../workbench/port.ts'
import { Experiments, Field, JsonDetails, PriceEditor, Scenario, download, number, type Text } from './components.tsx'
import { workbenchCss } from './styles.ts'

type View = 'inspect' | 'prices' | 'ledger' | 'changes' | 'projects' | 'scenario' | 'experiments' | 'share'
const views: [View, string, string][] = [['inspect', '本地体检 / 收据', 'Inspection / receipt'], ['prices', '价卡', 'Price cards'], ['ledger', '辅助分析账本', 'Analysis ledger'], ['changes', '变化归因', 'Changes'], ['projects', '项目与预算', 'Projects / budgets'], ['scenario', '情景试算', 'Scenarios'], ['experiments', '优化实验室', 'Experiments'], ['share', '周报与联动', 'Weekly / integration']]
const labels: Record<string, [string, string]> = {
  uncachedInputTokens: ['未缓存输入', 'Uncached input'], outputTokens: ['输出', 'Output'], cacheReadTokens: ['缓存读取', 'Cache reads'], cacheWriteTokens: ['缓存写入', 'Cache writes'],
  complete: ['完整', 'Complete'], partial: ['部分覆盖', 'Partial'], unavailable: ['不可用', 'Unavailable'], range: ['区间参考', 'Range'],
  exceeded: ['已超预算', 'Exceeded'], warning: ['接近预算', 'Warning'], within: ['预算内', 'Within'], disabled: ['未启用', 'Disabled'],
  'retry-share': ['重试占比偏高', 'High retry share'], 'compaction-share': ['压缩占比偏高', 'High compaction share'],
  reconciliation: ['用量对账差异', 'Reconciliation mismatch'], 'tool-errors': ['存在工具错误', 'Tool errors'], 'orphan-tools': ['存在未配对工具事件', 'Unpaired tool events'],
  'open-lifecycle': ['仍有未结束回合或步骤', 'Open turns or steps'], 'unresolved-approvals': ['仍有待处理审批', 'Pending approvals'], 'usage-unavailable': ['没有可观测用量', 'No observed usage'],
}
function word(key: string, t: Text) { return labels[key] ? t(...labels[key]!) : key }
function QuoteView({ value, t }: { value: Quote; t: Text }) {
  return <div className="wbQuote"><strong>{value.currency} {number(value.amount)}</strong><span>{word(value.status, t)}</span>
    {value.amount === null && <span>{t('已知下界 / 上界', 'Known lower / upper')}: {number(value.lower)} / {number(value.upper)}</span>}
    <small>{t('可计价 Token', 'Priced Tokens')}: {number(value.coveredTokens)} / {number(value.totalTokens)} · {value.mode}</small>
    {value.unavailable.length > 0 && <small>{value.unavailable.join(' · ')}</small>}
  </div>
}
function MoneyBudgets({ values, submit, busy, t }: { values: Configuration['moneyBudgets']; submit(values: Configuration['moneyBudgets']): Promise<void>; busy: boolean; t: Text }) {
  const [usd, setUsd] = useState(values.find(value => value.currency === 'USD')?.amount.toString() ?? '')
  const [cny, setCny] = useState(values.find(value => value.currency === 'CNY')?.amount.toString() ?? '')
  useEffect(() => { setUsd(values.find(value => value.currency === 'USD')?.amount.toString() ?? ''); setCny(values.find(value => value.currency === 'CNY')?.amount.toString() ?? '') }, [values])
  return <form className="wbInline" onSubmit={event => { event.preventDefault(); const next: Configuration['moneyBudgets'] = []; if (usd) next.push({ currency: 'USD', amount: Number(usd) }); if (cny) next.push({ currency: 'CNY', amount: Number(cny) }); void submit(next).catch(() => {}) }}>
    <Field label={t('30 日 USD 预算（空白关闭）', '30-day USD budget (blank disables)')}><input type="number" min="0.000001" max="1000000000" step="any" value={usd} onChange={event => setUsd(event.target.value)}/></Field>
    <Field label={t('30 日 CNY 预算（空白关闭）', '30-day CNY budget (blank disables)')}><input type="number" min="0.000001" max="1000000000" step="any" value={cny} onChange={event => setCny(event.target.value)}/></Field>
    <button disabled={busy} type="submit">{t('保存金额预算', 'Save money budgets')}</button>
  </form>
}
function Projects({ config, sessions, save, busy, t, selected, error }: { config: Configuration; sessions: readonly InsightSession[]; save(config: Configuration): Promise<void>; busy: boolean; t: Text; selected: string; error(message: string): void }) {
  const [name, setName] = useState(''), [budget, setBudget] = useState('0'), [editing, setEditing] = useState('')
  const assignment = config.assignments.find(value => value.sessionId === selected)
  const [project, setProject] = useState(assignment?.projectId ?? ''), [tags, setTags] = useState(assignment?.tags.join(', ') ?? '')
  useEffect(() => { setProject(assignment?.projectId ?? ''); setTags(assignment?.tags.join(', ') ?? '') }, [selected, assignment])
  const rows = projectTotals(sessions, config)
  const attempt = (action: () => Promise<void>) => void action().catch(cause => error(cause instanceof Error ? cause.message : String(cause)))
  return <section><h2>{t('项目与滚动 30 日预算', 'Projects and rolling 30-day budgets')}</h2>
    <p>{t('统计所有可观测会话，不受上方浏览筛选影响。一个会话只能归属一个主项目；标签只用于筛选，不重复加总。金额采用当前费率重估，不是历史账单。', 'All observable sessions, independent of the browsing filter. One primary project per session; tags never duplicate totals. Money is revalued at current rates, not historical billing.')}</p>
    <form className="wbInline" onSubmit={event => { event.preventDefault(); attempt(async () => {
      const id = editing || crypto.randomUUID(), existing = config.projects.find(item => item.id === id)
      await save({ ...config, projects: [...config.projects.filter(item => item.id !== id), { id, name: name.trim(), tokenBudget: Number(budget), moneyBudgets: existing?.moneyBudgets ?? [] }] })
      setName(''); setBudget('0'); setEditing('')
    }) }}>
      <Field label={t('项目名称', 'Project name')}><input required maxLength={80} value={name} onChange={event => setName(event.target.value)}/></Field>
      <Field label={t('30 日 Token 预算（0 关闭）', '30-day Token budget (0 disables)')}><input type="number" required min="0" max={Number.MAX_SAFE_INTEGER} step="1" value={budget} onChange={event => setBudget(event.target.value)}/></Field>
      <button disabled={busy} type="submit">{editing ? t('保存项目', 'Save project') : t('新建项目', 'Create project')}</button>{editing && <button type="button" onClick={() => { setEditing(''); setName(''); setBudget('0') }}>{t('取消编辑', 'Cancel edit')}</button>}
    </form>
    <form className="wbInline" onSubmit={event => { event.preventDefault(); attempt(() => save({ ...config, assignments: [...config.assignments.filter(value => value.sessionId !== selected), ...(project ? [{ sessionId: selected, projectId: project, tags: [...new Set(tags.split(/[,，]/u).map(tag => tag.trim()).filter(Boolean))] }] : [])] })) }}>
      <Field label={t('当前会话主项目', 'Selected session primary project')}><select value={project} onChange={event => setProject(event.target.value)}><option value="">{t('未分组', 'Unassigned')}</option>{config.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label={t('标签（逗号分隔，最多 12 个）', 'Tags (comma separated, maximum 12)')}><input maxLength={500} value={tags} disabled={!project} onChange={event => setTags(event.target.value)}/></Field>
      <button disabled={busy || !selected} type="submit">{t('保存会话归属', 'Assign session')}</button>
    </form>
    <div className="wbTable"><table><thead><tr><th>{t('项目', 'Project')}</th><th>{t('会话', 'Sessions')}</th><th>{t('全部 / 30 日 Token', 'All / 30-day Tokens')}</th><th>{t('Token 预算', 'Token budget')}</th><th>{t('状态', 'Status')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name || t('未分组', 'Unassigned')}</td><td>{row.sessions}</td><td>{number(total(row.total))} / {row.complete ? number(total(row.rolling)) : t('日期不完整', 'Incomplete dates')}</td><td>{number(row.tokenBudget)}</td><td>{word(row.status, t)}</td><td>{row.id !== 'unassigned' && <><button onClick={() => { setEditing(row.id); setName(row.name); setBudget(String(row.tokenBudget)) }}>{t('编辑', 'Edit')}</button> <button disabled={busy} onClick={() => attempt(() => save({ ...config, projects: config.projects.filter(item => item.id !== row.id), assignments: config.assignments.filter(item => item.projectId !== row.id) }))}>{t('删除并解除分组', 'Delete and unassign')}</button></>}</td></tr>)}</tbody></table></div>
    <h3>{t('全局金额预算', 'Global money budgets')}</h3><MoneyBudgets values={config.moneyBudgets} busy={busy} t={t} submit={moneyBudgets => save({ ...config, moneyBudgets })}/>
    {config.moneyBudgets.map(budget => { const estimate = rollingMoney(sessions, config, budget.currency); return <div key={budget.currency}><QuoteView value={estimate} t={t}/><p>{t('预算状态', 'Budget status')}: {word(moneyBudgetStatus(estimate, budget.amount), t)} · {budget.currency} {number(budget.amount)}</p></div> })}
    {config.projects.map(item => <details key={item.id}><summary>{item.name} · {t('项目金额预算', 'Project money budgets')}</summary>
      <MoneyBudgets values={item.moneyBudgets} busy={busy} t={t} submit={moneyBudgets => save({ ...config, projects: config.projects.map(value => value.id === item.id ? { ...value, moneyBudgets } : value) })}/>
      {item.moneyBudgets.map(budget => { const estimate = rollingMoney(selectSessions(sessions, config, item.id), config, budget.currency); return <div key={budget.currency}><QuoteView value={estimate} t={t}/><p>{word(moneyBudgetStatus(estimate, budget.amount), t)} · {budget.currency} {number(budget.amount)}</p></div> })}
    </details>)}
    <p>{t('预算只提示，不会停止、取消或延迟你的任务。80% 起预警；缺少日期或完整定价时不会显示“预算内”。', 'Budgets notify only: they never stop, cancel or delay tasks. Warnings start at 80%; missing dates or pricing cannot produce a “within budget” result.')}</p>
  </section>
}

export function WorkbenchApp({ port, sessions, chinese = false }: { port: WorkbenchPort; sessions: readonly InsightSession[]; chinese?: boolean }) {
  const t: Text = (zh, en) => chinese ? zh : en
  const [state, setState] = useState<WorkbenchState>(), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [view, setView] = useState<View>('inspect')
  const [selected, setSelected] = useState(sessions[0]?.id ?? ''), [projectFilter, setProjectFilter] = useState(''), [tagFilter, setTagFilter] = useState('')
  const [snapshot, setSnapshot] = useState<LocalSnapshot>(), [costs, setCosts] = useState<ReceiptCost[]>([]), [mode, setMode] = useState<'historical-reference' | 'revaluation'>('historical-reference')
  const [days, setDays] = useState<7 | 30 | 90>(7), [clearConfirmed, setClearConfirmed] = useState(false), [anonymize, setAnonymize] = useState(true)
  const controller = useRef<AbortController | null>(null), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  const run = async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (controller.current && !controller.current.signal.aborted) throw new Error(t('已有操作运行中。', 'Another operation is running.'))
    const current = new AbortController(); controller.current = current; setBusy(true); setError(''); setNotice('')
    try { const result = await operation(current.signal); current.signal.throwIfAborted(); return result }
    catch (cause) { if (alive.current && !current.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); throw cause }
    finally { if (controller.current === current) { controller.current = null; if (alive.current) setBusy(false) } }
  }
  const refresh = () => run(async signal => { const result = await port.read(signal); signal.throwIfAborted(); if (alive.current) setState(result) })
  useEffect(() => { void refresh().catch(() => {}); return () => controller.current?.abort() }, [port])
  useEffect(() => { if (!selected && sessions[0]) setSelected(sessions[0].id) }, [sessions, selected])
  const chooseSession = (id: string) => { controller.current?.abort(); setSelected(id); setSnapshot(undefined); setCosts([]); setError('') }
  const save = (config: Configuration) => run(async signal => {
    if (!state) throw new Error('Workbench has not loaded')
    const next = configurationSchema.parse(config), result = await port.save(state.revision, next, signal)
    signal.throwIfAborted(); if (!alive.current) return
    if (next.thresholds.retryShare !== state.config.thresholds.retryShare || next.thresholds.compactionShare !== state.config.thresholds.compactionShare) setSnapshot(undefined)
    setState(result); setCosts([]); setNotice(t('已保存到本地 Host。', 'Saved to the local Host.'))
  })
  const inspect = (offset = 0) => run(async signal => {
    if (!selected) throw new Error(t('请选择会话。', 'Select a session.'))
    const result = await port.snapshot(selected, signal, offset, offset ? snapshot?.revision : undefined)
    signal.throwIfAborted(); if (!alive.current) return
    setSnapshot(result)
    if (!offset) setCosts([])
  })
  const price = () => run(async signal => {
    if (!snapshot) throw new Error('Inspect the session first')
    const at = new Date().toISOString()
    const values = await Promise.all((['USD', 'CNY'] as const).map(currency => port.receipt(snapshot.sessionId, snapshot.revision, currency, mode, at, signal)))
    signal.throwIfAborted(); if (alive.current) setCosts(values)
  })
  const config = state?.config
  const filtered = useMemo(() => config ? selectSessions(sessions, config, projectFilter, tagFilter) : [...sessions], [sessions, config, projectFilter, tagFilter])
  const report = useMemo(() => changes(filtered, days), [filtered, days])
  const usage = useMemo(() => sumSessionUsage(filtered), [filtered])
  const weekly = useMemo(() => shareSummary(filtered), [filtered])
  const validCosts = costs.filter(cost => cost.revision === snapshot?.revision && cost.priceRevision === state?.revision && cost.estimate.mode === mode)
  useEffect(() => { if (config?.shareSummary) window.dispatchEvent(new Event('dsh-token-usage:summary-request')) }, [config?.shareSummary, sessions])
  const csv = () => download('token-changes.csv', '\uFEFF' + changesCsv(filtered, days), 'text/csv;charset=utf-8')
  const status = (text: string) => <span className="wbPill">{text}</span>
  return <main className="wbRoot" lang={chinese ? 'zh-CN' : 'en'}><style>{workbenchCss}</style>
    <header className="wbHeader"><div><span className="wbEyebrow">LOCAL USAGE · 0.4</span><h1>{t('用量工作台', 'Usage workbench')}</h1><p>{t('从一次调用，到可核对的优化决策。', 'From individual calls to auditable optimization decisions.')}</p></div><div className="wbActions"><button disabled={busy} onClick={() => void refresh().catch(() => {})}>{t('刷新配置与账本', 'Refresh settings and ledger')}</button>{busy && <button onClick={() => controller.current?.abort()}>{t('取消当前读取', 'Cancel current operation')}</button>}</div></header>
    <div role="status" aria-live="polite">{busy ? t('正在读取或保存…', 'Reading or saving…') : notice}</div>{error && <div role="alert" className="wbError">{error}<p>{t('可刷新后重试；现有数据不会被自动覆盖。', 'Refresh and retry; existing data is not automatically overwritten.')}</p></div>}
    {!state ? <p>{t('等待本地 Host 配置。', 'Waiting for local Host configuration.')}</p> : <>
      <nav className="wbTabs" aria-label={t('工作台功能', 'Workbench views')}>{views.map(([id, zh, en]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{t(zh, en)}</button>)}</nav>
      <div className="wbToolbar"><Field label={t('当前会话', 'Selected session')}><select value={selected} onChange={event => chooseSession(event.target.value)}><option value="">—</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}</select></Field>
        <Field label={t('浏览项目筛选', 'Browsing project filter')}><select value={projectFilter} onChange={event => { setProjectFilter(event.target.value); setTagFilter('') }}><option value="">{t('全部项目', 'All projects')}</option><option value="unassigned">{t('未分组', 'Unassigned')}</option>{state.config.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
        <Field label={t('浏览标签筛选', 'Browsing tag filter')}><select value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="">{t('全部标签', 'All tags')}</option>{[...new Set(state.config.assignments.flatMap(item => item.tags))].map(tag => <option key={tag}>{tag}</option>)}</select></Field>
      </div>
      <p className="wbScope">{t('浏览范围', 'Browsing scope')}: {filtered.length} / {sessions.length} {t('会话', 'sessions')} · {t('Token', 'Tokens')} {number(total(usage))} · {t('体检使用当前会话；预算始终使用完整项目范围。', 'Inspection uses the selected session; budgets always use complete project scope.')}</p>
      {view === 'inspect' && <section><h2>{t('无需模型的本地体检', 'Local inspection without a model')}</h2><p>{t('仅读取会话事件元数据和提供方上报用量，不发送提示词，不产生模型费用。读取后得到固定版本快照；正在运行的会话需要重新读取。', 'Reads event metadata and reported usage only. No prompts are sent and no model is called. The result is an immutable snapshot; re-inspect active sessions for updates.')}</p>
        <div className="wbActions"><button disabled={busy || !selected} onClick={() => void inspect().catch(() => {})}>{t('读取并体检', 'Inspect session')}</button>{snapshot && <><Field label={t('价格口径', 'Pricing basis')}><select value={mode} onChange={event => { setMode(event.target.value as typeof mode); setCosts([]) }}><option value="historical-reference">{t('历史参考 / 时点不确定用区间', 'Historical reference / uncertain time uses ranges')}</option><option value="revaluation">{t('当前费率重估', 'Current-rate revaluation')}</option></select></Field><button disabled={busy} onClick={() => void price().catch(() => {})}>{t('计算收据参考费用', 'Price receipt')}</button></>}</div>
        <details><summary>{t('体检阈值', 'Diagnostic thresholds')}</summary><form className="wbInline" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void save({ ...state.config, thresholds: { retryShare: Number(data.get('retry')), compactionShare: Number(data.get('compaction')) } }).catch(() => {}) }}>
          <Field label={t('重试占比阈值（0–1）', 'Retry share threshold (0–1)')}><input name="retry" required type="number" min="0" max="1" step="0.01" defaultValue={state.config.thresholds.retryShare}/></Field>
          <Field label={t('压缩占比阈值（0–1）', 'Compaction share threshold (0–1)')}><input name="compaction" required type="number" min="0" max="1" step="0.01" defaultValue={state.config.thresholds.compactionShare}/></Field><button disabled={busy} type="submit">{t('保存体检阈值', 'Save diagnostic thresholds')}</button></form></details>
        {snapshot && <><h3>{t('用量收据', 'Usage receipt')}</h3><div className="wbMetricGrid"><div><small>{t('总 Token', 'Total Tokens')}</small><strong>{number(total(snapshot.totals.usage))}</strong></div><div><small>{t('模型请求 / 重试', 'Model requests / retries')}</small><strong>{snapshot.totals.requests} / {snapshot.totals.retries}</strong></div><div><small>{t('活跃时长（秒）', 'Active seconds')}</small><strong>{number(snapshot.totals.activeDurationMs / 1000)}</strong></div><div><small>{t('对账', 'Reconciliation')}</small><strong>{snapshot.reconciliation}</strong></div></div>
          <p>{snapshot.generatedAt} · {t('事件', 'events')} {snapshot.eventCount} · {t('暂定用量节点', 'provisional nodes')} {snapshot.provisionalNodeCount}</p>
          <div className="wbTable"><table><thead><tr><th>{t('Token 类别', 'Token bucket')}</th><th>{t('总计', 'Total')}</th><th>{t('普通', 'Ordinary')}</th><th>{t('重试', 'Retry')}</th><th>{t('压缩', 'Compaction')}</th><th>{t('差异', 'Delta')}</th></tr></thead><tbody>{bucketKeys.map(key => <tr key={key}><td>{word(key, t)}</td><td>{number(snapshot.totals.usage[key])}</td><td>{number(snapshot.totals.ordinary[key])}</td><td>{number(snapshot.totals.retry[key])}</td><td>{number(snapshot.totals.compaction[key])}</td><td>{number(snapshot.totals.delta[key])}</td></tr>)}</tbody></table></div>
          <h3>{t('可复核诊断', 'Auditable findings')}</h3>{!snapshot.findings.length && <p>{t('未命中当前规则；不代表业务结果正确。', 'No current rules fired; this does not certify task correctness.')}</p>}{snapshot.findings.map(finding => <details key={finding.ruleId}><summary>{status(finding.severity)} {word(finding.ruleId, t)} · {finding.coverage}</summary><p>{t('规则版本', 'Rule version')}: {finding.ruleVersion} · {t('值 / 阈值', 'Value / threshold')}: {number(finding.value)} / {number(finding.threshold)}</p><pre>{finding.evidence.join('\n')}</pre></details>)}
          <div className="wbGrid">{validCosts.map(cost => <div key={cost.estimate.currency}><QuoteView value={cost.estimate} t={t}/><p>{t('已计价节点中最大费用', 'Largest fully priced node')}: {cost.largestPricedNode ? `${cost.largestPricedNode.id} · ${number(cost.largestPricedNode.amount)}` : '—'}</p><JsonDetails label={t('价卡证据与版本', 'Price evidence and revision')} value={cost}/></div>)}</div>
          <h3>{t('请求与压缩时间线', 'Request and compaction timeline')}</h3><div className="wbTable"><table><thead><tr><th>Seq</th><th>{t('类别 / 状态', 'Kind / status')}</th><th>{t('路由', 'Route')}</th><th>Token</th><th>{t('证据', 'Evidence')}</th></tr></thead><tbody>{snapshot.nodes.map(node => <tr key={node.id}><td>{node.seq}</td><td>{node.kind} / {node.status}</td><td>{node.provider} / {node.model}</td><td>{number(total(node.usage))}</td><td>{node.finality}</td></tr>)}</tbody></table></div>
          <div className="wbActions"><span>{snapshot.offset + 1}–{snapshot.offset + snapshot.nodes.length} / {snapshot.nodeCount}</span><button disabled={busy || snapshot.offset === 0} onClick={() => void run(async signal => { const result = await port.snapshot(selected, signal, Math.max(0, snapshot.offset - 200), snapshot.revision); if (alive.current) setSnapshot(result) }).catch(() => {})}>{t('上一页', 'Previous page')}</button><button disabled={busy || snapshot.nextOffset === null} onClick={() => void inspect(snapshot.nextOffset ?? 0).catch(() => {})}>{t('下一页', 'Next page')}</button></div>
          <Field label={t('导出时隐藏会话与路由标识', 'Hide session and route identifiers in export')}><input type="checkbox" checked={anonymize} onChange={event => setAnonymize(event.target.checked)}/></Field>
          <div className="wbActions"><button onClick={() => download('token-receipt.json', JSON.stringify(receiptDocument(snapshot, validCosts, anonymize), null, 2), 'application/json')}>{t('导出收据 JSON', 'Export receipt JSON')}</button><button onClick={() => download('token-receipt.md', receiptMarkdown(snapshot, validCosts), 'text/markdown')}>{t('导出收据 Markdown', 'Export receipt Markdown')}</button></div><p>{t('JSON 节点明细只包含当前页，总计覆盖整个快照。参考费用不是账单；辅助分析费用另列。', 'JSON node details contain the displayed page; totals cover the entire snapshot. Reference estimates are not invoices. Auxiliary analysis is separate.')}</p>
        </>}
      </section>}
      {view === 'prices' && <PriceEditor config={state.config} save={save} busy={busy} t={t} reportError={setError}/>}
      {view === 'ledger' && <section><h2>{t('辅助分析账本', 'Auxiliary analysis ledger')}</h2><p>{t('仅记录本版本启用之后，通过插件发起的 AI 用量分析和轨迹分析。与原会话账本隔离；本地体检不计入。未上报用量与取消调用的暂定用量不会伪装为完整账单。', 'Records plugin-initiated AI usage and trajectory analysis since this version was enabled. Separate from session accounting. Local inspection adds no entries. Missing or cancelled-call usage is not presented as a complete invoice.')}</p>
        <div className="wbMetricGrid"><div><small>{t('已知 Token', 'Known Tokens')}</small><strong>{number(total(ledgerTotals(state.ledger).usage))}</strong></div><div><small>{t('未知用量记录', 'Unknown usage entries')}</small><strong>{ledgerTotals(state.ledger).unknown}</strong></div><div><small>{t('暂定记录', 'Provisional entries')}</small><strong>{ledgerTotals(state.ledger).provisional}</strong></div><div><small>{t('已淘汰历史记录', 'Evicted entries')}</small><strong>{state.evictedEntries}</strong></div></div>
        <JsonDetails label={t('按分析类型汇总', 'Totals by analysis kind')} value={ledgerTotals(state.ledger).byKind}/>
        <div className="wbTable"><table><thead><tr><th>{t('开始时间', 'Started')}</th><th>{t('分析类型', 'Analysis kind')}</th><th>{t('状态', 'Status')}</th><th>Token</th><th>{t('证据', 'Evidence')}</th></tr></thead><tbody>{[...state.ledger].reverse().map(entry => <tr key={entry.id}><td>{entry.startedAt}</td><td>{entry.kind}</td><td>{entry.status}</td><td>{entry.usage ? number(total(entry.usage)) : '—'}</td><td>{entry.finality}</td></tr>)}</tbody></table></div>
        <button onClick={() => download('auxiliary-analysis-ledger.json', JSON.stringify({ schema: 'dsh-token-usage/analysis-ledger-v1', entries: state.ledger, evictedEntries: state.evictedEntries }, null, 2), 'application/json')}>{t('导出辅助账本', 'Export analysis ledger')}</button>
        <details><summary>{t('清空辅助账本', 'Clear auxiliary ledger')}</summary><Field label={t('确认永久清空本地辅助账本，不影响原会话账本', 'Confirm permanent clearing of the auxiliary ledger only')}><input type="checkbox" checked={clearConfirmed} onChange={event => setClearConfirmed(event.target.checked)}/></Field><button disabled={busy || !clearConfirmed} onClick={() => void run(async signal => { const result = await port.clear(signal); if (alive.current) { setState(result); setClearConfirmed(false) } }).catch(() => {})}>{t('确认清空辅助账本', 'Confirm clear auxiliary ledger')}</button></details>
      </section>}
      {view === 'changes' && <section><h2>{t('消耗变化归因', 'Usage change attribution')}</h2><Field label={t('完整周期天数', 'Complete-day window')}><select value={days} onChange={event => setDays(Number(event.target.value) as 7 | 30 | 90)}>{[7, 30, 90].map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
        <p>{report.window.previousStart} → {report.window.start} {t('对比', 'versus')} {report.window.start} → {report.window.end} · UTC · {t('右端日期不含在内，排除今天。', 'End dates are exclusive; today is excluded.')}</p>
        <div className="wbMetricGrid"><div><small>{t('前周期', 'Previous')}</small><strong>{number(total(report.previous))}</strong></div><div><small>{t('本周期', 'Current')}</small><strong>{number(total(report.current))}</strong></div><div><small>{t('差额', 'Delta')}</small><strong>{number(report.delta)}</strong></div><div><small>{t('日期不明而排除的 Token', 'Excluded undated Tokens')}</small><strong>{number(total(report.excludedUndated))}</strong></div></div>
        {!report.complete && <p role="status">{t('仅比较日期可靠的子集，不能代表全部用量变化。', 'Only the reliably dated subset is compared, not all usage.')}</p>}
        <div className="wbTable"><table><thead><tr><th>{t('类别', 'Bucket')}</th><th>{t('前周期', 'Previous')}</th><th>{t('本周期', 'Current')}</th><th>{t('差额', 'Delta')}</th></tr></thead><tbody>{report.buckets.map(row => <tr key={row.key}><td>{word(row.key, t)}</td><td>{number(row.previous)}</td><td>{number(row.current)}</td><td>{number(row.delta)}</td></tr>)}</tbody></table></div>
        <div className="wbTable"><table><thead><tr><th>{t('模型路由', 'Model route')}</th><th>{t('前周期', 'Previous')}</th><th>{t('本周期', 'Current')}</th><th>{t('差额', 'Delta')}</th></tr></thead><tbody>{report.routes.map(row => <tr key={JSON.stringify([row.provider, row.model])}><td>{row.model ? `${row.provider} / ${row.model}` : t('路由未归属残差', 'Unattributed route residual')}</td><td>{number(row.previous)}</td><td>{number(row.current)}</td><td>{number(row.delta)}</td></tr>)}</tbody></table></div>
        <div className="wbTable"><table><thead><tr><th>{t('贡献会话', 'Contributing session')}</th><th>{t('前周期', 'Previous')}</th><th>{t('本周期', 'Current')}</th><th>{t('差额', 'Delta')}</th></tr></thead><tbody>{report.contributors.slice(0, 100).map(row => <tr key={row.id}><td><button onClick={() => { chooseSession(row.id); setView('inspect') }}>{sessions.find(session => session.id === row.id)?.title ?? row.id}</button></td><td>{number(row.previous)}</td><td>{number(row.current)}</td><td>{number(row.delta)}</td></tr>)}</tbody></table></div>
        <p>{t('页面展示绝对变化最大的 100 个会话，导出包含全部贡献项。这里只做算术分解，不推断业务因果。', 'The page shows the 100 largest absolute changes; exports contain all contributors. This is arithmetic decomposition, not causal attribution.')}</p><button onClick={csv}>{t('导出完整变化 CSV', 'Export full changes CSV')}</button>
      </section>}
      {view === 'projects' && <Projects config={state.config} sessions={sessions} save={save} busy={busy} t={t} selected={selected} error={setError}/>}
      {view === 'scenario' && <Scenario config={state.config} usage={snapshot?.totals.usage ?? usage} t={t}/>}
      {view === 'experiments' && <Experiments config={state.config} snapshot={snapshot} costs={validCosts} save={save} busy={busy} t={t} reportError={setError}/>}
      {view === 'share' && <section><h2>{t('本地周报与只读联动', 'Local weekly report and read-only integration')}</h2><p>{t('周报只包含时间窗口和数字统计，不含会话标题、路径、路由或正文。下载使用当前浏览筛选；同窗口事件使用全部可观测会话。', 'Weekly reports contain only dates and numeric statistics, never session titles, paths, routes or content. Downloads follow browsing filters; same-window events use all observable sessions.')}</p>
        <div className="wbWeekly"><strong>{weekly.from} — {weekly.to} UTC</strong><h3>{number(weekly.tokens)} Token</h3><p>{weekly.sessions} {t('活跃会话', 'active sessions')} · Δ {number(weekly.delta)}</p><p>{t('缓存读取占输入', 'Cache reads / input')}: {weekly.cacheReadShare === null ? '—' : `${number(weekly.cacheReadShare * 100)}%`} · {weekly.complete ? t('日期覆盖完整', 'Complete dated coverage') : t('仅可靠子集', 'Reliable subset only')}</p></div>
        <div className="wbActions"><button onClick={() => download('token-weekly.svg', shareSvg(weekly, chinese), 'image/svg+xml')}>{t('导出周报 SVG', 'Export weekly SVG')}</button><button onClick={() => download('token-weekly.json', JSON.stringify(weekly, null, 2), 'application/json')}>{t('导出周报 JSON', 'Export weekly JSON')}</button></div>
        <Field label={t('允许同一页面中的插件读取脱敏数字摘要（默认关闭）', 'Allow plugins in this page to read the numeric summary (off by default)')}><input type="checkbox" disabled={busy} checked={state.config.shareSummary} onChange={event => void save({ ...state.config, shareSummary: event.target.checked }).catch(() => {})}/></Field>
        <p>{t('不开启 HTTP 服务，不接受跨窗口消息，不执行指令；关闭后停止发送新摘要。已经收到摘要的同页面代码无法被追回。', 'No HTTP service, cross-window messages or command execution. Disabling stops new summaries; data already received by same-page code cannot be revoked.')}</p>
        <JsonDetails label={t('将被共享的全部字段', 'All shared fields')} value={shareSummary(sessions)}/>
        <details><summary>{t('同窗口集成示例', 'Same-window integration example')}</summary><pre>{"window.addEventListener('dsh-token-usage:summary', event => {\n  console.log(event.detail); // allowlisted numeric summary\n});\nwindow.dispatchEvent(new Event('dsh-token-usage:summary-request'));"}</pre></details>
      </section>}
      <footer>{t('本地保存 · 不上传遥测 · 不替代提供方账单或人工验收', 'Stored locally · No telemetry upload · Not a provider invoice or human acceptance')}</footer>
    </>}
  </main>
}
