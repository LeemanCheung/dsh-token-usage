// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { prepareTrajectory } from '../src/trajectory-analysis.ts'
import { zh } from '../src/client/locales.ts'
import { TrajectoryAnalysisAction } from '../src/client/TrajectoryAnalysisAction.tsx'
import type { TrajectoryAnalysis } from '../src/types.ts'

function t(key: keyof typeof zh, params?: Record<string, unknown>): string {
  let text = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value))
  return text
}

const analysis: TrajectoryAnalysis = {
  schema: 'dsh-token-usage/trajectory-analysis-v3',
  sessionId: 'session-current',
  generatedAt: '2026-08-14T12:00:00.000Z',
  model: { provider: 'deepseek', model: 'chat' },
  truncated: false,
  metrics: prepareTrajectory([]).metrics,
  report: '# Report\n\nTechnical review.',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('conversation trajectory analysis action', () => {
  it('runs the shared analysis flow and exposes browser-local session history', async () => {
    const save = vi.fn()
    const remove = vi.fn()
    const analyze = vi.fn(async (
      _sessionId: string,
      _model: unknown,
      _signal: AbortSignal,
      onProgress?: (progress: unknown) => void,
    ) => {
      onProgress?.({
        phase: 'generating',
        elapsedMs: 700,
        chunks: 2,
        outputCharacters: 20,
        estimatedOutputTokens: 6,
        maximumOutputTokens: 3_000,
      })
      return analysis
    })
    const props = {
      sessionId: 'session-current',
      useTrajectoryHistory: (selector: (snapshot: unknown) => unknown) => selector({
        status: 'ready',
        entries: [{ id: 'saved', savedAt: '2026-08-14T12:01:00.000Z', analysis }],
      }),
      download: { save: vi.fn() },
      listAnalysisModels: async () => ({
        models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }],
        failures: [],
        default: { provider: 'deepseek', model: 'chat' },
      }),
      analyzeTrajectory: analyze,
      saveTrajectoryAnalysis: save,
      removeTrajectoryAnalysis: remove,
      t,
    } as unknown as ComponentProps<typeof TrajectoryAnalysisAction>

    render(<TrajectoryAnalysisAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '会话 Token 轨迹分析' }))

    expect(await screen.findByRole('dialog', { name: '当前会话轨迹分析' })).toBeTruthy()
    expect(screen.getByText('1 条')).toBeTruthy()
    expect(screen.getByText('deepseek/chat')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '分析轨迹' }))

    await waitFor(() => { expect(save).toHaveBeenCalledWith(analysis) })
    expect(analyze).toHaveBeenCalledWith(
      'session-current',
      { provider: 'deepseek', model: 'chat' },
      expect.any(AbortSignal),
      expect.any(Function),
    )
    expect(screen.getByRole('button', { name: '导出 Markdown 报告' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '删除分析历史' }))
    expect(remove).toHaveBeenCalledWith('saved')
  })

  it('aborts an in-flight analysis when the footer closes the modal', async () => {
    let analysisSignal: AbortSignal | undefined
    const props = {
      sessionId: 'session-current',
      useTrajectoryHistory: (selector: (snapshot: unknown) => unknown) => selector({ status: 'ready', entries: [] }),
      download: { save: vi.fn() },
      listAnalysisModels: async () => ({
        models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }],
        failures: [],
        default: { provider: 'deepseek', model: 'chat' },
      }),
      analyzeTrajectory: vi.fn((_sessionId: string, _model: unknown, signal: AbortSignal) => {
        analysisSignal = signal
        return new Promise<TrajectoryAnalysis>(() => {})
      }),
      saveTrajectoryAnalysis: vi.fn(),
      removeTrajectoryAnalysis: vi.fn(),
      t,
    } as unknown as ComponentProps<typeof TrajectoryAnalysisAction>

    render(<TrajectoryAnalysisAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '会话 Token 轨迹分析' }))
    expect(await screen.findByLabelText('分析模型')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '分析轨迹' }))
    const footerClose = screen.getAllByRole('button', { name: '关闭' })
      .find(button => button.textContent?.trim() === '关闭')
    expect(footerClose).toBeTruthy()
    fireEvent.click(footerClose!)

    expect(analysisSignal?.aborted).toBe(true)
    expect(screen.queryByRole('dialog', { name: '当前会话轨迹分析' })).toBeNull()
  })

  it('can retry a transient conversation model-catalog failure', async () => {
    const listAnalysisModels = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        models: [{ provider: 'deepseek', providerName: 'DeepSeek', model: 'chat', modelName: 'Chat' }],
        failures: [],
        default: { provider: 'deepseek', model: 'chat' },
      })
    const props = {
      sessionId: 'session-current',
      useTrajectoryHistory: (selector: (snapshot: unknown) => unknown) => selector({ status: 'ready', entries: [] }),
      download: { save: vi.fn() },
      listAnalysisModels,
      analyzeTrajectory: vi.fn(),
      saveTrajectoryAnalysis: vi.fn(),
      removeTrajectoryAnalysis: vi.fn(),
      t,
    } as unknown as ComponentProps<typeof TrajectoryAnalysisAction>

    render(<TrajectoryAnalysisAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '会话 Token 轨迹分析' }))
    expect(await screen.findByText(/无法读取已接入模型：offline/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新模型目录' }))
    expect(await screen.findByLabelText('分析模型')).toBeTruthy()
    expect(listAnalysisModels).toHaveBeenCalledTimes(2)
  })
})
