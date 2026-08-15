import { useMemo, type ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { safeModelMarkdown } from './report-safety.ts'

/** Render untrusted model Markdown semantically without activating remote images or raw HTML. */
export function SafeMarkdownReport({
  report,
  className,
  copyLabel,
  copiedLabel,
}: {
  report: string
  className?: string | undefined
  copyLabel: string
  copiedLabel: string
}): ReactNode {
  const safeReport = useMemo(() => safeModelMarkdown(report), [report])
  const codeLabels = useMemo(() => ({ copyLabel, copiedLabel }), [copiedLabel, copyLabel])
  return <div className={className}><MarkdownText text={safeReport} codeLabels={codeLabels} /></div>
}
