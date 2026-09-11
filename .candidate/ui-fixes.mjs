import { readFileSync, writeFileSync } from 'node:fs'
function edit(path, transform) { const before = readFileSync(path, 'utf8').replace(/\r\n/g, '\n'); writeFileSync(path, transform(before)) }
edit('src/client/workbench/App.tsx', text => text
  .replace("import './styles.css'", "import { workbenchCss } from './styles.ts'")
  .replace("if (controller.current) throw new Error", "if (controller.current && !controller.current.signal.aborted) throw new Error")
  .replace("if (controller.current === current) controller.current = null; if (alive.current) setBusy(false)", "if (controller.current === current) { controller.current = null; if (alive.current) setBusy(false) }")
  .replace("<main className=\"wbRoot\" lang={chinese ? 'zh-CN' : 'en'}>", "<main className=\"wbRoot\" lang={chinese ? 'zh-CN' : 'en'}><style>{workbenchCss}</style>"))
edit('src/client/workbench/components.tsx', text => {
  if (!/import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from ['"]react['"]/.test(text)) return "import { useMemo } from 'react'\n" + text
  return text
})
edit('src/workbench/reporting.ts', text => text.replace('costs: costs.filter(cost => cost.revision === snapshot.revision),', `costs: costs.filter(cost => cost.revision === snapshot.revision).map(cost => anonymize ? {
      currency: cost.estimate.currency, mode: cost.estimate.mode, amount: cost.estimate.amount,
      lower: cost.estimate.lower, upper: cost.estimate.upper, status: cost.estimate.status,
      coveredTokens: cost.estimate.coveredTokens, totalTokens: cost.estimate.totalTokens,
    } : cost),`))
console.log('UI lifecycle and export privacy corrections applied')
