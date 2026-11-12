import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildZip, modelSize, partsList, partStats } from './exportModel'
import { fontFromArrayBuffer } from './hb'
import { analyse } from './solid'
import { bounds, diff, intersect, islands, regionArea } from './geo2d'
import {
  ART_H, BASE_H, buildTwoTone, cleanTwoTone, SIZE_PRESETS, cleanTwoToneColours, DEFAULT_TWOTONE, MAX_LENGTH, TWOTONE_MODES, TWOTONE_PALETTES, twoToneReadme,
  type TwoToneOptions,
} from './twoTone'

function font(file: string) {
  const bytes = readFileSync(`public/fonts/${file}`)
  return fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const fonts = ['Mitr-SemiBold.ttf', 'Kanit-Bold.ttf', 'Itim-Regular.ttf'].map(font)
const colours = TWOTONE_PALETTES[0].colours
const opts = (o: Partial<TwoToneOptions>): TwoToneOptions => ({ ...DEFAULT_TWOTONE, ...o })

describe('two-tone name keychain', () => {
  for (const mode of TWOTONE_MODES.map((m) => m.id)) {
    for (const text of ['Mali', 'น้องปิ่น', 'Happy Birthday Ploy', 'มะลิ ใจดี 2026']) {
      it(`${mode} "${text}": base and raised art, watertight, 6 mm, within length`, () => {
        for (const f of fonts) {
          const model = buildTwoTone(f, opts({ mode, text, charm: 'cat' }), colours)
          expect(model.parts.map((p) => p.label)).toEqual(['ฐาน', 'ตัวอักษรและลาย'])
          for (const part of model.parts) expect(analyse(part.geometry).watertight, part.label).toBe(true)
          const size = modelSize(model.parts)
          expect(size.d).toBeCloseTo(BASE_H + ART_H, 3)
          if (mode !== 'initial') expect(Math.max(model.width, model.height)).toBeLessThanOrEqual(MAX_LENGTH.small + 12)
          expect(model.letterHeight).toBeGreaterThan(4)
        }
      }, 30_000)
    }
  }

  it('large is bigger than small', () => {
    const small = buildTwoTone(fonts[0], opts({ text: 'Ploy' }), colours)
    const large = buildTwoTone(fonts[0], opts({ text: 'Ploy', ...SIZE_PRESETS.large }), colours)
    expect(large.letterHeight).toBeGreaterThan(small.letterHeight)
  })

  for (const mode of TWOTONE_MODES.map((m) => m.id)) {
    it(`${mode}: supported art, connected backing and clear tab for edge-case names`, () => {
      for (const f of fonts) for (const text of ['I', 'J', 'i', 'j', 'M', 'ฒ', 'ญ', 'ฐ', 'มะลิ', 'ไก่', 'ปิ่น', 'กุ้ง', 'I J', 'W'.repeat(24)]) {
        const model = buildTwoTone(f, opts({ mode, text }), colours)
        expect(model.parts, text).toHaveLength(2)
        const [base, art] = model.parts.map((p) => p.profile!.region)
        expect(islands(base), text).toHaveLength(1)
        expect(regionArea(diff(art, base)), text).toBeLessThan(0.01)
        const holes = base.filter((p) => regionArea([p]) < 0)
        expect(holes.length, text).toBeGreaterThan(0)
        for (const hole of holes) expect(regionArea(intersect(art, [hole.slice().reverse()])), text).toBeLessThan(0.01)
        for (const p of model.parts) {
          expect(analyse(p.geometry).watertight, `${text} ${p.label}`).toBe(true)
          p.geometry.dispose()
        }
      }
      // 14 names × 3 fonts of full geometry: several seconds when the suite runs in parallel.
    }, 60_000)
  }

  it('limits the finished body, including thickening and the plate border', () => {
    for (const mode of ['word', 'charm', 'plate'] as const) for (const size of ['small', 'large'] as const) {
      const model = buildTwoTone(fonts[0], opts({ mode, ...SIZE_PRESETS[size], text: 'W'.repeat(24), loop: false }), colours)
      const b = bounds(model.parts[0].profile!.region)
      expect(Math.max(b.w, b.h)).toBeLessThanOrEqual(MAX_LENGTH[size] + 0.01)
      model.parts.forEach((p) => p.geometry.dispose())
    }
  })

  it('a long name goes onto two rows rather than shrinking too far', () => {
    const model = buildTwoTone(fonts[0], opts({ mode: 'word', text: 'Happy Birthday Ploy' }), colours)
    expect(model.rows.length).toBe(2)
  })

  it('warns when the initial mode has no usable letter, or the font lacks one', () => {
    expect(buildTwoTone(fonts[0], opts({ mode: 'initial', text: '2026' }), colours).warning).toMatch(/พยัญชนะ/)
    expect(buildTwoTone(fonts[0], opts({ text: 'A漢' }), colours).warning).toMatch(/ฟอนต์นี้ไม่มี/)
  })

  it('restores only valid settings', () => {
    expect(cleanTwoTone({ mode: 'x', size: 'huge', charm: 'nope', loop: 1 })).toEqual({ ...DEFAULT_TWOTONE })
    expect(cleanTwoTone({ mode: 'plate', size: 'large', charm: 'owl', loop: false, text: 'Ann' })).toEqual({ ...DEFAULT_TWOTONE, mode: 'plate', ...SIZE_PRESETS.large, charm: 'owl', loop: false, text: 'Ann' })
    expect(cleanTwoToneColours({ base: '#ABCDEF', art: 'white' })).toEqual({ base: '#abcdef', art: colours.art })
  })

  it('zip has both colour files and the readme', () => {
    const o = opts({ text: 'Mali' })
    const model = buildTwoTone(fonts[0], o, colours)
    const zip = unzipSync(buildZip({ baseName: 't', parts: model.parts, readme: twoToneReadme(model, o, colours, partsList(partStats(model.parts))) }))
    const names = Object.keys(zip)
    expect(names.filter((n) => n.endsWith('.stl'))).toHaveLength(3)
    expect(strFromU8(zip[names.find((n) => n.endsWith('.txt'))!])).toContain('ลายกระต่าย')
  })
})

describe('two-tone detailed settings', () => {
  it('thickness, letter height, rows and plate rim follow the settings', () => {
    const model = buildTwoTone(fonts[0], opts({ mode: 'plate', text: 'Mali Ploy', base: 3, art: 2, letter: 9, rows: 2, rim: 2 }), colours)
    const size = modelSize(model.parts)
    expect(size.d).toBeCloseTo(5, 3)
    expect(model.rows).toHaveLength(2)
    expect(model.letterHeight).toBeLessThanOrEqual(9 + 1e-6)
    const one = buildTwoTone(fonts[0], opts({ mode: 'word', text: 'Mali Ploy', rows: 1 }), colours)
    expect(one.rows).toHaveLength(1)
  })

  it('a wider margin makes a bigger base round the same letters', () => {
    const thin = buildTwoTone(fonts[0], opts({ mode: 'charm', text: 'Mali', margin: 1.2, loop: false }), colours)
    const wide = buildTwoTone(fonts[0], opts({ mode: 'charm', text: 'Mali', margin: 5, loop: false }), colours)
    expect(wide.width).toBeGreaterThan(thin.width + 7)
  })

  it('restores old saves and clamps new values to 0.2 mm layers', () => {
    expect(cleanTwoTone({ size: 'large' })).toMatchObject(SIZE_PRESETS.large)
    expect(cleanTwoTone({ base: 3.33, art: 9, letter: 2 })).toMatchObject({ base: 3.4, art: 3, letter: 6 })
  })
})
