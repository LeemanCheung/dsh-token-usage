import { existsSync, readFileSync, writeFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function write(path, content) {
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

function replaceExact(path, before, after) {
  const source = read(path)
  if (!source.includes(before)) {
    throw new Error(`Expected source fragment was not found in ${path}`)
  }
  write(path, source.replace(before, after))
}

replaceExact(
  'src/projection.ts',
  `    if (previous !== null\n      && previous.route.provider === route.provider\n      && previous.route.model === route.model\n      && bucketsEqual(previous.usage, usage)) return state`,
  `    if (previous !== null\n      && previous.route.provider === route.provider\n      && previous.route.model === route.model\n      && previous.day === day\n      && bucketsEqual(previous.usage, usage)) return state`,
)

replaceExact(
  'src/client/TokenUsageSection.tsx',
  `function isUnattributed(model: ModelTokenUsageRecord): boolean {\n  return model.provider === '' && model.model === ''\n}`,
  `export function isUnattributed(model: ModelTokenUsageRecord): boolean {\n  return (model.provider === '' && model.model === '')\n    || (model.provider === 'unknown' && model.model === 'unknown')\n}`,
)

const projectionTestPath = 'tests/projection.spec.ts'
const projectionMarker = 'moves an identical final sample to its authoritative UTC day'
if (!read(projectionTestPath).includes(projectionMarker)) {
  const projectionTest = `\n\ndescribe('authoritative UTC day attribution', () => {\n  it('${projectionMarker}', () => {\n    const provisionalTime = Date.parse('2026-01-01T23:59:59.000Z')\n    const finalTime = Date.parse('2026-01-02T00:00:01.000Z')\n    const expectedUsage = {\n      uncachedInputTokens: 10,\n      outputTokens: 2,\n      cacheReadTokens: 5,\n      cacheWriteTokens: 1,\n    }\n    let state = definition.init()\n    state = definition.apply(state, event({\n      seq: 0,\n      time: provisionalTime - 1_000,\n      type: 'request/context',\n      data: { provider: 'deepseek', model: 'deepseek-chat' },\n    }))\n    state = definition.apply(state, event({\n      seq: 1,\n      time: provisionalTime,\n      type: 'assistant/chunk',\n      data: {\n        turn: 1,\n        step: 1,\n        chunk: {\n          type: 'usage',\n          usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 },\n        },\n      },\n    }))\n    state = definition.apply(state, event({\n      seq: 2,\n      time: finalTime,\n      type: 'assistant/message',\n      data: {\n        turn: 1,\n        step: 1,\n        message: {\n          id: 'message-midnight',\n          role: 'assistant',\n          content: [],\n          source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },\n        },\n        usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 1 },\n      },\n    }))\n\n    const view = definition.view(state)\n    expect(view.assistantRequests).toBe(1)\n    expect(view.usage).toEqual(expectedUsage)\n    expect(view.days).toEqual([{ date: '2026-01-02', usage: expectedUsage }])\n    expect(view.modelDays).toEqual([{\n      provider: 'deepseek',\n      model: 'deepseek-chat',\n      date: '2026-01-02',\n      usage: expectedUsage,\n    }])\n  })\n})\n`
  write(projectionTestPath, `${read(projectionTestPath).trimEnd()}${projectionTest}`)
}

const unattributedTestPath = 'tests/unattributed-route.client.spec.ts'
if (!existsSync(unattributedTestPath)) {
  write(unattributedTestPath, `import { describe, expect, it } from 'vitest'\nimport type { ModelTokenUsageRecord } from '../src/types.ts'\nimport { isUnattributed } from '../src/client/TokenUsageSection.tsx'\n\nconst usage = {\n  uncachedInputTokens: 1,\n  outputTokens: 0,\n  cacheReadTokens: 0,\n  cacheWriteTokens: 0,\n}\n\nfunction route(provider: string, model: string): ModelTokenUsageRecord {\n  return { provider, model, assistantRequests: 1, compactionRequests: 0, usage }\n}\n\ndescribe('unattributed route identities', () => {\n  it('excludes legacy and projection fallback identities from exact-route controls', () => {\n    expect(isUnattributed(route('', ''))).toBe(true)\n    expect(isUnattributed(route('unknown', 'unknown'))).toBe(true)\n    expect(isUnattributed(route('unknown', 'real-model'))).toBe(false)\n    expect(isUnattributed(route('deepseek', 'deepseek-chat'))).toBe(false)\n  })\n})\n`)
}

const readmePath = 'README.md'
let readme = read(readmePath)
if (!readme.includes('actions/workflows/ci.yml/badge.svg')) {
  readme = readme.replace(
    '  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f.svg" alt="MIT License"></a>',
    '  <a href="https://github.com/LeemanCheung/dsh-token-usage/actions/workflows/ci.yml"><img src="https://github.com/LeemanCheung/dsh-token-usage/actions/workflows/ci.yml/badge.svg" alt="CI"></a>\n  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2ea44f.svg" alt="MIT License"></a>',
  )
}
if (!readme.includes('## 🧪 开发验证')) {
  const validationSection = [
    '',
    '## 🧪 开发验证',
    '',
    '主仓库 CI 固定复用 DeepSeek Harness 的官方构建预设与工具链，而不是另行维护一套可能漂移的插件打包配置。每个 Pull Request 和主分支提交都会执行：',
    '',
    '- Host / Client TypeScript 严格类型检查；',
    '- 全量 Vitest 回归测试；',
    '- Host 与 Web Client bundle 重建，并校验提交的 `lib/` 产物没有漂移；',
    '- `npm pack --dry-run --json` 包内容校验。',
    '',
    'CI 当前固定在 DeepSeek Harness `fb82698709c39f1860b0ab0ed147e1fa30c1d5d0`（`dsh@0.1.0-rc.6` 发布提交）与 Node.js `22.19.0`。本地构建仍遵循 DSH 插件约定：将 DeepSeek Harness 仓库放在本仓库同级的 `../deepseek-harness`，再运行 `npm run typecheck && npm test && npm run build`。',
    '',
  ].join('\n')
  readme = readme.trimEnd() + validationSection
}
write(readmePath, readme)

console.log('Applied UTC-day attribution, fallback-route, regression-test, and README updates.')
