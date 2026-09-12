import { readFileSync, writeFileSync } from 'node:fs'
function edit(path, transform) { const before = readFileSync(path, 'utf8').replace(/\r\n/g, '\n'); writeFileSync(path, transform(before)) }
edit('src/client/workbench/App.tsx', text => {
  let next = text.replace("import './styles.css'", "import { workbenchCss } from './styles.ts'")
    .replace("if (controller.current) throw new Error", "if (controller.current && !controller.current.signal.aborted) throw new Error")
    .replace("if (controller.current === current) controller.current = null; if (alive.current) setBusy(false)", "if (controller.current === current) { controller.current = null; if (alive.current) setBusy(false) }")
    .replace("window.dispatchEvent(new CustomEvent('dsh-token-usage:summary', { detail: shareSummary(sessions) }))", "window.dispatchEvent(new Event('dsh-token-usage:summary-request'))")
    .replace('JSON.stringify(next.thresholds) !== JSON.stringify(state.config.thresholds)', 'next.thresholds.retryShare !== state.config.thresholds.retryShare || next.thresholds.compactionShare !== state.config.thresholds.compactionShare')
  if (!next.includes('<style>{workbenchCss}</style>')) next = next.replace("<main className=\"wbRoot\" lang={chinese ? 'zh-CN' : 'en'}>", "<main className=\"wbRoot\" lang={chinese ? 'zh-CN' : 'en'}><style>{workbenchCss}</style>")
  return next
})
edit('src/client/workbench/components.tsx', text => {
  if (!/import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from ['"]react['"]/.test(text)) text = "import { useMemo } from 'react'\n" + text
  const before = 'export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="wbField"><span>{label}</span>{children}</label> }'
  if (text.includes(before)) {
    text = "import { Children, cloneElement, isValidElement, useId } from 'react'\n" + text
    text = text.replace(before, `export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return <label className="wbField"><span id={id}>{label}</span>{Children.map(children, child =>
    isValidElement<{ 'aria-labelledby'?: string }>(child) && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)
      ? cloneElement(child, { 'aria-labelledby': id }) : child
  )}</label>
}`)
  }
  return text
})
edit('src/workbench/reporting.ts', text => text.replace('costs: costs.filter(cost => cost.revision === snapshot.revision),', `costs: costs.filter(cost => cost.revision === snapshot.revision).map(cost => anonymize ? {
      currency: cost.estimate.currency, mode: cost.estimate.mode, amount: cost.estimate.amount,
      lower: cost.estimate.lower, upper: cost.estimate.upper, status: cost.estimate.status,
      coveredTokens: cost.estimate.coveredTokens, totalTokens: cost.estimate.totalTokens,
    } : cost),`))
edit('tests/workbench.spec.ts', text => text.replace(/expect\((csvCell\([^\n]+?\))\)\.toStartWith\(([^;\n]+)\)/g, 'expect($1.startsWith($2)).toBe(true)'))
edit('scripts/workbench-e2e.cjs', text => text
  .replace("await field('Uncached input hypothetically moved to cache reads').fill('0.5')", "const slider = page.getByRole('slider'); await slider.press('Home'); for (let i = 0; i < 10; i++) await slider.press('ArrowRight'); await expect(slider).toHaveValue('0.5')")
  .replace("await nav('Inspection / receipt'); await field('Pricing basis').selectOption('revaluation')", "await nav('Inspection / receipt'); await expect(page.getByRole('heading', { name: 'Usage receipt', exact: true })).toBeVisible(); await field('Pricing basis').selectOption('revaluation')")
  .replace('  console.error(error)\n', "  console.error(error)\n  if (page) console.error('VISIBLE FIXTURE UI:', (await page.locator('body').innerText().catch(() => '')).slice(-8000))\n"))
edit('src/workbench/host.ts', text => {
  if (text.includes('const streamUsage =')) return text
  return text.replace("import { quote, sumQuotes, total, type Quote }", "import { add, zero, quote, sumQuotes, total, type Quote }")
    .replace('    let lastCheckpoint = 0', `    let lastCheckpoint = 0, streamSequence = 0
    const streamUsage = new Map<number, NonNullable<LedgerEntry['usage']>>()
    const unfinished = new Set<number>()`)
    .replace('          return { ...prepared, stream: async function* (...streamArgs: Parameters<typeof prepared.stream>) {', `          return { ...prepared, stream: async function* (...streamArgs: Parameters<typeof prepared.stream>) {
            const streamId = ++streamSequence
            unfinished.add(streamId)`)
    .replace("entry.usage = value.data; entry.finality = 'provisional'", "streamUsage.set(streamId, value.data); entry.usage = [...streamUsage.values()].reduce((sum, usage) => add(sum, usage), zero()); entry.finality = 'provisional'")
    .replace('              yield chunk\n            }\n          } }', '              yield chunk\n            }\n            unfinished.delete(streamId)\n          } }')
    .replace("if (entry.usage) entry.finality = 'authoritative'", "if (entry.usage && unfinished.size === 0 && streamUsage.size === streamSequence) entry.finality = 'authoritative'")
    .replace('const estimates = archive.nodes.map(node => quote(state.config.cards, node, node.usage, {', "const estimates = archive.nodes.map(node => quote(request.mode === 'historical-reference' && !node.time ? [] : state.config.cards, node, node.usage, {")
})
edit('.github/workflows/workbench-candidate.yml', text => text.replace('git add src package.json', 'git add src tests scripts package.json'))
console.log('UI lifecycle, privacy, multi-stream accounting and acceptance corrections applied')
