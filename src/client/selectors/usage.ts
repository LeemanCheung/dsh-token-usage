/** Pure immutable usage selectors; no React component or CSS imports. */
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { DailyTokenUsageRecord, ModelDailyTokenUsageRecord, ModelTokenUsageRecord, TokenUsageAnalysisInput, TokenUsageBuckets, TokenUsageRecorderProjection } from '../../types.ts'

export interface SessionUsageRow {
  id: SessionId
  title: string
  updatedAt: number
  assistantRequests: number
  compactionRequests: number
  compactionUsage: TokenUsageBuckets
  usage: TokenUsageBuckets
  models: readonly ModelTokenUsageRecord[]
  days: readonly DailyTokenUsageRecord[]
  modelDays: readonly ModelDailyTokenUsageRecord[]
  dailyUsageReliable: boolean
  modelDailyUsageReliable: boolean
}

export interface DashboardData {
  usage: TokenUsageBuckets
  assistantRequests: number
  compactionRequests: number
  compactionUsage: TokenUsageBuckets
  sessions: SessionUsageRow[]
  models: ModelTokenUsageRecord[]
  days: DailyTokenUsageRecord[]
  modelDays: ModelDailyTokenUsageRecord[]
  operationalDays: DailyTokenUsageRecord[]
  dailyCoverage: 'complete' | 'partial' | 'unavailable'
  modelDailyCoverage: 'complete' | 'partial' | 'unavailable'
}

/** Detached zero buckets for dashboard folds. */
export function zeroBuckets(): TokenUsageBuckets {
  return {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
}

/** Add four disjoint token buckets. */
export function addBuckets(left: TokenUsageBuckets, right: TokenUsageBuckets): TokenUsageBuckets {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  }
}

/** Whether two detached provider bucket sets are exactly conserved. */
export function sameBuckets(left: TokenUsageBuckets, right: TokenUsageBuckets): boolean {
  return left.uncachedInputTokens === right.uncachedInputTokens
    && left.outputTokens === right.outputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
}

/** Sum detached bucket records without retaining projection-owned objects. */
function summedUsage(records: readonly { usage: TokenUsageBuckets }[]): TokenUsageBuckets {
  return records.reduce((sum, record) => addBuckets(sum, record.usage), zeroBuckets())
}

/** Compare two aggregate maps without accepting missing or extra keys. */
function sameUsageMap(
  actual: ReadonlyMap<string, TokenUsageBuckets>,
  expected: ReadonlyMap<string, TokenUsageBuckets>,
): boolean {
  return actual.size === expected.size
    && [...expected].every(([key, usage]) => {
      const value = actual.get(key)
      return value !== undefined && sameBuckets(value, usage)
    })
}

/** Verify daily buckets conserve the session-level projection total. */
function dailyUsageConserved(recorded: TokenUsageRecorderProjection): boolean {
  return sameBuckets(summedUsage(recorded.days), recorded.usage)
}

/** Verify date-by-model buckets conserve totals across session, route, and UTC day dimensions. */
function modelDailyUsageConserved(recorded: TokenUsageRecorderProjection): boolean {
  if (!sameBuckets(summedUsage(recorded.modelDays), recorded.usage)) return false
  const routeTotals = new Map<string, TokenUsageBuckets>()
  const dayTotals = new Map<string, TokenUsageBuckets>()
  for (const record of recorded.modelDays) {
    if (totalTokens(record.usage) === 0) continue
    const route = modelKey(record)
    routeTotals.set(route, addBuckets(routeTotals.get(route) ?? zeroBuckets(), record.usage))
    dayTotals.set(record.date, addBuckets(dayTotals.get(record.date) ?? zeroBuckets(), record.usage))
  }
  const expectedRoutes = new Map(recorded.models
    .filter(model => totalTokens(model.usage) > 0)
    .map(model => [modelKey(model), model.usage]))
  const expectedDays = new Map(recorded.days
    .filter(day => totalTokens(day.usage) > 0)
    .map(day => [day.date, day.usage]))
  return sameUsageMap(routeTotals, expectedRoutes) && sameUsageMap(dayTotals, expectedDays)
}

/** Stable UTC day key used by durable Host records and legacy fallbacks. */
export function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** Prompt-side total across uncached input and cache traffic. */
export function inputTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Complete request/response total without double-counting reasoning output. */
export function totalTokens(usage: TokenUsageBuckets): number {
  return inputTokens(usage) + usage.outputTokens
}

export function modelKey(model: Pick<ModelTokenUsageRecord, 'provider' | 'model'>): string {
  return JSON.stringify([model.provider, model.model])
}
export function modelDayKey(model: Pick<ModelDailyTokenUsageRecord, 'provider' | 'model' | 'date'>): string {
  return JSON.stringify([model.provider, model.model, model.date])
}
/** Attribute a built-in projection fallback to an explicit dashboard remainder row. */
function unattributedModel(usage: TokenUsageBuckets): ModelTokenUsageRecord {
  return {
    provider: '',
    model: '',
    assistantRequests: 0,
    compactionRequests: 0,
    usage: { ...usage },
  }
}

/** Built-in projection fallback for a cache created before this plugin was installed. */
function fallbackUsage(value: TokenUsageProjection): TokenUsageBuckets {
  return {
    uncachedInputTokens: value.uncachedInputTokens,
    outputTokens: value.outputTokens,
    cacheReadTokens: value.cacheReadTokens,
    cacheWriteTokens: value.cacheWriteTokens,
  }
}

/** One session summary projected into a usage row, or null when it has no usage. */
function sessionRow(summary: SessionSummary): SessionUsageRow | null {
  const recorded: TokenUsageRecorderProjection | undefined = summary.projectionValues?.tokenUsageRecorder
  const builtIn = summary.projectionValues?.tokenUsage
  const usage = recorded?.usage ?? (builtIn === undefined ? undefined : fallbackUsage(builtIn))
  const assistantRequests = recorded?.assistantRequests ?? 0
  const compactionRequests = recorded?.compactionRequests ?? 0
  if (usage === undefined || (totalTokens(usage) === 0 && assistantRequests === 0 && compactionRequests === 0)) return null
  const dailyUsageReliable = recorded?.days !== undefined && dailyUsageConserved(recorded)
  const modelDailyUsageReliable = recorded?.modelDays !== undefined
    && dailyUsageReliable
    && modelDailyUsageConserved(recorded)
  return {
    id: summary.id,
    title: summary.displayTitle,
    updatedAt: summary.updatedAt,
    assistantRequests,
    compactionRequests,
    compactionUsage: recorded?.compactionUsage === undefined ? zeroBuckets() : { ...recorded.compactionUsage },
    usage,
    models: recorded?.models ?? [unattributedModel(usage)],
    days: recorded?.days ?? [{ date: dayKey(summary.updatedAt), usage }],
    modelDays: recorded?.modelDays ?? [],
    dailyUsageReliable,
    modelDailyUsageReliable,
  }
}

/** Aggregate session summaries into totals and provider/model records. */
export function aggregateUsage(summaries: readonly SessionSummary[]): DashboardData {
  const sessions: SessionUsageRow[] = []
  const models = new Map<string, ModelTokenUsageRecord>()
  const days = new Map<string, TokenUsageBuckets>()
  const modelDays = new Map<string, ModelDailyTokenUsageRecord>()
  const operationalDays = new Map<string, TokenUsageBuckets>()
  let usage = zeroBuckets()
  let assistantRequests = 0
  let compactionRequests = 0
  let compactionUsage = zeroBuckets()
  let reliableDailySessions = 0
  let reliableModelDailySessions = 0

  for (const summary of summaries) {
    const row = sessionRow(summary)
    if (row === null) continue
    sessions.push(row)
    usage = addBuckets(usage, row.usage)
    assistantRequests += row.assistantRequests
    compactionRequests += row.compactionRequests
    compactionUsage = addBuckets(compactionUsage, row.compactionUsage)
    if (row.dailyUsageReliable) reliableDailySessions += 1
    if (row.modelDailyUsageReliable) reliableModelDailySessions += 1
    for (const day of row.days) {
      days.set(day.date, addBuckets(days.get(day.date) ?? zeroBuckets(), day.usage))
      if (row.dailyUsageReliable) {
        operationalDays.set(day.date, addBuckets(operationalDays.get(day.date) ?? zeroBuckets(), day.usage))
      }
    }
    for (const modelDay of row.modelDays) {
      const key = modelDayKey(modelDay)
      const current = modelDays.get(key)
      modelDays.set(key, current === undefined ? {
        ...modelDay,
        usage: { ...modelDay.usage },
      } : {
        ...current,
        usage: addBuckets(current.usage, modelDay.usage),
      })
    }
    for (const model of row.models) {
      const key = modelKey(model)
      const current = models.get(key)
      models.set(key, current === undefined ? {
        ...model,
        usage: { ...model.usage },
      } : {
        ...current,
        assistantRequests: current.assistantRequests + model.assistantRequests,
        compactionRequests: current.compactionRequests + model.compactionRequests,
        usage: addBuckets(current.usage, model.usage),
      })
    }
  }

  sessions.sort((left, right) => right.updatedAt - left.updatedAt)
  return {
    usage,
    assistantRequests,
    compactionRequests,
    compactionUsage,
    sessions,
    models: [...models.values()].sort((left, right) =>
      totalTokens(right.usage) - totalTokens(left.usage)
      || left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model)),
    days: [...days.entries()]
      .map(([date, usage]): DailyTokenUsageRecord => ({ date, usage }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    modelDays: [...modelDays.values()].sort((left, right) =>
      left.date.localeCompare(right.date)
      || left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model)),
    operationalDays: [...operationalDays.entries()]
      .map(([date, usage]): DailyTokenUsageRecord => ({ date, usage }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    dailyCoverage: reliableDailySessions === 0
      ? 'unavailable'
      : reliableDailySessions === sessions.length ? 'complete' : 'partial',
    modelDailyCoverage: reliableModelDailySessions === 0
      ? 'unavailable'
      : reliableModelDailySessions === sessions.length ? 'complete' : 'partial',
  }
}

export function usageAnalysisInput(data: Pick<DashboardData, 'usage' | 'assistantRequests' | 'compactionRequests' | 'compactionUsage' | 'models' | 'operationalDays' | 'dailyCoverage'>): TokenUsageAnalysisInput {
  return {
    usage: { ...data.usage },
    assistantRequests: data.assistantRequests,
    compactionRequests: data.compactionRequests,
    compactionUsage: { ...data.compactionUsage },
    models: data.models.map(model => ({
      provider: model.provider,
      model: model.model,
      assistantRequests: model.assistantRequests,
      compactionRequests: model.compactionRequests,
      usage: { ...model.usage },
    })),
    days: data.dailyCoverage === 'complete'
      ? data.operationalDays.map(day => ({ date: day.date, usage: { ...day.usage } }))
      : [],
  }
}

/** Render a summary metric card with exact token counts available on hover. */