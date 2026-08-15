/** Request-bound progress accounting for auxiliary model streams. */

import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { TokenUsageAnalysisProgress } from './types.ts'

export type AnalysisProgressUpdate = Omit<TokenUsageAnalysisProgress, 'elapsedMs'>
export type AnalysisProgressReporter = (progress: AnalysisProgressUpdate) => void

/** Estimate text tokens without claiming provider-tokenizer precision. */
function estimatedUnits(text: string): number {
  let units = 0
  for (const character of text) {
    units += /[\u2e80-\u9fff\uf900-\ufaff]/u.test(character) ? 1 : 0.25
  }
  return units
}

/** Track stream chunks and publish immutable progress snapshots. */
export class AnalysisProgressTracker {
  private chunks = 0
  private outputCharacters = 0
  private outputTokenUnits = 0
  private exactOutputTokens: number | undefined

  constructor(
    private readonly maximumOutputTokens: number,
    private readonly report: AnalysisProgressReporter | undefined,
  ) {
    this.publish('preparing')
  }

  generating(): void {
    this.publish('generating')
  }

  push(chunk: StreamChunk): void {
    this.chunks += 1
    if (chunk.type === 'text-delta') {
      this.outputCharacters += [...chunk.text].length
      this.outputTokenUnits += estimatedUnits(chunk.text)
    } else if (chunk.type === 'usage') {
      this.exactOutputTokens = chunk.usage.outputTokens
    }
    this.publish('generating')
  }

  finalizing(usage: TokenUsage | undefined): void {
    if (usage !== undefined) this.exactOutputTokens = usage.outputTokens
    this.publish('finalizing')
  }

  private publish(phase: AnalysisProgressUpdate['phase']): void {
    this.report?.({
      phase,
      chunks: this.chunks,
      outputCharacters: this.outputCharacters,
      estimatedOutputTokens: Math.ceil(this.outputTokenUnits),
      ...this.exactOutputTokens === undefined ? {} : { exactOutputTokens: this.exactOutputTokens },
      maximumOutputTokens: this.maximumOutputTokens,
    })
  }
}
