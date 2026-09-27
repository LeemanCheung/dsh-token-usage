import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { transform } from 'lightningcss'
import { build } from 'rolldown'
import { describe, expect, it, vi } from 'vitest'
import buildConfig, { canonicalCssLocation, CSS_MODULE_PATTERN } from '../tsdown.config.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const cssPath = resolvePath(root, 'src/client/TokenThroughput.module.css')
const cssSource = readFileSync(cssPath)
const manifest = JSON.parse(readFileSync(resolvePath(root, 'package.json'), 'utf8')) as {
  version: string
  dsh?: { client?: { inject?: string[] }; compatibility?: { dshReleases?: Record<string, string> } }
}

describe('DSH 0.1.2 package contract', () => {
  it('uses the replacement client services and keeps live compatibility unclaimed', () => {
    expect(manifest.version).toBe('0.5.0')
    expect(manifest.dsh?.client?.inject).not.toContain('@deepseek-ai/dsh-client-runtime')
    expect(manifest.dsh?.client?.inject).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-api-session-controller',
      '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-ui-renderer',
    ]))
    expect(manifest.dsh?.compatibility?.dshReleases?.['0.1.2-rc.1']).toBe('compatible')
  })
})

function cssClassMap(projectRoot: string, packageId: string, pattern: string): Record<string, string> {
  const result = transform({
    filename: resolvePath(projectRoot, packageId, 'src/client/TokenThroughput.module.css'),
    projectRoot,
    code: cssSource,
    cssModules: { pattern },
    minify: true,
  })
  return Object.fromEntries(Object.entries(result.exports ?? {}).map(([key, value]) => [key, value.name]))
}

describe('deterministic client build config', () => {
  it('uses a fixed POSIX namespace for cross-platform CSS module hashes', () => {
    expect(canonicalCssLocation('src/client/TokenUsageSection.module.css')).toEqual({
      filename: '/dsh-plugin-build/dsh-token-usage/src/client/TokenUsageSection.module.css',
      projectRoot: '/dsh-plugin-build',
    })
    expect(canonicalCssLocation('src/client/TokenThroughput.module.css').filename).not.toContain('\\')
    expect(() => canonicalCssLocation('../outside.module.css')).toThrow(/invalid package-relative CSS path/)
    expect(() => canonicalCssLocation('src\\client\\outside.module.css')).toThrow(/invalid package-relative CSS path/)
  })

  it('keeps CSS module names stable across checkout roots and scoped by package', () => {
    const rootA = resolvePath(dirname(root), 'checkout-a')
    const rootB = resolvePath(dirname(root), 'checkout-b')
    expect(cssClassMap(rootA, 'dsh-token-usage', CSS_MODULE_PATTERN)).toEqual(
      cssClassMap(rootB, 'dsh-token-usage', CSS_MODULE_PATTERN),
    )
    expect(cssClassMap(rootA, 'dsh-token-usage', CSS_MODULE_PATTERN)).not.toEqual(
      cssClassMap(rootA, 'another-plugin', 'another-plugin_[local]'),
    )
  })

  it('replaces the shared CSS load hook with a sorted, watched virtual module', async () => {
    const client = buildConfig({}).find(config => config.name === 'dsh-token-usage/client')
    expect(client).toBeDefined()
    expect(Array.isArray(client?.plugins)).toBe(true)
    const plugin = Array.isArray(client?.plugins)
      ? client.plugins.find(entry => typeof entry === 'object' && entry !== null && 'name' in entry && entry.name === 'dsh-css-modules-inline')
      : undefined
    expect(plugin).toBeDefined()
    if (
      typeof plugin !== 'object'
      || plugin === null
      || !('resolveId' in plugin)
      || typeof plugin.resolveId !== 'function'
      || !('load' in plugin)
      || typeof plugin.load !== 'function'
    ) throw new Error('CSS build plugin hooks are unavailable')

    const addWatchFile = vi.fn()
    const context = { addWatchFile }
    const importer = resolvePath(root, 'src/client/TokenThroughput.tsx')
    const resolveId = plugin.resolveId as (this: unknown, ...args: unknown[]) => unknown
    const load = plugin.load as (this: unknown, ...args: unknown[]) => unknown
    const resolved = await resolveId.call(context, './TokenThroughput.module.css', importer)
    const resolvedId = typeof resolved === 'string'
      ? resolved
      : typeof resolved === 'object' && resolved !== null && 'id' in resolved && typeof resolved.id === 'string'
        ? resolved.id
        : undefined
    expect(resolvedId).toBeDefined()
    expect(resolvedId).toBe('\0dsh-token-usage-css:src/client/TokenThroughput.module.css.mjs')
    expect(resolvedId).not.toContain(root)
    const moduleSource = await load.call(context, resolvedId!)
    expect(typeof moduleSource).toBe('string')
    expect(addWatchFile).toHaveBeenCalledWith(cssPath)

    const lastLine = String(moduleSource).split('\n').at(-1)
    expect(lastLine?.startsWith('export default ')).toBe(true)
    const classMap = JSON.parse(lastLine!.slice('export default '.length, -1)) as Record<string, string>
    expect(Object.keys(classMap)).toEqual([...Object.keys(classMap)].sort())
    expect(classMap).toMatchObject({
      activeCount: 'dsh-token-usage_activeCount',
      headerMetric: 'dsh-token-usage_headerMetric',
      sidebarMetric: 'dsh-token-usage_sidebarMetric',
    })
    expect(String(moduleSource)).toContain('tag.dataset.plugin = "dsh-token-usage"')
    expect(String(moduleSource)).toContain('dsh-token-usage/TokenThroughput.module.css')
  })

  it('normalizes source-map line endings and rejects absolute source paths', () => {
    const client = buildConfig({}).find(config => config.name === 'dsh-token-usage/client')
    const plugin = Array.isArray(client?.plugins)
      ? client.plugins.find(entry => typeof entry === 'object' && entry !== null && 'name' in entry && entry.name === 'dsh-token-usage-canonical-sourcemap')
      : undefined
    if (
      typeof plugin !== 'object'
      || plugin === null
      || !('generateBundle' in plugin)
      || typeof plugin.generateBundle !== 'function'
    ) throw new Error('canonical source-map hook is unavailable')
    const generateBundle = plugin.generateBundle as (this: unknown, ...args: unknown[]) => unknown
    const mapAsset = {
      type: 'asset',
      fileName: 'client.js.map',
      source: JSON.stringify({
        version: 3,
        sources: [
          '../src/client/index.ts',
          '../../deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/index.js',
          '../../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/index.js',
        ],
        sourcesContent: ['first\r\nsecond\rthird', 'dependency', 'dependency'],
        names: [],
        mappings: '',
      }),
    }
    generateBundle.call({}, {}, { 'client.js.map': mapAsset })
    expect(JSON.parse(mapAsset.source).sourcesContent).toEqual(['first\nsecond\nthird', 'dependency', 'dependency'])
    expect(JSON.parse(mapAsset.source).sources).toEqual([
      '../src/client/index.ts',
      '../node_modules/.pnpm/zod@4.4.3/node_modules/zod/index.js',
      '../node_modules/.pnpm/zod@4.4.3/node_modules/zod/index.js',
    ])

    for (const source of ['C:/private/source.ts', '\\\\server\\share\\source.ts', 'file:///C:/private/source.ts']) {
      mapAsset.source = JSON.stringify({
        version: 3,
        sources: [source],
        sourcesContent: ['safe'],
        names: [],
        mappings: '',
      })
      expect(() => generateBundle.call({}, {}, { 'client.js.map': mapAsset })).toThrow(/absolute source path/)
    }
  })

  it('renders dependency layouts identically while preserving licenses, literal text and source positions', async () => {
    const client = buildConfig({}).find(config => config.name === 'dsh-token-usage/client')
    const normalizer = Array.isArray(client?.plugins)
      ? client.plugins.find(entry => typeof entry === 'object' && entry !== null && 'name' in entry && entry.name === 'dsh-token-usage-canonical-sourcemap')
      : undefined
    if (!client || !normalizer) throw new Error('client build policy is unavailable')
    const text = 'before\n//#region ../deepseek-harness/node_modules/vendor/private.js\nafter'
    const source = `/*! @license fixture MIT */\nexport const literal = String.raw\`${text}\`;`
    const render = async (layout: string) => {
      const result = await build({
        input: 'fixture', write: false,
        plugins: [{
          name: 'dependency-fixture',
          resolveId: () => resolvePath(root, layout, 'node_modules/vendor/index.js'),
          load: () => source,
        }, normalizer],
        output: { format: 'cjs', file: 'client.js', sourcemap: true, minify: client.minify },
      })
      const chunk = result.output.find(output => output.type === 'chunk')
      const asset = result.output.find(output => output.type === 'asset' && output.fileName === 'client.js.map')
      if (!chunk || !asset || asset.type !== 'asset') throw new Error('fixture bundle or map is missing')
      const map = JSON.parse(String(asset.source))
      const module = { exports: {} as { literal?: string } }
      runInNewContext(chunk.code, { module, exports: module.exports })
      expect(module.exports.literal).toBe(text)
      expect(chunk.code).toContain('/*! @license fixture MIT */')
      expect(map.sourcesContent).toEqual([source])
      const location = chunk.code.slice(0, chunk.code.indexOf('String.raw')).split('\n')
      expect(originalPositionFor(new TraceMap(map), { line: location.length, column: location.at(-1)!.length }))
        .toMatchObject({ source: '../node_modules/vendor/index.js', line: 2 })
      return { code: chunk.code, map }
    }
    expect(await render('../deepseek-harness')).toEqual(await render('../../_temp/deepseek-harness'))
  })
})
