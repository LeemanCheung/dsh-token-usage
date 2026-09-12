import { z } from 'zod'

export const SCHEMA = 'dsh-token-usage/workbench-v1' as const
export const MAX_STATE_CHARS = 3_000_000
export const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const identifier = z.string().min(1).max(256)
export const stamp = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)))
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
})
export const bucketsSchema = z.object({
  uncachedInputTokens: integer, outputTokens: integer, cacheReadTokens: integer, cacheWriteTokens: integer,
}).strict().refine(value => Number.isSafeInteger(Object.values(value).reduce((sum, n) => sum + n, 0)))
export type Buckets = z.infer<typeof bucketsSchema>
export const bucketKeys = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
export type BucketKey = typeof bucketKeys[number]
const rate = z.number().finite().min(0).max(1_000_000).nullable()
export const ratesSchema = z.object({
  uncachedInputTokens: rate, outputTokens: rate, cacheReadTokens: rate, cacheWriteTokens: rate,
}).strict()
export type Rates = z.infer<typeof ratesSchema>
const periodSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length),
  startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440),
  rates: ratesSchema,
}).strict().refine(value => value.startMinute < value.endMinute)
export const rateCardSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,96}$/), label: z.string().min(1).max(100),
  provider: identifier, model: identifier, currency: z.enum(['USD', 'CNY']),
  effectiveFrom: stamp, effectiveTo: stamp.optional(), verifiedAt: stamp,
  source: z.enum(['public', 'user-defined']),
  sourceUrl: z.string().max(512).url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  }).optional(),
  rates: ratesSchema,
  timezone: z.string().min(1).max(80).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true } catch { return false }
  }).default('UTC'),
  periods: z.array(periodSchema).max(32).default([]),
  tiers: z.array(z.object({ minimumInput: integer, rates: ratesSchema }).strict()).max(16).default([]),
  cacheWriteVariants: z.object({ short: rate, long: rate }).strict().optional(),
}).strict().superRefine((card, ctx) => {
  if (card.effectiveTo && Date.parse(card.effectiveTo) <= Date.parse(card.effectiveFrom)) ctx.addIssue({ code: 'custom', message: 'Invalid effective interval' })
  if (new Set(card.tiers.map(tier => tier.minimumInput)).size !== card.tiers.length) ctx.addIssue({ code: 'custom', message: 'Duplicate context threshold' })
  if (card.periods.length && card.tiers.length) ctx.addIssue({ code: 'custom', message: 'Combined time/context tariffs require an explicit supported rule; split into separate cards' })
  for (let i = 0; i < card.periods.length; i++) for (let j = i + 1; j < card.periods.length; j++) {
    const a = card.periods[i]!, b = card.periods[j]!
    if (a.days.some(day => b.days.includes(day)) && a.startMinute < b.endMinute && b.startMinute < a.endMinute) ctx.addIssue({ code: 'custom', message: 'Overlapping tariff periods' })
  }
})
export type RateCard = z.infer<typeof rateCardSchema>
export const cardsSchema = z.array(rateCardSchema).max(128).superRefine((cards, ctx) => {
  if (new Set(cards.map(card => card.id)).size !== cards.length) ctx.addIssue({ code: 'custom', message: 'Duplicate price-card id' })
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i]!, b = cards[j]!
    if (a.provider === b.provider && a.model === b.model && a.currency === b.currency
      && Date.parse(a.effectiveFrom) < (b.effectiveTo ? Date.parse(b.effectiveTo) : Infinity)
      && Date.parse(b.effectiveFrom) < (a.effectiveTo ? Date.parse(a.effectiveTo) : Infinity)) ctx.addIssue({ code: 'custom', message: 'Overlapping route/currency price versions' })
  }
})
export const moneyBudgetSchema = z.object({ currency: z.enum(['USD', 'CNY']), amount: z.number().finite().positive().max(1e9) }).strict()
export const projectSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(80), tokenBudget: integer,
  moneyBudgets: z.array(moneyBudgetSchema).max(2).refine(values => new Set(values.map(value => value.currency)).size === values.length).default([]),
}).strict()
export const assignmentSchema = z.object({ sessionId: identifier, projectId: identifier, tags: z.array(z.string().trim().min(1).max(40)).max(12) }).strict()
export const findingSchema = z.object({
  ruleId: identifier, ruleVersion: z.literal('1'), severity: z.enum(['info', 'warning', 'error']),
  evidence: z.array(z.string().max(200)).max(16), value: z.number().finite(), threshold: z.number().finite().optional(),
  coverage: z.enum(['complete', 'partial', 'unavailable']),
}).strict()
export const nodeSchema = z.object({
  id: identifier, seq: integer, kind: z.enum(['model', 'compaction']),
  status: z.enum(['open', 'completed', 'retried']), finality: z.enum(['provisional', 'authoritative']),
  provider: identifier, model: identifier, usage: bucketsSchema, time: stamp.optional(),
}).strict()
export const totalsSchema = z.object({
  usage: bucketsSchema, retry: bucketsSchema, compaction: bucketsSchema, ordinary: bucketsSchema,
  attributed: bucketsSchema,
  delta: z.object({ uncachedInputTokens: z.number().int().finite(), outputTokens: z.number().int().finite(), cacheReadTokens: z.number().int().finite(), cacheWriteTokens: z.number().int().finite() }).strict(),
  requests: integer, retries: integer, compactions: integer, toolCalls: integer, toolErrors: integer,
  orphanTools: integer, openTurns: integer, openSteps: integer, unresolvedApprovals: integer,
  durationMs: integer, activeDurationMs: integer, completedTurns: integer, failedTurns: integer,
}).strict()
export const snapshotSchema = z.object({
  schema: z.literal('dsh-token-usage/snapshot-v1'), sessionId: identifier, generatedAt: stamp,
  revision: identifier, firstSeq: integer, lastSeq: integer, eventCount: integer,
  totals: totalsSchema, reconciliation: z.enum(['matched', 'mismatch']),
  findings: z.array(findingSchema).max(32), nodes: z.array(nodeSchema).max(200),
  nodeCount: integer, provisionalNodeCount: integer, offset: integer, nextOffset: integer.nullable(),
  routes: z.array(z.object({ provider: identifier, model: identifier, usage: bucketsSchema }).strict()).max(512),
}).strict()
export type LocalSnapshot = z.infer<typeof snapshotSchema>
export type Finding = z.infer<typeof findingSchema>
export const experimentRunSchema = z.object({
  id: identifier, experiment: z.string().trim().min(1).max(80), variant: z.enum(['baseline', 'candidate']),
  pair: z.string().trim().min(1).max(80), task: z.string().trim().min(1).max(80),
  size: z.string().trim().min(1).max(40), conditions: z.string().trim().min(1).max(160),
  configLabel: z.string().trim().min(1).max(80), accepted: z.boolean().nullable(),
  generatedAt: stamp, revision: identifier, usage: bucketsSchema, retries: integer,
  durationMs: integer, complete: z.boolean(),
  costs: z.array(z.object({ currency: z.enum(['USD', 'CNY']), amount: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER), complete: z.boolean(), basis: z.string().max(200) }).strict()).max(2),
}).strict()
export type ExperimentRun = z.infer<typeof experimentRunSchema>
export const configurationSchema = z.object({
  cards: cardsSchema,
  projects: z.array(projectSchema).max(64), assignments: z.array(assignmentSchema).max(5000),
  experiments: z.array(experimentRunSchema).max(500),
  thresholds: z.object({ retryShare: z.number().min(0).max(1), compactionShare: z.number().min(0).max(1) }).strict(),
  moneyBudgets: z.array(moneyBudgetSchema).max(2).refine(values => new Set(values.map(value => value.currency)).size === values.length),
  shareSummary: z.boolean(),
}).strict().superRefine((config, ctx) => {
  for (const items of [config.projects, config.experiments]) if (new Set(items.map(item => item.id)).size !== items.length) ctx.addIssue({ code: 'custom', message: 'Duplicate id' })
  if (config.projects.some(project => project.id === 'unassigned')) ctx.addIssue({ code: 'custom', message: 'Reserved project id' })
  if (new Set(config.assignments.map(item => item.sessionId)).size !== config.assignments.length) ctx.addIssue({ code: 'custom', message: 'A session must have one primary project' })
  if (config.assignments.some(item => !config.projects.some(project => project.id === item.projectId))) ctx.addIssue({ code: 'custom', message: 'Unknown project assignment' })
})
export type Configuration = z.infer<typeof configurationSchema>
export function emptyConfiguration(): Configuration {
  return { cards: [], projects: [], assignments: [], experiments: [], thresholds: { retryShare: 0.1, compactionShare: 0.2 }, moneyBudgets: [], shareSummary: false }
}
export const ledgerEntrySchema = z.object({
  id: identifier, routeId: z.string().regex(/^[a-f0-9]{32}$/),
  kind: z.enum(['usage-analysis', 'trajectory-analysis']), startedAt: stamp, endedAt: stamp.optional(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled', 'interrupted']),
  usage: bucketsSchema.nullable(), finality: z.enum(['unknown', 'provisional', 'authoritative']),
}).strict()
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>
export const stateSchema = z.object({
  schema: z.literal(SCHEMA), revision: integer, config: configurationSchema,
  ledger: z.array(ledgerEntrySchema).max(512), evictedEntries: integer,
}).strict()
export type WorkbenchState = z.infer<typeof stateSchema>
export function emptyState(): WorkbenchState { return { schema: SCHEMA, revision: 0, config: emptyConfiguration(), ledger: [], evictedEntries: 0 } }
export function boundedParse<S extends z.ZodType>(schema: S, value: unknown, maxChars = MAX_STATE_CHARS): z.output<S> {
  if (value === undefined || JSON.stringify(value).length > maxChars) throw new Error('Payload exceeds the workbench limit')
  return schema.parse(value)
}
export const snapshotRequestSchema = z.object({ sessionId: identifier, offset: integer.max(200000).default(0), revision: identifier.optional() }).strict()
export const configRequestSchema = z.object({ revision: integer, config: configurationSchema }).strict()
