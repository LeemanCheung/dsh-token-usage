import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function MarkdownText({ text }: { text: string }): ReactNode {
  return <div>{text}</div>
}

export function Button({ variant: _variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }): ReactNode {
  return <button {...props} />
}

export function Modal({ open, title, children, footer }: {
  open: boolean
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}): ReactNode {
  return open ? <section role="dialog" aria-label={String(title)}>{children}{footer}</section> : null
}
