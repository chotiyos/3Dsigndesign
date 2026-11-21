import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DISPLAY_FONTS, FONT_OPTIONS, REGIONAL_FONTS, THAI_FONTS } from './fonts'
import { fontFromArrayBuffer, hb } from './hb'

const load = (url: string) => {
  const bytes = readFileSync(`public${url}`)
  return fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const shapes = (url: string, text: string) => {
  const font = load(url)
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(font.hbFont, buffer)
  return buffer.getGlyphInfos().every((g) => g.codepoint !== 0)
}

describe('display fonts', () => {
  for (const f of DISPLAY_FONTS) {
    it(`${f.id} loads and shapes Latin letters and digits`, () => {
      expect(shapes(f.url, 'Andrew 2026 & Co.')).toBe(true)
      expect(load(f.url).upem).toBeGreaterThan(0)
    })
  }
})

describe('font catalogue', () => {
  it('has unique ids, Kanit first as the default, and every file present with its OFL licence', () => {
    expect(new Set(FONT_OPTIONS.map((f) => f.id)).size).toBe(FONT_OPTIONS.length)
    expect(FONT_OPTIONS[0].id).toBe('kanit-bold')
    for (const f of FONT_OPTIONS) expect(readFileSync(`public${f.url}`).length, f.id).toBeGreaterThan(10_000)
  })
  for (const f of THAI_FONTS) it(`${f.id} writes Thai with its marks`, () => expect(shapes(f.url, 'น้ำใจ สุขสันต์ ปิ่น')).toBe(true))
  const sample: Record<string, string> = {
    'be-vietnam-pro': 'Việt Nam', 'phetsarath-bold': 'ສະບາຍດີ', 'padauk-bold': 'မင်္ဂလာပါ',
    'battambang-bold': 'សួស្តី', koulen: 'សួស្តី', moul: 'សួស្តី',
  }
  for (const f of REGIONAL_FONTS) it(`${f.id} writes its own script`, () => expect(shapes(f.url, sample[f.id])).toBe(true))
})
