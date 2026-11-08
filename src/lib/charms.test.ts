import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildBubble, DEFAULT_BUBBLE, PALETTES, type BubbleOptions } from './bubbleKeychain'
import { charmArt, charmPath, CHARMS } from './charms'
import { bounds, islands, regionArea, scale } from './geo2d'
import { fontFromArrayBuffer } from './hb'
import { analyse, extrude } from './solid'

const bytes = readFileSync('public/fonts/Mitr-SemiBold.ttf')
const mitr = fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const opts = (o: Partial<BubbleOptions>): BubbleOptions => ({ ...DEFAULT_BUBBLE, ...o })

describe('charms', () => {
  it('has unique ids and names', () => {
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(CHARMS.length)
    expect(new Set(CHARMS.map((c) => c.name)).size).toBe(CHARMS.length)
  })

  for (const charm of CHARMS) {
    it(`${charm.id}: 1 mm tall, centred, no specks, details survive at 15 mm`, () => {
      const art = charmArt(charm.id)
      for (const size of [15, 25]) expect(analyse(extrude(scale(art, size), 1.2)).watertight, charm.id + ' raw').toBe(true)
      const b = bounds(art)
      expect(b.h).toBeCloseTo(1, 3)
      expect(Math.abs(b.minX + b.maxX)).toBeLessThan(1e-3)
      expect(b.w).toBeLessThan(2.4)
      // At a 15 mm motif every separate piece is at least ~1 mm².
      for (const piece of islands(art)) expect(regionArea(piece) * 15 * 15, charm.id).toBeGreaterThan(0.8)
      expect(charmPath(charm.id)).toMatch(/^M/)
    })
  }

  for (const shape of ['contour', 'circle'] as const) {
    it(`${shape}: name + motif builds three watertight layers inside the size`, () => {
      for (const charm of CHARMS.map((ch) => ch.id)) {
        const model = buildBubble(mitr, opts({ text: 'มะลิ', style: 'charm', charm, shape, size: 60 }), PALETTES[1].colours)
        expect(model.parts, charm).toHaveLength(3)
        for (const part of model.parts) expect(analyse(part.geometry).watertight, `${charm} ${part.label}`).toBe(true)
        expect(Math.min(model.width, model.height)).toBeGreaterThan(10)
      }
    })
  }

  it('the motif makes the name wider than the name alone', () => {
    const plain = buildBubble(mitr, opts({ text: 'Ploy', shape: 'contour' }), PALETTES[1].colours)
    const withCharm = buildBubble(mitr, opts({ text: 'Ploy', shape: 'contour', style: 'charm', charm: 'cat' }), PALETTES[1].colours)
    expect(withCharm.letterHeight).toBeLessThan(plain.letterHeight)
  })
})
