import { createHash } from 'node:crypto'
import { isReplacementSurfaceEvent, type SessionEvent } from '@deepseek-ai/dsh-session'
import { prepareTrajectory } from '../trajectory-analysis.ts'
import { bucketKeys, snapshotSchema, type Configuration, type LocalSnapshot } from './schema.ts'
import { add, zero } from './prices.ts'
import { finding, withNodeEvidence } from './diagnostics.ts'
import { diagnose } from './insights.ts'

/** Parallel work is measured by the union of active intervals. */
export function intervalUnion(intervals: readonly (readonly [number, number])[]): number {
  const sorted = intervals.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start).map(value => [...value] as [number, number]).sort((a, b) => a[0] - b[0])
  let duration = 0, start: number | undefined, end = 0
  for (const interval of sorted) {
    if (start === undefined) { [start, end] = interval; continue }
    if (interval[0] > end) { duration += end - start; [start, end] = interval }
    else end = Math.max(end, interval[1])
  }
  return duration + (start === undefined ? 0 : end - start)
}
export interface SnapshotArchive { base: Omit<LocalSnapshot, 'nodes' | 'offset' | 'nextOffset'>; nodes: LocalSnapshot['nodes'] }
export function buildSnapshot(sessionId: string, events: readonly SessionEvent[], thresholds: Configuration['thresholds'], now = Date.now()): SnapshotArchive {
  if (events.length === 0) throw new Error('Session has no events')
  if (events.length > 200000) throw new Error('Session exceeds the bounded 200,000-event inspection limit')
  const routes = new Map<string, { provider: string; model: string }>()
  const { metrics } = prepareTrajectory(events, routes)
  const times = new Map<number, number>(events.map(event => [event.seq, event.time]))
  const nodes = metrics.spans.map(span => ({
    id: span.id, seq: span.seq, kind: span.kind, status: span.status, finality: span.finality,
    ...(routes.get(span.model) ?? { provider: 'unknown', model: 'unknown' }), usage: { ...span.usage },
    ...(Number.isFinite(times.get(span.seq)) && Math.abs(times.get(span.seq)!) <= 8.64e15 ? { time: new Date(times.get(span.seq)!).toISOString() } : {}),
  }))
  const usageByKind = (kind: 'retry' | 'compaction' | 'ordinary') => nodes.filter(node => kind === 'compaction' ? node.kind === 'compaction' : node.kind === 'model' && (kind === 'retry' ? node.status === 'retried' : node.status !== 'retried')).reduce((sum, node) => add(sum, node.usage), zero())
  const grouped = new Map<string, { provider: string; model: string; usage: ReturnType<typeof zero> }>()
  for (const node of nodes) {
    const key = JSON.stringify([node.provider, node.model]), entry = grouped.get(key) ?? { provider: node.provider, model: node.model, usage: zero() }
    entry.usage = add(entry.usage, node.usage); grouped.set(key, entry)
  }
  if (grouped.size > 512) throw new Error('Session has too many routes to inspect safely')
  const open = new Map<number, number>(), intervals: [number, number][] = []
  for (const event of events) {
    if (isReplacementSurfaceEvent(event)) continue
    const data = event.data as unknown as { turn?: unknown }
    if (typeof data.turn !== 'number') continue
    if (String(event.type) === 'turn/start') open.set(data.turn, event.time)
    if (String(event.type) === 'turn/end' && open.has(data.turn)) { intervals.push([open.get(data.turn)!, event.time]); open.delete(data.turn) }
  }
  for (const time of open.values()) intervals.push([time, events.at(-1)!.time])
  const totals: LocalSnapshot['totals'] = {
    usage: { ...metrics.usage }, retry: usageByKind('retry'), compaction: usageByKind('compaction'), ordinary: usageByKind('ordinary'),
    attributed: { ...metrics.reconciliation.attributedUsage }, delta: { ...metrics.reconciliation.delta },
    requests: metrics.assistantRequests, retries: metrics.retries, compactions: metrics.compactions,
    toolCalls: metrics.toolCalls, toolErrors: metrics.toolErrors, orphanTools: metrics.orphanToolCalls + metrics.orphanToolResults,
    openTurns: metrics.openTurns, openSteps: metrics.openSteps, unresolvedApprovals: metrics.unresolvedApprovals,
    durationMs: metrics.durationMs, activeDurationMs: intervalUnion(intervals), completedTurns: metrics.completedTurns, failedTurns: metrics.failedTurns,
  }
  const timeCoverage = nodes.length && nodes.every(node => node.time) ? 'complete' : nodes.some(node => node.time) ? 'partial' : 'unavailable'
  const routed = nodes.filter(node => node.provider !== 'unknown' && node.model !== 'unknown').length
  const routeCoverage = nodes.length && routed === nodes.length ? 'complete' : routed ? 'partial' : 'unavailable'
  const findings = diagnose(totals, thresholds)
  if (timeCoverage !== 'complete') findings.push(finding('time-coverage', 'warning', nodes.filter(node => !node.time).length, [`timestampedNodes: ${nodes.filter(node => node.time).length}`, `nodes: ${nodes.length}`], timeCoverage))
  if (routeCoverage !== 'complete') findings.push(finding('route-coverage', 'warning', nodes.length - routed, [`routedNodes: ${routed}`, `nodes: ${nodes.length}`], routeCoverage))
  const base: SnapshotArchive['base'] = {
    schema: 'dsh-token-usage/snapshot-v1', sessionId, generatedAt: new Date(now).toISOString(),
    revision: createHash('sha256').update(JSON.stringify({ ruleset: '0.5.0', nodes, totals, thresholds, count: events.length, seq: events.at(-1)!.seq })).digest('hex'),
    firstSeq: events[0]!.seq, lastSeq: events.at(-1)!.seq, eventCount: events.length,
    totals, reconciliation: bucketKeys.every(key => totals.delta[key] === 0) ? 'matched' : 'mismatch',
    timeCoverage, routeCoverage, findings: withNodeEvidence(findings, nodes), nodeCount: nodes.length, provisionalNodeCount: nodes.filter(node => node.finality !== 'authoritative').length, routes: [...grouped.values()],
  }
  pageSnapshot({ base, nodes }, 0)
  return { base, nodes }
}
export function pageSnapshot(archive: SnapshotArchive, offset: number): LocalSnapshot {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > archive.nodes.length) throw new Error('Invalid snapshot offset')
  return snapshotSchema.parse({ ...archive.base, nodes: archive.nodes.slice(offset, offset + 200), offset,
    nextOffset: offset + 200 < archive.nodes.length ? offset + 200 : null })
}
