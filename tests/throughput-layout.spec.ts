import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  new URL('../src/client/TokenThroughput.module.css', import.meta.url),
  'utf8',
)

describe('Token throughput footer layout contract', () => {
  it('stacks footer contributions without relying on generated class names', () => {
    expect(stylesheet).toContain('[data-slot="sidebar.footer.action"] > [data-token-throughput="all"]')
    expect(stylesheet).toMatch(/:global\(div:has\([^\n]*data-token-throughput[^\n]*\)\)\s*\{[^}]*flex-direction:\s*column;/s)
    expect(stylesheet).not.toMatch(/hHd-Xa|zai-restart-dsh/)
  })
})
