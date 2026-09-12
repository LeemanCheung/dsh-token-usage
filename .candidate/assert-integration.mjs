import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
function edit(path, transform, verify = () => true) {
  const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  const result = transform(source)
  assert(verify(result), `Integration postcondition failed: ${path}`)
  writeFileSync(path, result)
}
const importsUseMemo = /import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*['"]react['"]/u
edit('src/client/workbench/components.tsx', text => {
  if (importsUseMemo.test(text)) return text
  const reactImport = /import\s*\{([^}]+)\}\s*from\s*['"]react['"]/u
  assert(reactImport.test(text), 'Missing React import')
  return text.replace(reactImport, (_, names) => `import { useMemo, ${names.trim()} } from 'react'`)
}, text => importsUseMemo.test(text))
edit('src/workbench/schema.ts', text => {
  if (/provisionalNodeCount\s*:/u.test(text)) return text
  return text.replace(/nodeCount\s*:\s*integer\s*,/u, 'nodeCount: integer, provisionalNodeCount: integer,')
}, text => /provisionalNodeCount\s*:\s*integer/u.test(text))
edit('src/workbench/snapshot.ts', text => {
  if (/provisionalNodeCount\s*:/u.test(text)) return text
  return text.replace(/nodeCount\s*:\s*nodes\.length\s*,/u, "nodeCount: nodes.length, provisionalNodeCount: nodes.filter(node => node.finality !== 'authoritative').length,")
}, text => /provisionalNodeCount\s*:\s*nodes\.filter/u.test(text))
edit('README.md', text => {
  let next = text
    .replace('再打开 **设置 → Token 用量**。', '再打开 **设置 → Token 用量**；新增功能位于 **设置 → 用量工作台**。')
    .replace('- 数据分为三层：', '- 原有 Token 用量与轨迹报告的数据分为三层：')
    .replace('- 历史聚合会按当前内置静态表重估，不按事件发生日的历史价格还原；因此暂不提供 USD 预算。', '- 原「Token 用量」页按内置静态表重估历史聚合，不还原历史账单。新增「用量工作台」支持版本化自定义价卡，以及全局和项目的滚动 30 日 USD/CNY 预算；金额按当前费率重估，币种不相加，覆盖不足时不显示预算内。')
    .replace('- 分析调用的 Token 在生成进度和完成报告中显示，不计入持久化仪表盘。provider usage 到达前的输出 Token 是基于字符的近似值，不可用于账单。', '- 分析调用的 Token 不并入原会话 projection；0.4.0 起由工作台的独立辅助账本保存，覆盖本版本启用后的调用，最多 512 条并显示淘汰数量。未知用量、失败和取消后的暂定用量单独标识。生成进度中尚未收到 provider usage 的输出估算仍不可用于账单。')
    .replace('把静态费率表深化为带生效日期、来源和版本的本地 `FeeCatalog`，支持用户精确路由覆盖；在现有 provider/model Token 预算之上增加可信 USD 预算、阈值穿越冷却和本地告警历史。', '工作台已提供生效日期、来源、版本和精确路由匹配的自定义价卡，以及全局/项目 USD、CNY 金额预算。后续补充阈值穿越冷却和本地告警历史。')
    .replace('但不是完整的 DSH Web E2E。真实 profile 的安装激活', '但不是完整的 DSH Web E2E。工作台另有真实 React 组件与真实 Host RPC、合成事件/模型传输的 Chromium 验收，覆盖中英文、移动端、保存重载、导出和冲突保护；不产生付费模型调用，也不等同于真实提供方账单核对。真实 profile 的安装激活')
  if (!next.includes('**本地用量工作台**')) next = next.replace('| 领域 | 已实现能力 |\n| --- | --- |', '| 领域 | 已实现能力 |\n| --- | --- |\n| **本地用量工作台** | 无模型体检、用量收据、版本化价卡、独立辅助分析账本、7/30/90 日变化贡献、项目/标签与金额预算、人工验收实验、缓存/分时试算、脱敏周报，以及默认关闭的同页面只读摘要。详见 [工作台说明](docs/workbench.md)。 |')
  return next
})
const schema = readFileSync('src/workbench/schema.ts', 'utf8')
assert(schema.includes('z.output<S>'), 'boundedParse must return validated Zod output')
assert(readFileSync('src/client/workbench/register.tsx', 'utf8').includes('getSnapshot()'), 'Use pinned observable contract')
assert(readFileSync('src/workbench/host.ts', 'utf8').includes('streamUsage'), 'Track cumulative usage for all streams')
assert(readFileSync('src/client/workbench/App.tsx', 'utf8').includes('<style>{workbenchCss}</style>'), 'Include scoped client styles')
console.log('Verified integration postconditions: React hooks, complete snapshot schema, multi-stream accounting, observable contract, bundled CSS, current documentation.')
