import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import settingsSchema from '@deepseek-ai/schemastery'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { MAX_STATE_CHARS, boundedParse, bucketsSchema, configRequestSchema, emptyState, identifier, snapshotRequestSchema, stamp, stateSchema, type LedgerEntry, type WorkbenchState } from './schema.ts'
import { buildSnapshot, pageSnapshot, type SnapshotArchive } from './snapshot.ts'
import { quote, sumQuotes, total, type Quote } from './prices.ts'

const storageSchema = settingsSchema.object({ data: settingsSchema.string().max(MAX_STATE_CHARS).default('') })
const receiptRequest = z.object({ sessionId: identifier, revision: identifier, currency: z.enum(['USD', 'CNY']), mode: z.enum(['historical-reference', 'revaluation']), at: stamp }).strict()
const emptyRequest = z.object({}).strict()
const clearRequest = z.object({ confirm: z.literal('clear-analysis-ledger') }).strict()
const failure = (message: string) => ({ ok: false as const, error: { code: 'internal' as const, message, details: {} } })

/** Bounded durable store; all mutations are serialized and config changes use a revision precondition. */
export function createWorkbenchHost(ctx: Context) {
  const storage = ctx.settings.register('token-usage-workbench', storageSchema)
  let state: WorkbenchState
  let damaged = false, storageFailed = false, active = 0
  try {
    const raw = storage.get().data
    state = raw ? boundedParse(stateSchema, JSON.parse(raw)) : emptyState()
    state.ledger = state.ledger.map(entry => entry.status === 'running' ? { ...entry, status: 'interrupted', endedAt: new Date().toISOString() } : entry)
  } catch { state = emptyState(); damaged = true }
  let queue: Promise<void> = Promise.resolve()
  const archives = new Map<string, { archive: SnapshotArchive; touched: number }>()
  function cached(sessionId: string, revision: string): SnapshotArchive {
    const key = JSON.stringify([sessionId, revision]), value = archives.get(key)
    if (!value || Date.now() - value.touched > 600000) { archives.delete(key); throw new Error('Snapshot expired; refresh the local inspection') }
    value.touched = Date.now()
    return value.archive
  }
  function remember(archive: SnapshotArchive): void {
    archives.set(JSON.stringify([archive.base.sessionId, archive.base.revision]), { archive, touched: Date.now() })
    while (archives.size > 8) archives.delete([...archives.entries()].sort((a, b) => a[1].touched - b[1].touched)[0]![0])
  }
  function mutate(operation: (draft: WorkbenchState) => void): Promise<void> {
    const run = queue.then(async () => {
      if (damaged) throw new Error('Workbench storage is invalid; existing data was left untouched')
      const draft = structuredClone(state)
      operation(draft)
      boundedParse(stateSchema, draft)
      await storage.update({ data: JSON.stringify(draft) })
      state = draft; storageFailed = false
    })
    queue = run.catch(() => {})
    return run
  }
  async function checkpoint(entry: LedgerEntry): Promise<void> {
    try {
      await mutate(draft => {
        draft.ledger = draft.ledger.filter(value => value.id !== entry.id)
        draft.ledger.push(structuredClone(entry))
        draft.ledger.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
        while (draft.ledger.length > 512) {
          const index = draft.ledger.findIndex(value => value.status !== 'running')
          if (index < 0) throw new Error('Auxiliary ledger capacity reached')
          draft.ledger.splice(index, 1); draft.evictedEntries++
        }
      })
    } catch {
      storageFailed = true
      ctx.logger.warn('token usage: auxiliary ledger could not be persisted; the model call was not blocked')
    }
  }
  async function track<T>(service: Context['llm'], kind: LedgerEntry['kind'], route: { provider: string; model: string }, signal: AbortSignal, run: (llm: Context['llm']) => Promise<T>): Promise<T> {
    const entry: LedgerEntry = { id: randomUUID(), routeId: createHash('sha256').update(JSON.stringify([route.provider, route.model])).digest('hex').slice(0, 32), kind, startedAt: new Date().toISOString(), status: 'running', usage: null, finality: 'unknown' }
    active++
    let lastCheckpoint = 0
    await checkpoint(entry)
    const observed = new Proxy(service, {
      get(target, property, receiver) {
        if (property === 'prepareCall') return async (...args: Parameters<typeof service.prepareCall>) => {
          const prepared = await service.prepareCall(...args)
          return { ...prepared, stream: async function* (...streamArgs: Parameters<typeof prepared.stream>) {
            for await (const chunk of prepared.stream(...streamArgs)) {
              if (chunk.type === 'usage') {
                const value = bucketsSchema.safeParse({ uncachedInputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens, cacheReadTokens: chunk.usage.cacheReadTokens ?? 0, cacheWriteTokens: chunk.usage.cacheWriteTokens ?? 0 })
                if (value.success) {
                  entry.usage = value.data; entry.finality = 'provisional'
                  if (Date.now() - lastCheckpoint >= 1000) { lastCheckpoint = Date.now(); await checkpoint(entry) }
                }
              }
              yield chunk
            }
          } }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    try {
      const value = await run(observed)
      entry.status = 'completed'
      if (entry.usage) entry.finality = 'authoritative'
      return value
    } catch (error) {
      entry.status = signal.aborted ? 'cancelled' : 'failed'
      throw error
    } finally {
      entry.endedAt = new Date().toISOString()
      await checkpoint(entry); active--
    }
  }
  async function handle(endpoint: string, payload: unknown, signal: AbortSignal) {
    try {
      signal.throwIfAborted()
      switch (endpoint) {
        case 'workbench/read':
          emptyRequest.parse(payload); await queue
          if (damaged || storageFailed) return failure('Workbench storage is unavailable; existing data has not been discarded')
          return { ok: true as const, value: structuredClone(state) }
        case 'workbench/config': {
          const request = boundedParse(configRequestSchema, payload)
          await mutate(draft => {
            signal.throwIfAborted()
            if (request.revision !== draft.revision) throw new Error('Settings changed in another window; refresh before saving')
            draft.config = request.config; draft.revision++
          })
          return { ok: true as const, value: structuredClone(state) }
        }
        case 'workbench/ledger-clear':
          clearRequest.parse(payload)
          await mutate(draft => {
            if (active) throw new Error('Cannot clear the ledger while analysis is running')
            draft.ledger = []; draft.evictedEntries = 0
          })
          return { ok: true as const, value: structuredClone(state) }
        case 'workbench/snapshot': {
          const request = boundedParse(snapshotRequestSchema, payload, 2048)
          if (request.revision) return { ok: true as const, value: pageSnapshot(cached(request.sessionId, request.revision), request.offset) }
          if (request.offset !== 0) throw new Error('A revision is required for subsequent pages')
          const id = SessionId(request.sessionId)
          const events = ctx.sessions.get(id)?.snapshotEvents() ?? (await ctx.sessionQuery.readSession(id)).events
          signal.throwIfAborted()
          const archive = buildSnapshot(request.sessionId, events, state.config.thresholds)
          signal.throwIfAborted(); remember(archive)
          return { ok: true as const, value: pageSnapshot(archive, 0) }
        }
        case 'workbench/receipt-cost': {
          const request = boundedParse(receiptRequest, payload, 4096), archive = cached(request.sessionId, request.revision)
          const estimates = archive.nodes.map(node => quote(state.config.cards, node, node.usage, {
            currency: request.currency, mode: request.mode, at: request.mode === 'historical-reference' ? node.time ?? request.at : request.at,
            timingKnown: request.mode === 'revaluation', requestInputKnown: node.finality === 'authoritative',
          }))
          let estimate: Quote = sumQuotes(estimates, request.currency)
          if (archive.base.reconciliation !== 'matched') estimate = { ...estimate, totalTokens: total(archive.base.totals.usage), amount: null, upper: null, status: 'partial', unavailable: [...estimate.unavailable, 'token-reconciliation-mismatch'] }
          const known = estimates.map((estimate, index) => ({ id: archive.nodes[index]!.id, amount: estimate.amount })).filter((item): item is { id: string; amount: number } => item.amount !== null).sort((a, b) => b.amount - a.amount)
          return { ok: true as const, value: { estimate, largestPricedNode: known[0] ?? null, revision: archive.base.revision, priceRevision: state.revision } }
        }
        default: return failure('Unknown workbench endpoint')
      }
    } catch (error) {
      if (signal.aborted) throw error
      return failure(error instanceof z.ZodError ? 'Invalid workbench payload' : error instanceof Error ? error.message : 'Workbench request failed')
    }
  }
  return { handle, track, dispose: () => { archives.clear() } }
}
