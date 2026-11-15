import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DISPLAY_FONTS } from './fonts'
import { fontFromArrayBuffer, hb } from './hb'

describe('display fonts', () => {
  for (const f of DISPLAY_FONTS) {
    it(`${f.id} loads and shapes Latin letters and digits`, () => {
      const bytes = readFileSync(`public${f.url}`)
      const font = fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      const buffer = new hb.Buffer()
      buffer.addText('Andrew 2026 & Co.')
      buffer.guessSegmentProperties()
      hb.shape(font.hbFont, buffer)
      expect(buffer.getGlyphInfos().every((g) => g.codepoint !== 0)).toBe(true)
      expect(font.upem).toBeGreaterThan(0)
    })
  }
})
