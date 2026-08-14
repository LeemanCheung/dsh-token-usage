/** Bounded session-trajectory extraction and configured-model analysis. */

import type { Context } from '@deepseek-ai/cordis'
import {
  BlockAssembler,
  createUserMessage,
  type FinishReason,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {
  TokenUsageBuckets,
  TrajectoryAnalysis,
  TrajectoryMetrics,
} from './types.ts'

const MAX_EVENT_CHARS = 2_000
const MAX_TRAJECTORY_CHARS = 96_000
const MAX_COLLECTION_ITEMS = 16
const MAX_OBJECT_DEPTH = 5
const ANALYSIS_MAX_TOKENS = 3_000

interface PreparedTrajectory {
  metrics: TrajectoryMetrics
  timeline: string
  truncated: boolean
}

/** Return whether a value is a JSON-like object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Replace credential-shaped values before a trajectory enters an auxiliary model request. */
export function redactTrajectoryText(value: string): string {
  return value
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, '<private-key-redacted>')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer <redacted>')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<jwt-redacted>')
    .replace(/\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16})\b/g, '<token-redacted>')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
    .replace(/((?:api[_-]?key|password|secret|credential|authorization|access[_-]?token|refresh[_-]?token)\s*[=:]\s*)[^\s,;"']+/gi, '$1<redacted>')
}

const SAFE_TOKEN_ACCOUNTING_KEYS = new Set([
  'inputtokens', 'outputtokens', 'cachereadtokens', 'cachewritetokens', 'reasoningtokens',
  'maxtokens', 'tokencount', 'shadowedtokencount', 'tokensperminute',
])

/** Whether an object property commonly carries a credential rather than usage accounting. */
function sensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
  if (SAFE_TOKEN_ACCOUNTING_KEYS.has(normalized)) return false
  return normalized.includes('apikey')
    || normalized.includes('authorization')
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('credential')
    || normalized.endsWith('token')
}

/** Build a small detached JSON value for model inspection without retaining unbounded payloads. */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth >= MAX_OBJECT_DEPTH) return '<depth-limit>'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(sanitize(JSON.parse(trimmed) as unknown, depth + 1)).slice(0, MAX_EVENT_CHARS)
      } catch (_nonJsonToolArgument) {
        // Tool arguments can be provider-produced partial JSON; redact them as ordinary text.
      }
    }
    return redactTrajectoryText(value).slice(0, MAX_EVENT_CHARS)
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_COLLECTION_ITEMS).map(item => sanitize(item, depth + 1))
    if (value.length > MAX_COLLECTION_ITEMS) items.push(`<${value.length - MAX_COLLECTION_ITEMS} more items>`)
    return items
  }
  if (!isRecord(value)) return String(value)
  return Object.fromEntries(Object.entries(value).slice(0, MAX_COLLECTION_ITEMS).map(([key, child]) => [
    key,
    sensitiveKey(key) ? '<redacted>' : sanitize(child, depth + 1),
  ]))
}

/** Sum provider-reported usage into the plugin's disjoint buckets. */
function addUsage(target: TokenUsageBuckets, value: unknown): void {
  if (!isRecord(value)) return
  const number = (key: string): number => {
    const candidate = value[key]
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : 0
  }
  target.uncachedInputTokens += number('inputTokens')
  target.outputTokens += number('outputTokens')
  target.cacheReadTokens += number('cacheReadTokens')
  target.cacheWriteTokens += number('cacheWriteTokens')
}

/** Count one turn-end reason as failed unless it completed normally. */
function completedReason(value: unknown): boolean {
  return isRecord(value) && value.kind === 'completed'
}

/** Convert one event to a compact trajectory row; raw streaming chunks are summarized separately. */
function eventRow(event: SessionEvent): string | undefined {
  if (String(event.type) === 'assistant/chunk') return undefined
  const data: Record<string, unknown> = isRecord(event.data as unknown)
    ? event.data as Record<string, unknown>
    : {}
  const location = {
    ...typeof data.turn === 'number' ? { turn: data.turn } : {},
    ...typeof data.step === 'number' ? { step: data.step } : {},
  }
  const row = {
    seq: event.seq,
    time: new Date(event.time).toISOString(),
    type: String(event.type),
    ...Object.keys(location).length === 0 ? {} : { location },
    data: sanitize(data),
  }
  const serialized = JSON.stringify(row)
  if (serialized.length <= MAX_EVENT_CHARS) return serialized
  return JSON.stringify({
    seq: event.seq,
    time: new Date(event.time).toISOString(),
    type: String(event.type),
    ...Object.keys(location).length === 0 ? {} : { location },
    dataPreview: serialized.slice(0, Math.floor(MAX_EVENT_CHARS * 0.7)),
    truncated: true,
  })
}

/** Compute deterministic trajectory metrics and a bounded model-facing timeline. */
export function prepareTrajectory(events: readonly SessionEvent[]): PreparedTrajectory {
  const usage: TokenUsageBuckets = {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
  let turnCount = 0
  let completedTurns = 0
  let failedTurns = 0
  let stepCount = 0
  let assistantRequests = 0
  let toolCalls = 0
  let toolErrors = 0
  let retries = 0
  let compactions = 0
  let approvalsAsked = 0
  let approvalsRejected = 0
  let subagents = 0
  let omittedChunkEvents = 0
  const rows: string[] = []

  for (const event of events) {
    const type = String(event.type)
    const data: Record<string, unknown> = isRecord(event.data as unknown)
    ? event.data as Record<string, unknown>
    : {}
    switch (type) {
      case 'turn/start': turnCount += 1; break
      case 'turn/end':
        if (completedReason(data.reason)) completedTurns += 1
        else failedTurns += 1
        break
      case 'step/start': stepCount += 1; break
      case 'assistant/message':
        assistantRequests += 1
        addUsage(usage, data.usage)
        break
      case 'assistant/chunk': omittedChunkEvents += 1; break
      case 'tool/call': toolCalls += 1; break
      case 'tool/result': if (data.error !== undefined) toolErrors += 1; break
      case 'llm/retry': retries += 1; break
      case 'compaction/summary':
        compactions += 1
        addUsage(usage, data.usage)
        break
      case 'approval/asked': approvalsAsked += 1; break
      case 'approval/decided':
        if (isRecord(data.outcome) ? data.outcome.kind !== 'allowed-once' : data.outcome !== 'allowed-once') {
          approvalsRejected += 1
        }
        break
      case 'subagent/descriptor': subagents += 1; break
    }
    const row = eventRow(event)
    if (row !== undefined) rows.push(row)
  }

  const firstTime = events[0]?.time
  const lastTime = events.at(-1)?.time
  const durationMs = firstTime === undefined || lastTime === undefined ? 0 : Math.max(0, lastTime - firstTime)
  const totalTokens = usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const minutes = durationMs / 60_000
  const metrics: TrajectoryMetrics = {
    eventCount: events.length,
    includedEventCount: rows.length,
    omittedChunkEvents,
    turnCount,
    completedTurns,
    failedTurns,
    stepCount,
    assistantRequests,
    toolCalls,
    toolErrors,
    retries,
    compactions,
    approvalsAsked,
    approvalsRejected,
    subagents,
    durationMs,
    eventsPerMinute: minutes > 0 ? Number((events.length / minutes).toFixed(2)) : 0,
    tokensPerMinute: minutes > 0 ? Number((totalTokens / minutes).toFixed(2)) : 0,
    usage,
  }

  const head: string[] = []
  const tail: string[] = []
  let headChars = 0
  let tailChars = 0
  const headBudget = Math.floor(MAX_TRAJECTORY_CHARS * 0.65)
  const tailBudget = MAX_TRAJECTORY_CHARS - headBudget
  for (const row of rows) {
    if (headChars + row.length + 1 > headBudget) break
    head.push(row)
    headChars += row.length + 1
  }
  for (let index = rows.length - 1; index >= head.length; index -= 1) {
    const row = rows[index]
    if (row === undefined || tailChars + row.length + 1 > tailBudget) break
    tail.unshift(row)
    tailChars += row.length + 1
  }
  const truncated = head.length + tail.length < rows.length
  const timeline = truncated
    ? `${head.join('\n')}\n{"type":"trajectory/truncated","omittedRows":${rows.length - head.length - tail.length}}\n${tail.join('\n')}`
    : rows.join('\n')
  return {
    metrics: truncated ? { ...metrics, includedEventCount: head.length + tail.length } : metrics,
    timeline,
    truncated,
  }
}

/** Translate an unsuccessful terminal model finish into one user-visible analysis error. */
function finishError(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'stop': return undefined
    case 'error':
    case 'aborted': return Object.assign(new Error(finish.failure.message), { code: finish.failure.code })
    case 'max-tokens': return new Error('Trajectory analysis reached its output limit. Please retry with a shorter session.')
    case 'tool-calls': return new Error('Trajectory analysis model unexpectedly requested a tool.')
    default: return new Error(`Unsupported model finish reason: ${String((finish as { kind?: unknown }).kind)}`)
  }
}

/** Convert auxiliary-call usage into dashboard-compatible buckets. */
function analysisUsage(value: TokenUsage | undefined): TokenUsageBuckets | undefined {
  return value === undefined ? undefined : {
    uncachedInputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    cacheReadTokens: value.cacheReadTokens ?? 0,
    cacheWriteTokens: value.cacheWriteTokens ?? 0,
  }
}

/** Create the model instruction for the requested report language and analysis dimensions. */
function systemPrompt(language: string): string {
  const chinese = language.toLowerCase().startsWith('zh')
  const reportLanguage = chinese ? '简体中文' : 'English'
  const sections = chinese
    ? '1. 执行摘要\n2. 调用链与委派\n3. 合规与安全审查\n4. 异常与故障恢复\n5. 速率、延迟与吞吐\n6. Token、缓存与上下文效率\n7. 工具与子代理成效\n8. 可靠性与生命周期完整性\n9. 分级改进建议'
    : '1. Executive summary\n2. Call chain and delegation\n3. Compliance and safety review\n4. Anomalies and failure recovery\n5. Rate, latency, and throughput\n6. Token, cache, and context efficiency\n7. Tool and subagent effectiveness\n8. Reliability and lifecycle integrity\n9. Prioritized recommendations'
  return `You are a senior AI-agent observability, security, and performance auditor. Analyze one DeepSeek Harness session trajectory.\n\nWrite the report in ${reportLanguage} as concise Markdown. Use these exact top-level sections:\n${sections}\n\nRequirements:\n- Ground every material claim in event seq numbers, event types, or supplied metrics.\n- Distinguish observed facts from hypotheses. Never invent policy violations, timings, costs, or missing events.\n- Review approval decisions, sandbox or permission changes, possible secret exposure, destructive actions, and whether tool use matches user intent.\n- Detect retries, repeated calls, loops, orphaned calls/results, interrupted turns, compaction pressure, model switches, bursty activity, stalls, and recovery behavior.\n- Explain rates in context; a high rate is not automatically bad.\n- Include a compact Mermaid flowchart for the principal call chain when the evidence supports it.\n- End with 3-7 recommendations ranked P0/P1/P2, each tied to evidence and an expected benefit.\n- Treat redacted and truncated markers as unavailable evidence, not suspicious behavior.`
}

/** Analyze one immutable trajectory through the DSH default configured model. */
export async function analyzeTrajectory(
  ctx: Context,
  sessionId: SessionId,
  events: readonly SessionEvent[],
  language: string,
  signal: AbortSignal,
): Promise<TrajectoryAnalysis> {
  signal.throwIfAborted()
  const prepared = prepareTrajectory(events)
  const selection = ctx.agentDefaultModel.currentSelection()
  const messages = [createUserMessage({
    content: [{
      type: 'text',
      text: `Session: ${sessionId}\nDeterministic metrics:\n${JSON.stringify(prepared.metrics, null, 2)}\n\nBounded trajectory (JSON Lines):\n${prepared.timeline}`,
    }],
    source: { kind: 'plugin', plugin: 'dsh-token-usage' },
  })]
  const preparedCall = await ctx.llm.prepareCall({
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
    maxTokens: ANALYSIS_MAX_TOKENS,
  }, signal)
  const assembler = new BlockAssembler()
  for await (const chunk of preparedCall.stream({
    ...preparedCall.config,
    messages,
    system: systemPrompt(language),
    sessionId,
    signal,
  })) {
    signal.throwIfAborted()
    assembler.push(chunk)
  }
  signal.throwIfAborted()
  const terminalError = finishError(assembler.finish)
  if (terminalError !== undefined) throw terminalError
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type === 'tool-call')) {
    throw new Error('Trajectory analysis must return text only.')
  }
  const report = blocks
    .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (report.length === 0) throw new Error('Trajectory analysis model returned no report text.')
  const auxiliaryUsage = analysisUsage(assembler.usage)
  return {
    schema: 'dsh-token-usage/trajectory-analysis-v1',
    sessionId: String(sessionId),
    generatedAt: new Date().toISOString(),
    model: { provider: preparedCall.config.provider, model: preparedCall.config.model },
    truncated: prepared.truncated,
    metrics: prepared.metrics,
    ...auxiliaryUsage === undefined ? {} : { analysisUsage: auxiliaryUsage },
    report,
  }
}
