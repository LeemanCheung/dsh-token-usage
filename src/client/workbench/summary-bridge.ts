import { shareSummary, type InsightSession } from '../../workbench/insights.ts'
import type { WorkbenchPort } from '../../workbench/port.ts'

/** Same-window requests only. No postMessage, HTTP endpoint, payload forwarding, or command execution. */
export function installSummaryBridge(target: EventTarget, port: Pick<WorkbenchPort, 'read'>, sessions: () => readonly InsightSession[] | null, now = () => Date.now()): () => void {
  const lifecycle = new AbortController()
  let inFlight = false, lastRequest = -Infinity
  const listener = () => {
    if (lifecycle.signal.aborted || inFlight || now() - lastRequest < 1000) return
    lastRequest = now(); inFlight = true
    void port.read(lifecycle.signal).then(state => {
      if (lifecycle.signal.aborted || !state.config.shareSummary) return
      const data = sessions()
      if (data !== null) target.dispatchEvent(new CustomEvent('dsh-token-usage:summary', { detail: shareSummary(data, now()) }))
    }).catch(() => {
      // A disconnected Host cannot authorize sharing. No summary is emitted.
    }).finally(() => { inFlight = false })
  }
  target.addEventListener('dsh-token-usage:summary-request', listener)
  return () => { lifecycle.abort(); target.removeEventListener('dsh-token-usage:summary-request', listener) }
}
