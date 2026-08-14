/** Aggregate-only Token usage analysis through one user-selected registered model. */

import type { Context } from '@deepseek-ai/cordis'
import {
  BlockAssembler,
  createUserMessage,
  type FinishReason,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm'
import type {
  DailyTokenUsageRecord,
  ModelTokenUsageRecord,
  TokenUsageAnalysis,
  TokenUsageAnalysisInput,
  TokenUsageAnalysisModelSelection,
  TokenUsageBuckets,
} from './types.ts'

const MAX_ANALYSIS_TOKENS = 2_600
const MAX_MODEL_ROWS = 48
const MAX_DAILY_ROWS = 366

/** Return one four-bucket sum without retaining a source reference. */
function totalTokens(usage: TokenUsageBuckets): number {
  return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Return a small detached usage bucket. */
function copyUsage(usage: TokenUsageBuckets): TokenUsageBuckets {
  return {
    uncachedInputTokens: usage.uncachedInputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  }
}

/** Select the largest source route records in stable contribution order. */
function rankedModels(models: readonly ModelTokenUsageRecord[]): ModelTokenUsageRecord[] {
  return models
    .map((model, index) => ({ model, index }))
    .sort((left, right) => totalTokens(right.model.usage) - totalTokens(left.model.usage)
      || right.model.assistantRequests - left.model.assistantRequests
      || right.model.compactionRequests - left.model.compactionRequests
      || right.model.usage.uncachedInputTokens - left.model.usage.uncachedInputTokens
      || right.model.usage.outputTokens - left.model.usage.outputTokens
      || right.model.usage.cacheReadTokens - left.model.usage.cacheReadTokens
      || right.model.usage.cacheWriteTokens - left.model.usage.cacheWriteTokens
      || left.index - right.index)
    .slice(0, MAX_MODEL_ROWS)
    .map(({ model }) => ({
      provider: model.provider,
      model: model.model,
      assistantRequests: model.assistantRequests,
      compactionRequests: model.compactionRequests,
      usage: copyUsage(model.usage),
    }))
}

/** Replace raw route ids with stable report-local aliases. */
function modelEvidence(models: readonly ModelTokenUsageRecord[]): ModelTokenUsageRecord[] {
  return models.map((model, index) => ({
    provider: 'route',
    model: `route-${index + 1}`,
    assistantRequests: model.assistantRequests,
    compactionRequests: model.compactionRequests,
    usage: copyUsage(model.usage),
  }))
}

/** Select the latest UTC date records in chronological order. */
function dailyEvidence(days: readonly DailyTokenUsageRecord[]): DailyTokenUsageRecord[] {
  return days
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-MAX_DAILY_ROWS)
    .map(day => ({ date: day.date, usage: copyUsage(day.usage) }))
}

/** Build the only aggregate evidence supplied to the selected model. Local price matches stay in the browser. */
export function usageAnalysisEvidence(input: TokenUsageAnalysisInput): TokenUsageAnalysisInput {
  return {
    usage: copyUsage(input.usage),
    assistantRequests: input.assistantRequests,
    compactionRequests: input.compactionRequests,
    compactionUsage: copyUsage(input.compactionUsage),
    models: modelEvidence(rankedModels(input.models)),
    days: dailyEvidence(input.days),
  }
}

/** Convert provider usage from one auxiliary call into dashboard-compatible buckets. */
function analysisUsage(value: TokenUsage | undefined): TokenUsageBuckets | undefined {
  return value === undefined ? undefined : {
    uncachedInputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    cacheReadTokens: value.cacheReadTokens ?? 0,
    cacheWriteTokens: value.cacheWriteTokens ?? 0,
  }
}

/** Return a terminal model error when the stream did not finish normally. */
function finishError(reason: FinishReason | undefined): Error | undefined {
  if (reason === undefined || reason.kind === 'stop') return undefined
  return new Error(`Usage analysis model finished with ${reason.kind}.`)
}

/** Create a constrained, evidence-first Token efficiency review instruction. */
function systemPrompt(language: string): string {
  const chinese = language.toLowerCase().startsWith('zh')
  const reportLanguage = chinese ? '简体中文' : 'English'
  const sections = chinese
    ? '1. 用量概览\n2. 输入、输出与缓存效率\n3. 模型与路由贡献\n4. 时间趋势、峰值与波动\n5. 风险与不确定性\n6. 分级优化建议\n7. 后续观测重点'
    : '1. Usage overview\n2. Input, output, and cache efficiency\n3. Model and route contribution\n4. Time trends, peaks, and volatility\n5. Risks and uncertainty\n6. Prioritized optimization recommendations\n7. Next measurement focus'
  return `You are a senior LLM FinOps and performance analyst. Analyze aggregate DeepSeek Harness Token-usage evidence only.\n\nWrite concise Markdown in ${reportLanguage} with these exact top-level sections:\n${sections}\n\nRequirements:\n- Use only the supplied aggregate Token buckets, exact aggregate compaction Token usage, report-local route aliases, request counts, compaction counts, and UTC daily records. Do not claim to have session titles, prompts, responses, raw provider/model ids, prices, latency, quality, invoices, or user intent.\n- State the evidence behind each material claim with an exact bucket, route alias, UTC date, count, or trend. Distinguish facts from hypotheses.\n- Explain uncached input, output, cache reads, and cache writes separately. Do not treat cache reads as free or claim a monetary cost without price data.\n- Analyze concentration, compaction pressure, cache behavior, output-to-input balance, peaks, volatility, and changes in the supplied date coverage.\n- End the optimization section with 3-7 P0/P1/P2 recommendations. For each give evidence, expected Token-efficiency benefit, confidence, and implementation effort.\n- When the evidence is insufficient, say what additional aggregate measurement would resolve it. Never invent savings, costs, or causal explanations.`
}

/** Analyze bounded aggregate Token usage through one user-selected model route. */
export async function analyzeTokenUsage(
  ctx: Pick<Context, 'llm'>,
  input: TokenUsageAnalysisInput,
  selection: TokenUsageAnalysisModelSelection,
  language: string,
  signal: AbortSignal,
): Promise<TokenUsageAnalysis> {
  signal.throwIfAborted()
  const evidence = usageAnalysisEvidence(input)
  const messages = [createUserMessage({
    content: [{
      type: 'text',
      text: `Aggregate Token usage evidence (no session identifiers or content):\n${JSON.stringify(evidence)}`,
    }],
    source: { kind: 'plugin', plugin: 'dsh-token-usage' },
  })]
  const preparedCall = await ctx.llm.prepareCall({
    provider: selection.provider,
    model: selection.model,
    maxTokens: MAX_ANALYSIS_TOKENS,
  }, signal)
  signal.throwIfAborted()
  const assembler = new BlockAssembler()
  for await (const chunk of preparedCall.stream({
    ...preparedCall.config,
    messages,
    system: systemPrompt(language),
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
    throw new Error('Token usage analysis must return text only.')
  }
  const report = blocks
    .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (report.length === 0) throw new Error('Token usage analysis model returned no report text.')
  const auxiliaryUsage = analysisUsage(assembler.usage)
  return {
    schema: 'dsh-token-usage/usage-analysis-v1',
    generatedAt: new Date().toISOString(),
    model: { provider: preparedCall.config.provider, model: preparedCall.config.model },
    ...auxiliaryUsage === undefined ? {} : { analysisUsage: auxiliaryUsage },
    report,
  }
}
