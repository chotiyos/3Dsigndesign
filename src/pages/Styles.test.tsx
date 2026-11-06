import { isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (value: unknown) => [value, vi.fn()], useMemo: (fn: () => unknown) => fn(), useEffect() {},
}))
vi.mock('../router', () => ({ useTitle() {}, Link: 'a' }))
vi.mock('../lib/useFont', () => ({ useFont: () => ({ font: {} }) }))
vi.mock('../lib/artwork', () => ({ textToRegion: () => [[[0, 0], [120, 0], [120, 100], [0, 100]]] }))
vi.mock('../three/Viewer', () => ({ Viewer: 'viewer' }))
import { StyleDetail } from './Styles'

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  return [node as any, ...nodes(node.props.children)]
}

it('describes purchased lights, sheet cuts and printed walls correctly in the style detail', () => {
  const tree = nodes(StyleDetail({ id: 'front-lit-lip' }))
  const methods = tree.filter(n => n.type === 'td').map(n => n.props.children)
  expect(methods).toContain('ซื้อสำเร็จ')
  expect(methods).toContain('ตัดแผ่น · DXF')
  expect(methods).toContain('พิมพ์ 3D · STL')
  const viewer = tree.find(n => n.type === 'viewer')
  viewer?.props.parts.forEach((p: any) => p.geometry.dispose())
})
