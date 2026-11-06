import { describe, expect, it } from 'vitest'
import { circle, islands, rect, union } from '../geo2d'
import { buildStyle, findStyle } from './index'
import { silhouette } from './kit'

// Widely spaced letters, one sitting low, and a floating dot: a plain grow would split.
const art = union(rect(-300, 0, 60, 200), rect(-100, -40, 60, 120), rect(150, 0, 60, 200), circle(150, 160, 12))

describe('one-piece outlines', () => {
  it('joins separate letters into a single outline', () => {
    expect(islands(silhouette(art, 3))).toHaveLength(1)
  })

  it('F01 keychain base is one piece with its loop attached, at any size', () => {
    for (const scale of [0.05, 1, 4]) {
      const scaled = art.map((poly) => poly.map(([x, y]) => [x * scale, y * scale] as [number, number]))
      const parts = buildStyle(findStyle('keychain-outline'), scaled, {})
      const base = parts.find((p) => p.label === 'พื้นพวงกุญแจ')!
      expect(islands(base.profile!.region)).toHaveLength(1)
      parts.forEach((p) => p.geometry.dispose())
    }
  })

  it('F01 and F02 allow big signs: wide outline, thick base, large hole', () => {
    const f01 = findStyle('keychain-outline').params
    expect(f01.find((p) => p.key === 'outline')!.max).toBeGreaterThanOrEqual(100)
    expect(f01.find((p) => p.key === 'base')!.max).toBeGreaterThanOrEqual(30)
    expect(findStyle('keychain-stencil').params.find((p) => p.key === 'margin')!.max).toBeGreaterThanOrEqual(100)
  })

  it('D01 box follows the text as one box', () => {
    const parts = buildStyle(findStyle('die-cut-box'), art, {})
    const wall = parts.find((p) => p.label === 'ผนังกล่อง')!
    expect(islands(wall.profile!.region).filter((i) => i.length && i[0].length > 2)).toHaveLength(1)
    parts.forEach((p) => p.geometry.dispose())
  })
})
