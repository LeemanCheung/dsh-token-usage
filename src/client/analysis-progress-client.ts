/** Poll request-bound auxiliary-analysis progress over the unary Connection RPC. */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { TokenUsageAnalysisProgress } from '../types.ts'
import { TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT } from '../rpc.ts'

const POLL_INTERVAL_MS = 350

/** Return whether one wire value is a JSON record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Generate one request-local opaque progress id without persisting browser identity. */
function createProgressId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  return random === undefined
    ? `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.${Math.random().toString(36).slice(2)}`
    : random
}

/** Decode one live progress snapshot from the Host. */
export function analysisProgressOf(value: unknown): TokenUsageAnalysisProgress | undefined {
  if (!isRecord(value) || value.available !== true) return undefined
  const numericKeys = [
    'elapsedMs', 'chunks', 'outputCharacters', 'estimatedOutputTokens', 'maximumOutputTokens',
  ] as const
  if (!numericKeys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0)
    || (value.phase !== 'preparing' && value.phase !== 'generating' && value.phase !== 'finalizing')
    || (value.exactOutputTokens !== undefined
      && (typeof value.exactOutputTokens !== 'number' || !Number.isFinite(value.exactOutputTokens) || value.exactOutputTokens < 0))) {
    return undefined
  }
  return {
    phase: value.phase,
    elapsedMs: value.elapsedMs as number,
    chunks: value.chunks as number,
    outputCharacters: value.outputCharacters as number,
    estimatedOutputTokens: value.estimatedOutputTokens as number,
    ...value.exactOutputTokens === undefined ? {} : { exactOutputTokens: value.exactOutputTokens },
    maximumOutputTokens: value.maximumOutputTokens as number,
  }
}

/** Wait for the next poll or reject promptly when the owning request ends. */
function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', aborted)
      resolve()
    }, POLL_INTERVAL_MS)
    const aborted = (): void => {
      globalThis.clearTimeout(timer)
      reject(signal.reason)
    }
    if (signal.aborted) aborted()
    else signal.addEventListener('abort', aborted, { once: true })
  })
}

/** Run one unary analysis call while polling its request-bound progress record. */
export async function requestAnalysisWithProgress<T>(
  connection: ConnectionHandle,
  endpoint: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
  decode: (value: unknown) => T | undefined,
  onProgress?: (progress: TokenUsageAnalysisProgress) => void,
): Promise<T> {
  const progressId = createProgressId()
  const polling = new AbortController()
  const pollingSignal = AbortSignal.any([signal, polling.signal])
  const monitor = (async (): Promise<void> => {
    while (!pollingSignal.aborted) {
      try {
        const result = await connection.rpc.call(
          TOKEN_USAGE_RPC_CHANNEL,
          TOKEN_USAGE_RPC_ENDPOINT.analysisProgress,
          { progressId },
          pollingSignal,
        )
        if (result.ok) {
          const progress = analysisProgressOf(result.value)
          if (progress !== undefined) onProgress?.(progress)
        }
      } catch (_transientProgressFailure) {
        if (pollingSignal.aborted) return
        // Progress is advisory; a transient polling failure must not fail the model call.
      }
      try {
        await waitForPoll(pollingSignal)
      } catch (_analysisFinished) {
        return
      }
    }
  })()

  try {
    const result = await connection.rpc.call(
      TOKEN_USAGE_RPC_CHANNEL,
      endpoint,
      { ...payload, progressId },
      signal,
    )
    if (!result.ok) throw new Error(result.error.message)
    const decoded = decode(result.value)
    if (decoded === undefined) throw new Error('The Host returned an invalid analysis report.')
    return decoded
  } finally {
    polling.abort(new Error('analysis request settled'))
    await monitor
  }
}
