import { shareSummary, type InsightSession } from '../../workbench/insights.ts'
import { richSummary, numericOutput, type SharedOutput } from '../../workbench/weekly.ts'
import type { WorkbenchPort } from '../../workbench/port.ts'

/** Same-window requests only. The Host re-authorizes every response; both versions use an explicit whitelist. */
export function installSummaryBridge(target: EventTarget, port: Pick<WorkbenchPort, 'read'>, sessions: () => readonly InsightSession[] | null, now = () => Date.now(), output: () => SharedOutput = () => numericOutput(null, now())): () => void {
  const lifecycle = new AbortController()
  let inFlight = false, lastRequest = -Infinity
  const listener = () => {
    if (lifecycle.signal.aborted || inFlight || now() - lastRequest < 1000) return
    lastRequest = now(); inFlight = true
    void port.read(lifecycle.signal).then(state => {
      if (lifecycle.signal.aborted || !state.config.shareSummary) return
      const data = sessions()
      if (data !== null) {
        // V1 consumers are not silently upgraded to a different shape.
        target.dispatchEvent(new CustomEvent('dsh-token-usage:summary', { detail: shareSummary(data, now()) }))
        target.dispatchEvent(new CustomEvent('dsh-token-usage:summary-v2', { detail: richSummary(data, state, output(), now()) }))
      }
    }).catch(() => {
      // A disconnected Host cannot authorize sharing. No summary is emitted.
    }).finally(() => { inFlight = false })
  }
  target.addEventListener('dsh-token-usage:summary-request', listener)
  target.addEventListener('dsh-token-usage:summary-v2-request', listener)
  return () => { lifecycle.abort(); target.removeEventListener('dsh-token-usage:summary-request', listener); target.removeEventListener('dsh-token-usage:summary-v2-request', listener) }
}
