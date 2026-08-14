import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-compaction'
import { tokenUsageRecorderProjectionDefinition as definition } from '../src/projection.ts'

function event(value: unknown): SessionEvent {
  return value as SessionEvent
}

describe('tokenUsageRecorder projection', () => {
  it('drops a pre-daily checkpoint and refolds the complete log', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry).await()
    const unregister = ctx.sessionProjections.register(definition)
    const events = [
      event({
        seq: 0,
        time: 1,
        type: 'request/context',
        data: { provider: 'deepseek', model: 'deepseek-chat' },
      }),
      event({
        seq: 1,
        time: 2,
        type: 'assistant/chunk',
        data: {
          turn: 1,
          step: 1,
          chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
        },
      }),
      event({
        seq: 2,
        time: 3,
        type: 'llm/retry',
        data: {
          retryId: 'retry-1',
          turn: 1,
          step: 1,
          provider: 'deepseek',
          mode: 'normal',
          policyKey: 'policy',
          retry: 1,
          maxRetries: 2,
          delayMs: 0,
          failure: { code: 'SERVER', message: 'retry' },
        },
      }),
      event({
        seq: 3,
        time: 4,
        type: 'assistant/chunk',
        data: {
          turn: 1,
          step: 1,
          chunk: { type: 'usage', usage: { inputTokens: 8, outputTokens: 2 } },
        },
      }),
    ]
    const legacyCheckpoint = {
      tokenUsageRecorder: { ver: 2, seq: 3, val: {} },
    }

    try {
      expect(definition.stateVersion).toBe(5)
      expect(ctx.sessionProjections.restoreFloor(legacyCheckpoint)).toBe(0)
      const restored = ctx.sessionProjections.restore(legacyCheckpoint, events, 0)
      expect(restored.snapshot.values.tokenUsageRecorder).toMatchObject({
        assistantRequests: 2,
        compactionRequests: 0,
        compactionUsage: {
          uncachedInputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        usage: {
          uncachedInputTokens: 18,
          outputTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      })
      expect(restored.checkpoint.tokenUsageRecorder).toMatchObject({ ver: 5, seq: 3 })
    } finally {
      unregister()
      await ctx.fiber.dispose()
    }
  })

  it('replaces same-step samples and includes compaction usage by model', () => {
    let state = definition.init()
    state = definition.apply(state, event({
      seq: 0,
      time: 1,
      type: 'request/context',
      data: { provider: 'deepseek', model: 'deepseek-chat' },
    }))
    state = definition.apply(state, event({
      seq: 1,
      time: 2,
      type: 'assistant/chunk',
      data: {
        turn: 1,
        step: 1,
        chunk: {
          type: 'usage',
          usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 5 },
        },
      },
    }))
    state = definition.apply(state, event({
      seq: 2,
      time: 3,
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'message-1',
          role: 'assistant',
          content: [],
          source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
        },
        usage: {
          inputTokens: 12,
          outputTokens: 4,
          cacheReadTokens: 8,
          cacheWriteTokens: 1,
          reasoningTokens: 3,
        },
      },
    }))
    state = definition.apply(state, event({
      seq: 3,
      time: 4,
      type: 'compaction/summary',
      data: {
        compactionId: 'compaction-1',
        summary: [],
        shadowedRange: { start: 0, end: 1 },
        shadowedSeqs: [0, 1],
        shadowedTokenCount: 20,
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 2 },
      },
    }))

    const view = definition.view(state)
    expect(view).toEqual({
      assistantRequests: 1,
      compactionRequests: 1,
      compactionUsage: {
        uncachedInputTokens: 20,
        outputTokens: 5,
        cacheReadTokens: 2,
        cacheWriteTokens: 0,
      },
      usage: {
        uncachedInputTokens: 32,
        outputTokens: 9,
        cacheReadTokens: 10,
        cacheWriteTokens: 1,
      },
      models: [
        {
          provider: 'deepseek',
          model: 'deepseek-reasoner',
          assistantRequests: 0,
          compactionRequests: 1,
          usage: {
            uncachedInputTokens: 20,
            outputTokens: 5,
            cacheReadTokens: 2,
            cacheWriteTokens: 0,
          },
        },
        {
          provider: 'deepseek',
          model: 'deepseek-chat',
          assistantRequests: 1,
          compactionRequests: 0,
          usage: {
            uncachedInputTokens: 12,
            outputTokens: 4,
            cacheReadTokens: 8,
            cacheWriteTokens: 1,
          },
        },
      ],
      days: [{
        date: '1970-01-01',
        usage: {
          uncachedInputTokens: 32,
          outputTokens: 9,
          cacheReadTokens: 10,
          cacheWriteTokens: 1,
        },
      }],
    })
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('moves a finalized replacement sample to its reporting day', () => {
    let state = definition.init()
    state = definition.apply(state, event({
      seq: 0,
      time: Date.parse('2026-08-12T23:59:00.000Z'),
      type: 'request/context',
      data: { provider: 'deepseek', model: 'deepseek-chat' },
    }))
    state = definition.apply(state, event({
      seq: 1,
      time: Date.parse('2026-08-12T23:59:30.000Z'),
      type: 'assistant/chunk',
      data: {
        turn: 1,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
      },
    }))
    state = definition.apply(state, event({
      seq: 2,
      time: Date.parse('2026-08-13T00:00:30.000Z'),
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'message-1',
          role: 'assistant',
          content: [],
          source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
        },
        usage: { inputTokens: 12, outputTokens: 2 },
      },
    }))

    expect(definition.view(state).days).toEqual([{
      date: '2026-08-13',
      usage: {
        uncachedInputTokens: 12,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    }])
  })

  it('keeps usage from every retry attempt within one turn and step', () => {
    let state = definition.init()
    state = definition.apply(state, event({
      seq: 0,
      time: 1,
      type: 'request/context',
      data: { provider: 'deepseek', model: 'deepseek-chat' },
    }))
    state = definition.apply(state, event({
      seq: 1,
      time: 2,
      type: 'assistant/chunk',
      data: {
        turn: 1,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
      },
    }))
    state = definition.apply(state, event({
      seq: 2,
      time: 3,
      type: 'llm/retry',
      data: {
        retryId: 'retry-1',
        turn: 1,
        step: 1,
        provider: 'deepseek',
        mode: 'normal',
        policyKey: 'policy',
        retry: 1,
        maxRetries: 2,
        delayMs: 0,
        failure: { code: 'SERVER', message: 'retry' },
      },
    }))
    state = definition.apply(state, event({
      seq: 3,
      time: 4,
      type: 'llm/retry-started',
      data: { retryId: 'retry-1', turn: 1, step: 1, retry: 1 },
    }))
    state = definition.apply(state, event({
      seq: 4,
      time: 5,
      type: 'assistant/chunk',
      data: {
        turn: 1,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 1 } },
      },
    }))
    state = definition.apply(state, event({
      seq: 5,
      time: 6,
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'message-1',
          role: 'assistant',
          content: [],
          source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
        },
        usage: { inputTokens: 8, outputTokens: 2 },
      },
    }))

    expect(definition.view(state)).toEqual({
      assistantRequests: 2,
      compactionRequests: 0,
      compactionUsage: {
        uncachedInputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      usage: {
        uncachedInputTokens: 18,
        outputTokens: 4,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      models: [{
        provider: 'deepseek',
        model: 'deepseek-chat',
        assistantRequests: 2,
        compactionRequests: 0,
        usage: {
          uncachedInputTokens: 18,
          outputTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      }],
      days: [{
        date: '1970-01-01',
        usage: {
          uncachedInputTokens: 18,
          outputTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      }],
    })
  })

  it('counts a failed pre-usage retry as a zero-Token model attempt', () => {
    let state = definition.init()
    state = definition.apply(state, event({
      seq: 0,
      time: 1,
      type: 'request/context',
      data: { provider: 'deepseek', model: 'deepseek-chat' },
    }))
    state = definition.apply(state, event({
      seq: 1,
      time: 2,
      type: 'llm/retry',
      data: { retryId: 'retry-1', turn: 1, step: 1, retry: 1, failure: { code: 'SERVER', message: 'private' } },
    }))
    state = definition.apply(state, event({
      seq: 2,
      time: 3,
      type: 'assistant/chunk',
      data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 3, outputTokens: 1 } } },
    }))

    expect(definition.view(state)).toMatchObject({
      assistantRequests: 2,
      usage: { uncachedInputTokens: 3, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      models: [{ provider: 'deepseek', model: 'deepseek-chat', assistantRequests: 2 }],
    })
  })

  it('counts a pre-usage retry when the last sample belongs to another step', () => {
    let state = definition.init()
    const events = [
      { seq: 0, time: 1, type: 'request/context', data: { provider: 'deepseek', model: 'deepseek-chat' } },
      { seq: 1, time: 2, type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } } } },
      { seq: 2, time: 3, type: 'llm/retry', data: { retryId: 'retry-2', turn: 1, step: 2, retry: 1, failure: { code: 'SERVER', message: 'private' } } },
      { seq: 3, time: 4, type: 'assistant/chunk', data: { turn: 1, step: 2, chunk: { type: 'usage', usage: { inputTokens: 3, outputTokens: 1 } } } },
    ]
    for (const item of events) state = definition.apply(state, event(item))

    expect(definition.view(state)).toMatchObject({
      assistantRequests: 3,
      usage: { uncachedInputTokens: 5, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      models: [{ provider: 'deepseek', model: 'deepseek-chat', assistantRequests: 3 }],
    })
  })

  it('counts a compaction attempt even when provider usage is unavailable', () => {
    const state = definition.apply(definition.init(), event({
      seq: 0,
      time: 1,
      type: 'compaction/summary',
      data: { provider: 'deepseek', model: 'deepseek-chat', summary: 'private' },
    }))

    expect(definition.view(state)).toMatchObject({
      compactionRequests: 1,
      compactionUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      models: [{ provider: 'deepseek', model: 'deepseek-chat', compactionRequests: 1 }],
      usage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
  })

  it('returns the same state for duplicate final usage', () => {
    let state = definition.init()
    const sample = event({
      seq: 0,
      time: 1,
      type: 'assistant/chunk',
      data: {
        turn: 1,
        step: 1,
        chunk: { type: 'usage', usage: { inputTokens: 3, outputTokens: 1 } },
      },
    })
    state = definition.apply(state, sample)
    expect(definition.apply(state, sample)).toBe(state)
  })
})
