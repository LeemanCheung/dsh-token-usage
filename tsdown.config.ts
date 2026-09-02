import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, posix, relative, resolve as resolvePath, sep, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import { clientBundle } from '../deepseek-harness/packages/client/tsdown.client.ts'

const PLUGIN_ID = 'dsh-token-usage'
const PACKAGE_ROOT = fileURLToPath(new URL('.', import.meta.url))
const CANONICAL_CSS_PROJECT_ROOT = '/dsh-plugin-build'
export const CSS_MODULE_PATTERN = `${PLUGIN_ID}_[local]`
const baseConfig = clientBundle(PLUGIN_ID, ['src/index.ts'])

interface BuildHookContext {
  addWatchFile(path: string): void
}

interface SourceMapShape {
  sources?: unknown
  sourcesContent?: unknown
  [key: string]: unknown
}

/** Resolve emitted lib/types CSS imports back to their package source file. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}

/** Return the stable POSIX path of one package-owned build input. */
function packageRelativePath(fileId: string): string {
  const relativePath = relative(PACKAGE_ROOT, fileId)
  if (
    relativePath === ''
    || relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(`dsh-token-usage build: input escaped package root: ${fileId}`)
  }
  return relativePath.split(sep).join('/')
}

/**
 * Return the OS-independent virtual paths used as Lightning CSS hash input.
 *
 * A fixed POSIX namespace keeps path-aware CSS transforms independent of the
 * maintainer checkout. CSS Module names deliberately use a literal plugin
 * namespace instead of Lightning CSS's path-based `[hash]`, whose path
 * semantics still differ between Windows and Linux.
 */
export function canonicalCssLocation(packagePath: string): {
  filename: string
  projectRoot: string
} {
  if (
    packagePath === ''
    || packagePath === '..'
    || packagePath.startsWith('../')
    || packagePath.includes('\\')
    || posix.isAbsolute(packagePath)
  ) {
    throw new Error(`dsh-token-usage build: invalid package-relative CSS path: ${packagePath}`)
  }
  return {
    filename: posix.join(CANONICAL_CSS_PROJECT_ROOT, PLUGIN_ID, packagePath),
    projectRoot: CANONICAL_CSS_PROJECT_ROOT,
  }
}

/** Build the shared preset's virtual module with path-stable, sorted exports. */
async function deterministicCssModule(this: BuildHookContext, fileId: string): Promise<string> {
  const packagePath = packageRelativePath(fileId)

  this.addWatchFile(fileId)
  const source = Buffer.from((await readFile(fileId, 'utf8')).replace(/\r\n?/g, '\n'))
  const logicalLocation = canonicalCssLocation(packagePath)
  const { code, exports: cssExports } = transform({
    // The plugin id provides collision isolation without relying on the host's
    // interpretation of path separators inside Lightning CSS's `[hash]`.
    filename: logicalLocation.filename,
    projectRoot: logicalLocation.projectRoot,
    code: source,
    cssModules: { pattern: CSS_MODULE_PATTERN },
    minify: true,
  })
  const classMap = Object.fromEntries(
    Object.entries(cssExports ?? {})
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([local, value]) => [local, value.name]),
  )
  const tagId = `${PLUGIN_ID}/${basename(fileId)}`
  return [
    `const css = ${JSON.stringify(code.toString())};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/** Normalize embedded source text before Rolldown writes the map asset. */
function canonicalSourceMapPlugin() {
  return {
    name: 'dsh-token-usage-canonical-sourcemap',
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      let normalized = 0
      for (const output of Object.values(bundle)) {
        if (
          typeof output !== 'object'
          || output === null
          || !('type' in output)
          || output.type !== 'asset'
          || !('fileName' in output)
          || typeof output.fileName !== 'string'
          || !output.fileName.endsWith('.map')
          || !('source' in output)
        ) continue
        const raw = typeof output.source === 'string'
          ? output.source
          : output.source instanceof Uint8Array
            ? Buffer.from(output.source).toString('utf8')
            : undefined
        if (raw === undefined) throw new Error('dsh-token-usage build: source map asset has no text')
        const map = JSON.parse(raw) as SourceMapShape
        if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) {
          throw new Error('dsh-token-usage build: source map lacks sources or sourcesContent')
        }
        if (map.sources.some(source => (
          typeof source !== 'string'
          || /^file:/i.test(source)
          || posix.isAbsolute(source)
          || win32.isAbsolute(source)
        ))) {
          throw new Error('dsh-token-usage build: source map contains an absolute source path')
        }
        map.sourcesContent = map.sourcesContent.map(content => (
          typeof content === 'string' ? content.replace(/\r\n?/g, '\n') : content
        ))
        output.source = JSON.stringify(map)
        normalized++
      }
      if (normalized !== 1) {
        throw new Error(`dsh-token-usage build: expected one source map asset, normalized ${normalized}`)
      }
    },
  }
}

/**
 * The shared rc.6 preset at DSH `fb82698709c39f1860b0ab0ed147e1fa30c1d5d0`
 * feeds Lightning CSS an absolute filename without a
 * projectRoot and serializes its export table in insertion order. That makes
 * committed bundles vary by checkout path and sometimes by repeated build.
 * Replace only that named plugin's CSS load result before Rolldown builds the
 * graph; the dirty shared Harness checkout stays untouched and source maps are
 * generated from the deterministic virtual module rather than patched later.
 */
export default (inlineConfig: Parameters<typeof baseConfig>[0]) => {
  let wrapped = 0
  const configs = baseConfig(inlineConfig).map((config) => {
    if (!Array.isArray(config.plugins)) return config
    const plugins = config.plugins.map((entry) => {
      if (
        typeof entry !== 'object'
        || entry === null
        || !('name' in entry)
        || entry.name !== 'dsh-css-modules-inline'
      ) return entry
      if (
        !('resolveId' in entry)
        || typeof entry.resolveId !== 'function'
        || !('load' in entry)
        || typeof entry.load !== 'function'
      ) {
        throw new Error('dsh-token-usage build: CSS module hooks are not callable')
      }

      wrapped++
      const cssFiles = new Map<string, string>()
      const resolveId = entry.resolveId as (this: unknown, ...args: unknown[]) => unknown
      const load = entry.load as (this: unknown, ...args: unknown[]) => unknown
      return {
        ...entry,
        async resolveId(this: unknown, ...args: unknown[]) {
          const result = await resolveId.apply(this, args)
          const source = args[0]
          const importer = args[1]
          if (typeof source !== 'string' || !source.endsWith('.module.css')) return result
          const resolvedId = typeof result === 'string'
            ? result
            : typeof result === 'object' && result !== null && 'id' in result && typeof result.id === 'string'
              ? result.id
              : undefined
          if (resolvedId === undefined) {
            throw new Error(`dsh-token-usage build: CSS resolver returned no id for ${source}`)
          }
          const fileId = typeof importer === 'string'
            ? sourceAssetPath(source, importer)
            : resolvePath(PACKAGE_ROOT, source)
          const stableId = `\0${PLUGIN_ID}-css:${packageRelativePath(fileId)}.mjs`
          cssFiles.set(stableId, fileId)
          if (typeof result === 'string') return stableId
          if (typeof result === 'object' && result !== null) return { ...result, id: stableId }
          throw new Error(`dsh-token-usage build: CSS resolver returned an invalid result for ${source}`)
        },
        async load(this: BuildHookContext, ...args: unknown[]) {
          const virtualId = args[0]
          const fileId = typeof virtualId === 'string' ? cssFiles.get(virtualId) : undefined
          if (fileId !== undefined) return deterministicCssModule.call(this, fileId)
          const result = await load.apply(this, args)
          if (result === null || result === undefined) return result
          throw new Error('dsh-token-usage build: unrecorded CSS virtual module reached load')
        },
      }
    })
    if (config.name === `${PLUGIN_ID}/client`) plugins.push(canonicalSourceMapPlugin())
    return { ...config, plugins }
  })

  const includesClient = configs.some(config => config.name === `${PLUGIN_ID}/client`)
  if (includesClient && wrapped !== 1) {
    throw new Error(`dsh-token-usage build: expected one CSS module plugin, wrapped ${wrapped}`)
  }
  return configs
}
