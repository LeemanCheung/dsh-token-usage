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
    expect(await controller.setBudget(200)).toBe(100)
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', budget: 100 })

    expect(await controller.setBudget(300)).toBe(300)
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', budget: 300 })
  })

  it('serializes overlapping writes so a later failure keeps the last durable success', async () => {
    let resolveFirst: ((value: { ok: true; value: { rolling30DayBudget: number } }) => void) | undefined
    const call = vi.fn(async (_channel: string, endpoint: string, payload: unknown) => {
      if (endpoint === 'budget/read') return { ok: true as const, value: { rolling30DayBudget: 100 } }
      const budget = (payload as { rolling30DayBudget: number }).rolling30DayBudget
      if (budget === 200) {
        return await new Promise<{ ok: true; value: { rolling30DayBudget: number } }>((resolve) => { resolveFirst = resolve })
      }
      throw new Error('temporary failure')
    })
    const controller = new TokenUsageBudgetController({ isLoopback: true, rpc: { call } } as never)
    await controller.load()

    const first = controller.setBudget(200)
    const second = controller.setBudget(300)
    await vi.waitFor(() => { expect(resolveFirst).toBeTypeOf('function') })
    expect(call).toHaveBeenCalledTimes(2)
    resolveFirst?.({ ok: true, value: { rolling30DayBudget: 200 } })

    await expect(Promise.all([first, second])).resolves.toEqual([200, 200])
    expect(controller.store.getSnapshot()).toEqual({ status: 'ready', budget: 200 })
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('does not call the Host for an invalid local budget', async () => {
    const call = vi.fn()
    const controller = new TokenUsageBudgetController({ isLoopback: true, rpc: { call } } as never)

    await controller.setBudget(-1)

    expect(call).not.toHaveBeenCalled()
  })
})
