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

it('omits a lip above its wall while reserving its letter', () => {
  const outline = rect(0, 0, 100, 50)
  const parts = new Parts().slab('ผนัง', 'print', outline, 5, 0)
    .seat(1, 'บ่า', outline, 2, 3, 2, 10)
    .slab('หน้า', 'opal', outline, 3, 10).done()
  try {
    expect(parts.map(p => p.code)).toEqual(['A', 'C'])
    expect(parts.some(p => p.addon)).toBe(false)
  } finally { parts.forEach(p => p.geometry.dispose()) }
})

it('A12 omits a lip that cannot reach the front panel above the wall', () => {
  const style = findStyle('front-brow')
  for (const browT of [3, 6, 10]) {
    const parts = buildStyle(style, rect(0, 0, 100, 50), { front: 3, browT, seatLip: 1 })
    try {
      const lip = parts.find(p => p.addon)
      if (browT > 3) {
        expect(lip).toBeUndefined()
      } else {
        expect(lip).toBeDefined()
        const panel = parts.find(p => p.material === 'opal')!
        panel.geometry.computeBoundingBox()
        lip!.geometry.computeBoundingBox()
        expect(lip!.geometry.boundingBox!.max.z).toBeCloseTo(panel.geometry.boundingBox!.min.z)
      }
    } finally { parts.forEach(p => p.geometry.dispose()) }
  }
})

for (const id of ['two-tier-light', 'two-tier-full-colour']) {
  for (const glow of [12, 16, 19]) {
    it(`${id} keeps its lip attached to the upper wall with a ${glow} mm light band`, () => {
      const parts = buildStyle(findStyle(id), rect(0, 0, 100, 50), { depth: 20, glow, seatLip: 1 })
      try {
        const lip = parts.find(p => p.addon)
        if (glow >= 16) {
          // The panel underside is below the upper wall: no ledge can attach.
          expect(lip).toBeUndefined()
        } else {
          expect(lip).toBeDefined()
          const wall = parts.find(p => p.code === lip!.addon!.wall)!
          wall.geometry.computeBoundingBox()
          lip!.geometry.computeBoundingBox()
          expect(lip!.geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(wall.geometry.boundingBox!.min.z)
          expect(lip!.geometry.boundingBox!.max.z).toBeCloseTo(20)
        }
        expect(parts.find(p => p.label === 'แถบไฟ LED')?.code).toBe(id === 'two-tier-light' ? 'G' : 'H')
      } finally { parts.forEach(p => p.geometry.dispose()) }
    })
  }
  it(`${id} does not create an orphan lip when the light replaces both walls`, () => {
    const style = findStyle(id)
    const art = rect(0, 0, 100, 50)
    const on = buildStyle(style, art, { depth: 20, glow: 20, seatLip: 1 })
    const off = buildStyle(style, art, { depth: 20, glow: 20, seatLip: 0 })
    try {
      expect(on.map(p => [p.code, p.label])).toEqual(off.map(p => [p.code, p.label]))
      expect(on.some(p => /บ่า/.test(p.label))).toBe(false)
    } finally { [...on, ...off].forEach(p => p.geometry.dispose()) }
  })
}
