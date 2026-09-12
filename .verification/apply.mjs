import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const blob = text => { const data = Buffer.from(text); return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex') }
const parts = readdirSync('.verification').filter(name => /^part-\d{2}\.json$/.test(name)).sort()
assert.equal(parts.length, 11, 'All eleven source manifests are required')
const files = parts.flatMap(name => JSON.parse(readFileSync(`.verification/${name}`,'utf8')).files)
assert.equal(files.length, 36, 'Expected the reviewed 36-file change set')
assert.equal(new Set(files.map(file => file.path)).size, files.length, 'Duplicate source path')
const original = new Map()
for (const file of files) {
  assert(typeof file.path === 'string' && !file.path.includes('..') && !file.path.includes('\\') && /^(src\/|tests\/|scripts\/|docs\/|package\.json$|README\.md$|CHANGELOG\.md$)/.test(file.path), 'Unexpected target path')
  original.set(file.path, existsSync(file.path) ? readFileSync(file.path,'utf8') : null)
}
function deriveSelector(source) {
  let s = source; const chunks = []
  function move(start,end) { const a=s.indexOf(start),b=s.indexOf(end,a); assert(a>=0&&b>=a,start); chunks.push(s.slice(a,b)); s=s.slice(0,a)+s.slice(b) }
  move('interface SessionUsageRow {','type InsightRange =')
  move('/** Detached zero buckets','/** Locale-aware exact integer formatting.')
  if(s.includes('/** Stable exact model route key')) move('/** Stable exact model route key','/**')
  for(const name of ['modelKey','modelDayKey']) { const a=s.indexOf('function '+name+'('),b=s.indexOf('\n}',a)+2; assert(a>=0&&b>a); chunks.push(s.slice(a,b)+'\n'); s=s.slice(0,a)+s.slice(b) }
  move('/** Attribute a built-in projection fallback',"/** Return one exact route's reliable daily buckets")
  if(s.includes('/** Build an aggregate-only')) move('/** Build an aggregate-only','/**')
  { const a=s.indexOf('export function usageAnalysisInput('),b=s.indexOf('\nfunction Metric(',a); assert(a>=0&&b>a); chunks.push(s.slice(a,b)) }
  let selector=`/** Pure immutable usage selectors; no React component or CSS imports. */
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { DailyTokenUsageRecord, ModelDailyTokenUsageRecord, ModelTokenUsageRecord, TokenUsageAnalysisInput, TokenUsageBuckets, TokenUsageRecorderProjection } from '../../types.ts'

`+chunks.join('')
  for(const name of ['zeroBuckets','addBuckets','sameBuckets','dayKey','modelKey','modelDayKey']) selector=selector.replace('function '+name+'(','export function '+name+'(')
  return selector.replace('interface SessionUsageRow','export interface SessionUsageRow').replace('interface DashboardData','export interface DashboardData')
}
const pending=[]
for (const file of files) {
  const current=original.get(file.path)
  if(current!==null && blob(current)===file.sha) continue
  assert.equal(current===null ? null : blob(current),file.base,`Unexpected base: ${file.path}`)
  let next
  if(file.derive) {
    assert.equal(file.path,'src/client/selectors/usage.ts')
    const input=original.get(file.derive.path); assert.equal(blob(input),file.derive.sha)
    next=deriveSelector(input)
  } else {
    assert(Array.isArray(file.edits))
    const lines=(current??'').match(/[^\n]*\n|[^\n]+$/g)??[]
    for(const edit of [...file.edits].reverse()) {
      assert(Number.isInteger(edit.line)&&Number.isInteger(edit.remove)&&edit.line>=0&&edit.remove>=0&&edit.line+edit.remove<=lines.length)
      lines.splice(edit.line,edit.remove,...(edit.insert.match(/[^\n]*\n|[^\n]+$/g)??[]))
    }
    next=lines.join('')
  }
  assert.equal(blob(next),file.sha,`Output hash mismatch: ${file.path}`)
  pending.push([file.path,next])
}
for(const [path,text] of pending) { mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,text) }
console.log(`Verified ${files.length} source hashes; applied ${pending.length} reviewed source files.`)
