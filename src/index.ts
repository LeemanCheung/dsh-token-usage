/** Host projection and history warm-up for persistent Token usage records. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import {
  TOKEN_USAGE_SETTINGS_NAMESPACE,
  type TokenUsageBudgetSettings,
  type TokenUsageRouteBudget,
} from './budget-settings.ts'
import { tokenUsageRecorderProjectionDefinition } from './projection.ts'
import { TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT } from './rpc.ts'
import type { AnalysisProgressReporter, AnalysisProgressUpdate } from './analysis-progress.ts'
import { analyzeTrajectory } from './trajectory-analysis.ts'
import { analyzeTokenUsage } from './usage-analysis.ts'
import type {
  DailyTokenUsageRecord,
  ModelTokenUsageRecord,
  TokenUsageAnalysisCatalogFailure,
  TokenUsageAnalysisInput,
  TokenUsageAnalysisModel,
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
} from './types.ts'

/** Cordis plugin name. */
export const name = 'token-usage-recorder'

/** Host services required for core projection registration and historical replay. */
export const inject = [
  'sessionProjections',
  'sessionProjectionCache',
  'sessionQuery',
  'sessions',
]

/** Budget RPC surface; trajectory-only services are resolved lazily per request. */
const auxiliaryPlugin = {
  name: 'token-usage-auxiliary',
  inject: ['settings', 'connection'],
  apply: installRpc,
}

const BUDGET_NAMESPACE = settingsNamespace(TOKEN_USAGE_SETTINGS_NAMESPACE)
const MAX_ROUTE_BUDGETS = 64
const RouteBudgetSchema: z<TokenUsageRouteBudget> = z.object({
  provider: z.string().min(1).max(256),
  model: z.string().min(1).max(256),
  rolling30DayBudget: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
})
const BudgetSettingsSchema: z<TokenUsageBudgetSettings> = z.object({
  rolling30DayBudget: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  routeBudgets: z.array(RouteBudgetSchema).max(MAX_ROUTE_BUDGETS).default([]),
})

interface BudgetSettingsPatch {
  rolling30DayBudget?: number
  routeBudgets?: TokenUsageRouteBudget[]
}

/** Read one safe whole-token count from a settings payload. */
function budgetCount(value: unknown, allowZero: boolean): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0)
    ? value
    : undefined
}

/** Read one exact-route budget from the private client wire. */
function routeBudgetFrom(value: unknown): TokenUsageRouteBudget | undefined {
  if (!isRecord(value)) return undefined
  const provider = text(value.provider, 256)
  const model = text(value.model, 256)
  const rolling30DayBudget = budgetCount(value.rolling30DayBudget, false)
  return provider === undefined || model === undefined || rolling30DayBudget === undefined
    ? undefined
    : { provider, model, rolling30DayBudget }
}

/** Read a bounded global or route-budget settings patch from the private client wire. */
function budgetPatchFrom(payload: unknown): BudgetSettingsPatch | undefined {
  if (!isRecord(payload)) return undefined
  const hasGlobal = payload.rolling30DayBudget !== undefined
  const hasRoutes = payload.routeBudgets !== undefined
  if (!hasGlobal && !hasRoutes) return undefined
  const rolling30DayBudget = hasGlobal ? budgetCount(payload.rolling30DayBudget, true) : undefined
  if (hasGlobal && rolling30DayBudget === undefined) return undefined
  let routeBudgets: TokenUsageRouteBudget[] | undefined
  if (hasRoutes) {
    if (!Array.isArray(payload.routeBudgets) || payload.routeBudgets.length > MAX_ROUTE_BUDGETS) return undefined
    const parsed = payload.routeBudgets.map(routeBudgetFrom)
    if (parsed.some(route => route === undefined)) return undefined
    routeBudgets = (parsed as TokenUsageRouteBudget[]).sort((left, right) =>
      left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
    const seen = new Set(routeBudgets.map(route => JSON.stringify([route.provider, route.model])))
    if (seen.size !== routeBudgets.length) return undefined
  }
  return {
    ...rolling30DayBudget === undefined ? {} : { rolling30DayBudget },
    ...routeBudgets === undefined ? {} : { routeBudgets },
  }
}

/** Build one standard internal error response for the private loopback channel. */
function rpcError(message: string) {
  return {
    ok: false as const,
    error: { code: 'internal' as const, message, details: {} },
  }
}

/** Build one settings-rejected response for an invalid budget preference. */
function budgetError(message: string) {
  return {
    ok: false as const,
    error: { code: 'settings-rejected' as const, message, details: { ns: BUDGET_NAMESPACE } },
  }
}

/** Return whether one wire value is a plain JSON record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read one bounded string from a client wire record. */
function text(value: unknown, maximum: number, allowEmpty = false): string | undefined {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0) ? value : undefined
}

/** Read one non-negative whole Token count from the client wire. */
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** Read exactly four detached Token buckets from the client wire. */
function usageFrom(payload: unknown): TokenUsageBuckets | undefined {
  if (!isRecord(payload)) return undefined
  const uncachedInputTokens = count(payload.uncachedInputTokens)
  const outputTokens = count(payload.outputTokens)
  const cacheReadTokens = count(payload.cacheReadTokens)
  const cacheWriteTokens = count(payload.cacheWriteTokens)
  if (uncachedInputTokens === undefined || outputTokens === undefined
    || cacheReadTokens === undefined || cacheWriteTokens === undefined) return undefined
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/** Read one detached model aggregate from the client wire. */
function modelUsageFrom(payload: unknown): ModelTokenUsageRecord | undefined {
  if (!isRecord(payload)) return undefined
  const provider = text(payload.provider, 256, true)
  const model = text(payload.model, 256, true)
  const assistantRequests = count(payload.assistantRequests)
  const compactionRequests = count(payload.compactionRequests)
  const usage = usageFrom(payload.usage)
  if (provider === undefined || model === undefined || assistantRequests === undefined || compactionRequests === undefined || usage === undefined) return undefined
  return { provider, model, assistantRequests, compactionRequests, usage }
}

/** Read one UTC calendar-day aggregate from the client wire. */
function dailyUsageFrom(payload: unknown): DailyTokenUsageRecord | undefined {
  if (!isRecord(payload)) return undefined
  const date = text(payload.date, 10)
  const usage = usageFrom(payload.usage)
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date) || usage === undefined) return undefined
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return undefined
  return { date, usage }
}

/** Read one opaque request-local progress id. */
function progressIdFrom(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{8,96}$/.test(value) ? value : undefined
}

/** Read one bounded model route; the adapter verifies it authoritatively at call time. */
function modelSelectionFrom(payload: unknown): TokenUsageAnalysisModelSelection | undefined {
  if (!isRecord(payload)) return undefined
  const provider = text(payload.provider, 256)
  const model = text(payload.model, 256)
  return provider === undefined || model === undefined ? undefined : { provider, model }
}

/** Read and validate one trajectory-analysis request from the private wire. */
function trajectoryAnalysisRequest(payload: unknown): {
  sessionId: SessionId
  language: string
  model: TokenUsageAnalysisModelSelection
  progressId?: string
} | undefined {
  if (!isRecord(payload)) return undefined
  const sessionId = text(payload.sessionId, 256)
  const language = text(payload.language, 32)
  const model = modelSelectionFrom(payload.model)
  const progressId = payload.progressId === undefined ? undefined : progressIdFrom(payload.progressId)
  if (sessionId === undefined || language === undefined || model === undefined
    || (payload.progressId !== undefined && progressId === undefined)) return undefined
  return { sessionId: SessionId(sessionId), language, model, ...progressId === undefined ? {} : { progressId } }
}

/** Read and validate one aggregate-only Token usage analysis request. */
function usageAnalysisRequest(payload: unknown): {
  input: TokenUsageAnalysisInput
  language: string
  model: TokenUsageAnalysisModelSelection
  progressId?: string
} | undefined {
  if (!isRecord(payload)) return undefined
  const language = text(payload.language, 32)
  const model = modelSelectionFrom(payload.model)
  const progressId = payload.progressId === undefined ? undefined : progressIdFrom(payload.progressId)
  const input = payload.input
  if (language === undefined || model === undefined || !isRecord(input)
    || (payload.progressId !== undefined && progressId === undefined)) return undefined
  const usage = usageFrom(input.usage)
  const assistantRequests = input.assistantRequests === undefined ? undefined : count(input.assistantRequests)
  const compactionRequests = input.compactionRequests === undefined ? undefined : count(input.compactionRequests)
  const compactionUsage = input.compactionUsage === undefined
    ? { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    : usageFrom(input.compactionUsage)
  const rawModels = input.models
  const rawDays = input.days
  if (usage === undefined || compactionUsage === undefined
    || (input.assistantRequests !== undefined && assistantRequests === undefined)
    || (input.compactionRequests !== undefined && compactionRequests === undefined)
    || !Array.isArray(rawModels) || rawModels.length > 512 || !Array.isArray(rawDays) || rawDays.length > 3_660) {
    return undefined
  }
  const models = rawModels.map(modelUsageFrom)
  const days = rawDays.map(dailyUsageFrom)
  if (models.some(model => model === undefined) || days.some(day => day === undefined)) return undefined
  const parsedModels = models as ModelTokenUsageRecord[]
  const parsedDays = days as DailyTokenUsageRecord[]
  return {
    language,
    model,
    ...progressId === undefined ? {} : { progressId },
    input: {
      usage,
      assistantRequests: assistantRequests ?? parsedModels.reduce((sum, model) => sum + model.assistantRequests, 0),
      compactionRequests: compactionRequests ?? parsedModels.reduce((sum, model) => sum + model.compactionRequests, 0),
      compactionUsage,
      models: parsedModels,
      days: parsedDays,
    },
  }
}

/** Detached, partially available integrated-model catalog for the local selector. */
interface AnalysisModelCatalog {
  models: TokenUsageAnalysisModel[]
  failures: TokenUsageAnalysisCatalogFailure[]
}

type AnalysisListedModels = Awaited<ReturnType<Context['llm']['listModels']>>

interface AnalysisCatalogProviderState {
  active: Set<Promise<AnalysisListedModels>>
  current: Promise<AnalysisListedModels> | undefined
  lastStartedAt: number
}

interface AnalysisCatalogRuntime {
  llm: Context['llm']
  logger: Context['logger']
  catalogInFlight: Map<string, AnalysisCatalogProviderState>
}

/** Stop awaiting an API that cannot consume AbortSignal when its owning lifecycle ends. */
function awaitWithAbort<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const rejectOnce = (error: unknown): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', aborted)
      reject(error)
    }
    const aborted = (): void => { rejectOnce(signal.reason) }
    if (signal.aborted) {
      aborted()
      return
    }
    signal.addEventListener('abort', aborted, { once: true })
    let operation: Promise<T>
    try {
      operation = start()
    } catch (error) {
      rejectOnce(error)
      return
    }
    void operation.then(
      value => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', aborted)
        resolve(value)
      },
      rejectOnce,
    )
  })
}

const ANALYSIS_MODEL_PROVIDER_TIMEOUT_MS = 5_000
const ANALYSIS_MODEL_PROVIDER_RETRY_COOLDOWN_MS = 30_000
const MAX_UNSETTLED_PROVIDER_CATALOG_CALLS = 2

/** Reuse recent enumeration while permitting one cooldown retry without unbounded hung calls. */
function listAnalysisProvider(runtime: AnalysisCatalogRuntime, provider: string): Promise<AnalysisListedModels> {
  let state = runtime.catalogInFlight.get(provider)
  const now = Date.now()
  if (state?.current !== undefined
    && (state.active.size >= MAX_UNSETTLED_PROVIDER_CATALOG_CALLS
      || now - state.lastStartedAt < ANALYSIS_MODEL_PROVIDER_RETRY_COOLDOWN_MS)) return state.current
  if (state === undefined) {
    state = { active: new Set(), current: undefined, lastStartedAt: 0 }
    runtime.catalogInFlight.set(provider, state)
  }
  if (state.active.size >= MAX_UNSETTLED_PROVIDER_CATALOG_CALLS) {
    const reusable = state.current ?? [...state.active][state.active.size - 1]
    if (reusable === undefined) throw new Error(`No reusable model catalog call exists for provider "${provider}".`)
    return reusable
  }
  const operation = Promise.resolve().then(() => runtime.llm.listModels(provider))
  state.active.add(operation)
  state.current = operation
  state.lastStartedAt = now
  const settled = (): void => {
    if (runtime.catalogInFlight.get(provider) !== state) return
    state.active.delete(operation)
    if (state.current === operation) state.current = undefined
    if (state.active.size === 0) runtime.catalogInFlight.delete(provider)
  }
  void operation.then(settled, settled)
  return operation
}

/** List selectable routes without one unavailable provider blocking healthy providers. */
async function analysisModels(ctx: AnalysisCatalogRuntime, signal: AbortSignal): Promise<AnalysisModelCatalog> {
  const providers = ctx.llm.listProviders()
  const providerResults = await Promise.all(providers.map(async (provider) => {
    try {
      const providerSignal = AbortSignal.any([signal, AbortSignal.timeout(ANALYSIS_MODEL_PROVIDER_TIMEOUT_MS)])
      const listed = await awaitWithAbort(() => listAnalysisProvider(ctx, provider.id), providerSignal)
      return { provider, listed }
    } catch (error) {
      signal.throwIfAborted()
      ctx.logger.warn(`token usage: failed to list analysis models for "${provider.id}": ${String(error)}`)
      return { provider, listed: undefined }
    }
  }))
  signal.throwIfAborted()

  const models: TokenUsageAnalysisModel[] = []
  const failures: TokenUsageAnalysisCatalogFailure[] = []
  const seen = new Set<string>()
  for (const { provider, listed } of providerResults) {
    if (listed === undefined) {
      failures.push({ provider: provider.id, providerName: provider.name })
      continue
    }
    for (const model of listed) {
      const key = `${provider.id}\u0000${model.id}`
      if (seen.has(key)) continue
      seen.add(key)
      models.push({
        provider: provider.id,
        providerName: provider.name,
        model: model.id,
        modelName: model.name,
      })
    }
  }
  return { models, failures }
}

/** Return whether a default route remains visible in the current selector catalog. */
function isKnownModel(models: readonly TokenUsageAnalysisModel[], selection: TokenUsageAnalysisModelSelection): boolean {
  return models.some(model => model.provider === selection.provider && model.model === selection.model)
}

const MAX_ACTIVE_ANALYSIS_PROGRESS = 8

interface ActiveAnalysisProgress {
  startedAt: number
  update: AnalysisProgressUpdate
}

/** Expose persistent preferences and explicit configured-model trajectory analysis to the local Web client. */
function installRpc(ctx: Context): void {
  const budget = ctx.settings.register(BUDGET_NAMESPACE, BudgetSettingsSchema)
  const activeProgress = new Map<string, ActiveAnalysisProgress>()
  const withProgress = async <T>(
    progressId: string | undefined,
    run: (report: AnalysisProgressReporter | undefined) => Promise<T>,
  ): Promise<T> => {
    if (progressId === undefined) return run(undefined)
    if (activeProgress.has(progressId)) throw new Error('Analysis progress id is already active.')
    if (activeProgress.size >= MAX_ACTIVE_ANALYSIS_PROGRESS) throw new Error('Too many analyses are already running.')
    const entry: ActiveAnalysisProgress = {
      startedAt: Date.now(),
      update: {
        phase: 'preparing',
        chunks: 0,
        outputCharacters: 0,
        estimatedOutputTokens: 0,
        maximumOutputTokens: 0,
      },
    }
    activeProgress.set(progressId, entry)
    try {
      return await run((update) => { entry.update = update })
    } finally {
      activeProgress.delete(progressId)
    }
  }
  let analysisRuntime: {
    llm: Context['llm']
    signal: AbortSignal
    catalogInFlight: Map<string, AnalysisCatalogProviderState>
  } | undefined
  ctx.plugin({
    name: 'token-usage-analysis-runtime',
    inject: ['llm'],
    apply(analysisCtx: Context) {
      const lifecycle = new AbortController()
      const current = {
        llm: analysisCtx.llm,
        signal: lifecycle.signal,
        catalogInFlight: new Map<string, AnalysisCatalogProviderState>(),
      }
      analysisRuntime = current
      analysisCtx.effect(() => () => {
        lifecycle.abort(new Error('token usage analysis service disposed'))
        current.catalogInFlight.clear()
        if (analysisRuntime === current) analysisRuntime = undefined
      }, 'token usage: analysis runtime')
    },
  })
  ctx.effect(() => {
    const lifecycle = new AbortController()
    const dispose = ctx.connection.rpc.handle(TOKEN_USAGE_RPC_CHANNEL, async (endpoint, payload, signal) => {
      const operationSignal = AbortSignal.any([signal, lifecycle.signal])
      switch (endpoint) {
      case TOKEN_USAGE_RPC_ENDPOINT.budgetRead:
        return { ok: true, value: budget.get() }
      case TOKEN_USAGE_RPC_ENDPOINT.budgetWrite: {
        const patch = budgetPatchFrom(payload)
        if (patch === undefined) {
          return budgetError('Budget settings must contain a valid whole-Token global budget or unique exact-route budgets.')
        }
        try {
          await budget.update(patch)
        } catch (error) {
          return budgetError(error instanceof Error ? error.message : String(error))
        }
        return { ok: true, value: budget.get() }
      }
      case TOKEN_USAGE_RPC_ENDPOINT.analysisModels: {
        const runtime = analysisRuntime
        if (runtime?.llm === undefined) return rpcError('Analysis requires an available model service.')
        const analysisSignal = AbortSignal.any([operationSignal, runtime.signal])
        const catalog = await analysisModels({ llm: runtime.llm, logger: ctx.logger, catalogInFlight: runtime.catalogInFlight }, analysisSignal)
        analysisSignal.throwIfAborted()
        const defaultSelection = ctx.get('agentDefaultModel')?.currentSelection()
        return {
          ok: true,
          value: {
            models: catalog.models,
            ...catalog.failures.length === 0 ? {} : { failures: catalog.failures },
            ...defaultSelection !== undefined && isKnownModel(catalog.models, defaultSelection) ? {
              default: { provider: defaultSelection.provider, model: defaultSelection.model },
            } : {},
          },
        }
      }
      case TOKEN_USAGE_RPC_ENDPOINT.analysisProgress: {
        const progressId = isRecord(payload) ? progressIdFrom(payload.progressId) : undefined
        if (progressId === undefined) return rpcError('A valid analysis progress id is required.')
        const entry = activeProgress.get(progressId)
        return {
          ok: true,
          value: entry === undefined
            ? { available: false }
            : { available: true, elapsedMs: Math.max(0, Date.now() - entry.startedAt), ...entry.update },
        }
      }
      case TOKEN_USAGE_RPC_ENDPOINT.usageAnalyze: {
        const request = usageAnalysisRequest(payload)
        if (request === undefined) return rpcError('A valid aggregate Token usage payload, selected model, and language are required.')
        const runtime = analysisRuntime
        if (runtime?.llm === undefined) return rpcError('Usage analysis requires an available model service.')
        const analysisSignal = AbortSignal.any([operationSignal, runtime.signal])
        try {
          return {
            ok: true,
            value: await withProgress(request.progressId, report => analyzeTokenUsage(
              { llm: runtime.llm },
              request.input,
              request.model,
              request.language,
              analysisSignal,
              report,
            )),
          }
        } catch (error) {
          if (analysisSignal.aborted) throw error
          return rpcError(error instanceof Error ? error.message : String(error))
        }
      }
      case TOKEN_USAGE_RPC_ENDPOINT.trajectoryAnalyze: {
        const request = trajectoryAnalysisRequest(payload)
        if (request === undefined) return rpcError('A valid session id, selected model, and language are required.')
        const runtime = analysisRuntime
        if (runtime?.llm === undefined) return rpcError('Trajectory analysis requires an available model service.')
        const analysisSignal = AbortSignal.any([operationSignal, runtime.signal])
        try {
          return {
            ok: true,
            value: await withProgress(request.progressId, async report => {
              const live = ctx.sessions.get(request.sessionId)
              let events = live?.events
              if (events === undefined) {
                const persistence = ctx.get('sessionPersistence')
                if (persistence === undefined) {
                  throw new Error('Trajectory analysis cannot read cold sessions because persistence is unavailable.')
                }
                events = (await persistence.inspect(request.sessionId, analysisSignal)).events
              }
              if (events.length === 0) throw new Error('This session has no trajectory events to analyze.')
              return analyzeTrajectory(
                { llm: runtime.llm },
                request.sessionId,
                events,
                request.model,
                request.language,
                analysisSignal,
                report,
              )
            }),
          }
        } catch (error) {
          if (analysisSignal.aborted) throw error
          return rpcError(error instanceof Error ? error.message : String(error))
        }
      }
      default:
        return rpcError(`Unknown Token usage endpoint: ${endpoint}`)
      }
    }, { authority: 'loopback' })
    return async () => {
      lifecycle.abort(new Error('token usage plugin disposed'))
      await dispose()
    }
  }, 'token usage: private RPC')
}

/** Refresh one readable session without letting an operational failure stop later records or leave an attach race stale. */
async function warmRecord(ctx: Context, record: SessionRecord, signal: AbortSignal): Promise<void> {
  try {
    const live = ctx.sessions.get(record.header.id)
    if (live !== undefined) {
      await ctx.sessionProjectionCache.write(live)
    } else if (record.persisted) {
      await ctx.sessionProjectionCache.coldSnapshot(record.header.id, signal)
      if (signal.aborted) return
      const attached = ctx.sessions.get(record.header.id)
      if (attached !== undefined) await ctx.sessionProjectionCache.write(attached)
    }
  } catch (error) {
    if (signal.aborted) return
    ctx.logger.warn(`token usage: failed to refresh session "${record.header.id}": ${String(error)}`)
  }
}

/** Populate the new projection's cache sequentially without delaying plugin activation. */
async function warmHistory(ctx: Context, signal: AbortSignal): Promise<void> {
  let records: SessionRecord[]
  try {
    records = await ctx.sessionQuery.listSessions(signal)
  } catch (error) {
    if (signal.aborted) return
    ctx.logger.warn(`token usage: failed to list historical sessions: ${String(error)}`)
    return
  }

  for (const record of records) {
    if (signal.aborted) return
    await warmRecord(ctx, record, signal)
  }
}

/** Register the projection and start cancellable fail-soft history warming. */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(tokenUsageRecorderProjectionDefinition)
  ctx.plugin(auxiliaryPlugin)
  ctx.effect(() => {
    const controller = new AbortController()
    const operation = warmHistory(ctx, controller.signal)
    return async () => {
      controller.abort(new Error('token usage plugin disposed'))
      await operation
    }
  }, 'token usage: warm historical projections')
}
