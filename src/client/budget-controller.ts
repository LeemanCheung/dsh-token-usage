import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { TokenUsageBudgetSettings, TokenUsageRouteBudget } from '../budget-settings.ts'
import { TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT } from '../rpc.ts'

/** One browser-visible state of the persistent global and exact-route budgets. */
export interface TokenUsageBudgetSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  budget: number
  routeBudgets: readonly TokenUsageRouteBudget[]
}

const INITIAL: TokenUsageBudgetSnapshot = { status: 'loading', budget: 0, routeBudgets: [] }
const MAX_ROUTE_BUDGETS = 64

/** Stable exact-route identity for settings comparisons and updates. */
function routeKey(route: Pick<TokenUsageRouteBudget, 'provider' | 'model'>): string {
  return JSON.stringify([route.provider, route.model])
}

/** Whether two normalized route-budget lists contain the same settings. */
function sameRouteBudgets(left: readonly TokenUsageRouteBudget[], right: readonly TokenUsageRouteBudget[]): boolean {
  return left.length === right.length && left.every((route, index) => {
    const other = right[index]
    return other !== undefined
      && route.provider === other.provider
      && route.model === other.model
      && route.rolling30DayBudget === other.rolling30DayBudget
  })
}

/** Minimal stable observable source consumed by the Settings slot hook binder. */
class BudgetStore {
  private snapshot: TokenUsageBudgetSnapshot = INITIAL
  private readonly listeners = new Set<() => void>()

  getSnapshot(): TokenUsageBudgetSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  set(next: TokenUsageBudgetSnapshot): void {
    if (this.snapshot.status === next.status
      && this.snapshot.budget === next.budget
      && sameRouteBudgets(this.snapshot.routeBudgets, next.routeBudgets)) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}

/** Decode normalized budget settings returned by the private Host RPC. */
function settingsOf(value: unknown): TokenUsageBudgetSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const budget = (value as { rolling30DayBudget?: unknown }).rolling30DayBudget
  if (typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget < 0) return undefined
  const rawRoutes = (value as { routeBudgets?: unknown }).routeBudgets ?? []
  if (!Array.isArray(rawRoutes) || rawRoutes.length > MAX_ROUTE_BUDGETS) return undefined
  const routeBudgets: TokenUsageRouteBudget[] = []
  const seen = new Set<string>()
  for (const value of rawRoutes) {
    if (typeof value !== 'object' || value === null) return undefined
    const provider = (value as { provider?: unknown }).provider
    const model = (value as { model?: unknown }).model
    const rolling30DayBudget = (value as { rolling30DayBudget?: unknown }).rolling30DayBudget
    if (typeof provider !== 'string' || provider.length === 0 || provider.length > 256
      || typeof model !== 'string' || model.length === 0 || model.length > 256
      || typeof rolling30DayBudget !== 'number' || !Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget <= 0) return undefined
    const route = { provider, model, rolling30DayBudget }
    const key = routeKey(route)
    if (seen.has(key)) return undefined
    seen.add(key)
    routeBudgets.push(route)
  }
  routeBudgets.sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
  return { rolling30DayBudget: budget, routeBudgets }
}

/** Mirror the private Host settings endpoint onto one HMR-safe observable source. */
export class TokenUsageBudgetController {
  /** Observable snapshot supplied through the settings section's hooks compartment. */
  readonly store = new BudgetStore()

  private generation = 0
  private disposed = false
  private writeQueue: Promise<void> = Promise.resolve()

  /** @param connection - client connection carrying the loopback RPC channel. */
  constructor(private readonly connection: ConnectionHandle) {}

  /** Fetch durable budgets unless the current page cannot call loopback-only endpoints. */
  async load(): Promise<void> {
    const generation = ++this.generation
    if (!this.connection.isLoopback) {
      this.publish(generation, { status: 'unavailable', budget: 0, routeBudgets: [] })
      return
    }
    try {
      const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetRead, {})
      const settings = result.ok ? settingsOf(result.value) : undefined
      this.publish(generation, settings === undefined
        ? { status: 'unavailable', budget: 0, routeBudgets: [] }
        : { status: 'ready', budget: settings.rolling30DayBudget, routeBudgets: settings.routeBudgets })
    } catch (_budgetReadFailure) {
      this.publish(generation, { status: 'unavailable', budget: 0, routeBudgets: [] })
    }
  }

  /** Persist one whole-token global rolling budget and return the durable value. */
  setBudget(rolling30DayBudget: number): Promise<number> {
    if (!Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) {
      return Promise.resolve(this.store.getSnapshot().budget)
    }
    return this.enqueue(async () => (await this.writeSettings({ rolling30DayBudget })).budget)
  }

  /** Add, replace, or remove one exact-route rolling budget; zero removes it. */
  setRouteBudget(provider: string, model: string, rolling30DayBudget: number): Promise<void> {
    if (provider.length === 0 || provider.length > 256 || model.length === 0 || model.length > 256
      || !Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) return Promise.resolve()
    return this.enqueue(async () => {
      const current = this.store.getSnapshot().routeBudgets
      const key = routeKey({ provider, model })
      const routeBudgets = current
        .filter(route => routeKey(route) !== key)
        .concat(rolling30DayBudget === 0 ? [] : [{ provider, model, rolling30DayBudget }])
        .sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
      if (routeBudgets.length > MAX_ROUTE_BUDGETS) return
      await this.writeSettings({ routeBudgets })
    })
  }

  /** Serialize settings writes so each patch is based on the latest durable snapshot. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.writeQueue.then(operation)
    this.writeQueue = queued.then(() => undefined, () => undefined)
    return queued
  }

  /** Execute one queued settings patch and publish the Host-returned durable value. */
  private async writeSettings(payload: Record<string, unknown>): Promise<TokenUsageBudgetSnapshot> {
    if (this.disposed) return this.store.getSnapshot()
    const previous = this.store.getSnapshot()
    const fallback = previous.status === 'ready'
      ? previous
      : { status: 'unavailable' as const, budget: 0, routeBudgets: [] }
    const generation = ++this.generation
    if (!this.connection.isLoopback) {
      this.publish(generation, fallback)
      return fallback
    }
    try {
      const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetWrite, payload)
      const settings = result.ok ? settingsOf(result.value) : undefined
      const next = settings === undefined
        ? fallback
        : { status: 'ready' as const, budget: settings.rolling30DayBudget, routeBudgets: settings.routeBudgets }
      this.publish(generation, next)
      return next
    } catch (_budgetWriteFailure) {
      this.publish(generation, fallback)
      return fallback
    }
  }

  /** Stop all late asynchronous publications after the owning Client fiber disposes. */
  dispose(): void {
    this.disposed = true
    this.generation += 1
  }

  /** Publish only the latest request result while this controller remains owned. */
  private publish(generation: number, next: TokenUsageBudgetSnapshot): void {
    if (this.disposed || generation !== this.generation) return
    this.store.set(next)
  }
}
