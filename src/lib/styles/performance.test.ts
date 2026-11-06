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

for (const maximums of [false, true]) for (const style of STYLES) {
  it(`${style.code} builds 40 Thai characters at 1500 mm with ${maximums ? 'maximum' : 'default'} dimensions within 5 seconds`, () => {
    // Small pitch/cell values exercise the expensive repeated-detail styles.
    const values = maximums ? Object.fromEntries(style.params.map(p => [p.key, p.max])) : defaultValues(style)
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

it('keeps new supports bounded at maximum dimensions on long marked Thai text', () => {
  const bytes = readFileSync('public/fonts/Kanit-Bold.ttf')
  const font = fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const longArt = textToRegion(font, '\u0e01\u0e35\u0e48'.repeat(66), 1500, 0)
  for (const id of ['desk-block', 'keychain-stencil', 'die-cut-box', 'keychain-outline']) {
    const style = STYLES.find(s => s.id === id)!
    const values = Object.fromEntries(style.params.map(p => [p.key, p.max]))
    // Exercise F02's new stencil bridges rather than the optional solid backing.
    if (id === 'keychain-stencil') values.backing = 0
    const start = performance.now()
    const parts = buildStyle(style, longArt, values)
    try {
      expect(parts.length).toBeGreaterThan(0)
      expect(performance.now() - start, id).toBeLessThan(5000)
      for (const part of parts) expect(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
    } finally { parts.forEach(p => p.geometry.dispose()) }
  }
}, 25000)
