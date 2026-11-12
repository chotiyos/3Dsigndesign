import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildClicker, cleanClicker, cleanClickerColours, cleanClickerText, clickerReadme, CLICKER_PALETTES, DEFAULT_CLICKER, frameShape, iconArt, ICONS, keyArt, keysOf,
  LETTER_BOX, MAX_KEYS, PITCH, SWITCH, SWITCH_CAP, frameCells, frameColour, insertClickerIcon, keyCentre, sameClickerColours, withClickerKeyColour,
  type ClickerOptions,
} from './clickerKeychain'
import { buildZip, partsList, partStats } from './exportModel'
import { bounds, islands, diff, intersect, regionArea, union, roundRect, translate } from './geo2d'
import { fontFromArrayBuffer } from './hb'
import { analyse } from './solid'

function font(file: string) {
  const bytes = readFileSync(`public/fonts/${file}`)
  return fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const mitr = font('Mitr-SemiBold.ttf')
const opts = (o: Partial<ClickerOptions>): ClickerOptions => ({ ...DEFAULT_CLICKER, ...o })
const colours = CLICKER_PALETTES[0].colours

function box(g: THREE.BufferGeometry) {
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('clicker keychain', () => {
  it('makes one key per grapheme, keeps Thai marks on their letter and drops spaces', () => {
    expect(keysOf('น้ำ ใจ')).toEqual(['น้ำ', 'ใ', 'จ'])
    expect(keysOf('ปิ๋ม')).toEqual(['ปิ๋', 'ม'])
    expect(keysOf('ABCDEFGHIJKL')).toHaveLength(MAX_KEYS)
    expect(keysOf(cleanClickerText('A B C D E F G H I J K L'))).toHaveLength(MAX_KEYS)
    expect(cleanClickerText('  มะลิ   ♥')).toBe('มะลิ ♥')
  })

  it('restores only valid settings and colours', () => {
    expect(cleanClicker({ build: 'x', edge: 'circle', layout: 'row', loop: false, text: 7 })).toEqual({ ...DEFAULT_CLICKER, edge: 'circle', layout: 'row', loop: false })
    expect(cleanClickerColours({ frames: ['#ABCDEF', 'red'], cap: 'blue', letter: '#000000' })).toEqual({ frames: ['#abcdef'], cap: colours.cap, letter: '#000000' })
    expect(cleanClickerColours(null)).toEqual(colours)
    for (const raw of [null, [], 4, 'bad', { text: null, loop: 'false' }]) {
      expect(cleanClicker(raw)).toEqual(DEFAULT_CLICKER)
    }
  })

  it('inserts at the caret and replaces selections even at the key limit', () => {
    expect(insertClickerIcon('ABCDEFGHIJ', '♥', 3, 5)).toEqual({ text: 'ABC♥FGHIJ', caret: 4 })
    expect(insertClickerIcon('ABCDEFGHIJ', '♥', 3)).toEqual({ text: 'ABCDEFGHIJ', caret: 3 })
    expect(insertClickerIcon('A ปิ๋ B', '★', 2, 5)).toEqual({ text: 'A ★ B', caret: 3 })
    expect(insertClickerIcon('ปิ๋B', '★', 1)).toEqual({ text: '★ปิ๋B', caret: 1 })
    expect(insertClickerIcon('  A', '♥', 0)).toEqual({ text: '♥ A', caret: 1 })
  })

  it('recognises expanded repeating palettes and notices a later key edit', () => {
    const palette = CLICKER_PALETTES[2].colours
    const expanded = { ...palette, frames: Array.from({ length: MAX_KEYS }, (_, i) => palette.frames[i % palette.frames.length]) }
    expect(sameClickerColours(palette, expanded)).toBe(true)
    expanded.frames[9] = '#123456'
    expect(sameClickerColours(palette, expanded)).toBe(false)
  })

  it('edits one repeated colour without recolouring existing or future keys', () => {
    const palette = CLICKER_PALETTES[2].colours
    const edited = withClickerKeyColour(palette, 1, '#123456')
    for (let i = 0; i < MAX_KEYS; i++) {
      expect(frameColour(edited, i)).toBe(i === 1 ? '#123456' : frameColour(palette, i))
    }
    expect(palette.frames).toHaveLength(3)
  })

  it('cuts every frame at the midline without islands, lost slivers or overlapping colours', () => {
    for (const edge of ['scallop', 'round', 'circle'] as const) {
      for (const layout of ['column', 'row'] as const) {
        const cells = frameCells(MAX_KEYS, opts({ edge, layout }))
        const pitch = Math.abs(keyCentre(1, layout, edge)[layout === 'column' ? 1 : 0])
        expect(bounds(frameShape(edge)).w - pitch).toBeCloseTo(1, 2)
        for (const cell of cells) expect(islands(cell)).toHaveLength(1)
        for (let i = 1; i < cells.length; i++) {
          expect(regionArea(intersect(cells[i - 1], cells[i]))).toBe(0)
          expect(islands(union(cells[i - 1], cells[i])), `${edge} ${layout} ${i}`).toHaveLength(1)
        }
      }
    }
  })

  it('draws every picture key as one solid piece (smiley keeps its face cut-outs)', () => {
    for (const icon of ICONS) {
      const art = iconArt(icon)!
      const b = bounds(art)
      expect(Math.max(b.w, b.h), icon).toBeLessThanOrEqual(LETTER_BOX + 0.1)
      expect(islands(art).length, icon).toBe(1)
    }
  })

  it('fits letters, including stacked Thai marks, in the key face', () => {
    for (const key of ['M', 'ปิ๋', 'น้ำ', 'ฎ', 'ฐ', 'g', '1']) {
      const b = bounds(keyArt(mitr, key))
      expect(Math.max(b.w, b.h), key).toBeCloseTo(LETTER_BOX, 1)
      expect(Math.abs(b.minX + b.maxX), key).toBeLessThan(0.01)
    }
  })

  it('each frame edge is a single outline', () => {
    for (const edge of ['scallop', 'round', 'circle'] as const) expect(islands(frameShape(edge))).toHaveLength(1)
  })

  for (const build of ['solid', 'switch'] as const) {
    for (const layout of ['column', 'row'] as const) {
      it(`${build}, ${layout}: watertight parts, joined frame, files in the zip`, () => {
        const o = opts({ text: 'มะลิ ♥ A', build, layout, edge: 'scallop' })
        const model = buildClicker(mitr, o, colours)
        expect(model.warning).toBeUndefined()
        expect(model.keys).toEqual(['ม', 'ะ', 'ลิ', '♥', 'A'])
        for (const part of model.print) expect(analyse(part.geometry).watertight, part.label).toBe(true)
        // One frame colour per key here, all lying on the bed.
        const frames = model.print.filter((p) => p.label.startsWith(build === 'solid' ? 'กรอบ' : 'ตัวเรือน'))
        expect(frames).toHaveLength(5)
        for (const part of frames) expect(box(part.geometry).min.z, part.label).toBeCloseTo(0, 5)
        if (build === 'switch') for (const part of model.print.filter((p) => p.label !== 'ตัวอักษร')) expect(box(part.geometry).min.z, part.label).toBeCloseTo(0, 5)
        // Long side spans every key plus the tab.
        const long = Math.max(model.width, model.height)
        expect(long).toBeGreaterThan(4 * PITCH + 20)
        const zip = unzipSync(buildZip({ baseName: 'test', parts: model.print, readme: clickerReadme(model, o, partsList(partStats(model.print))) }))
        const names = Object.keys(zip)
        expect(names.filter((n) => n.endsWith('.stl'))).toHaveLength(model.print.length + 1)
        expect(strFromU8(zip[names.find((n) => n.endsWith('.txt'))!])).toContain(build === 'switch' ? 'สวิตช์คีย์บอร์ดแบบ MX' : 'พิมพ์ชิ้นเดียวจบ')
      })
    }
  }

  it('groups frames that share a colour into one file', () => {
    const model = buildClicker(mitr, opts({ text: 'ABCDE' }), { frames: ['#111111', '#222222'], cap: '#ffffff', letter: '#000000' })
    expect(model.parts.filter((p) => p.label.startsWith('กรอบ'))).toHaveLength(2)
  })

  it('switch housing: plate hole, cavity and cap fit the MX standard', () => {
    const model = buildClicker(mitr, opts({ text: 'A', build: 'switch', loop: false }), colours)
    const body = model.print.find((p) => p.label.startsWith('ตัวเรือน'))!
    expect(box(body.geometry).max.z).toBeCloseTo(SWITCH.floor + SWITCH.depth + SWITCH.plate, 5)
    const cap = model.print.find((p) => p.label === 'ปุ่ม')!
    const c = box(cap.geometry)
    expect(c.max.x - c.min.x).toBeCloseTo(SWITCH_CAP.size, 1)
    expect(c.max.z).toBeCloseTo(SWITCH_CAP.skirt + SWITCH_CAP.top, 5)
    expect(SWITCH.stemTop).toBeCloseTo(11.6 + 3.6 - 5, 5)
    // The switch stand-in shows in the preview only.
    expect(model.parts.some((p) => p.label.startsWith('สวิตช์'))).toBe(true)
    expect(model.print.some((p) => p.label.startsWith('สวิตช์'))).toBe(false)
    // Caps sit beside the housing on the bed, not on it.
    expect(c.min.x).toBeGreaterThan(box(body.geometry).max.x)
  })

  it('warns instead of building when the font lacks a letter', () => {
    const model = buildClicker(mitr, opts({ text: 'A漢' }), colours)
    expect(model.parts).toHaveLength(0)
    expect(model.warning).toMatch(/ฟอนต์นี้ไม่มี/)
  })

  it('builds all six fonts with every edge without error', () => {
    for (const file of ['Kanit-Bold.ttf', 'Prompt-Bold.ttf', 'Sarabun-ExtraBold.ttf', 'Mitr-SemiBold.ttf', 'ChakraPetch-Bold.ttf', 'Itim-Regular.ttf']) {
      const f = font(file)
      for (const edge of ['scallop', 'round', 'circle', 'pencil'] as const) {
        const model = buildClicker(f, opts({ text: 'ปิ๋น้ำฎฐJ', edge }), colours)
        expect(model.parts.length, `${file} ${edge}`).toBeGreaterThan(2)
        for (const part of model.parts) expect(analyse(part.geometry).watertight, `${file} ${edge} ${part.label}`).toBe(true)
      }
    }
  })

  it('supports art on the cap face and keeps ten print caps clear of the housing and each other', () => {
    const face = roundRect(0, 0, SWITCH_CAP.size - 2 * SWITCH_CAP.inset, SWITCH_CAP.size - 2 * SWITCH_CAP.inset, 1)
    for (const key of ['ปิ๋', 'น้ำ', 'ฎ', 'ฐ', ...ICONS]) expect(regionArea(diff(keyArt(mitr, key), face))).toBe(0)
    for (const layout of ['column', 'row'] as const) {
      for (const edge of ['scallop', 'round', 'circle'] as const) {
        const model = buildClicker(mitr, opts({ text: 'AAAAAAAAAA', build: 'switch', layout, edge }), colours)
        for (const part of model.print) expect(analyse(part.geometry).watertight, `${edge} ${part.label}`).toBe(true)
        const cap = box(model.print.find((p) => p.label === 'ปุ่ม')!.geometry)
        for (const body of model.print.filter((p) => p.label.startsWith('ตัวเรือน'))) {
          const b = box(body.geometry)
          expect(layout === 'column' ? cap.min.x - b.max.x : b.min.y - cap.max.y).toBeGreaterThan(3.9)
        }
        expect(PITCH - SWITCH_CAP.size).toBeGreaterThan(1)
        const assembled = box(model.parts.find((p) => p.label === 'ปุ่ม')!.geometry)
        const plateTop = SWITCH.floor + SWITCH.depth + SWITCH.plate
        expect(assembled.min.z - plateTop - 4).toBeGreaterThan(0)
      }
    }
    // The cap roof bridges from the skirt to the central stem; both start on the bed.
    const inner = SWITCH_CAP.size / 2 - SWITCH_CAP.wall
    expect(inner - SWITCH_CAP.stemR).toBeLessThan(5)
    expect(regionArea(intersect(face, translate(face, PITCH, 0)))).toBe(0)
  })
})

describe('clicker round housing', () => {
  it('keeps a wall round the switch cavity on circle frames', async () => {
    const { CIRCLE_R } = await import('./clickerKeychain')
    // Housing corners (13.9 mm square) must fit; the cavity stops 1.2 mm inside the frame.
    expect(Math.hypot(13.9 / 2, 13.9 / 2)).toBeLessThan(10)
    expect(CIRCLE_R - 10).toBeGreaterThan(1.19)
  })
})

describe('pencil keychain', () => {
  for (const build of ['solid', 'switch'] as const) {
    for (const layout of ['column', 'row'] as const) {
      it(`${build}, ${layout}: eraser, band, wood and lead are separate watertight parts that do not overlap`, async () => {
        const { pencilEnds } = await import('./clickerKeychain')
        const o = opts({ text: 'MALI', build, layout, edge: 'pencil' })
        const model = buildClicker(mitr, o, colours)
        const labels = model.print.map((p) => p.label)
        for (const l of ['ยางลบ', 'ปลอกโลหะ', 'เนื้อไม้', 'ไส้ดินสอ']) expect(labels).toContain(l)
        for (const part of model.print) expect(analyse(part.geometry).watertight, part.label).toBe(true)
        const ends = pencilEnds(4, o).map((e) => e.region)
        for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
          const { intersect, regionArea } = await import('./geo2d')
          expect(regionArea(intersect(ends[i], ends[j])), `${i}-${j}`).toBeLessThan(0.01)
        }
        // Tip and eraser make the pencil longer than the keys alone.
        expect(Math.max(model.width, model.height)).toBeGreaterThan(3 * PITCH + 20 + 30)
      })
    }
  }
})

 it('butt joins pencil keys and meets both ends without area overlap', async () => {
   const { pencilEnds } = await import('./clickerKeychain')
   for (const layout of ['row', 'column'] as const) {
     const o = opts({ edge: 'pencil', layout })
     const cells = frameCells(10, o)
     const ends = pencilEnds(10, o).map(e => e.region)
     expect(Math.hypot(...keyCentre(1, layout, 'pencil'))).toBe(20)
     const body = union(...cells)
     for (const end of ends) expect(regionArea(intersect(body, end))).toBe(0)
     expect(islands(union(body, ...ends))).toHaveLength(1)
     expect(cells.map(c => regionArea(c))).toEqual(Array(10).fill(400))
   }
 })

describe('clicker detailed settings', () => {
  it('key size scales the decorative keychain; thicknesses stack as set', async () => {
    const { modelSize } = await import('./exportModel')
    const base = buildClicker(mitr, opts({ text: 'AB', loop: false }), colours)
    const big = buildClicker(mitr, opts({ text: 'AB', loop: false, keySize: 30, frame: 4, capH: 2, letterH: 1.2 }), colours)
    expect(big.width / base.width).toBeCloseTo(1.5, 2)
    expect(modelSize(big.parts).d).toBeCloseTo(4 + 2 + 1.2, 3)
    expect(big.thickness).toBeCloseTo(7.2, 3)
    for (const part of big.parts) expect(analyse(part.geometry).watertight, part.label).toBe(true)
  })

  it('switch keys keep the MX size whatever key size is saved', () => {
    const a = buildClicker(mitr, opts({ text: 'A', build: 'switch', loop: false }), colours)
    const b = buildClicker(mitr, opts({ text: 'A', build: 'switch', loop: false, keySize: 30 }), colours)
    expect(b.width).toBeCloseTo(a.width, 3)
  })

  it('smaller letters on the keys', () => {
    const full = bounds(keyArt(mitr, 'M'))
    const small = bounds(keyArt(mitr, 'M', LETTER_BOX * 0.6))
    expect(small.w / full.w).toBeCloseTo(0.6, 2)
  })

  it('restores and clamps the detailed settings', () => {
    expect(cleanClicker({ keySize: 99, frame: 3.33, letterSize: 10 })).toMatchObject({ keySize: 30, frame: 3.4, letterSize: 60, capH: DEFAULT_CLICKER.capH })
  })
})
