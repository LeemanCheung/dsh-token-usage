import { describe, expect, it, vi } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { AnalysisProgressTracker } from '../src/analysis-progress.ts'
import { analysisProgressOf } from '../src/client/analysis-progress-client.ts'

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
})
