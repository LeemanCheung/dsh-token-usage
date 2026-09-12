import { bucketKeys, day as daySchema, type Buckets, type Configuration, type ExperimentRun, type Finding, type LocalSnapshot, type LedgerEntry } from './schema.ts'
import { add, zero, total } from './prices.ts'

export function diagnose(totals: LocalSnapshot['totals'], thresholds: Configuration['thresholds']): Finding[] {
  const findings: Finding[] = []
  const push = (ruleId: string, severity: Finding['severity'], value: number, evidence: string[], threshold?: number, coverage: Finding['coverage'] = 'complete') => findings.push({ ruleId, ruleVersion: '1', severity, value, evidence, coverage, ...(threshold === undefined ? {} : { threshold }) })
  const tokens = total(totals.usage)
  if (bucketKeys.some(key => totals.delta[key] !== 0)) push('reconciliation', 'error', bucketKeys.reduce((sum, key) => sum + Math.abs(totals.delta[key]), 0), bucketKeys.map(key => `${key}: ${totals.delta[key]}`), undefined, 'partial')
  if (tokens && total(totals.retry) / tokens >= thresholds.retryShare && total(totals.retry)) push('retry-share', 'warning', total(totals.retry) / tokens, [`retryTokens: ${total(totals.retry)}`, `allTokens: ${tokens}`, `retries: ${totals.retries}`], thresholds.retryShare)
  if (tokens && total(totals.compaction) / tokens >= thresholds.compactionShare && total(totals.compaction)) push('compaction-share', 'warning', total(totals.compaction) / tokens, [`compactionTokens: ${total(totals.compaction)}`, `allTokens: ${tokens}`], thresholds.compactionShare)
  if (totals.toolErrors) push('tool-errors', 'warning', totals.toolErrors, [`toolErrors: ${totals.toolErrors}`, `toolCalls: ${totals.toolCalls}`])
  if (totals.orphanTools) push('orphan-tools', 'warning', totals.orphanTools, [`unpairedToolEvents: ${totals.orphanTools}`], undefined, 'partial')
  if (totals.openTurns || totals.openSteps) push('open-lifecycle', 'info', totals.openTurns + totals.openSteps, [`openTurns: ${totals.openTurns}`, `openSteps: ${totals.openSteps}`], undefined, 'partial')
  if (totals.unresolvedApprovals) push('unresolved-approvals', 'warning', totals.unresolvedApprovals, [`unresolvedApprovals: ${totals.unresolvedApprovals}`], undefined, 'partial')
  if (!tokens) push('usage-unavailable', 'info', 0, ['No provider-reported Token usage'], undefined, 'unavailable')
  return findings
}
/** Half-open UTC windows; comparison excludes the unfinished current day. */
export function windows(length: 7 | 30 | 90, now = Date.now()) {
  const end = Date.parse(new Date(now).toISOString().slice(0, 10)), start = end - length * 86400000
  return { previousStart: new Date(start - length * 86400000).toISOString().slice(0, 10), start: new Date(start).toISOString().slice(0, 10), end: new Date(end).toISOString().slice(0, 10), timezone: 'UTC' as const, length }
}
export interface DayUsage { date: string; usage: Buckets }
export interface InsightSession {
  id: string; title: string; usage: Buckets; days: readonly DayUsage[];
  models: readonly { provider: string; model: string; usage: Buckets }[];
  modelDays: readonly { provider: string; model: string; date: string; usage: Buckets }[];
  dailyUsageReliable: boolean; modelDailyUsageReliable: boolean;
}
export function periodSum(days: readonly DayUsage[], start: string, end: string): Buckets {
  daySchema.parse(start); daySchema.parse(end)
  return days.filter(day => day.date >= start && day.date < end).reduce((sum, row) => add(sum, row.usage), zero())
}
export function changes(sessions: readonly InsightSession[], length: 7 | 30 | 90, now = Date.now()) {
  const window = windows(length, now)
  let current = zero(), previous = zero(), excluded = zero()
  const contributors: { id: string; current: number; previous: number; delta: number }[] = []
  const routes = new Map<string, { provider: string; model: string; current: number; previous: number }>()
  for (const session of sessions) {
    if (!session.dailyUsageReliable) { excluded = add(excluded, session.usage); continue }
    const before = periodSum(session.days, window.previousStart, window.start), after = periodSum(session.days, window.start, window.end)
    current = add(current, after); previous = add(previous, before)
    contributors.push({ id: session.id, current: total(after), previous: total(before), delta: total(after) - total(before) })
    if (!session.modelDailyUsageReliable) continue
    for (const row of session.modelDays) {
      if (row.date < window.previousStart || row.date >= window.end) continue
      const key = JSON.stringify([row.provider, row.model]), value = routes.get(key) ?? { provider: row.provider, model: row.model, current: 0, previous: 0 }
      if (row.date < window.start) value.previous += total(row.usage)
      else value.current += total(row.usage)
      routes.set(key, value)
    }
  }
  const routeRows = [...routes.values()].map(row => ({ ...row, delta: row.current - row.previous }))
  const residual = { provider: '', model: '', current: total(current) - routeRows.reduce((sum, row) => sum + row.current, 0), previous: total(previous) - routeRows.reduce((sum, row) => sum + row.previous, 0) }
  return { window, current, previous, delta: total(current) - total(previous), excludedUndated: excluded,
    complete: sessions.every(session => session.dailyUsageReliable),
    routes: [...routeRows, { ...residual, delta: residual.current - residual.previous }].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    contributors: contributors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    buckets: bucketKeys.map(key => ({ key, current: current[key], previous: previous[key], delta: current[key] - previous[key] })),
  }
}
/** Rolling budgets include today's confirmed data, unlike complete-day comparisons. */
export function projectTotals(sessions: readonly InsightSession[], config: Configuration, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10), start = new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10), end = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10)
  const assignments = new Map(config.assignments.map(item => [item.sessionId, item.projectId]))
  type Row = { id: string; name: string; tokenBudget: number; total: Buckets; rolling: Buckets; complete: boolean; sessions: number }
  const rows = new Map<string, Row>(config.projects.map(project => [project.id, { id: project.id, name: project.name, tokenBudget: project.tokenBudget, total: zero(), rolling: zero(), complete: true, sessions: 0 }]))
  rows.set('unassigned', { id: 'unassigned', name: '', tokenBudget: 0, total: zero(), rolling: zero(), complete: true, sessions: 0 })
  for (const session of sessions) {
    const row = rows.get(assignments.get(session.id) ?? 'unassigned') ?? rows.get('unassigned')!
    row.total = add(row.total, session.usage); row.sessions++
    if (session.dailyUsageReliable) row.rolling = add(row.rolling, periodSum(session.days, start, end))
    else row.complete = false
  }
  return [...rows.values()].map(row => ({ ...row, status: !row.complete ? 'unavailable' : !row.tokenBudget ? 'disabled' : total(row.rolling) >= row.tokenBudget ? 'exceeded' : total(row.rolling) >= row.tokenBudget * 0.8 ? 'warning' : 'within', start, end }))
}
export function ledgerTotals(entries: readonly LedgerEntry[]) {
  return { usage: entries.reduce((sum, entry) => entry.usage ? add(sum, entry.usage) : sum, zero()), unknown: entries.filter(entry => entry.usage === null).length,
    provisional: entries.filter(entry => entry.finality === 'provisional').length,
    byKind: (['usage-analysis', 'trajectory-analysis'] as const).map(kind => ({ kind, count: entries.filter(entry => entry.kind === kind).length,
      usage: entries.filter(entry => entry.kind === kind).reduce((sum, entry) => entry.usage ? add(sum, entry.usage) : sum, zero()) })) }
}
function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), n = values.length, mean = n ? values.reduce((sum, value) => sum + value, 0) / n : null
  return { n, mean, median: n ? (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.floor(n / 2)]!) / 2 : null,
    sd: n > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean!) ** 2, 0) / (n - 1)) : null }
}
export function experimentComparison(runs: readonly ExperimentRun[], experiment: string) {
  const selected = runs.filter(run => run.experiment === experiment)
  const groups = (['baseline', 'candidate'] as const).map(variant => {
    const rows = selected.filter(run => run.variant === variant), passed = rows.filter(run => run.accepted === true).length
    return { variant, n: rows.length, judged: rows.filter(run => run.accepted !== null).length, passed,
      acceptance: rows.length && rows.every(run => run.accepted !== null) ? passed / rows.length : null,
      tokens: stats(rows.map(run => total(run.usage))), durationMs: stats(rows.map(run => run.durationMs)), retries: stats(rows.map(run => run.retries)),
      costs: (['USD', 'CNY'] as const).map(currency => {
        const costs = rows.map(run => run.costs.find(cost => cost.currency === currency))
        const complete = rows.length > 0 && rows.every(run => run.complete) && costs.every(cost => cost?.complete)
        const knownCost = costs.reduce((sum, cost) => sum + (cost?.amount ?? 0), 0)
        return { currency, complete, knownCost, perAccepted: complete && passed > 0 && rows.every(run => run.accepted !== null) ? knownCost / passed : null }
      }),
    }
  })
  const pairs = new Map<string, ExperimentRun[]>()
  for (const run of selected) { const key = JSON.stringify([run.pair, run.task, run.size, run.conditions]); pairs.set(key, [...(pairs.get(key) ?? []), run]) }
  const paired = [...pairs.values()].filter(rows => rows.filter(row => row.variant === 'baseline').length === 1 && rows.filter(row => row.variant === 'candidate').length === 1)
  const differences = paired.map(rows => total(rows.find(row => row.variant === 'candidate')!.usage) - total(rows.find(row => row.variant === 'baseline')!.usage))
  return { groups, pairedCount: paired.length, tokenDifferences: stats(differences), comparable: selected.length > 0 && paired.length * 2 === selected.length && selected.every(run => run.complete),
    qualityObserved: selected.length > 0 && selected.every(run => run.accepted !== null), exploratory: true as const }
}
/** Only numerical allowlisted fields enter the optional same-origin summary. */
export function shareSummary(sessions: readonly InsightSession[], now = Date.now()) {
  const change = changes(sessions, 7, now), input = change.current.uncachedInputTokens + change.current.cacheReadTokens + change.current.cacheWriteTokens
  return { schema: 'dsh-token-usage/public-summary-v1' as const, from: change.window.start, to: change.window.end, timezone: 'UTC' as const,
    complete: change.complete, sessions: change.contributors.filter(row => row.current > 0).length, tokens: total(change.current), delta: change.delta,
    cacheReadShare: input ? change.current.cacheReadTokens / input : null }
}
export function shareSvg(summary: ReturnType<typeof shareSummary>, chinese: boolean): string {
  const esc = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
  const text = chinese ? ['本地用量周报', '可观测会话', '已确认 Token', '较上个完整周期', '缓存读取占输入', '统计完整', '仅可比子集'] : ['Local usage weekly', 'Observed sessions', 'Confirmed Tokens', 'Change vs previous window', 'Cache reads / input', 'Complete coverage', 'Comparable subset only']
  const rows = [[text[1], String(summary.sessions)], [text[2], summary.tokens.toLocaleString('en-US')], [text[3], `${summary.delta > 0 ? '+' : ''}${summary.delta.toLocaleString('en-US')}`], [text[4], summary.cacheReadShare === null ? '—' : `${(summary.cacheReadShare * 100).toFixed(1)}%`]]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="#f7f8fb"/><g font-family="system-ui,sans-serif" fill="#17263d"><text x="64" y="84" font-size="34">${esc(text[0]!)}</text><text x="64" y="124" font-size="18">${summary.from} — ${summary.to} UTC (${esc(summary.complete ? text[5]! : text[6]!)})</text>${rows.map((row, index) => `<text x="64" y="${196 + index * 78}" font-size="20">${esc(row[0]!)}</text><text x="860" y="${196 + index * 78}" text-anchor="end" font-size="28">${esc(row[1]!)}</text>`).join('')}<text x="64" y="548" font-size="16">dsh-token-usage · local-first · not a bill</text></g></svg>`
}
