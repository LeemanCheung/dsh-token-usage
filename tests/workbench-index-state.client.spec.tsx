// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchSection } from '../src/client/workbench/register.tsx'

afterEach(cleanup)
describe('workbench session-index availability', () => {
  it('exposes offline receipts without turning an unavailable index into observed zero usage', () => {
    const read = vi.fn()
    const props = {
      useSessions: (selector: (state: unknown) => unknown) => selector({ phase: 'loading', ids: [], byId: {} }),
      port: { read }, getLanguage: () => 'en',
    } as unknown as ComponentProps<typeof WorkbenchSection>
    render(<WorkbenchSection {...props}/>)
    expect(screen.getByRole('status').textContent).toContain('session index is not ready')
    expect(screen.getByText('Offline receipts (no Host required)')).toBeDefined()
    expect(screen.queryByText('Combined observed Tokens')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Usage workbench' })).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
})
