import { expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useEffect() {}, useLayoutEffect() {},
}))
import { Tour } from './Tour'

function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return content(node.props.children)
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}

it('skips tour targets hidden by responsive CSS', () => {
  vi.stubGlobal('document', { querySelector: (target: string) => ({ getClientRects: () => target === '.hidden' ? [] : [{}] }) })
  vi.stubGlobal('window', { innerWidth: 375, innerHeight: 667 })
  try {
    const tree = Tour({ steps: [
      { target: '.hidden', title: 'Hidden layers', text: 'Unavailable' },
      { target: '.visible', title: 'Visible controls', text: 'Available' },
    ], onClose: vi.fn() })
    expect(content(tree)).toContain('1 / 1')
    expect(content(tree)).toContain('Visible controls')
    expect(content(tree)).not.toContain('Hidden layers')
  } finally { vi.unstubAllGlobals() }
})
