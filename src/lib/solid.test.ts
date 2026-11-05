import { describe, expect, it } from 'vitest'
import { rect } from './geo2d'
import { analyse, extrude, merge, radial, revolve } from './solid'

describe('solid geometry', () => {
  it('rejects non-finite extrusion dimensions', () => {
    for (const depth of [0, -1, NaN, Infinity]) expect(extrude(rect(0, 0, 10, 10), depth).getAttribute('position')).toBeUndefined()
    expect(extrude(rect(0, 0, 10, 10), 2, NaN).getAttribute('position')).toBeUndefined()
  })
  it('requires exactly two incident faces per edge', () => {
    const box = extrude(rect(0, 0, 10, 10), 2)
    expect(analyse(box).volume).toBeCloseTo(200)
    expect(analyse(box).watertight).toBe(true)
    expect(analyse(merge([box, box.clone()])).watertight).toBe(false)
  })
  it('keeps revolution and tube normals outward', () => {
    for (const g of [revolve([[0, 0], [10, 0], [10, 20], [0, 20]]), radial(20, 2, 64, () => 10, () => 8)]) {
      expect(analyse(g).volume).toBeGreaterThan(0)
      expect(analyse(g).watertight).toBe(true)
    }
  })
})
