import { readFileSync, writeFileSync } from 'node:fs'
function edit(path, transform) { const before = readFileSync(path, 'utf8').replace(/\r\n/g, '\n'); const after = transform(before); writeFileSync(path, after) }
edit('src/workbench/schema.ts', text => text
  .replace('export function boundedParse<T>(schema: z.ZodType<T>, value: unknown, maxChars = MAX_STATE_CHARS): T {', 'export function boundedParse<S extends z.ZodType>(schema: S, value: unknown, maxChars = MAX_STATE_CHARS): z.output<S> {')
  .replace('if (JSON.stringify(value).length > maxChars)', "if (value === undefined || JSON.stringify(value).length > maxChars)")
  .replace('nodeCount: integer, offset: integer', 'nodeCount: integer, provisionalNodeCount: integer, offset: integer')
  .replace('offset: integer.max(100000)', 'offset: integer.max(200000)'))
edit('src/workbench/port.ts', text => text.replace('async <T>(endpoint: string, payload: Record<string, unknown>, schema: z.ZodType<T>, signal: AbortSignal): Promise<T>', 'async <S extends z.ZodType>(endpoint: string, payload: Record<string, unknown>, schema: S, signal: AbortSignal): Promise<z.output<S>>'))
edit('src/workbench/host.ts', text => text
  .replace("import { SessionId }", "import { SessionId, isSessionEvent }")
  .replace('(await ctx.sessionQuery.readSession(id)).events', '(await ctx.sessionQuery.readSession(id)).events.filter(isSessionEvent)')
  .replace('buildSnapshot(request.sessionId, events,', 'buildSnapshot(request.sessionId, events.filter(isSessionEvent),'))
edit('src/workbench/snapshot.ts', text => text.replace('nodeCount: nodes.length, routes:', "nodeCount: nodes.length, provisionalNodeCount: nodes.filter(node => node.finality !== 'authoritative').length, routes:"))
edit('src/client/workbench/components.tsx', text => text
  .replace("import { useState,", "import { useMemo, useState,")
  .replace("import { useState }", "import { useMemo, useState }")
  .replace("rateCardSchema.parse({ ...draft, verifiedAt:", "rateCardSchema.parse({ ...draft, source: 'user-defined', verifiedAt:")
  .replace('snapshot.nodeCount <= snapshot.nodes.length && snapshot.nodes.every(node => node.finality === \'authoritative\')', 'snapshot.provisionalNodeCount === 0')
  .replace('导入已核验 DeepSeek 参考价卡', '载入 DeepSeek 空白模板')
  .replace('Import reviewed DeepSeek reference cards', 'Load blank DeepSeek templates')
  .replace('参考表核验日：2026-09-11。标签匹配不能验证实际端点；导入前请核对路由。未来生效版本不会提前用于历史。', '模板不预填价格。请核对提供方官方价目表、实际路由与生效时间后填写；空白费率不可用，不会按零计费。')
  .replace('Reference verified: 2026-09-11. Route labels do not verify the endpoint. Future versions are not applied before their validity interval.', 'Templates contain no prices. Verify the official tariff, actual route and validity before entering rates. Unknown rates are not zero.'))
edit('src/workbench/prices.ts', text => {
  const index = text.indexOf('/** Reviewed public templates.')
  if (index < 0) return text
  return text.slice(0, index) + `/** Empty route templates: never claim a remotely changing tariff was verified by installing this plugin. */
export function publicTemplates(): RateCard[] {
  const now = new Date().toISOString()
  return ['deepseek-v4-flash', 'deepseek-v4-pro'].map(model => rateCardSchema.parse({
    id: \`template-\${model}\`, label: \`\${model} — configure rates\`, provider: 'deepseek', model,
    currency: 'USD', effectiveFrom: now, verifiedAt: now, source: 'user-defined',
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    rates: { uncachedInputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null },
    timezone: 'UTC', periods: [], tiers: [],
  }))
}
`
})
edit('src/client/TokenUsageSection.tsx', text => text.replace('function collectDashboardData(', 'export function collectDashboardData('))
console.log('Workbench schema, source evidence and UI integration corrections applied')
