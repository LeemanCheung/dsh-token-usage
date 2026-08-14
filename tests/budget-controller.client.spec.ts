import { describe, expect, it, vi } from 'vitest'
import { TokenUsageBudgetController } from '../src/client/budget-controller.ts'

describe('TokenUsageBudgetController', () => {
  it('reads and writes the loopback-persisted rolling budget', async () => {
    const call = vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
      if (endpoint === 'budget/read') return { ok: true as const, value: { rolling30DayBudget: 100 } }
      expect(payload).toEqual({ rolling30DayBudget: 250 })
      return { ok: true as const, value: { rolling30DayBudget: 250 } }
    })
    const controller = new TokenUsageBudgetController({
      isLoopback: true,
      rpc: { call },
    } as never)

    await controller.load()
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', budget: 100 })

    await controller.setBudget(250)
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', budget: 250 })
    expect(call).toHaveBeenNthCalledWith(1, '/token-usage', 'budget/read', {})
    expect(call).toHaveBeenNthCalledWith(2, '/token-usage', 'budget/write', { rolling30DayBudget: 250 })
  })

  it('keeps the last durable budget editable after a transient write failure', async () => {
    let writes = 0
    const call = vi.fn(async (_channel: string, endpoint: string) => {
      if (endpoint === 'budget/read') return { ok: true as const, value: { rolling30DayBudget: 100 } }
      writes += 1
      if (writes === 1) throw new Error('temporary failure')
      return { ok: true as const, value: { rolling30DayBudget: 300 } }
    })
    const controller = new TokenUsageBudgetController({ isLoopback: true, rpc: { call } } as never)

    await controller.load()
    await controller.setBudget(200)
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', budget: 100 })

    await controller.setBudget(300)
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', budget: 300 })
  })

  it('does not call the Host for an invalid local budget', async () => {
    const call = vi.fn()
    const controller = new TokenUsageBudgetController({ isLoopback: true, rpc: { call } } as never)

    await controller.setBudget(-1)

    expect(call).not.toHaveBeenCalled()
  })
})
