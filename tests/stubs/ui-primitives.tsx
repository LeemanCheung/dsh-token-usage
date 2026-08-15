import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function MarkdownText({ text }: { text: string }): ReactNode {
  return <div>{text}</div>
}

export function Button({ variant: _variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }): ReactNode {
  return <button {...props} />
}

export function Modal({ open, title, children, footer, className, contentClassName }: {
  open: boolean
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
}): ReactNode {
  return open
    ? <section className={className} role="dialog" aria-label={String(title)}>
        <div className={contentClassName}>{children}</div>
        {footer}
      </section>
    : null
}
