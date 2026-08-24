import { describe, expect, it, vi } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { AnalysisProgressTracker } from '../src/analysis-progress.ts'
import { analysisProgressOf, requestAnalysisWithProgress } from '../src/client/analysis-progress-client.ts'

describe('analysis progress', () => {
  it('publishes estimated text progress and provider-reported exact output usage', () => {
    const report = vi.fn()
    const tracker = new AnalysisProgressTracker(3_000, report)

    tracker.generating()
    tracker.push({ type: 'text-delta', index: 0, text: '你好ab' } as StreamChunk)
    tracker.finalizing({ uncachedInputTokens: 8, outputTokens: 7, cacheReadTokens: 0, cacheWriteTokens: 0 })

    expect(report).toHaveBeenNthCalledWith(1, expect.objectContaining({ phase: 'preparing', maximumOutputTokens: 3_000 }))
    expect(report).toHaveBeenNthCalledWith(3, expect.objectContaining({
      phase: 'generating',
      chunks: 1,
      outputCharacters: 4,
      estimatedOutputTokens: 3,
    }))
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'finalizing',
      exactOutputTokens: 7,
    }))
  })

  it('accepts only complete nonnegative Host progress snapshots', () => {
    expect(analysisProgressOf({
      available: true,
      phase: 'generating',
      elapsedMs: 350,
      chunks: 2,
      outputCharacters: 12,
      estimatedOutputTokens: 4,
      exactOutputTokens: 3,
      maximumOutputTokens: 2_600,
    })).toEqual({
      phase: 'generating',
      elapsedMs: 350,
      chunks: 2,
      outputCharacters: 12,
      estimatedOutputTokens: 4,
      exactOutputTokens: 3,
      maximumOutputTokens: 2_600,
    })
    expect(analysisProgressOf({ available: true, phase: 'generating', elapsedMs: -1 })).toBeUndefined()
    expect(analysisProgressOf({ available: false })).toBeUndefined()
  })

  it('suppresses a late progress response after the analysis has settled', async () => {
    let resolveProgress: ((value: { ok: true; value: Record<string, unknown> }) => void) | undefined
    const call = vi.fn((_channel: string, endpoint: string) => {
      if (endpoint === 'analysis/progress') {
        return new Promise<{ ok: true; value: Record<string, unknown> }>((resolve) => { resolveProgress = resolve })
      }
      return Promise.resolve({ ok: true as const, value: { report: 'done' } })
    })
    const onProgress = vi.fn()
    const request = requestAnalysisWithProgress(
      { rpc: { call } } as never,
      'usage/analyze',
      {},
      new AbortController().signal,
      value => typeof (value as { report?: unknown })?.report === 'string' ? (value as { report: string }).report : undefined,
      onProgress,
    )
    await vi.waitFor(() => { expect(resolveProgress).toBeTypeOf('function') })
    await Promise.resolve()
    resolveProgress?.({
      ok: true,
      value: {
        available: true,
        phase: 'finalizing',
        elapsedMs: 1,
        chunks: 1,
        outputCharacters: 4,
        estimatedOutputTokens: 1,
        maximumOutputTokens: 10,
      },
    })

    await expect(request).resolves.toBe('done')
    expect(onProgress).not.toHaveBeenCalled()
    expect(call.mock.calls.filter(([, endpoint]) => endpoint === 'analysis/progress')).toHaveLength(1)
  })

  it('stops polling and publishing after the owning analysis is cancelled', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const progress = {
        available: true,
        phase: 'generating',
        elapsedMs: 1,
        chunks: 1,
        outputCharacters: 4,
        estimatedOutputTokens: 1,
        maximumOutputTokens: 10,
      }
      const call = vi.fn((_channel: string, endpoint: string, _payload: unknown, signal: AbortSignal) => {
        if (endpoint === 'analysis/progress') return Promise.resolve({ ok: true as const, value: progress })
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
        })
      })
      const onProgress = vi.fn()
      const request = requestAnalysisWithProgress(
        { rpc: { call } } as never,
        'usage/analyze',
        {},
        controller.signal,
        () => undefined,
        onProgress,
      )
      await vi.waitFor(() => { expect(onProgress).toHaveBeenCalledTimes(1) })
      controller.abort(new Error('cancelled'))

      await expect(request).rejects.toThrow('cancelled')
      await vi.advanceTimersByTimeAsync(1_000)
      expect(onProgress).toHaveBeenCalledTimes(1)
      expect(call.mock.calls.filter(([, endpoint]) => endpoint === 'analysis/progress')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
