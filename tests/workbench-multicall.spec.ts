import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { createWorkbenchHost } from '../src/workbench/host.ts'
import { stateSchema } from '../src/workbench/schema.ts'

function fixture() {
  let data = ''
  const host = createWorkbenchHost({ settings: { register: () => ({ get: () => ({ data }), update: async (value: { data: string }) => { data = value.data } }) }, logger: { warn: () => {} } } as unknown as Context)
  const llm = { prepareCall: async () => ({ stream: async function* (reported = true) {
    if (reported) { yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }; yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 5 } } }
  } }) } as unknown as Context['llm']
  return { host, llm }
}
describe('multi-call auxiliary accounting', () => {
  it('adds different calls while replacing each stream cumulative report', async () => {
    const { host, llm } = fixture(), signal = new AbortController().signal
    await host.track(llm, 'usage-analysis', { provider: 'p', model: 'm' }, signal, async service => {
      for (let i = 0; i < 2; i++) {
        const prepared = await (service.prepareCall as (...args: unknown[]) => Promise<{ stream(): AsyncIterable<unknown> }>)({})
        for await (const _chunk of prepared.stream()) { /* exhaust stream */ }
      }
    })
    const result = await host.handle('workbench/read', {}, signal)
    if (!result.ok) throw new Error(result.error.message)
    expect(stateSchema.parse(result.value).ledger[0]).toMatchObject({ finality: 'authoritative', usage: { uncachedInputTokens: 40, outputTokens: 10 } })
  })
  it('does not call an aggregate authoritative when another stream never reports usage', async () => {
    const { host, llm } = fixture(), signal = new AbortController().signal
    await host.track(llm, 'usage-analysis', { provider: 'p', model: 'm' }, signal, async service => {
      const prepared = await (service.prepareCall as (...args: unknown[]) => Promise<{ stream(reported: boolean): AsyncIterable<unknown> }>)({})
      for await (const _chunk of prepared.stream(true)) { /* known usage */ }
      for await (const _chunk of prepared.stream(false)) { /* unknown usage */ }
    })
    const result = await host.handle('workbench/read', {}, signal)
    if (!result.ok) throw new Error(result.error.message)
    expect(stateSchema.parse(result.value).ledger[0]).toMatchObject({ finality: 'provisional', status: 'completed' })
  })
})
