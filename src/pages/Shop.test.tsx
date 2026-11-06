import { isValidElement, type ReactNode } from 'react'
import { BoxGeometry } from 'three'
import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (value: unknown) => [value, vi.fn()],
}))
vi.mock('../router', () => ({ useTitle() {}, Link: 'a' }))
vi.mock('../ui/StyleThumb', () => ({ StyleThumb: () => null }))
vi.mock('../lib/account', () => ({
  useDemo: () => ({}), credits: () => 100, EXPORT_COST: { file: 15 },
  spend: vi.fn(() => true), changeCartQty: vi.fn(), clearCart: vi.fn(),
}))
vi.mock('../lib/hb', () => ({ loadFont: vi.fn(async () => ({})) }))
vi.mock('../lib/artwork', () => ({ textToRegion: () => [] }))
vi.mock('../lib/styles', async (original) => ({
  ...await original<typeof import('../lib/styles')>(), buildStyle: vi.fn(),
}))
vi.mock('../lib/exportModel', () => ({
  partsToStl: vi.fn(), downloadBlob: vi.fn(), safeName: (name: string) => name,
}))

import { spend } from '../lib/account'
import { downloadBlob, partsToStl } from '../lib/exportModel'
import { buildStyle } from '../lib/styles'
import { Files } from './Shop'
import { READY_FILES } from '../data/shop'

it('links every ready file to its own editor preset', () => {
  const links: string[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!isValidElement<{ children?: ReactNode; href?: string }>(node)) return
    if (node.type === 'a' && node.props.href) links.push(node.props.href)
    visit(node.props.children)
  }
  visit(Files())
  expect(links).toEqual(READY_FILES.map(file => `/app?style=${file.styleId}&file=${encodeURIComponent(file.id)}`))
})

function firstDownload(node: ReactNode): (() => Promise<void>) | undefined {
  if (Array.isArray(node)) return node.map(firstDownload).find(Boolean)
  if (!isValidElement<{ children?: ReactNode; onClick?: () => Promise<void> }>(node)) return
  if (node.type === 'button') return node.props.onClick
  return firstDownload(node.props.children)
}

beforeEach(() => vi.clearAllMocks())

it('generates the ready-file STL before charging and releases its geometry', async () => {
  const geometry = new BoxGeometry()
  const dispose = vi.spyOn(geometry, 'dispose')
  vi.mocked(buildStyle).mockReturnValue([{ id: 'A', code: 'A', label: 'test', material: 'print', explode: 0, geometry }])
  vi.mocked(partsToStl).mockImplementation(() => {
    expect(spend).not.toHaveBeenCalled()
    return new Uint8Array([1])
  })
  await firstDownload(Files())!()
  expect(dispose).toHaveBeenCalledOnce()
  expect(spend).toHaveBeenCalledOnce()
  expect(downloadBlob).toHaveBeenCalledOnce()
})

it('does not charge or download when ready-file STL generation fails', async () => {
  const geometry = new BoxGeometry()
  const dispose = vi.spyOn(geometry, 'dispose')
  vi.mocked(buildStyle).mockReturnValue([{ id: 'A', code: 'A', label: 'test', material: 'print', explode: 0, geometry }])
  vi.mocked(partsToStl).mockImplementation(() => { throw new Error('export failed') })
  await firstDownload(Files())!()
  expect(spend).not.toHaveBeenCalled()
  expect(downloadBlob).not.toHaveBeenCalled()
  expect(dispose).toHaveBeenCalledOnce()
})
