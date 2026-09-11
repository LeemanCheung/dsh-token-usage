import { readFileSync, writeFileSync, existsSync } from 'node:fs'
function replace(path, before, after) {
  const text = readFileSync(path, 'utf8')
  if (text.includes(after)) return
  if (text.split(before).length !== 2) throw new Error(`Integration anchor changed: ${path}: ${before.slice(0, 100)}`)
  writeFileSync(path, text.replace(before, after))
}
replace('src/trajectory-analysis.ts',
  'export function prepareTrajectory(events: readonly SessionEvent[]): PreparedTrajectory {',
  'export function prepareTrajectory(events: readonly SessionEvent[], localRoutes?: Map<string, { provider: string; model: string }>): PreparedTrajectory {')
replace('src/trajectory-analysis.ts', '    routeAliases.set(key, alias)\n    return alias', '    routeAliases.set(key, alias)\n    localRoutes?.set(alias.model, { ...value })\n    return alias')
replace('src/index.ts', "import { analyzeTrajectory } from './trajectory-analysis.ts'", "import { analyzeTrajectory } from './trajectory-analysis.ts'\nimport { createWorkbenchHost } from './workbench/host.ts'")
replace('src/index.ts', '  const activeProgress = new Map<string, ActiveAnalysisProgress>()', "  let workbench: ReturnType<typeof createWorkbenchHost> | undefined\n  const getWorkbench = () => workbench ??= createWorkbenchHost(ctx)\n  const activeProgress = new Map<string, ActiveAnalysisProgress>()")
replace('src/index.ts', '      const operationSignal = AbortSignal.any([signal, lifecycle.signal])\n      switch (endpoint)', "      const operationSignal = AbortSignal.any([signal, lifecycle.signal])\n      if (endpoint.startsWith('workbench/')) return getWorkbench().handle(endpoint, payload, operationSignal)\n      switch (endpoint)")
replace('src/index.ts', `value: await withProgress(request.progressId, report => analyzeTokenUsage(
              { llm: runtime.llm },
              request.input,
              request.model,
              request.language,
              analysisSignal,
              report,
            )),`, `value: await withProgress(request.progressId, report => getWorkbench().track(runtime.llm, 'usage-analysis', request.model, analysisSignal, llm => analyzeTokenUsage(
              { llm },
              request.input,
              request.model,
              request.language,
              analysisSignal,
              report,
            ))),`)
replace('src/index.ts', `return analyzeTrajectory(
                { llm: runtime.llm },
                request.sessionId,
                events,
                request.model,
                request.language,
                analysisSignal,
                report,
              )`, `return getWorkbench().track(runtime.llm, 'trajectory-analysis', request.model, analysisSignal, llm => analyzeTrajectory(
                { llm },
                request.sessionId,
                events,
                request.model,
                request.language,
                analysisSignal,
                report,
              ))`)
replace('src/index.ts', "      lifecycle.abort(new Error('token usage plugin disposed'))\n      await dispose()", "      lifecycle.abort(new Error('token usage plugin disposed'))\n      workbench?.dispose()\n      await dispose()")
if (existsSync('src/client/workbench/register.tsx')) {
  replace('src/client/index.ts', "import { TokenUsageSection } from './TokenUsageSection.tsx'", "import { TokenUsageSection } from './TokenUsageSection.tsx'\nimport { registerWorkbench } from './workbench/register.tsx'")
  replace('src/client/index.ts', '  const t = ctx.locale.bind(NS)', '  registerWorkbench(ctx, connection)\n  const t = ctx.locale.bind(NS)')
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
pkg.version = '0.4.0'
if (!pkg.files.includes('docs/workbench.md')) pkg.files.push('docs/workbench.md')
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
let readme = readFileSync('README.md', 'utf8').replaceAll('0.3.2', '0.4.0').replaceAll('sessionPersistence.inspect()', 'sessionQuery.readSession()')
if (!readme.includes('## 本地用量工作台')) readme += '\n\n## 本地用量工作台（0.4.0）\n\n在设置中打开 **用量工作台 / Usage workbench**。新增无需模型的体检、用量收据、版本化自定义价卡、辅助分析账本、变化归因、项目预算、优化实验室、情景试算与本地周报。原有 Token 用量页和账本口径保持不变。\n\n配置及辅助账本保存在 Host 的 `token-usage-workbench` settings；本地体检只读取元数据，不调用模型。价格是参考估算，不是账单；不同币种不相加。详见 [工作台使用与数据边界](docs/workbench.md)。\n'
writeFileSync('README.md', readme)
if (existsSync('scripts/run-workbench-e2e.sh')) {
  replace('.github/workflows/ci.yml', '      - name: Rebuild committed bundles', '      - name: Browser workbench integration\n        run: bash scripts/run-workbench-e2e.sh\n\n      - name: Rebuild committed bundles')
}
replace('.github/workflows/ci.yml', "'docs/compatibility-0.1.2-rc.1.md'])", "'docs/compatibility-0.1.2-rc.1.md', 'docs/workbench.md'])")
console.log('Applied idempotent integration patches. The original projection and existing public price table were not modified.')
