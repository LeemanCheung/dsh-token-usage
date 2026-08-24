/** Token usage dashboard registered into Web Settings. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {
  TokenUsageAnalysisInput,
  TokenUsageAnalysisModelSelection,
  TokenUsageAnalysisProgress,
  TrajectoryAnalysis,
} from '../types.ts'
import { TokenUsageSection } from './TokenUsageSection.tsx'
import { TrajectoryAnalysisAction } from './TrajectoryAnalysisAction.tsx'
import { TokenUsageBudgetController } from './budget-controller.ts'
import { browserDownload } from './export.ts'
import { requestTrajectoryAnalysis } from './trajectory-analysis-client.ts'
import { TrajectoryHistoryController } from './trajectory-history.ts'
import { requestAnalysisModels, requestTokenUsageAnalysis } from './usage-analysis-client.ts'
import { en, NS, zh, type TokenUsageLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Token usage dashboard copy. */
    'settings.tokenUsage': TokenUsageLocaleKey
  }
}

/** Client services required by the Settings contribution. */
export const inject = ['slots', 'locale', 'connection', 'sessions']

/** Contribute a localized Token usage page to Settings. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  if (connection === undefined) throw new Error('dsh-token-usage requires the Client connection service')
  const budget = new TokenUsageBudgetController(connection)
  const trajectoryHistory = new TrajectoryHistoryController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'token-usage: dictionaries')
  ctx.effect(() => {
    trajectoryHistory.load()
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
      setRouteBudget: (provider: string, model: string, value: number) => budget.setRouteBudget(provider, model, value),
      download: browserDownload,
      saveTrajectoryAnalysis: (analysis: TrajectoryAnalysis) => { trajectoryHistory.save(analysis) },
      openSession: (sessionId: SessionId) => { ctx.sessions.open(sessionId) },
      listAnalysisModels: (signal: AbortSignal) => requestAnalysisModels(connection, signal),
      analyzeTokenUsage: (
        input: TokenUsageAnalysisInput,
        model: TokenUsageAnalysisModelSelection,
        signal: AbortSignal,
        onProgress?: (progress: TokenUsageAnalysisProgress) => void,
      ) => requestTokenUsageAnalysis(
        connection,
        input,
        model,
        ctx.locale.getLocale().active,
        signal,
        onProgress,
      ),
      analyzeTrajectory: (
        sessionId: string,
        model: TokenUsageAnalysisModelSelection,
        signal: AbortSignal,
        onProgress?: (progress: TokenUsageAnalysisProgress) => void,
      ) => requestTrajectoryAnalysis(
        connection,
        sessionId,
        model,
        ctx.locale.getLocale().active,
        signal,
        onProgress,
      ),
    }),
  }, TokenUsageSection))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'token-usage-trajectory-analysis',
    order: 40,
    locale: NS,
    inject: () => ({
      hooks: { trajectoryHistory: trajectoryHistory.store },
      download: browserDownload,
      listAnalysisModels: (signal: AbortSignal) => requestAnalysisModels(connection, signal),
      analyzeTrajectory: (
        sessionId: string,
        model: TokenUsageAnalysisModelSelection,
        signal: AbortSignal,
        onProgress?: (progress: TokenUsageAnalysisProgress) => void,
      ) => requestTrajectoryAnalysis(
        connection,
        sessionId,
        model,
        ctx.locale.getLocale().active,
        signal,
        onProgress,
      ),
      saveTrajectoryAnalysis: (analysis: TrajectoryAnalysis) => { trajectoryHistory.save(analysis) },
      removeTrajectoryAnalysis: (id: string) => { trajectoryHistory.remove(id) },
    }),
  }, TrajectoryAnalysisAction))
}
