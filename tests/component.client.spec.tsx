// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function props(summaries: readonly SessionSummary[] = [first, legacy]): TokenUsageSectionProps {
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
    t: translate,
  } as TokenUsageSectionProps
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'))
    render(<TokenUsageSection {...props([activity])} />)

    expect(screen.getByRole('grid', { name: 'Token 活跃度' })).toBeTruthy()
    const cell = screen.getAllByRole('gridcell').find(item => item.getAttribute('title')?.startsWith('2026-08-12'))
    expect(screen.getAllByRole('gridcell')).toHaveLength(210)
    expect(cell?.getAttribute('title')).toBe('2026-08-12\n总计 1,000 Token\n输入 1,000 · 输出 0\n缓存：读 0 · 写 0')
    expect(cell?.getAttribute('data-level')).toBe('4')
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
