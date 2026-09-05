import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const harnessRoot = resolve(process.argv[2] ?? '../deepseek-harness')
const targetRoot = resolve(process.argv[3] ?? 'node_modules')
const linkType = process.platform === 'win32' ? 'junction' : 'dir'

if (!existsSync(join(harnessRoot, 'package.json'))) {
  throw new Error(`DeepSeek Harness checkout not found at ${harnessRoot}`)
}

rmSync(targetRoot, { force: true, recursive: true })
mkdirSync(targetRoot, { recursive: true })

function replaceLink(target, source) {
  mkdirSync(dirname(target), { recursive: true })
  rmSync(target, { force: true, recursive: true })
  symlinkSync(realpathSync(source), target, linkType)
}

function linkPackage(name, source) {
  replaceLink(join(targetRoot, ...name.split('/')), source)
}

/**
 * DSH 0.1.2 resolves a client preset's production externals from the Harness
 * workspace manifest roster. Expose a manifest-only copy under the dedicated
 * packages/external/dsh-token-usage bridge without replacing an unrelated
 * path. Node's Windows glob does not traverse directory junctions here, so a
 * physical one-file directory is required.
 */
function ensurePluginWorkspaceBridge() {
  const source = realpathSync(process.cwd())
  const bridge = join(harnessRoot, 'packages', 'external', 'dsh-token-usage')
  if (existsSync(bridge)) {
    if (realpathSync(bridge) === source) {
      rmSync(bridge, { force: true, recursive: true })
    } else {
      const existingManifest = join(bridge, 'package.json')
      const existingName = existsSync(existingManifest)
        ? JSON.parse(readFileSync(existingManifest, 'utf8')).name
        : undefined
      if (existingName !== 'dsh-token-usage') {
        throw new Error(`DeepSeek Harness workspace bridge already belongs to another checkout: ${bridge}`)
      }
    }
  }
  mkdirSync(bridge, { recursive: true })
  writeFileSync(join(bridge, 'package.json'), readFileSync(join(source, 'package.json')))
}

function mergeInstalledPackages(sourceRoot) {
  if (!existsSync(sourceRoot)) return
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name === '.pnpm') continue
    const source = join(sourceRoot, entry.name)
    // pnpm can leave platform-optional directory links whose targets are not
    // installed on this OS. They are not usable dependencies and realpathSync
    // would abort the whole local toolchain link on Windows.
    if (!existsSync(source)) continue
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const scoped of readdirSync(source, { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue
        const scopedSource = join(source, scoped.name)
        if (!existsSync(scopedSource)) continue
        linkPackage(`${entry.name}/${scoped.name}`, scopedSource)
      }
      continue
    }
    if (entry.isDirectory() || entry.isSymbolicLink()) linkPackage(entry.name, source)
  }
}

const workspacePackages = new Map()
function discoverWorkspacePackages(directory) {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'lib') continue
    const child = join(directory, entry.name)
    const manifestPath = join(child, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.name === 'string') workspacePackages.set(manifest.name, child)
      continue
    }
    discoverWorkspacePackages(child)
  }
}

const virtualStore = join(harnessRoot, 'node_modules', '.pnpm')
ensurePluginWorkspaceBridge()
if (existsSync(virtualStore)) replaceLink(join(targetRoot, '.pnpm'), virtualStore)
mergeInstalledPackages(join(virtualStore, 'node_modules'))
mergeInstalledPackages(join(harnessRoot, 'node_modules'))
discoverWorkspacePackages(join(harnessRoot, 'vendor'))
discoverWorkspacePackages(join(harnessRoot, 'packages'))
discoverWorkspacePackages(join(harnessRoot, 'native'))

for (const [name, source] of workspacePackages) linkPackage(name, source)

const binaries = join(harnessRoot, 'node_modules', '.bin')
if (existsSync(binaries)) replaceLink(join(targetRoot, '.bin'), binaries)

console.log(`Linked ${workspacePackages.size} DeepSeek Harness workspace packages into ${targetRoot}.`)
