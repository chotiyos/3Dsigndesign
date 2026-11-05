/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, expect, it } from 'vitest'
import { textToRegion } from '../artwork'
import { fontFromArrayBuffer } from '../hb'
import type { Region } from '../geo2d'
import { buildStyle, defaultValues, STYLES } from './index'

let art: Region
beforeAll(() => {
  const bytes = readFileSync('public/fonts/Kanit-Bold.ttf')
  const font = fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  art = textToRegion(font, 'ก'.repeat(40), 1500, 0)
})

for (const style of STYLES) {
  it(`${style.code} builds 40 Thai characters at 1500 mm within 5 seconds`, () => {
    // Small pitch/cell values exercise the expensive repeated-detail styles.
    const values = defaultValues(style)
    for (const p of style.params) {
      if (['pitch', 'cell'].includes(p.key)) values[p.key] = p.min
    }
    const start = performance.now()
    const parts = buildStyle(style, art, values)
    const elapsed = performance.now() - start
    try {
      expect(parts.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(5000)
      for (const part of parts) {
        const positions = part.geometry.getAttribute('position').array
        expect(Array.from(positions).every(Number.isFinite)).toBe(true)
      }
    } finally {
      parts.forEach((p) => p.geometry.dispose())
    }
  }, 10000)
}

it('bounds repeated detail on the editor maximum of 200 Thai characters', () => {
  const bytes = readFileSync('public/fonts/Kanit-Bold.ttf')
  const font = fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const longArt = textToRegion(font, 'ก'.repeat(200), 1500, 0)
  for (const id of ['perforated-face', 'lattice-letter']) {
    const style = STYLES.find((s) => s.id === id)!
    const values = defaultValues(style)
    for (const p of style.params) if (['pitch', 'cell'].includes(p.key)) values[p.key] = p.min
    const start = performance.now()
    const parts = buildStyle(style, longArt, values)
    try {
      expect(parts.length).toBeGreaterThan(0)
      expect(performance.now() - start).toBeLessThan(5000)
    } finally { parts.forEach((p) => p.geometry.dispose()) }
  }
}, 15000)
