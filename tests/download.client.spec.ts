// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserDownload } from '../src/client/export.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('browserDownload', () => {
  it('uses a named Blob URL and revokes it after starting the download', () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:usage') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    browserDownload.save('usage.json', 'application/json;charset=utf-8', '{"schema":"v1"}')

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:usage')
  })
})
