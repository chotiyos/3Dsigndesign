import { expect, it, vi } from 'vitest'
vi.mock('./hb', () => ({ hb: {
  Buffer: class {
    addText() {} guessSegmentProperties() {}
    getGlyphInfos() { return [{ codepoint: 1, cluster: 0 }, { codepoint: 2, cluster: 0 }, { codepoint: 1, cluster: 2 }] }
    getGlyphPositions() { return [
      { xAdvance: 100, yAdvance: 0, xOffset: 0, yOffset: 0 },
      { xAdvance: 0, yAdvance: 0, xOffset: -80, yOffset: 100 },
      { xAdvance: 100, yAdvance: 0, xOffset: 0, yOffset: 0 },
    ] }
  }, shape() {},
} }))
import { shapeTextToShapes } from './textToShapes'
import type { LoadedFont } from './hb'
it('applies tracking after marks in the same shaped cluster', () => {
  const font = { upem: 1000, hbFont: { glyphToJson: () => [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] },
    { type: 'L', values: [10, 10] }, { type: 'Z', values: [] },
  ] } } as unknown as LoadedFont
  const result = shapeTextToShapes(font, 'test', 30)
  expect(result.shapes[1].getPoints()[0].x).toBe(20)
  expect(result.shapes[2].getPoints()[0].x).toBe(130)
  expect(result.width).toBe(260)
})
