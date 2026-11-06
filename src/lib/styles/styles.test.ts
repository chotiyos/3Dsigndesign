import { describe, expect, it } from 'vitest'
import { circle, diff, rect, union } from '../geo2d'
import { analyse } from '../solid'
import { buildStyle, defaultValues, STYLES, type SignPart } from './index'

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
    const light = parts.find((p) => p.material === 'opalprint')!
    light.geometry.computeBoundingBox()
    expect(light.geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(values.back)
    expect(light.geometry.boundingBox!.max.z).toBeLessThanOrEqual(values.back + values.depth)
  })
}

describe('files follow materials', () => {
  const SHEET = new Set(['acrylic', 'opal', 'plaswood', 'mirror', 'metal'])
  for (const style of STYLES) {
    it(`${style.code} gives DXF only to sheet parts, and its make label matches`, () => {
      const parts = buildStyle(style, ART, defaultValues(style))
      try {
        for (const part of parts) {
          if (part.cut) expect(SHEET.has(part.material), `${part.code} ${part.label} is ${part.material} but has a DXF`).toBe(true)
          if (part.label.includes('อะคริลิก') && !part.label.includes('บ่า')) expect(['opal', 'acrylic', 'mirror']).toContain(part.material)
        }
        const front = style.params.find(p => p.key === 'front')
        // Shared thickness controls must also fit printed and metal faces.
        if (front && parts.some(p => p.material === 'opalprint')) expect(front.label).not.toContain('อะคริลิก')
        const made = parts.filter((p) => p.material !== 'led')
        const cut = made.filter((p) => p.cut).length
        const actual = cut === 0 ? 'print' : cut === made.length ? 'cut' : 'mixed'
        expect(actual, `${style.id} make label`).toBe(style.make)
      } finally { parts.forEach((p) => p.geometry.dispose()) }
    })
  }
})

it('does not advertise CNC files for the default printed classic solid', () => {
  const style = STYLES.find(s => s.id === 'classic-solid')!
  expect(style.make).toBe('print')
  expect(style.blurb).toContain('พิมพ์ 3D')
  expect(style.blurb).not.toContain('CNC')
})

describe('front panel lip switch', () => {
  const withSwitch = STYLES.filter((s) => s.params.some((p) => p.key === 'seatLip'))
  it('is offered on every style with a front panel', () => {
    expect(withSwitch.map((s) => s.code)).toEqual(['A01', 'A02', 'A04', 'A05', 'A06', 'A07', 'A08', 'A11', 'A12', 'A15', 'A16', 'B01', 'D01', 'D02', 'D03', 'D05'])
  })
  for (const style of withSwitch) {
    it(`${style.code} adds a printed lip under the panel without renaming other parts`, () => {
      const on = buildStyle(style, ART, { ...defaultValues(style), seatLip: 1 })
      const off = buildStyle(style, ART, { ...defaultValues(style), seatLip: 0 })
      try {
        const lips = on.filter((p) => !off.some((o) => o.code === p.code))
        expect(lips.length, 'lip parts').toBeGreaterThan(0)
        expect(lips.every((p) => p.material === 'print' && /บ่า/.test(p.label))).toBe(true)
        // Every other part keeps its letter, so saved material picks still match.
        for (const part of off) expect(on.find((p) => p.code === part.code)?.label).toBe(part.label)
        const box = (g: SignPart['geometry']) => { g.computeBoundingBox(); return g.boundingBox! }
        const all = on.map((p) => box(p.geometry))
        const minZ = Math.min(...all.map((b) => b.min.z))
        const maxZ = Math.max(...all.map((b) => b.max.z))
        for (const lip of lips) {
          const b = box(lip.geometry)
          expect(b.min.z).toBeGreaterThanOrEqual(minZ - 1e-6)
          expect(b.max.z).toBeLessThanOrEqual(maxZ + 1e-6)
          // The lip touches a panel face: some non-lip part starts where it ends, or ends where it starts.
          const touches = on.some((p) => !lips.includes(p) && p.material !== 'led' && (Math.abs(box(p.geometry).min.z - b.max.z) < 0.01 || Math.abs(box(p.geometry).max.z - b.min.z) < 0.01))
          expect(touches, `${lip.label} touches a panel`).toBe(true)
        }
      } finally {
        on.forEach((p) => p.geometry.dispose())
        off.forEach((p) => p.geometry.dispose())
      }
    })
  }
})
