import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  TokenUsageAnalysisModelSelection,
  TokenUsageAnalysisProgress,
  TrajectoryAnalysis,
} from '../types.ts'
import type { DownloadPort } from './export.ts'
import { NS } from './locales.ts'
import type { TokenUsageAnalysisModelCatalog } from './usage-analysis-client.ts'
import type { TrajectoryHistorySnapshot } from './trajectory-history.ts'
import {
  TrajectoryAnalysisPanel,
  type TrajectoryAnalysisState,
} from './TokenUsageSection.tsx'
import css from './TokenUsageSection.module.css'

type CatalogState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; value: TokenUsageAnalysisModelCatalog }
  | { status: 'error'; message: string }

interface TrajectoryAnalysisActionInjected {
  hooks: {
    trajectoryHistory: ObservableSnapshot<TrajectoryHistorySnapshot>
  }
  download: DownloadPort
  listAnalysisModels(signal: AbortSignal): Promise<TokenUsageAnalysisModelCatalog>
  analyzeTrajectory(
    sessionId: string,
    model: TokenUsageAnalysisModelSelection,
    signal: AbortSignal,
    onProgress?: (progress: TokenUsageAnalysisProgress) => void,
  ): Promise<TrajectoryAnalysis>
  saveTrajectoryAnalysis(analysis: TrajectoryAnalysis): void
  removeTrajectoryAnalysis(id: string): void
}

type TrajectoryAnalysisActionProps = PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & InjectFace<TrajectoryAnalysisActionInjected>

/** Conversation-header entry opening session analysis and browser-local history. */
export function TrajectoryAnalysisAction({
  sessionId,
  useTrajectoryHistory,
  download,
  listAnalysisModels,
  analyzeTrajectory,
  saveTrajectoryAnalysis,
  removeTrajectoryAnalysis,
  t,
}: TrajectoryAnalysisActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'idle' })
  const [selectedModel, setSelectedModel] = useState<TokenUsageAnalysisModelSelection>()
  const [analysis, setAnalysis] = useState<TrajectoryAnalysisState>({ status: 'idle' })
  const catalogController = useRef<AbortController>()
  const analysisController = useRef<AbortController>()
  const history = useTrajectoryHistory(snapshot => snapshot)
  const sessionHistory = useMemo(() => history.entries
    .filter(entry => entry.analysis.sessionId === String(sessionId)), [history.entries, sessionId])
  const availableModels = catalog.status === 'ready' ? catalog.value.models : []

  useEffect(() => () => {
    catalogController.current?.abort()
    analysisController.current?.abort()
  }, [])

  useEffect(() => {
    if (!open || catalog.status !== 'idle') return
    const controller = new AbortController()
    catalogController.current = controller
    setCatalog({ status: 'loading' })
    void listAnalysisModels(controller.signal).then((value) => {
      if (catalogController.current !== controller || controller.signal.aborted) return
      setCatalog({ status: 'ready', value })
      setSelectedModel(value.default ?? value.models[0])
    }, (error: unknown) => {
      if (catalogController.current === controller && !controller.signal.aborted) {
        setCatalog({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })
  }, [catalog.status, listAnalysisModels, open])

  const retryCatalog = (): void => {
    catalogController.current?.abort()
    catalogController.current = undefined
    setSelectedModel(undefined)
    setCatalog({ status: 'idle' })
  }

  const closeModal = (): void => {
    analysisController.current?.abort()
    analysisController.current = undefined
    setAnalysis(current => current.status === 'loading' ? { status: 'idle' } : current)
    setOpen(false)
  }

  const run = (): void => {
    if (selectedModel === undefined) return
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    setAnalysis({ status: 'loading', sessionId: String(sessionId), title: t('currentSession') })
    void analyzeTrajectory(String(sessionId), selectedModel, controller.signal, (progress) => {
      if (analysisController.current !== controller || controller.signal.aborted) return
      setAnalysis(current => current.status === 'loading' ? { ...current, progress } : current)
    }).then((value) => {
      if (analysisController.current !== controller || controller.signal.aborted) return
      analysisController.current = undefined
      saveTrajectoryAnalysis(value)
      setAnalysis({ status: 'ready', title: t('currentSession'), value })
    }, (error: unknown) => {
      if (analysisController.current === controller && !controller.signal.aborted) {
        analysisController.current = undefined
        setAnalysis({
          status: 'error',
          sessionId: String(sessionId),
          title: t('currentSession'),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  return <>
    <button className={css.conversationAnalysisButton} type="button" onClick={() => { setOpen(true) }}>
      {t('trajectoryAnalysis')}
    </button>
    <Modal
      open={open}
      onClose={closeModal}
      title={t('conversationTrajectoryAnalysis')}
      description={t('conversationTrajectoryAnalysisIntro')}
      closeLabel={t('close')}
      className={css.analysisDialog as string}
      contentClassName={css.analysisDialogContent as string}
      footer={<Button variant="outline" onClick={closeModal}>{t('close')}</Button>}
    >
      <div className={css.conversationAnalysisControls}>
        {catalog.status === 'loading' || catalog.status === 'idle'
          ? <span>{t('analysisModelsLoading')}</span>
          : catalog.status === 'error'
            ? <>
                <span className={css.analysisErrorText}>{t('analysisModelsFailed', { message: catalog.message })}</span>
                <button className={css.quietButton} type="button" onClick={retryCatalog}>{t('refreshAnalysisModels')}</button>
              </>
            : availableModels.length === 0
              ? <>
                  <span>{t('analysisModelsUnavailable')}</span>
                  <button className={css.quietButton} type="button" onClick={retryCatalog}>{t('refreshAnalysisModels')}</button>
                </>
              : <>
                <label className={css.analysisModelSelect}>
                  <span>{t('analysisModel')}</span>
                  <select
                    value={selectedModel === undefined ? '' : JSON.stringify([selectedModel.provider, selectedModel.model])}
                    onChange={(event) => {
                      const model = availableModels.find(candidate =>
                        JSON.stringify([candidate.provider, candidate.model]) === event.currentTarget.value)
                      if (model !== undefined) setSelectedModel({ provider: model.provider, model: model.model })
                    }}
                  >
                    {availableModels.map(model => <option
                      key={JSON.stringify([model.provider, model.model])}
                      value={JSON.stringify([model.provider, model.model])}
                    >{model.providerName} · {model.modelName}</option>)}
                  </select>
                </label>
                <button
                  className={css.analysisButton}
                  type="button"
                  disabled={selectedModel === undefined || analysis.status === 'loading'}
                  onClick={run}
                >{analysis.status === 'loading' ? t('analyzing') : t('analyze')}</button>
              </>}
      </div>

      <TrajectoryAnalysisPanel state={analysis} download={download} t={t} />

      <section className={css.analysisHistory}>
        <div className={css.blockHead}>
          <div><h3>{t('analysisHistory')}</h3><p>{t('analysisHistoryLocal')}</p></div>
          <span>{t('analysisHistoryCount', { count: sessionHistory.length })}</span>
        </div>
        {history.status !== 'ready'
          ? <p className={css.analysisWarning}>{t('analysisHistoryUnavailable')}</p>
          : null}
        {sessionHistory.length === 0
          ? <p>{t('analysisHistoryEmpty')}</p>
          : <ul>{sessionHistory.map(entry => <li key={entry.id}>
              <button type="button" onClick={() => {
                setAnalysis({ status: 'ready', title: t('currentSession'), value: entry.analysis })
              }}>
                <strong>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.savedAt))}</strong>
                <span>{entry.analysis.model.provider}/{entry.analysis.model.model}</span>
              </button>
              <button
                className={css.historyDeleteButton}
                type="button"
                aria-label={t('deleteAnalysisHistory')}
                onClick={() => { removeTrajectoryAnalysis(entry.id) }}
              >×</button>
            </li>)}</ul>}
      </section>
    </Modal>
  </>
}
