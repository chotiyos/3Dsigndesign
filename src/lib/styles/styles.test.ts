import { describe, expect, it } from 'vitest'
import { circle, diff, rect, union } from '../geo2d'
import { analyse } from '../solid'
import { buildStyle, defaultValues, STYLES } from './index'

/** Stand-in artwork with a hole, a thin stroke, and a separate island, like real lettering. */
const ART = union(
  diff(rect(-60, 0, 80, 120), rect(-60, 10, 30, 50)),
  rect(40, 0, 18, 120),
  circle(90, 50, 12, 32),
)

describe('style catalogue', () => {
  it('has at least 49 styles with unique ids and codes', () => {
    expect(STYLES.length).toBeGreaterThanOrEqual(49)
    expect(new Set(STYLES.map((s) => s.id)).size).toBe(STYLES.length)
    expect(new Set(STYLES.map((s) => s.code)).size).toBe(STYLES.length)
  })

  for (const style of STYLES) {
    it(`${style.code} ${style.id} builds solid parts at default settings`, () => {
      const parts = buildStyle(style, ART, defaultValues(style))
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        const pos = part.geometry.getAttribute('position')
        expect(pos.count, `${part.label} has geometry`).toBeGreaterThan(0)
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true)
        }
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox!
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(box.max[axis] - box.min[axis], part.label + ' stays below 20 metres').toBeLessThan(20000)
        }
        const { volume } = analyse(part.geometry)
        expect(volume, `${part.label} encloses positive volume`).toBeGreaterThan(0)
      }
    })

    it(`${style.code} ${style.id} survives every parameter at its limits`, () => {
      for (const param of style.params) {
        for (const value of [param.min, param.max]) {
          const values = { ...defaultValues(style), [param.key]: value }
          const parts = buildStyle(style, ART, values)
          try {
            for (const part of parts) {
              expect(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
              part.geometry.computeBoundingBox()
              const box = part.geometry.boundingBox!
              for (const axis of ['x', 'y', 'z'] as const) {
                expect(box.max[axis] - box.min[axis], part.label + ' stays below 20 metres').toBeLessThan(20000)
              }
            }
          } finally { parts.forEach((p) => p.geometry.dispose()) }
        }
      }
    })
  }
})

it('curved-surface never wraps text more than three quarters around the column', () => {
  const style = STYLES.find((s) => s.id === 'curved-surface')!
  const wide = union(rect(0, 0, 1000, 100))
  const parts = buildStyle(style, wide, { ...defaultValues(style), radius: 30 })
  parts[0].geometry.computeBoundingBox()
  const box = parts[0].geometry.boundingBox!
  // A full wrap would put geometry on both sides of the column's axis in z.
  expect(box.max.x - box.min.x).toBeGreaterThan(100)
  expect(parts[0].warning).toMatch(/รัศมี/)
  expect(buildStyle(style, union(rect(0, 0, 100, 100)), defaultValues(style))[0].warning).toBeUndefined()
})

for (const id of ['two-tier-light', 'two-tier-full-colour']) {
  it(id + ' keeps the side light within the body at minimum depth', () => {
    const style = STYLES.find((s) => s.id === id)!
    const values: Record<string, number> = { ...defaultValues(style), depth: 5, glow: 60 }
    const parts = buildStyle(style, ART, values)
    const light = parts.find((p) => p.material === 'opal')!
    light.geometry.computeBoundingBox()
    expect(light.geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(values.back)
    expect(light.geometry.boundingBox!.max.z).toBeLessThanOrEqual(values.back + values.depth)
  })
}
