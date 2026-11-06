import { expect, it } from 'vitest'
import { diff, islands, rect, ring, union } from '../geo2d'
import { holeGrid, spaced } from './lit'
import { buildStyle, findStyle, STYLES } from './index'
import { silhouette } from './kit'

it('silhouette does not create a second box wall around newly enclosed whitespace', () => {
  const art = union(rect(0, -49, 90, 4), rect(0, 49, 90, 4), rect(-49, 0, 4, 90), rect(49, 0, 4, 90))
  const shape = silhouette(art, 3)
  expect(shape).toHaveLength(1)
  expect(islands(ring(shape, 2))).toHaveLength(1)
})

it('silhouette preserves open concavities', () => {
  const art = diff(rect(0, 0, 100, 100), rect(30, 0, 80, 60))
  expect(diff(rect(20, 0, 10, 10), silhouette(art, 3))).toHaveLength(1)
})

for (const radius of [20, 30]) it(`keeps ${radius * 2} mm repeated details apart at minimum pitch`, () => {
  const centres = holeGrid(rect(0, 0, 500, 500), spaced(3, radius * 2), radius)
  expect(centres.length).toBeGreaterThan(1)
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      expect(Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1])).toBeGreaterThanOrEqual(radius * 2 + 0.59)
    }
  }
})

it('B02 retains its body when the requested face exceeds total depth', () => {
  const parts = buildStyle(findStyle('mini-solid-two-colour'), rect(0, 0, 100, 100), { depth: 5, face: 30 })
  try {
    expect(parts.map(p => p.code)).toEqual(['A', 'B'])
    expect(parts[0].profile!.depth).toBeGreaterThanOrEqual(0.4)
    for (const part of parts) {
      part.geometry.computeBoundingBox()
      expect(part.geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(0)
      expect(part.geometry.boundingBox!.max.z).toBeLessThanOrEqual(5)
    }
    expect(parts[0].warning).toBeTruthy()
  } finally { parts.forEach(p => p.geometry.dispose()) }
})

for (const style of STYLES.filter(s => s.params.some(p => p.key === 'front'))) {
  it(`${style.code} fits a thick face without negative walls or faces behind the back`, () => {
    const parts = buildStyle(style, rect(0, 0, 200, 200), { depth: 5, front: 30 })
    try {
      expect(parts[0].warning).toMatch(/ความลึก/)
      for (const part of parts) {
        part.geometry.computeBoundingBox()
        if (part.material !== 'accent') expect(part.geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(0)
      }
      expect(parts.some(p => p.label.startsWith('ผนัง') || p.label.startsWith('ถ้วย'))).toBe(true)
    } finally { parts.forEach(p => p.geometry.dispose()) }
  })
}

it('A12 retains the wall under a thick brow', () => {
  const parts = buildStyle(findStyle('front-brow'), rect(0, 0, 200, 200), { depth: 5, browT: 30 })
  try {
    expect(parts[0].warning).toMatch(/ความลึก/)
    expect(parts.find(p => p.code === 'B')!.profile!.depth).toBeCloseTo(0.8)
  } finally { parts.forEach(p => p.geometry.dispose()) }
})

for (const id of ['front-back-lips', 'infinity-mirror', 'double-sided-box']) {
  it(`${id} keeps internal panels apart`, () => {
    const parts = buildStyle(findStyle(id), rect(0, 0, 200, 200), { depth: 5, front: 3, back: 3 })
    try {
      expect(parts[0].warning).toMatch(/ความลึก/)
      const panels = parts.filter(p => ['opal', 'acrylic', 'mirror', 'plaswood'].includes(p.material))
      panels.forEach(p => p.geometry.computeBoundingBox())
      expect(panels).toHaveLength(2)
      expect(panels[0].geometry.boundingBox!.max.z).toBeLessThan(panels[1].geometry.boundingBox!.min.z)
    } finally { parts.forEach(p => p.geometry.dispose()) }
  })
}

it('still samples finely where holeGrid only looks for a spot (wire holes, LEDs)', () => {
  // A 12 mm stroke has room for a 6 mm wire hole only along a narrow band.
  const spots = holeGrid(rect(0, 0, 12, 200), 1.5, 4)
  expect(spots.length).toBeGreaterThan(20)
})
