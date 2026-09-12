import { finding } from './diagnostics.ts'
import { bucketKeys, type Buckets, type Configuration, type LocalSnapshot } from './schema.ts'
import { changes, periodSum, projectTotals, type InsightSession } from './insights.ts'
import { add, quote, sumQuotes, total, zero, type Quote } from './prices.ts'
import type { ReceiptCost } from './port.ts'

export function rollingWindow(now = Date.now()) {
  const today = Date.parse(new Date(now).toISOString().slice(0, 10))
  return { start: new Date(today - 29 * 86400000).toISOString().slice(0, 10), end: new Date(today + 86400000).toISOString().slice(0, 10) }
}
/** Revalue only observable, dated usage. No FX conversion and no request-tier inference from daily aggregates. */
export function rollingMoney(sessions: readonly InsightSession[], config: Configuration, currency: Quote['currency'], now = Date.now()): Quote {
  const { start, end } = rollingWindow(now), at = new Date(now).toISOString()
  const estimates: Quote[] = []
  let undated = false
  for (const session of sessions) {
    if (!session.dailyUsageReliable) { undated = true; continue }
    const usage = periodSum(session.days, start, end)
    if (!total(usage)) continue
    if (!session.modelDailyUsageReliable) {
      estimates.push(quote([], { provider: '', model: '' }, usage, { currency, mode: 'revaluation', at }))
      continue
    }
    for (const row of session.modelDays.filter(row => row.date >= start && row.date < end)) estimates.push(quote(config.cards, row, row.usage, { currency, mode: 'revaluation', at, timingKnown: true, requestInputKnown: false }))
  }
  let result: Quote = estimates.length ? sumQuotes(estimates, currency) : {
    currency, mode: 'revaluation', amount: 0, lower: 0, upper: 0, coveredTokens: 0, totalTokens: 0,
    status: 'complete', cards: [], verifiedAt: [], unavailable: [],
  }
  if (undated) result = { ...result, amount: null, upper: null, status: result.coveredTokens ? 'partial' : 'unavailable', unavailable: [...result.unavailable, 'undated-session-usage'] }
  return result
}
export function moneyBudgetStatus(estimate: Quote, amount: number): 'exceeded' | 'warning' | 'within' | 'unavailable' {
  if (estimate.lower !== null && estimate.lower >= amount) return 'exceeded'
  if (estimate.status !== 'complete' || estimate.amount === null) return 'unavailable'
  return estimate.amount >= amount * 0.8 ? 'warning' : 'within'
}
export function selectSessions(sessions: readonly InsightSession[], config: Configuration, project: string, tag = ''): InsightSession[] {
  const assignments = new Map(config.assignments.map(item => [item.sessionId, item]))
  return sessions.filter(session => {
    const assignment = assignments.get(session.id)
    return (!project || (assignment?.projectId ?? 'unassigned') === project) && (!tag || assignment?.tags.includes(tag))
  })
}
export function receiptDocument(snapshot: LocalSnapshot, costs: readonly ReceiptCost[], anonymize = false) {
  return {
    schema: 'dsh-token-usage/local-receipt-v1', generatedAt: snapshot.generatedAt,
    ...(anonymize ? {} : { sessionId: snapshot.sessionId }), revision: snapshot.revision,
    totals: snapshot.totals, reconciliation: snapshot.reconciliation, findings: snapshot.findings.map(item => anonymize ? { ...item, nodes: item.nodes.map(({ seq, index }) => ({ seq, index })) } : item),
    inspectedEvents: snapshot.eventCount, totalNodes: snapshot.nodeCount,
    page: { offset: snapshot.offset, nextOffset: snapshot.nextOffset, includedNodes: snapshot.nodes.length },
    nodes: snapshot.nodes.map((node, index) => anonymize ? { index: snapshot.offset + index, seq: node.seq, kind: node.kind, status: node.status, finality: node.finality, usage: node.usage } : node),
    costs: costs.filter(cost => cost.revision === snapshot.revision).map(cost => anonymize ? {
      currency: cost.estimate.currency, mode: cost.estimate.mode, amount: cost.estimate.amount,
      lower: cost.estimate.lower, upper: cost.estimate.upper, status: cost.estimate.status,
      coveredTokens: cost.estimate.coveredTokens, totalTokens: cost.estimate.totalTokens,
    } : cost),
    notes: ['Reference estimate, not a provider invoice.', 'Auxiliary AI analysis is recorded separately.', 'Node export contains the currently displayed page; totals cover the complete inspected snapshot.'],
  }
}
export function receiptMarkdown(snapshot: LocalSnapshot, costs: readonly ReceiptCost[]): string {
  const rows = bucketKeys.map(key => `| ${key} | ${snapshot.totals.usage[key]} | ${snapshot.totals.ordinary[key]} | ${snapshot.totals.retry[key]} | ${snapshot.totals.compaction[key]} | ${snapshot.totals.delta[key]} |`)
  return `# Local Token receipt\n\nSnapshot: ${snapshot.generatedAt}\n\nReconciliation: ${snapshot.reconciliation}\n\n| Bucket | Total | Ordinary | Retry | Compaction | Delta |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n\n${costs.filter(cost => cost.revision === snapshot.revision).map(cost => `${cost.estimate.currency}: ${cost.estimate.amount ?? 'unavailable'} (${cost.estimate.status}; ${cost.estimate.mode})`).join('\n\n')}\n\nReference estimates, not a provider invoice. Auxiliary analysis is accounted separately.\n`
}
/** CSV cells cannot initiate a spreadsheet formula, including leading whitespace. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function changesCsv(sessions: readonly InsightSession[], length: 7 | 30 | 90, now = Date.now()): string {
  const report = changes(sessions, length, now)
  return [['sessionId', 'previous', 'current', 'delta'], ...report.contributors.map(row => [row.id, row.previous, row.current, row.delta])].map(row => row.map(csvCell).join(',')).join('\r\n')
}
export function sumSessionUsage(sessions: readonly InsightSession[]): Buckets {
  const result = zero()
  for (const session of sessions) for (const key of bucketKeys) result[key] += session.usage[key]
  if (!Number.isSafeInteger(total(result))) throw new Error('Usage total exceeds safe integer precision')
  return result
}

/** One complete date window across both ledgers; unknown coverage is never extrapolated. */
export function observableTotals(sessions: readonly InsightSession[], state: import('./schema.ts').WorkbenchState, length: 7 | 30 | 90, now = Date.now()) {
  const end = new Date(Date.parse(new Date(now).toISOString().slice(0, 10)) + 86400000).toISOString().slice(0, 10)
  const start = new Date(Date.parse(end) - length * 86400000).toISOString().slice(0, 10)
  const sessionUsage = sessions.filter(session => session.dailyUsageReliable).reduce((sum, session) => add(sum, periodSum(session.days, start, end)), zero())
  const entries = state.ledger.filter(entry => entry.startedAt.slice(0, 10) >= start && entry.startedAt.slice(0, 10) < end)
  const auxiliaryUsage = entries.reduce((sum, entry) => entry.usage ? add(sum, entry.usage) : sum, zero())
  const combined = add(sessionUsage, auxiliaryUsage)
  const reasons: string[] = []
  if (sessions.some(session => !session.dailyUsageReliable)) reasons.push('undated-sessions')
  if (entries.some(entry => entry.usage === null)) reasons.push('unreported-analysis-usage')
  if (entries.some(entry => entry.finality !== 'authoritative')) reasons.push('provisional-analysis-usage')
  if (!state.ledgerStartedAt || state.ledgerStartedAt.slice(0, 10) > start) reasons.push('analysis-tracking-started-after-window')
  if (state.evictedEntries || state.ledgerClearedAt) reasons.push('analysis-history-evicted-or-cleared')
  return { start, end, timezone: 'UTC' as const, sessionUsage, auxiliaryUsage, combined, reasons, complete: reasons.length === 0,
    unknownSessions: sessions.filter(session => !session.dailyUsageReliable).length,
    unknownAnalysis: entries.filter(entry => entry.usage === null).length,
    analysisShare: total(combined) ? total(auxiliaryUsage) / total(combined) : null,
    ledgerStartedAt: state.ledgerStartedAt, ledgerClearedAt: state.ledgerClearedAt, evictedEntries: state.evictedEntries }
}

/** Budget findings share the same explicit date basis as the displayed snapshot. */
export function budgetFindings(sessions: readonly InsightSession[], config: Configuration, sessionId: string, at: string) {
  const findings: import('./schema.ts').Finding[] = []
  const assignment = config.assignments.find(item => item.sessionId === sessionId)
  const project = config.projects.find(item => item.id === assignment?.projectId)
  const now = Date.parse(at)
  if (project) {
    const row = projectTotals(sessions, config, now).find(item => item.id === project.id)!
    if (row.tokenBudget) {
      if (!row.complete) findings.push(finding('budget-coverage', 'warning', 0, ['project dates incomplete'], 'partial', 'project'))
      else if (row.status !== 'within') findings.push(finding('budget-pressure', row.status === 'exceeded' ? 'error' : 'warning', total(row.rolling), [`rollingUTC: ${row.start} .. ${row.end}`, `budgetTokens: ${row.tokenBudget}`], 'complete', 'project', row.tokenBudget))
    }
  }
  for (const scope of ['global', 'project'] as const) {
    const budgets = scope === 'global' ? config.moneyBudgets : project?.moneyBudgets ?? []
    const scoped = scope === 'global' ? sessions : sessions.filter(session => config.assignments.some(item => item.sessionId === session.id && item.projectId === project?.id))
    for (const budget of budgets) {
      const estimate = rollingMoney(scoped, config, budget.currency, now), status = moneyBudgetStatus(estimate, budget.amount)
      if (status !== 'within') findings.push(finding(status === 'unavailable' ? 'budget-coverage' : 'budget-pressure', status === 'exceeded' ? 'error' : 'warning', estimate.amount ?? estimate.lower ?? 0,
        [`currency: ${budget.currency}`, `knownLower: ${estimate.lower ?? 'unknown'}`, `budget: ${budget.amount}`, 'basis: current-rate revaluation'], estimate.status === 'complete' ? 'complete' : 'partial', scope, budget.amount))
    }
  }
  return findings
}
