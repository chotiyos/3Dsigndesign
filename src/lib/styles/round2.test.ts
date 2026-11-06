import { describe, expect, it } from 'vitest'
import { center, circle, diff, islands, rect, regionArea, ring, union } from '../geo2d'
import { buildStyle, findStyle, STYLES } from './index'
import { silhouette } from './kit'
import baseline from './range-baseline.json'

const spaced = union(ring(rect(-300, 0, 80, 200), 12), rect(0, -50, 40, 100), rect(300, 0, 60, 200), circle(300, 150, 10))
const scaled = (height: number) => spaced.map(poly => poly.map(([x, y]) => [x * height / 260, y * height / 260] as [number, number]))

describe('round 2 connected supports', () => {
  for (const style of STYLES) {
    it(`${style.code} preserves defaults, printable minimums and fixed hardware ranges`, () => {
      const before = baseline.find(s => s.code === style.code)!
      for (const param of style.params) {
        const old = before.params.find(p => p.key === param.key)!
        expect(param.value).toBe(old.value)
        if (param.key !== 'shift') expect(param.min).toBe(old.min)
        expect(param.max).toBeGreaterThanOrEqual(old.max)
        if (!style.usesArt || style.id === 'keycap') expect(param.max).toBe(old.max)
      }
    })
    if (style.usesArt) for (const height of [10, 1500]) {
      it(`${style.code} builds finite geometry with widely spaced ${height} mm lettering`, () => {
        const parts = buildStyle(style, scaled(height), {})
        try {
          expect(parts.length).toBeGreaterThan(0)
          for (const part of parts) expect(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
        } finally { parts.forEach(p => p.geometry.dispose()) }
      })
    }
  }
  for (const height of [10, 200, 1500]) {
    for (const id of ['keychain-outline', 'die-cut-box', 'flex-twin-rail', 'desk-block', 'keychain-stencil']) {
      it(`${id} has connected supporting parts at ${height} mm`, () => {
        const parts = buildStyle(findStyle(id), scaled(height), id === 'keychain-stencil' ? { backing: 0 } : {})
        try {
          if (id === 'desk-block') {
            const regions = parts.map(p => p.profile!.region)
            expect(islands(union(...regions))).toHaveLength(1)
            // All original lettering is retained.
            expect(Math.abs(regionArea(diff(center(scaled(height)), regions[1])))).toBeLessThan(0.1)
          } else {
            const support = parts.find(p => p.code === (id === 'flex-twin-rail' || id === 'keychain-stencil' ? 'B' : 'A'))!
            expect(islands(support.profile!.region)).toHaveLength(1)
          }
          if (id === 'die-cut-box') expect(islands(parts.find(p => p.code === 'B')!.profile!.region)).toHaveLength(1)
        } finally { parts.forEach(p => p.geometry.dispose()) }
      })
    }
    it(`silhouette fills letter counters at ${height} mm`, () => {
      const shape = silhouette(scaled(height), 3)
      expect(shape).toHaveLength(1)
      expect(islands(ring(shape, 1))).toHaveLength(1)
    })
  }
  it('keeps F02 counters supported by the optional backing without adding stencil bridges', () => {
    const art = ring(rect(0, 0, 100, 100), 15)
    const parts = buildStyle(findStyle('keychain-stencil'), art, {})
    try {
      expect(islands(parts[1].profile!.region)).toHaveLength(2)
      expect(islands(parts[0].profile!.region)).toHaveLength(1)
    } finally { parts.forEach(p => p.geometry.dispose()) }
  })
  for (const backing of [0, 0.8]) it(`F02 retains material around a large hole on a small tag, backing ${backing}`, () => {
    const parts = buildStyle(findStyle('keychain-stencil'), rect(0, 0, 10, 10), { hole: 100, backing })
    try { for (const part of parts) expect(islands(part.profile!.region)).toHaveLength(1) }
    finally { parts.forEach(p => p.geometry.dispose()) }
  })
  for (const height of [5, 9, 16]) it(`F03 stem reaches the keycap roof at height ${height}`, () => {
    const parts = buildStyle(findStyle('keycap'), rect(0, 0, 10, 10), { height })
    try {
      const stem = parts.find(p => p.code === 'B')!
      stem.geometry.computeBoundingBox()
      expect(stem.geometry.boundingBox!.min.z).toBe(0)
      expect(stem.geometry.boundingBox!.max.z).toBeCloseTo(height - 1.2)
      const cap = parts[0]
      cap.geometry.computeBoundingBox()
      expect(stem.geometry.boundingBox!.max.z).toBeGreaterThan(cap.geometry.boundingBox!.min.z)
    } finally { parts.forEach(p => p.geometry.dispose()) }
  })
  it('audits all 51 styles and preserves fixed hardware ranges', () => {
    expect(STYLES).toHaveLength(51)
    expect(findStyle('keycap').params.map(p => p.max)).toEqual([40, 16, 3])
    for (const style of STYLES.filter(s => s.usesArt && s.id !== 'keycap')) {
      for (const param of style.params) {
        const required: Record<string, number> = { depth: 500, wall: 30, margin: 300, outline: 300, border: 150, front: 30, back: 30, lip: 100, lipT: 20 }
        if (required[param.key]) expect(param.max, `${style.code}.${param.key}`).toBeGreaterThanOrEqual(required[param.key])
        expect(param.value).toBeGreaterThanOrEqual(param.min)
        expect(param.value).toBeLessThanOrEqual(param.max)
      }
    }
  })
  it('F01 loop remains attached for a pointed left edge and maximum hole', () => {
    const art = union([[[-100, 0], [0, -40], [0, 40]]], rect(400, 0, 60, 200))
    const parts = buildStyle(findStyle('keychain-outline'), art, { hole: 100 })
    try { expect(islands(parts[0].profile!.region)).toHaveLength(1) }
    finally { parts.forEach(p => p.geometry.dispose()) }
  })
})
