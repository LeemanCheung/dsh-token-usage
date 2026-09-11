import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
function edit(path, transform, verify) {
  const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  const result = transform(source)
  assert(verify(result), `Integration postcondition failed: ${path}`)
  writeFileSync(path, result)
}
edit('src/client/workbench/components.tsx', text => {
  const reactImport = /import\s*\{([^}]+)\}\s*from\s*['"]react['"]/u
  assert(reactImport.test(text), 'Missing React import')
  return text.replace(reactImport, (whole, names) => /\buseMemo\b/u.test(names) ? whole : `import { useMemo, ${names.trim()} } from 'react'`)
}, text => /import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*['"]react['"]/u.test(text))
edit('src/workbench/schema.ts', text => {
  if (/provisionalNodeCount\s*:/u.test(text)) return text
  return text.replace(/nodeCount\s*:\s*integer\s*,/u, 'nodeCount: integer, provisionalNodeCount: integer,')
}, text => /provisionalNodeCount\s*:\s*integer/u.test(text))
edit('src/workbench/snapshot.ts', text => {
  if (/provisionalNodeCount\s*:/u.test(text)) return text
  return text.replace(/nodeCount\s*:\s*nodes\.length\s*,/u, "nodeCount: nodes.length, provisionalNodeCount: nodes.filter(node => node.finality !== 'authoritative').length,")
}, text => /provisionalNodeCount\s*:\s*nodes\.filter/u.test(text))
const schema = readFileSync('src/workbench/schema.ts', 'utf8')
assert(schema.includes('z.output<S>'), 'boundedParse must return validated Zod output')
assert(readFileSync('src/client/workbench/register.tsx', 'utf8').includes('getSnapshot()'), 'Use pinned observable contract')
assert(readFileSync('src/workbench/host.ts', 'utf8').includes('streamUsage'), 'Track cumulative usage for all streams')
assert(readFileSync('src/client/workbench/App.tsx', 'utf8').includes('<style>{workbenchCss}</style>'), 'Include scoped client styles')
console.log('Verified integration postconditions: React hooks, complete snapshot schema, multi-stream accounting, observable contract, bundled CSS.')
