import { type Configuration, type ExperimentRun, type WorkbenchState } from './schema.ts'
import { shareSummary, projectTotals, type InsightSession } from './insights.ts'
import { moneyBudgetStatus, rollingMoney } from './reporting.ts'
import { total } from './prices.ts'

/** Only distinct, complete pairs with explicit acceptance in BOTH groups enter improvement totals. */
export function improvementSummary(runs: readonly ExperimentRun[], start: string, end: string) {
  const byPair = new Map<string, ExperimentRun[]>()
  for (const run of runs) {
    const key = JSON.stringify([run.experiment, run.pair, run.task, run.size, run.conditions])
    byPair.set(key, [...(byPair.get(key) ?? []), run])
  }
  let pairs = 0, excluded = 0, baselineTokens = 0, candidateTokens = 0, retriesBefore = 0, retriesAfter = 0, durationBefore = 0, durationAfter = 0
  const used = new Set<string>()
  for (const values of byPair.values()) {
    const baseline = values.filter(run => run.variant === 'baseline'), candidates = values.filter(run => run.variant === 'candidate' && run.generatedAt.slice(0, 10) >= start && run.generatedAt.slice(0, 10) < end)
    if (!candidates.length) continue
    if (baseline.length !== 1 || candidates.length !== 1) { excluded++; continue }
    const a = baseline[0]!, b = candidates[0]!
    if (!a.complete || !b.complete || a.accepted !== true || b.accepted !== true || a.revision === b.revision || used.has(a.revision) || used.has(b.revision)) { excluded++; continue }
    used.add(a.revision); used.add(b.revision); pairs++
    baselineTokens += total(a.usage); candidateTokens += total(b.usage)
    retriesBefore += a.retries; retriesAfter += b.retries
    durationBefore += a.durationMs; durationAfter += b.durationMs
  }
  return { pairs, excluded, baselineTokens, candidateTokens, tokenReduction: baselineTokens - candidateTokens,
    tokenReductionShare: baselineTokens ? (baselineTokens - candidateTokens) / baselineTokens : null,
    retriesBefore, retriesAfter, retryReduction: retriesBefore - retriesAfter, durationBefore, durationAfter,
    qualityConstraint: 'both-human-accepted' as const, windowBasis: 'candidate-started-in-window' as const, exploratory: true as const }
}
export interface SharedOutput {
  status: 'sampling' | 'ready' | 'unavailable'
  tokensPerSecond: number | null
  observedAt: string
  windowMs: number
  cadenceMs: number
}
export function numericOutput(value: { status: 'sampling' | 'ready'; allTokensPerSecond: number } | null, now = Date.now()): SharedOutput {
  return { status: value?.status ?? 'unavailable', tokensPerSecond: value?.status === 'ready' && Number.isFinite(value.allTokensPerSecond) && value.allTokensPerSecond >= 0 ? value.allTokensPerSecond : null,
    observedAt: new Date(now).toISOString(), windowMs: 10000, cadenceMs: 5000 }
}
function budgetSummary(sessions: readonly InsightSession[], config: Configuration, now: number) {
  const projects = projectTotals(sessions, config, now)
  const counts = { within: 0, warning: 0, exceeded: 0, unavailable: 0, disabled: 0 }
  for (const row of projects.filter(row => row.id !== 'unassigned')) counts[row.status as keyof typeof counts]++
  return { projectTokenStatusCounts: counts, money: (['USD', 'CNY'] as const).map(currency => {
    const budget = config.moneyBudgets.find(item => item.currency === currency)
    return { currency, status: budget ? moneyBudgetStatus(rollingMoney(sessions, config, currency, now), budget.amount) : 'disabled' as const }
  }) }
}
/** Version 2 is published on a separate event; v1 consumers keep their original contract. */
export function richSummary(sessions: readonly InsightSession[], state: WorkbenchState, output: SharedOutput = numericOutput(null), now = Date.now()) {
  const activity = shareSummary(sessions, now)
  return { ...activity, schema: 'dsh-token-usage/public-summary-v2' as const,
    improvements: improvementSummary(state.config.experiments, activity.from, activity.to),
    budgets: budgetSummary(sessions, state.config, now), confirmedOutput: output }
}
export function improvementSvg(summary: ReturnType<typeof richSummary>, chinese: boolean): string {
  const i = summary.improvements
  const words = chinese ? ['可验证的优化周报', '双方人工验收通过的不同快照配对', 'Token 减少量（可为负）', '重试次数减少量（可为负）', '探索性比较；不是因果证明或模型排名', '不满足条件的配对不纳入'] : ['Measured optimization weekly', 'Distinct snapshot pairs accepted in both groups', 'Token reduction (may be negative)', 'Retry reduction (may be negative)', 'Exploratory; not causal proof or model ranking', 'Ineligible pairs are excluded']
  const rows = [[words[1], i.pairs], [words[2], i.tokenReduction], [words[3], i.retryReduction], [words[5], i.excluded]]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600"><rect width="960" height="600" fill="#f7f8fb"/><g font-family="system-ui,sans-serif" fill="#17263d"><text x="60" y="78" font-size="32">${words[0]}</text><text x="60" y="116" font-size="18">${summary.from} — ${summary.to} UTC</text>${rows.map(([label, value], index) => `<text x="60" y="${198 + index * 74}" font-size="18">${label}</text><text x="875" y="${198 + index * 74}" text-anchor="end" font-size="30">${i.pairs || index === 3 ? Number(value).toLocaleString('en-US') : '—'}</text>`).join('')}<text x="60" y="550" font-size="16">${words[4]}</text></g></svg>`
}
