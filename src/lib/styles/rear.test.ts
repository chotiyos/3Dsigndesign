import { describe, expect, it } from 'vitest'
import { bounds, circle, diff, islands, rect, regionArea, union, type Region } from '../geo2d'
import { planModules, powerFor } from '../ledPlan'
import { applyMaterials, buildStyle, findStyle, keyhole, rearHoles, STYLES } from './index'

const area = (r: Region) => Math.abs(regionArea(r))
const dispose = (parts: { geometry: { dispose(): void } }[]) => parts.forEach((p) => p.geometry.dispose())
/** Two hollow "letters", one wide and one narrow, plus a small accent. */
const art = union(rect(-80, 0, 120, 100), rect(60, 0, 40, 100), rect(60, 70, 10, 10))

describe('rear add-ons', () => {
  it('are offered on every style that builds a back plate, and off by default', () => {
    for (const style of STYLES) {
      const keys = style.params.map((p) => p.key)
      const parts = buildStyle(style, rect(0, 0, 120, 60), {})
      const hasBack = parts.some((p) => p.rear)
      expect(keys.includes('deskBase'), style.code).toBe(hasBack)
      expect(parts.some((p) => p.label === 'แท่นตั้งโต๊ะ'), style.code).toBe(false)
      dispose(parts)
    }
  })

  it('cuts one wire passage per hollow letter, through the back only', () => {
    const style = findStyle('front-lit-lip')
    const plain = buildStyle(style, art, {})
    const wired = buildStyle(style, art, { wire: 1, wireD: 6 })
    const before = plain.find((p) => p.rear)!
    const after = wired.find((p) => p.rear)!
    // Three islands (the accent is an island too, but too small for a 6 mm hole).
    const removed = area(before.profile!.region) - area(after.profile!.region)
    expect(removed).toBeGreaterThan(2 * Math.PI * 9 * 0.95)
    expect(removed).toBeLessThan(3 * Math.PI * 9 * 1.05)
    // The plaswood back is still cut from sheet, and its DXF shows the holes.
    expect(after.cut).toBe(after.profile!.region)
    expect(after.code).toBe(before.code)
    expect(wired.map((p) => p.code)).toEqual(plain.map((p) => p.code))
    dispose([...plain, ...wired])
  })

  it('keeps every hole inside the hollow, clear of the walls', () => {
    const cavity = diff(rect(0, 0, 200, 120), rect(0, 0, 60, 40))
    for (const v of [{ wire: 1, wireD: 8, mount: 1, screwD: 4 }, { wire: 1, wireD: 8, mount: 2, screwD: 5 }]) {
      const { holes, notes } = rearHoles(cavity, v)
      expect(notes).toEqual([])
      expect(area(diff(holes, cavity))).toBeLessThan(0.01)
      // Wire hole plus a fixing on each side of a wide letter.
      expect(islands(holes)).toHaveLength(3)
    }
  })

  it('makes keyholes with a head opening below a screw-sized slot', () => {
    const k = keyhole(0, 0, 4)
    const b = bounds(k)
    expect(b.w).toBeCloseTo(8, 0)
    expect(b.minY).toBeCloseTo(-4, 0)
    expect(b.maxY).toBeGreaterThan(7)
  })

  it('reports letters too narrow for a hole instead of failing', () => {
    const { holes, notes } = rearHoles(rect(0, 0, 4, 100), { wire: 1, wireD: 6, mount: 1, screwD: 4 })
    expect(holes).toEqual([])
    expect(notes).toHaveLength(2)
  })

  it('adds a desk base as the last part, under the sign, and flags floating pieces', () => {
    const style = findStyle('front-lit-lip')
    const parts = buildStyle(style, union(rect(0, 0, 100, 60), circle(0, 50, 5)), { deskBase: 1, baseH: 15, baseOver: 25 })
    const base = parts[parts.length - 1]
    expect(base.label).toBe('แท่นตั้งโต๊ะ')
    expect(new Set(parts.map((p) => p.code)).size).toBe(parts.length)
    base.geometry.computeBoundingBox()
    const box = base.geometry.boundingBox!
    // The artwork is centred: the sign spans y -42.5…42.5, so the base sits
    // 15 mm below -42.5 and its rails rise 8 mm above it.
    expect(box.max.y).toBeCloseTo(-34.5, 1)
    expect(box.min.y).toBeCloseTo(-57.5, 1)
    expect(base.warning).toMatch(/1 ชิ้น/)
    // Re-materialling the sign leaves the base alone.
    expect(applyMaterials(parts, { [base.code]: 'accent' }).at(-1)!.material).toBe('accent')
    dispose(parts)
  })
})

describe('LED estimate', () => {
  it('places modules about a pitch apart, at least one per hollow', () => {
    const modules = planModules(union(rect(0, 0, 300, 40), rect(0, 100, 20, 20)), 50)
    expect(modules.length).toBeGreaterThanOrEqual(6)
    expect(modules.length).toBeLessThanOrEqual(9)
    expect(modules.some(([, y]) => y > 80)).toBe(true)
  })

  it('sizes the power supply with headroom', () => {
    expect(powerFor(20, 0.72)).toMatchObject({ supply: 24, supplies: 1 })
    expect(powerFor(1000, 0.72).supplies).toBe(3)
    expect(powerFor(0, 0.72).supplies).toBe(0)
  })
})
