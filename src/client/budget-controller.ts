import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { TokenUsageBudgetSettings } from '../budget-settings.ts'
import { TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT } from '../rpc.ts'

/** One browser-visible state of the persistent rolling budget. */
export interface TokenUsageBudgetSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  budget: number
}

const INITIAL: TokenUsageBudgetSnapshot = { status: 'loading', budget: 0 }

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
    if (this.snapshot.status === next.status && this.snapshot.budget === next.budget) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}

/** Decode the one numeric setting returned by the private Host RPC. */
function settingsOf(value: unknown): TokenUsageBudgetSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const budget = (value as { rolling30DayBudget?: unknown }).rolling30DayBudget
  if (typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget < 0) return undefined
  return { rolling30DayBudget: budget }
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

  /** Fetch the durable budget unless the current page cannot call loopback-only endpoints. */
  async load(): Promise<void> {
    const generation = ++this.generation
    if (!this.connection.isLoopback) {
      this.publish(generation, { status: 'unavailable', budget: 0 })
      return
    }
    try {
      const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetRead, {})
      const settings = result.ok ? settingsOf(result.value) : undefined
      this.publish(generation, settings === undefined
        ? { status: 'unavailable', budget: 0 }
        : { status: 'ready', budget: settings.rolling30DayBudget })
    } catch (_budgetReadFailure) {
      this.publish(generation, { status: 'unavailable', budget: 0 })
    }
  }

  /** Persist one whole-token rolling budget and return the value that remains durable. */
  setBudget(rolling30DayBudget: number): Promise<number> {
    if (!Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) {
      return Promise.resolve(this.store.getSnapshot().budget)
    }
    const operation = this.writeQueue.then(() => this.writeBudget(rolling30DayBudget))
    this.writeQueue = operation.then(() => undefined, () => undefined)
    return operation
  }

  /** Execute one queued budget write against the latest published durable value. */
  private async writeBudget(rolling30DayBudget: number): Promise<number> {
    if (this.disposed) return this.store.getSnapshot().budget
    const previous = this.store.getSnapshot()
    const fallback = previous.status === 'ready' ? previous : { status: 'unavailable' as const, budget: 0 }
    const generation = ++this.generation
    if (!this.connection.isLoopback) {
      this.publish(generation, fallback)
      return fallback.budget
    }
    try {
      const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetWrite, { rolling30DayBudget })
      const settings = result.ok ? settingsOf(result.value) : undefined
      const next = settings === undefined ? fallback : { status: 'ready' as const, budget: settings.rolling30DayBudget }
      this.publish(generation, next)
      return next.budget
    } catch (_budgetWriteFailure) {
      this.publish(generation, fallback)
      return fallback.budget
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
