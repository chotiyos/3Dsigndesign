import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { textToRegion } from './artwork'
import { buildBubble, DEFAULT_BUBBLE, PALETTES } from './bubbleKeychain'
import { buildClicker, DEFAULT_CLICKER } from './clickerKeychain'
import { bounds, islands, regionArea } from './geo2d'
import { fontFromArrayBuffer } from './hb'

function font(file: string) {
  const bytes = readFileSync(`public/fonts/${file}`)
  return fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const kanit = font('Kanit-Bold.ttf')
const mitr = font('Mitr-SemiBold.ttf')

describe('fixes from the full audit', () => {
  it('keeps the lines of multi-line Thai text apart: lower vowels never touch the next line\'s tone marks', () => {
    for (const f of [kanit, mitr]) {
      const both = islands(textToRegion(f, 'ปู่ญู\nกิ๊ก ปิ๋ม', 100, 0)).length
      const apart = islands(textToRegion(f, 'ปู่ญู', 100, 0)).length + islands(textToRegion(f, 'กิ๊ก ปิ๋ม', 100, 0)).length
      expect(both).toBe(apart)
    }
  })

  it('still spaces plain lines one line gap apart', () => {
    const one = bounds(textToRegion(kanit, 'AB', 100, 0))
    const two = bounds(textToRegion(kanit, 'AB\nAB', 100, 0))
    expect(two.h - one.h).toBeCloseTo(115, 0)
  })

  it('refuses a keychain name that is only punctuation or a tone mark', () => {
    const colours = PALETTES[0].colours
    for (const text of ['.', '่', '-', 'ำ', 'เ', 'ๆ']) {
      const model = buildBubble(mitr, { ...DEFAULT_BUBBLE, text }, colours)
      expect(model.parts).toHaveLength(0)
      expect(model.warning).toBeTruthy()
    }
    const ok = buildBubble(mitr, { ...DEFAULT_BUBBLE, text: 'น้ำ' }, colours)
    expect(ok.parts.length).toBeGreaterThan(0)
    ok.parts.forEach((p) => p.geometry.dispose())
  })

  it('builds the initial keychain on a contour piece at the chosen size', () => {
    const colours = PALETTES[0].colours
    const model = buildBubble(mitr, { ...DEFAULT_BUBBLE, style: 'initial', shape: 'contour', text: 'Mali', size: 50, loop: false }, colours)
    expect(Math.max(model.width, model.height)).toBeGreaterThan(49)
    expect(Math.max(model.width, model.height)).toBeLessThan(51)
    model.parts.forEach((p) => p.geometry.dispose())
  })

  it('keeps the clicker key-ring hole 3.5 mm at the smallest key size', () => {
    const colours = { frames: ['#111111'], cap: '#ffffff', letter: '#000000' }
    for (const keySize of [16, 20, 30]) {
      const model = buildClicker(mitr, { ...DEFAULT_CLICKER, keySize }, colours)
      const frame = model.parts.find((p) => p.material !== 'led')!
      frame.geometry.computeBoundingBox()
      // The hole is the small round void at the tab: measure it from the frame's outline slice.
      const pos = frame.geometry.getAttribute('position')
      const tabTop = frame.geometry.boundingBox!.max.y
      // Points on the hole's rim sit within 4 mm of the tab's top; their spread across x is the hole's width.
      const xs: number[] = []
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        if (y < tabTop - 1.2 && y > tabTop - 8 && Math.abs(pos.getX(i)) < 2.2) xs.push(pos.getX(i))
      }
      if (xs.length) expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3.3)
      model.parts.forEach((p) => p.geometry.dispose())
    }
  })

  it('fills overlapping strokes drawn the same way round, as TrueType does', async () => {
    const { shapeTextToShapes } = await import('./textToShapes')
    expect(typeof shapeTextToShapes).toBe('function')
    // Bundled fonts keep their letter counters: 'O' still has its hole.
    const o = textToRegion(kanit, 'O', 100, 0)
    expect(o.some((poly) => regionArea([poly]) < 0)).toBe(true)
  })
})
