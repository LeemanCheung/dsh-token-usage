import { z } from 'zod'
import { boundedParse, configRequestSchema, identifier, integer, snapshotRequestSchema, snapshotSchema, stateSchema, type Configuration, type LocalSnapshot, type WorkbenchState } from './schema.ts'
import type { Quote } from './prices.ts'
const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable()
export const quoteSchema = z.object({
  currency: z.enum(['USD', 'CNY']), mode: z.enum(['historical-reference', 'revaluation', 'scenario']),
  amount: money, lower: money, upper: money, coveredTokens: integer, totalTokens: integer,
  status: z.enum(['complete', 'partial', 'unavailable', 'range']), cards: z.array(z.string().max(96)).max(128),
  verifiedAt: z.array(z.string().max(64)).max(128), unavailable: z.array(z.string().max(256)).max(128),
}).strict().refine(value => value.amount === null || value.status === 'complete')
export const receiptSchema = z.object({
  estimate: quoteSchema, revision: identifier, priceRevision: integer,
  largestPricedNode: z.object({ id: identifier, amount: z.number().finite().nonnegative() }).strict().nullable(),
}).strict()
export type ReceiptCost = z.infer<typeof receiptSchema>
export interface WorkbenchPort {
  read(signal: AbortSignal): Promise<WorkbenchState>
  save(revision: number, config: Configuration, signal: AbortSignal): Promise<WorkbenchState>
  snapshot(sessionId: string, signal: AbortSignal, offset?: number, revision?: string): Promise<LocalSnapshot>
  receipt(sessionId: string, revision: string, currency: Quote['currency'], mode: 'historical-reference' | 'revaluation', at: string, signal: AbortSignal): Promise<ReceiptCost>
  clear(signal: AbortSignal): Promise<WorkbenchState>
}
export function makeWorkbenchPort(call: (endpoint: string, payload: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>): WorkbenchPort {
  const request = async <T>(endpoint: string, payload: Record<string, unknown>, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> => {
    signal.throwIfAborted()
    const value = await call(endpoint, payload, signal)
    signal.throwIfAborted()
    return boundedParse(schema, value)
  }
  return {
    read: signal => request('workbench/read', {}, stateSchema, signal),
    save: (revision, config, signal) => request('workbench/config', boundedParse(configRequestSchema, { revision, config }), stateSchema, signal),
    snapshot: async (sessionId, signal, offset = 0, revision) => {
      const result = await request('workbench/snapshot', snapshotRequestSchema.parse({ sessionId, offset, ...(revision ? { revision } : {}) }), snapshotSchema, signal)
      if (result.sessionId !== sessionId || result.offset !== offset || revision && result.revision !== revision) throw new Error('Snapshot identity changed; refresh the inspection')
      return result
    },
    receipt: async (sessionId, revision, currency, mode, at, signal) => {
      const result = await request('workbench/receipt-cost', { sessionId, revision, currency, mode, at }, receiptSchema, signal)
      if (result.revision !== revision) throw new Error('Receipt revision does not match the snapshot')
      return result
    },
    clear: signal => request('workbench/ledger-clear', { confirm: 'clear-analysis-ledger' }, stateSchema, signal),
  }
}
