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
        const { volume } = analyse(part.geometry)
        expect(volume, `${part.label} encloses positive volume`).toBeGreaterThan(0)
      }
    })

    it(`${style.code} ${style.id} survives every parameter at its limits`, () => {
      for (const param of style.params) {
        for (const value of [param.min, param.max]) {
          const values = { ...defaultValues(style), [param.key]: value }
          expect(() => buildStyle(style, ART, values), `${param.key}=${value}`).not.toThrow()
        }
      }
    })
  }
})
