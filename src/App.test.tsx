import { isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'

const route = vi.hoisted(() => ({ path: '/', hash: '' }))
vi.mock('./router', () => ({
  useLocation: () => ({ ...route, search: '', query: new URLSearchParams() }),
  useNavigationScroll() {}, useTitle() {}, Link: 'a', navigate: vi.fn(),
}))
import App from './App'
import { NotFoundBody } from './pages/Styles'

it('remounts the editor when another share link is opened on the same path', () => {
  route.path = '/app'
  route.hash = '#d=first'
  const first = (App().props.children as any).key
  route.hash = '#d=second'
  expect((App().props.children as any).key).not.toBe(first)
})

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
