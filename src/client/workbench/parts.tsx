import { Children, cloneElement, isValidElement, useId, type ReactNode } from 'react'

export type Text = (zh: string, en: string) => string
export const number = (value: number | null | undefined): string => value === null || value === undefined ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 }).format(value)
export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return <label className="wbField"><span id={id}>{label}</span>{Children.map(children, child =>
    isValidElement<{ 'aria-labelledby'?: string }>(child) && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)
      ? cloneElement(child, { 'aria-labelledby': id }) : child
  )}</label>
}
export function JsonDetails({ label, value }: { label: string; value: unknown }) { return <details><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details> }
