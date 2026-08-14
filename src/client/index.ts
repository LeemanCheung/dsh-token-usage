/** Token usage dashboard registered into Web Settings. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '../types.ts'
import { TokenUsageSection } from './TokenUsageSection.tsx'
import { TokenUsageBudgetController } from './budget-controller.ts'
import { browserDownload } from './export.ts'
import { requestTrajectoryAnalysis } from './trajectory-analysis-client.ts'
import { en, NS, zh, type TokenUsageLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Token usage dashboard copy. */
    'settings.tokenUsage': TokenUsageLocaleKey
  }
}

/** Client services required by the Settings contribution. */
export const inject = ['slots', 'locale', 'connection']

/** Contribute a localized Token usage page to Settings. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  if (connection === undefined) throw new Error('dsh-token-usage requires the Client connection service')
  const budget = new TokenUsageBudgetController(connection)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'token-usage: dictionaries')
  ctx.effect(() => {
    void budget.load()
    return () => { budget.dispose() }
  }, 'token usage: load persistent budget')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'token-usage',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({
      hooks: { budget: budget.store },
      setBudget: (value: number) => budget.setBudget(value),
      download: browserDownload,
      analyzeTrajectory: (sessionId: string, signal: AbortSignal) => requestTrajectoryAnalysis(
        connection,
        sessionId,
        ctx.locale.getLocale().active,
        signal,
      ),
    }),
  }, TokenUsageSection))
}
