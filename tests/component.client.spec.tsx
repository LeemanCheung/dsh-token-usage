// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '../src/types.ts'
import {
  aggregateUsage,
  TokenUsageSection,
  totalTokens,
  type TokenUsageSectionProps,
} from '../src/client/TokenUsageSection.tsx'
import { zh } from '../src/client/locales.ts'

function summary(value: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'displayTitle' | 'updatedAt'>): SessionSummary {
  return {
    running: false,
    blank: false,
    ...value,
  } as SessionSummary
}

const first = summary({
  id: 'session-first' as SessionSummary['id'],
  displayTitle: '主要会话',
  updatedAt: 2_000,
  projectionValues: {
    tokenUsageRecorder: {
      assistantRequests: 2,
      compactionRequests: 1,
      usage: {
        uncachedInputTokens: 100,
        outputTokens: 30,
        cacheReadTokens: 50,
        cacheWriteTokens: 10,
      },
      models: [{
        provider: 'deepseek',
        model: 'deepseek-chat',
        assistantRequests: 2,
        compactionRequests: 1,
        usage: {
          uncachedInputTokens: 100,
          outputTokens: 30,
          cacheReadTokens: 50,
          cacheWriteTokens: 10,
        },
      }],
      days: [{
        date: '1970-01-01',
        usage: {
          uncachedInputTokens: 100,
          outputTokens: 30,
          cacheReadTokens: 50,
          cacheWriteTokens: 10,
        },
      }],
    },
  },
})

const large = summary({
  id: 'session-large' as SessionSummary['id'],
  displayTitle: '大用量会话',
  updatedAt: 3_000,
  projectionValues: {
    tokenUsage: {
      uncachedInputTokens: 200_000_000,
      outputTokens: 8_250_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  },
})

const activity = summary({
  id: 'session-activity' as SessionSummary['id'],
  displayTitle: '热力图会话',
  updatedAt: Date.UTC(2026, 7, 14),
  projectionValues: {
    tokenUsageRecorder: {
      assistantRequests: 1,
      compactionRequests: 0,
      usage: { uncachedInputTokens: 1_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      models: [{
        provider: 'deepseek',
        model: 'deepseek-chat',
        assistantRequests: 1,
        compactionRequests: 0,
        usage: { uncachedInputTokens: 1_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }],
      days: [{
        date: '2026-08-12',
        usage: { uncachedInputTokens: 1_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }],
    },
  },
})

const legacy = summary({
  id: 'session-legacy' as SessionSummary['id'],
  displayTitle: '旧会话',
  updatedAt: 1_000,
  projectionValues: {
    tokenUsage: {
      uncachedInputTokens: 20,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  },
})

function translate(key: keyof typeof zh, params?: Record<string, unknown>): string {
  let value = zh[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

function props(
  summaries: readonly SessionSummary[] = [first, legacy],
  analyzeTrajectory: TokenUsageSectionProps['analyzeTrajectory'] = async sessionId => ({
    schema: 'dsh-token-usage/trajectory-analysis-v1',
    sessionId,
    generatedAt: '2026-08-14T12:00:00.000Z',
    model: { provider: 'deepseek', model: 'deepseek-chat' },
    truncated: false,
    metrics: {
      eventCount: 20,
      includedEventCount: 15,
      omittedChunkEvents: 5,
      turnCount: 2,
      completedTurns: 2,
      failedTurns: 0,
      stepCount: 3,
      assistantRequests: 3,
      toolCalls: 4,
      toolResults: 4,
      toolErrors: 1,
      orphanToolCalls: 0,
      orphanToolResults: 0,
      averageToolLatencyMs: 250,
      maxToolLatencyMs: 600,
      retries: 1,
      compactions: 0,
      approvalsAsked: 1,
      approvalsRejected: 0,
      subagents: 1,
      modelSwitches: 0,
      openTurns: 0,
      openSteps: 0,
      durationMs: 60_000,
      activeDurationMs: 50_000,
      eventsPerMinute: 20,
      tokensPerMinute: 190,
      activeTokensPerMinute: 228,
      usage: { uncachedInputTokens: 100, outputTokens: 30, cacheReadTokens: 50, cacheWriteTokens: 10 },
    },
    analysisUsage: { uncachedInputTokens: 40, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
    report: '# 执行摘要\n\n调用链与合规性正常。',
  }),
): TokenUsageSectionProps {
  const state = {
    ids: summaries.map(summary => summary.id),
    byId: Object.fromEntries(summaries.map(summary => [summary.id, summary])),
    current: summaries[0]?.id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as SessionListState
  const useSessions = <T,>(select: (snapshot: SessionListState) => T): T => select(state)
  return {
    close: () => {},
    useSessions,
    useWorkspaces: (() => { throw new Error('unused') }) as TokenUsageSectionProps['useWorkspaces'],
    useBudget: selector => selector({ status: 'ready', budget: 0 }),
    setBudget: async () => {},
    download: { save: () => {} },
    listAnalysisModels: async () => ({
      models: [
        { provider: 'deepseek', providerName: 'DeepSeek', model: 'deepseek-chat', modelName: 'DeepSeek Chat' },
        { provider: 'openai', providerName: 'OpenAI', model: 'gpt-5-mini', modelName: 'GPT-5 mini' },
      ],
      default: { provider: 'deepseek', model: 'deepseek-chat' },
    }),
    analyzeTokenUsage: async (_input, model) => ({
      schema: 'dsh-token-usage/usage-analysis-v1',
      generatedAt: '2026-08-14T12:00:00.000Z',
      model,
      analysisUsage: { uncachedInputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      report: '# 用量概览\n\n缓存使用良好。',
    }),
    analyzeTrajectory,
    t: translate,
  } as TokenUsageSectionProps
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TokenUsageSection', () => {
  it('aggregates custom and built-in historical projection values', () => {
    const data = aggregateUsage([first, legacy])
    expect(data.usage).toEqual({
      uncachedInputTokens: 120,
      outputTokens: 35,
      cacheReadTokens: 50,
      cacheWriteTokens: 10,
    })
    expect(data.sessions.map(row => row.title)).toEqual(['主要会话', '旧会话'])
    expect(data.models).toHaveLength(2)
    expect(data.models.find(model => model.provider === '' && model.model === '')?.usage).toEqual({
      uncachedInputTokens: 20,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(data.models.reduce((sum, model) => sum + totalTokens(model.usage), 0))
      .toBe(totalTokens(data.usage))
    expect(data.days).toEqual([{
      date: '1970-01-01',
      usage: {
        uncachedInputTokens: 120,
        outputTokens: 35,
        cacheReadTokens: 50,
        cacheWriteTokens: 10,
      },
    }])
  })

  it('keeps distinct route pairs whose labels would collide', () => {
    const colliding = summary({
      id: 'session-collision' as SessionSummary['id'],
      displayTitle: '碰撞会话',
      updatedAt: 3_000,
      projectionValues: {
        tokenUsageRecorder: {
          assistantRequests: 2,
          compactionRequests: 0,
          usage: { uncachedInputTokens: 3, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          models: [
            {
              provider: 'one/two',
              model: 'three',
              assistantRequests: 1,
              compactionRequests: 0,
              usage: { uncachedInputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
            },
            {
              provider: 'one',
              model: 'two/three',
              assistantRequests: 1,
              compactionRequests: 0,
              usage: { uncachedInputTokens: 2, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
            },
          ],
          days: [{
            date: '1970-01-01',
            usage: { uncachedInputTokens: 3, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          }],
        },
      },
    })

    expect(aggregateUsage([colliding]).models).toHaveLength(2)
  })

  it('uses compact token units while preserving the exact value on hover', () => {
    render(<TokenUsageSection {...props([large])} />)

    expect(screen.getAllByTitle('208,250,000').every(element => element.textContent === '208.3M')).toBe(true)
    expect(screen.getAllByText('200M').length).toBeGreaterThan(0)
    expect(screen.getAllByText('8.3M').length).toBeGreaterThan(0)
  })

  it('renders daily Token activity as a heatmap cell', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 7, 14, 12))
    render(<TokenUsageSection {...props([activity])} />)

    expect(screen.getByRole('grid', { name: 'Token 活跃度' })).toBeTruthy()
    const cell = screen.getAllByRole('gridcell').find(item => item.getAttribute('title')?.startsWith('2026-08-12'))
    expect(screen.getAllByRole('gridcell')).toHaveLength(210)
    expect(cell?.getAttribute('title')).toBe('2026-08-12\n总计 1,000 Token\n输入 1,000 · 输出 0\n缓存：读 0 · 写 0')
    expect(cell?.getAttribute('data-level')).toBe('4')
    fireEvent.click(cell!)
    expect(screen.getByRole('heading', { name: '2026-08-12 用量明细' })).toBeTruthy()
    expect(screen.getAllByText('热力图会话').length).toBeGreaterThan(1)
  })

  it('switches trend periods, persists a budget, and exports aggregate-only data', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 7, 14, 12))
    const setBudget = vi.fn(async () => {})
    const save = vi.fn()
    render(<TokenUsageSection {...props([activity])} setBudget={setBudget} download={{ save }} />)

    fireEvent.click(screen.getByRole('button', { name: '7 天' }))
    expect(screen.getByRole('button', { name: '7 天' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('30 日预算（Token）'), { target: { value: '2000' } })
    fireEvent.blur(screen.getByLabelText('30 日预算（Token）'))
    expect(setBudget).toHaveBeenCalledWith(2000)

    fireEvent.click(screen.getByRole('button', { name: 'JSON 汇总' }))
    const exported = save.mock.calls[0]?.[2] as string
    expect(exported).toContain('dsh-token-usage/export-v1')
    expect(exported).not.toContain('热力图会话')
    expect(exported).not.toContain('session-activity')
  })

  it('selects an integrated model and sends only aggregate Token records for AI optimization', async () => {
    const usageAnalyze = vi.fn(props([first]).analyzeTokenUsage)
    render(<TokenUsageSection {...props([first])} analyzeTokenUsage={usageAnalyze} />)

    const selector = await screen.findByLabelText('分析模型')
    fireEvent.change(selector, { target: { value: 'openai\u0000gpt-5-mini' } })
    fireEvent.click(screen.getByRole('button', { name: '生成用量分析' }))

    await waitFor(() => { expect(screen.getByText(/缓存使用良好/)).toBeTruthy() })
    expect(usageAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { uncachedInputTokens: 100, outputTokens: 30, cacheReadTokens: 50, cacheWriteTokens: 10 },
        models: expect.any(Array),
        days: expect.any(Array),
      }),
      { provider: 'openai', model: 'gpt-5-mini' },
      expect.any(AbortSignal),
    )
    const input = usageAnalyze.mock.calls[0]?.[0] as Record<string, unknown>
    expect(input).not.toHaveProperty('sessions')
    expect(JSON.stringify(input)).not.toContain('主要会话')
    expect(screen.getByText(/openai\/gpt-5-mini ·/)).toBeTruthy()
  })

  it('runs trajectory analysis for a selected session through the chosen integrated route', async () => {
    const analyze = vi.fn(props([first]).analyzeTrajectory)
    render(<TokenUsageSection {...props([first], analyze)} />)

    await waitFor(() => { expect(screen.getByLabelText('分析模型')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '分析轨迹' }))

    expect(screen.getByText('正在分析“主要会话”的完整会话轨迹…')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText(/调用链与合规性正常/)).toBeTruthy() })
    expect(analyze).toHaveBeenCalledWith(
      'session-first',
      { provider: 'deepseek', model: 'deepseek-chat' },
      expect.any(AbortSignal),
    )
    expect(screen.getByText(/deepseek\/deepseek-chat ·/)).toBeTruthy()
    expect(screen.getByText('本次分析 60 Token')).toBeTruthy()
  })

  it('renders totals, model attribution, and filters session records', () => {
    render(<TokenUsageSection {...props()} />)

    expect(screen.getByRole('heading', { name: 'Token 使用记录' })).toBeTruthy()
    expect(screen.getByText('deepseek-chat')).toBeTruthy()
    expect(screen.getByText('未归因用量')).toBeTruthy()
    expect(screen.getByText('主要会话')).toBeTruthy()
    expect(screen.getByText('旧会话')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索会话或模型' }), {
      target: { value: '主要' },
    })
    expect(screen.getByText('主要会话')).toBeTruthy()
    expect(screen.queryByText('旧会话')).toBeNull()
  })
})
