import { useMemo, type ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { safeModelMarkdown } from './report-safety.ts'

/** Render untrusted model Markdown semantically without activating remote images or raw HTML. */
export function SafeMarkdownReport({
  report,
  className,
  copyLabel,
  copiedLabel,
  footnotesLabel,
}: {
  report: string
  className?: string | undefined
  copyLabel: string
  copiedLabel: string
  footnotesLabel: string
}): ReactNode {
  const safeReport = useMemo(() => safeModelMarkdown(report), [report])
  const labels = useMemo(() => ({
    code: { copyLabel, copiedLabel },
    footnotes: footnotesLabel,
  }), [copiedLabel, copyLabel, footnotesLabel])
  return <div className={className}><MarkdownText text={safeReport} labels={labels} /></div>
}
