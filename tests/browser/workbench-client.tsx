import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkbenchApp } from '../../src/client/workbench/App.tsx'
import { makeWorkbenchPort } from '../../src/workbench/port.ts'
import type { InsightSession } from '../../src/workbench/insights.ts'
import { installSummaryBridge } from '../../src/client/workbench/summary-bridge.ts'

const port = makeWorkbenchPort(async (endpoint, payload, signal) => {
  const response = await fetch(`/rpc/${encodeURIComponent(endpoint)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal })
  if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`)
  const result = await response.json() as { ok: boolean; value?: unknown; error?: { message: string } }
  if (!result.ok) throw new Error(result.error?.message ?? 'Fixture request failed')
  return result.value
})
const sessions = await (await fetch('/fixture')).json() as InsightSession[]
installSummaryBridge(window, port, () => sessions)
createRoot(document.getElementById('root')!).render(<StrictMode><WorkbenchApp port={port} sessions={sessions} chinese={new URLSearchParams(location.search).get('lang') === 'zh'}/></StrictMode>)
