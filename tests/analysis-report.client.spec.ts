import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { prepareTrajectory } from '../src/trajectory-analysis.ts'
import {
  analysisReportFilename,
  tokenUsageAnalysisMarkdown,
  trajectoryAnalysisMarkdown,
} from '../src/client/export.ts'
import { safeModelMarkdown } from '../src/client/report-safety.ts'
import type { TokenUsageAnalysis, TrajectoryAnalysis } from '../src/types.ts'

describe('analysis report presentation and export', () => {
  it('neutralizes inline, reference, and shortcut Markdown images without deleting labels', () => {
    const markdown = '![chart](https://tracker.invalid/pixel.png)\n![diagram][ref]\n![]\n![tracking \\]](https://tracker.invalid/escaped.png)\n![nested [label]](https://tracker.invalid/nested.png)\n<img src="https://tracker.invalid/raw.png">\n<div style="background:url(https://tracker.invalid/css)">x</div>\n[ref]: https://tracker.invalid/ref.png'
    const safe = safeModelMarkdown(markdown)
    expect(safe).not.toContain('![')
    expect(safe).toContain('[chart](https://tracker.invalid/pixel.png)')
    expect(safe).toContain('[diagram][ref]')
    expect(safe).toContain('image')
    expect(safe).not.toContain('<img')
    expect(safe).not.toContain('<div')
    expect(safe).toContain('&lt;img')
  })

  it('creates identity-free filenames and portable Markdown for both report types', () => {
    const generatedAt = '2026-08-14T01:02:03.000Z'
    const usage: TokenUsageAnalysis = {
      schema: 'dsh-token-usage/usage-analysis-v1',
      generatedAt,
      model: { provider: 'deepseek', model: 'chat' },
      analysisUsage: { uncachedInputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      report: '# Usage findings\n\n![pixel](https://tracker.invalid/pixel.png)',
    }
    const trajectory: TrajectoryAnalysis = {
      schema: 'dsh-token-usage/trajectory-analysis-v3',
      sessionId: String(SessionId('private-session-title')),
      generatedAt,
      model: { provider: 'deepseek', model: 'chat' },
      truncated: false,
      metrics: prepareTrajectory([]).metrics,
      report: '# Trajectory findings',
    }

    expect(analysisReportFilename('trajectory', generatedAt)).toBe('dsh-trajectory-analysis-2026-08-14T01-02-03-000Z.md')
    expect(analysisReportFilename('trajectory', generatedAt)).not.toContain('private-session-title')
    expect(tokenUsageAnalysisMarkdown(usage)).toContain('# Usage findings')
    expect(tokenUsageAnalysisMarkdown(usage)).not.toContain('![pixel]')
    expect(trajectoryAnalysisMarkdown(trajectory)).toContain('metadata-based technical-control review')
    expect(trajectoryAnalysisMarkdown(trajectory)).toContain('Persistent approval decisions | Not defined by ApprovalOutcome; session policy events excluded')
    expect(trajectoryAnalysisMarkdown(trajectory)).not.toContain('private-session-title')

    const legacy: TrajectoryAnalysis = {
      ...trajectory,
      schema: 'dsh-token-usage/trajectory-analysis-v2',
      metrics: { ...trajectory.metrics, completeComplianceEvidenceAvailable: false, approvalsAsked: 3, approvalsRejected: 2 },
    }
    expect(trajectoryAnalysisMarkdown(legacy)).toContain('Approval requests | 3')
    expect(trajectoryAnalysisMarkdown(legacy)).toContain('Rejected decisions | 2')
    expect(trajectoryAnalysisMarkdown(legacy)).toContain('v3 closure/categorized outcomes/audit gaps | Unavailable in this pre-v3 report')
    expect(trajectoryAnalysisMarkdown(legacy)).not.toContain('| Approval closure |')
  })
})
