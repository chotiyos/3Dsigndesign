import { BufferGeometry } from 'three'
import { expect, it, vi } from 'vitest'
import { rect } from '../geo2d'
import { buildStyle, findStyle } from './index'
import { Parts } from './kit'

it('reserves letters for empty parts and disposes rejected geometry', () => {
  const empty = new BufferGeometry()
  const dispose = vi.spyOn(empty, 'dispose')
  const parts = new Parts().solid('empty', 'print', empty)
    .slab('face', 'opal', rect(0, 0, 20, 20), 3, 0).done()
  expect(dispose).toHaveBeenCalledOnce()
  expect(parts[0].code).toBe('B')
  expect(parts[0].profile?.depth).toBe(3)
  parts.forEach(p => p.geometry.dispose())
})

it('keeps stencil material and visibility keys stable when backing disappears', () => {
  const style = findStyle('keychain-stencil')
  const backed = buildStyle(style, rect(0, 0, 100, 50), { backing: 1 })
  const bare = buildStyle(style, rect(0, 0, 100, 50), { backing: 0 })
  expect(backed).toHaveLength(2)
  expect(bare).toHaveLength(1)
  expect(bare[0].code).toBe(backed[1].code)
  expect(bare[0].label).toBe(backed[1].label)
  ;[...backed, ...bare].forEach(p => p.geometry.dispose())
})
