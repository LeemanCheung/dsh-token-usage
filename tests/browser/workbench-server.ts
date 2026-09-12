import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createWorkbenchHost } from '../../src/workbench/host.ts'
import { stateSchema } from '../../src/workbench/schema.ts'
import { fixtureSessionId, fixtureNow, insightFixture, workbenchEvents } from '../workbench.fixture.ts'

// Stable synthetic clock; no real provider traffic or production session mutation.
const NativeDate = Date
let fixtureTime = fixtureNow - 86400000
class FixtureDate extends NativeDate {
  constructor(value?: string | number) { super(value === undefined ? fixtureTime : value) }
  static now() { return fixtureTime }
}
globalThis.Date = FixtureDate as DateConstructor
let eventOffset = 0
const sessionEvents = () => workbenchEvents().map(event => ({ ...event, time: event.time + eventOffset }))
const directory = resolve('test-results/workbench')
await mkdir(directory, { recursive: true })
const statePath = resolve(directory, 'fixture-state.json')
let data = existsSync(statePath) ? readFileSync(statePath, 'utf8') : ''
const settings = { get: () => ({ data }), update: async (patch: { data: string }) => {
  await writeFile(`${statePath}.tmp`, patch.data, { mode: 0o600 }); await rename(`${statePath}.tmp`, statePath); data = patch.data
} }
const context = {
  settings: { register: () => settings }, logger: { warn: () => {} },
  sessions: { get: (id: string) => id === fixtureSessionId ? { snapshotEvents: sessionEvents } : undefined },
  sessionQuery: { readSession: async () => { throw new Error('Unknown fixture session') } },
} as unknown as Context
const host = createWorkbenchHost(context)
const server = createServer(async (req, res) => {
  const lifecycle = new AbortController()
  req.on('aborted', () => lifecycle.abort())
  res.on('close', () => { if (!res.writableEnded) lifecycle.abort() })
  const json = (value: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
  try {
    if (req.method === 'GET' && req.url === '/fixture') { json([insightFixture()]); return }
    if (req.method === 'GET' && req.url === '/workbench.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(await readFile(resolve(directory, 'workbench.js'))); return }
    if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workbench acceptance fixture</title><style>body{margin:0;background:#f8f9fc;color:#1f2937;font-family:system-ui,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/workbench.js"></script></body></html>'); return
    }
    if (req.method !== 'POST') { json({ error: 'Not found' }, 404); return }
    let body = ''
    for await (const chunk of req) { body += chunk; if (body.length > 3_000_000) throw new Error('Fixture payload too large') }
    if (req.url?.startsWith('/rpc/')) { json(await host.handle(decodeURIComponent(req.url.slice(5)), body ? JSON.parse(body) : {}, lifecycle.signal)); return }
    if (req.url === '/test/advance-session') { eventOffset += 60000; fixtureTime += 60000; json({ ok: true }); return }
    if (req.url === '/test/analysis') {
      const llm = { prepareCall: async () => ({ stream: async function* () { yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } }; yield { type: 'usage', usage: { inputTokens: 9, outputTokens: 5 } } } }) } as unknown as Context['llm']
      await host.track(llm, 'usage-analysis', { provider: 'fixture-provider', model: 'fixture-model' }, lifecycle.signal, async tracked => {
        const prepared = await (tracked.prepareCall as (...args: unknown[]) => Promise<{ stream(): AsyncIterable<unknown> }>)({})
        for await (const _chunk of prepared.stream()) { /* exercise the real tracker */ }
      }, body && JSON.parse(body).requestId ? { requestId: String(JSON.parse(body).requestId), fingerprint: 'fixed synthetic analysis' } : undefined)
      json({ ok: true }); return
    }
    if (req.url === '/test/concurrent-edit') {
      const current = await host.handle('workbench/read', {}, lifecycle.signal)
      if (!current.ok) throw new Error(current.error.message)
      const state = stateSchema.parse(current.value)
      json(await host.handle('workbench/config', { revision: state.revision, config: state.config }, lifecycle.signal)); return
    }
    json({ error: 'Not found' }, 404)
  } catch (error) { if (!res.headersSent) json({ error: error instanceof Error ? error.message : String(error) }, 500); else res.end() }
})
server.listen(18768, '127.0.0.1', () => console.log('Workbench E2E fixture listening on 127.0.0.1:18768'))
process.on('SIGTERM', () => { host.dispose(); server.close(() => process.exit(0)) })
