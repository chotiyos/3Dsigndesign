import { isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'

const route = vi.hoisted(() => ({ path: '/' }))
vi.mock('./router', () => ({
  useLocation: () => ({ ...route, search: '', query: new URLSearchParams() }),
  useNavigationScroll() {}, useTitle() {}, Link: 'a', navigate: vi.fn(),
}))
import App from './App'
import { NotFoundBody } from './pages/Styles'

function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some(child => contains(child, type))
  if (!isValidElement<{ children?: ReactNode }>(node)) return false
  return node.type === type || contains(node.props.children, type)
}

for (const path of ['/materials', '/materials/cart', '/pricing']) {
  it(`routes the retired ${path} page to 404`, () => {
    route.path = path
    expect(contains(App(), NotFoundBody)).toBe(true)
  })
}
