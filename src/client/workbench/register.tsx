import type { TokenThroughputController } from '../throughput-controller.ts'
import { numericOutput } from '../../workbench/weekly.ts'
import { useMemo } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TOKEN_USAGE_RPC_CHANNEL } from '../../rpc.ts'
import { makeWorkbenchPort, type WorkbenchPort } from '../../workbench/port.ts'
import { aggregateUsage } from '../selectors/usage.ts'
import { NS } from '../locales.ts'
import { WorkbenchApp } from './App.tsx'
import { installSummaryBridge } from './summary-bridge.ts'

type WorkbenchSectionProps = PropsRuntime<'settings.section'> & PropsLocale<typeof NS> & InjectFace<{ port: WorkbenchPort; getLanguage(): string }>
function WorkbenchSection({ useSessions, port, getLanguage }: WorkbenchSectionProps) {
  const phase = useSessions(state => state.phase)
  const ids = useSessions(state => state.ids)
  const byId = useSessions(state => state.byId)
  const data = useMemo(() => aggregateUsage(ids.map(id => byId[id]).filter((value): value is SessionSummary => value !== undefined)), [ids, byId])
  const chinese = getLanguage().toLowerCase().startsWith('zh')
  return <WorkbenchApp port={port} sessions={phase === 'ready' ? data.sessions : []} chinese={chinese}/>
}
export function registerWorkbench(ctx: Context, connection: ConnectionHandle, throughput?: TokenThroughputController): void {
  const port = makeWorkbenchPort(async (endpoint, payload, signal) => {
    if (!connection.isLoopback) throw new Error('The usage workbench is available only from the local DSH page.')
    const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, endpoint, payload, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'token-usage-workbench', order: 31, locale: NS,
    label: () => ctx.locale.getLocale().active.toLowerCase().startsWith('zh') ? '用量工作台' : 'Usage workbench',
    inject: () => ({ port, getLanguage: () => ctx.locale.getLocale().active }),
  }, WorkbenchSection))
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    return installSummaryBridge(window, port, () => {
      const state = ctx.sessions.list.getSnapshot()
      if (state.phase !== 'ready') return null
      return aggregateUsage(state.ids.map(id => state.byId[id]).filter((value): value is SessionSummary => value !== undefined)).sessions
    }, () => Date.now(), () => numericOutput(throughput?.getSnapshot() ?? null))
  }, 'token usage: opt-in same-window summary bridge')
}
