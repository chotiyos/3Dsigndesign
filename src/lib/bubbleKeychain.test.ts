import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  buildBubble, bubbleReadme, chooseRows, initialOf, cleanBubble, cleanColours, cleanText, DEFAULT_BUBBLE, graphemes, MAX_CHARS, PALETTES, printWarnings, puffUp, RIM, SEAM, splits, TAB, withTab,
  type BubbleOptions,
} from './bubbleKeychain'
import { buildZip, modelSize, partsList, partStats, printableStl } from './exportModel'
import { bounds, circle, diff, intersect, islands, offset, rect, regionArea, regionFromShapes, translate, union } from './geo2d'
import { FONT_OPTIONS } from './fonts'
import { shapeTextToShapes } from './textToShapes'
import { fontFromArrayBuffer } from './hb'
import { analyse } from './solid'

function font(file: string) {
  const bytes = readFileSync(`public/fonts/${file}`)
  return fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const mitr = font('Mitr-SemiBold.ttf')
const colours = PALETTES[1].colours
const opts = (o: Partial<BubbleOptions>): BubbleOptions => ({ ...DEFAULT_BUBBLE, ...o })

describe('bubble keychain', () => {
  it('limits whole graphemes, including stacked Thai marks and emoji', () => {
    const text = 'ปิ๋'.repeat(24)
    expect(cleanText(text + 'ม')).toBe(text)
    expect(graphemes(cleanText('👩🏽‍💻'.repeat(25)))).toHaveLength(24)
    expect(cleanText(' น้ำใจ  ปิ๋ม\nฤๅษี ')).toBe('น้ำใจ ปิ๋ม ฤๅษี ')
  })

  it('snaps restored layer heights to 0.2 mm', () => {
    expect(cleanBubble({ base: 1.31, puff: 2.51, letter: 0.51 })).toMatchObject({ base: 1.4, puff: 2.6, letter: 0.6 })
  })

  it('puffs letters up but keeps a seam between pieces and counters open', () => {
    // Two squares 0.3 mm apart, a small mark beside a big one: a seam is cut, the small one kept whole.
    const big = rect(0, 0, 4, 4)
    const small = rect(2.3 + 0.5, 0, 1, 1)
    const out = puffUp(union(big, small), 0.5)
    expect(islands(out)).toHaveLength(2)
    expect(islands(offset(out, SEAM / 2 - 0.02))).toHaveLength(2)
    const [a, b] = islands(out).sort((p, q) => regionArea(p) - regionArea(q))
    expect(regionArea(a)).toBeGreaterThanOrEqual(regionArea(small) - 1e-6)
    expect(regionArea(b)).toBeGreaterThan(regionArea(big) * 0.9)
    // A counter too small to stay open when grown stops the growth.
    const ring = diff(rect(0, 0, 5, 5), circle(0, 0, 0.6))
    const grown = puffUp(ring, 1)
    expect(grown).toHaveLength(2)
    expect(regionArea(grown)).toBeGreaterThan(regionArea(ring))
  })

  it('rejects missing glyphs instead of printing replacement boxes', () => {
    const model = buildBubble(mitr, opts({ text: 'น้ำใจ 😀' }), colours)
    expect(model.parts).toHaveLength(0)
    expect(model.warning).toContain('ไม่รองรับ')
  })

  it('limits counters locally without holding back unrelated solid letters', () => {
    const ring = diff(rect(0, 0, 5, 5), circle(0, 0, 0.6))
    const solid = rect(10, 0, 4, 4)
    const out = puffUp(union(ring, solid), 1)
    const grownSolid = islands(out).find((p) => bounds(p).cx > 5)!
    expect(bounds(grownSolid).w).toBeCloseTo(6, 2)
    expect(out.filter((p) => regionArea([p]) < 0)).toHaveLength(1)
    expect(offset(out, 0.24).filter((p) => regionArea([p]) < 0)).toHaveLength(1)
  })

  it('does not mistake a new pocket for a preserved original counter', () => {
    const art = diff(rect(0, 0, 6, 6), union(circle(0, -1, 0.6), rect(0, 1.6, 1.5, 1.2), rect(0, 2.6, 0.2, 1)))
    const out = puffUp(art, 0.9)
    expect(regionArea(intersect(out, circle(0, -1, 0.2)))).toBe(0)
  })

  it('keeps curved neighbours a physical seam apart and gives up at most a seam of core', () => {
    const small = circle(0, 0, 0.5, 64)
    const big = circle(2.7, 0.4, 2, 64)
    const out = puffUp(union(small, big), 0.8)
    const pieces = islands(out)
    expect(pieces).toHaveLength(2)
    expect(regionArea(diff(small, out))).toBeLessThan(0.001)
    expect(regionArea(diff(offset(big, -SEAM - 0.005), out))).toBeLessThan(0.001)
    // Independent point-to-segment distances, not the same offset helper.
    let distance = Infinity
    for (const [x, y] of pieces[0][0]) {
      const poly = pieces[1][0]
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i]
        const [bx, by] = poly[(i + 1) % poly.length]
        const dx = bx - ax, dy = by - ay
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        distance = Math.min(distance, Math.hypot(x - ax - t * dx, y - ay - t * dy))
      }
    }
    expect(distance).toBeGreaterThanOrEqual(SEAM - 0.001)
  })

  it('keeps close small font pieces intact, but does not grow into their gap', () => {
    const a = rect(0, 0, 1, 1), b = rect(1.2, 0, 1, 1)
    const out = puffUp(union(a, b, rect(8, 0, 4, 4)), 0.5)
    expect(regionArea(diff(union(a, b), out))).toBeLessThan(0.001)
    expect(islands(out)).toHaveLength(3)
    expect(regionArea(intersect(out, rect(0.6, 0, 0.18, 0.8)))).toBe(0)
  })

  it('removes detached seam-cut slivers while preserving the original mark', () => {
    const letter = union(rect(0, 0, 4, 4), rect(3, 0, 2.2, 0.25))
    const mark = rect(2.6, 0.45, 0.4, 0.2)
    const out = puffUp(union(letter, mark), 0)
    expect(regionArea(diff(mark, out))).toBeLessThan(0.001)
    expect(islands(out)).toHaveLength(2)
    expect(regionArea(intersect(out, rect(3.8, 0, 0.3, 0.2)))).toBe(0)
  })

  it('fills new puff pockets without filling a clearance pocket around another mark', () => {
    const bowl = diff(rect(0, 0, 5, 5), union(rect(0, 0, 2, 2), rect(0, 2, 0.3, 2)))
    expect(puffUp(bowl, 0.3)).toHaveLength(1)
    const mark = rect(0, 0, 0.5, 0.5)
    const out = puffUp(union(bowl, mark), 0.3)
    expect(islands(out)).toHaveLength(2)
    expect(regionArea(diff(mark, out))).toBeLessThan(0.001)
    expect(regionArea(intersect(out, rect(0.6, 0, 0.1, 0.2)))).toBe(0)
  })

  it('warns for vanished dots even if another stroke splits, not for height alone', () => {
    const dumbbell = union(rect(-2, 0, 1, 1), rect(2, 0, 1, 1), rect(0, 0, 4, 0.3))
    const face = union(dumbbell, rect(0, 3, 0.2, 0.2))
    expect(islands(offset(face, -0.2))).toHaveLength(islands(face).length)
    expect(printWarnings(face, 6, opts({})).join(' ')).toContain('0.4 มม.')
    const nested = union(diff(circle(0, 0, 0.36), circle(0, 0, 0.34)), circle(0, 0, 0.23), translate(dumbbell, 10, 0))
    expect(printWarnings(nested, 6, opts({})).join(' ')).toContain('0.4 มม.')
    expect(printWarnings(rect(0, 0, 3, 3), 4, opts({}))).toEqual([])
  })

  it('keeps the tab joined and its entire hole clear of steep contour edges', () => {
    const plain = [[[0, 0], [10, 0], [4, 15], [0, 12]]] as [number, number][][]
    const tabbed = withTab(plain)
    expect(islands(tabbed)).toHaveLength(1)
    expect(regionArea(diff(plain, tabbed))).toBeLessThan(0.01)
    expect(tabbed).toHaveLength(2)
  })

  for (const option of FONT_OPTIONS) {
    const loaded = font(option.url.split('/').at(-1)!)
    it(`${option.id}: audits ordinary names at 40–60 mm in both shapes`, () => {
      for (const shape of ['circle', 'contour'] as const) for (const size of [40, 50, 60]) {
        for (const text of ['Ploy', 'มะลิ', 'น้องปิ่น ใจดี', 'Happy Birthday Mali 2026']) {
          const model = buildBubble(loaded, opts({ text, shape, size }), colours)
          // Short names never warn; longer ones may only warn about narrow gaps,
          // and a plain name at 50 mm or more in a rounded font prints clean.
          if (['Ploy', 'มะลิ'].includes(text)) expect(model.warning, text).toBeUndefined()
          else if (model.warning) expect(model.warning).toContain('0.45 มม.')
          if (size >= 50 && ['kanit-bold', 'prompt-bold', 'itim'].includes(option.id)) expect(model.warning).toBeUndefined()
          model.parts.forEach((p) => p.geometry.dispose())
        }
      }
    })
    it(`${option.id}: preserves every Thai mark from the shaped font outlines`, () => {
      const text = 'น้ำใจ ปิ๋ม ฤๅษี'
      const model = buildBubble(loaded, opts({ text, rows: 1, size: 80 }), colours)
      const original = regionFromShapes(shapeTextToShapes(loaded, text, 0.05 * loaded.upem).shapes, model.letterHeight / loaded.upem)
      const b = bounds(original)
      const centred = translate(original, -b.cx, -b.cy)
      const face = model.parts[2].profile!.region
      // Marks and small pieces stay whole; a big letter only gives up a seam beside them.
      const pieces = islands(centred)
      const areas = pieces.map((p) => regionArea(p)).sort((a, b) => a - b)
      const median = areas[Math.floor(areas.length / 2)]
      for (const mark of pieces) {
        const kept = regionArea(intersect(mark, face)) / regionArea(mark)
        expect(kept).toBeGreaterThan(regionArea(mark) <= median ? 0.98 : 0.9)
      }
      // A new pocket must not substitute for a closed original counter.
      for (const hole of centred.filter((poly) => regionArea([poly]) < 0)) {
        const counter = [hole.slice().reverse()]
        expect(regionArea(diff(counter, face))).toBeGreaterThan(0.01)
      }
      model.parts.forEach((p) => p.geometry.dispose())
    })
    for (const shape of ['circle', 'contour'] as const) {
      for (const size of [30, 80]) {
        for (const rows of [1, 2, 3, 4]) {
          it(`${option.id}, ${shape}, ${size} mm, ${rows} rows: watertight and contained`, () => {
            const o = opts({ text: 'น้ำใจ ปิ๋ม ฤๅษี A19', shape, size, rows, loop: rows % 2 === 0 })
            const model = buildBubble(loaded, o, colours)
            // Warnings may appear on these tight Thai marks; geometry must still be sound.
            expect(model.rows).toHaveLength(rows)
            expect(model.parts).toHaveLength(3)
            const [base, bubble, face] = model.parts.map((p) => p.profile!.region)
            expect(islands(base)).toHaveLength(1)
            if (o.loop) {
              expect(base).toHaveLength(2)
              const hole = base.find((poly) => regionArea([poly]) < 0)!
              expect(Math.abs(Math.abs(regionArea([hole])) - Math.PI * TAB.hole ** 2)).toBeLessThan(0.1)
            }
            expect(islands(bubble)).toHaveLength(1)
            expect(regionArea(diff(face, bubble))).toBeLessThan(0.01)
            expect(regionArea(diff(bubble, base))).toBeLessThan(0.01)
            for (const part of model.parts) {
              expect(analyse(part.geometry).watertight, part.label).toBe(true)
              part.geometry.dispose()
            }
            if (!o.loop) expect(Math.max(bounds(base).w, bounds(base).h)).toBeLessThanOrEqual(size + 0.1)
          })
        }
      }
    }
  }

  it('fits a worst-case 24-character many-word name without repeated polygon booleans', () => {
    const start = performance.now()
    const model = chooseRows(mitr, opts({ text: 'a b c d e f g h i j k l', rows: 0 }))
    expect(model.rows.length).toBeGreaterThan(0)
    expect(performance.now() - start).toBeLessThan(1500)
  })

  for (const layers of [{ base: 1.2, puff: 0.8, letter: 0.4 }, { base: 4, puff: 5, letter: 3 }]) {
    it(`stacks extreme thicknesses ${JSON.stringify(layers)} with no gaps`, () => {
      const model = buildBubble(mitr, opts({ text: 'น้ำใจ', ...layers }), colours)
      let z = 0
      for (const [i, depth] of [layers.base, layers.puff, layers.letter].entries()) {
        const part = model.parts[i]
        part.geometry.computeBoundingBox()
        expect(part.geometry.boundingBox!.min.z).toBeCloseTo(z, 5)
        z += depth
        expect(part.geometry.boundingBox!.max.z).toBeCloseTo(z, 5)
        part.geometry.dispose()
      }
    })
  }

  it('warns about nozzle-scale specks and non-layer-aligned thickness in the ZIP too', () => {
    const o = opts({ text: 'i'.repeat(24), size: 30, base: 1.3 })
    const model = buildBubble(mitr, o, colours)
    expect(model.warning).toContain('0.4 มม.')
    expect(model.warning).toContain('0.2 มม.')
    expect(bubbleReadme(model, o, colours, '')).toContain(model.warning)
    model.parts.forEach((p) => p.geometry.dispose())
  })
  it('cuts words into consecutive rows every possible way', () => {
    expect(splits(['a', 'b', 'c'], 2)).toEqual([['a', 'b c'], ['a b', 'c']])
    expect(splits(['a', 'b'], 3)).toEqual([])
    expect(splits(['a', 'b'], 1)).toEqual([['a b']])
  })

  it('cleans text to one line of at most the character limit', () => {
    expect(cleanText('  มะลิ\n  รักนะ ')).toBe('มะลิ รักนะ ')
    expect(Array.from(cleanText('x'.repeat(40)))).toHaveLength(MAX_CHARS)
  })

  it('reads stored options back into range', () => {
    const o = cleanBubble({ size: 999, rows: 9, shape: 'star', loop: 'yes', text: 5 })
    expect(o.size).toBe(80)
    expect(o.rows).toBe(4)
    expect(o.shape).toBe('circle')
    expect(o.loop).toBe(true)
    expect(o.text).toBe(DEFAULT_BUBBLE.text)
    expect(cleanColours({ base: '#ABCDEF', bubble: 'red' })).toEqual({ ...PALETTES[0].colours, base: '#abcdef' })
  })

  it('splits a long name into rows when that makes the letters taller', () => {
    const one = chooseRows(mitr, opts({ text: 'Happy Birthday Mali', rows: 1 }))
    const auto = chooseRows(mitr, opts({ text: 'Happy Birthday Mali', rows: 0 }))
    expect(one.rows).toHaveLength(1)
    expect(auto.rows.length).toBeGreaterThan(1)
    expect(auto.height).toBeGreaterThan(one.height)
    // A short name stays on one line.
    expect(chooseRows(mitr, opts({ text: 'Ploy' })).rows).toEqual(['Ploy'])
  })

  for (const shape of ['circle', 'contour'] as const) {
    for (const text of ['Ploy', 'มะลิ', 'น้องปิ่น ใจดี', 'Happy Birthday Mali 2026']) {
      it(`${shape} "${text}": three stacked layers that fit and print`, () => {
        const o = opts({ text, shape, size: 50 })
        const model = buildBubble(mitr, o, colours)
        expect(model.parts.map((p) => p.label)).toEqual(['ฐาน', 'ขอบบับเบิล', 'ตัวอักษร'])
        expect(model.colours).toEqual({ A: colours.base, B: colours.bubble, C: colours.letter })
        const [base, bubble, face] = model.parts
        // Layers stack without gaps or overlaps.
        const z = model.parts.map((p) => { p.geometry.computeBoundingBox(); return p.geometry.boundingBox! })
        expect(z[0].min.z).toBeCloseTo(0)
        expect(z[0].max.z).toBeCloseTo(o.base)
        expect(z[1].min.z).toBeCloseTo(o.base)
        expect(z[1].max.z).toBeCloseTo(o.base + o.puff)
        expect(z[2].min.z).toBeCloseTo(o.base + o.puff)
        expect(z[2].max.z).toBeCloseTo(o.base + o.puff + o.letter)
        for (const p of model.parts) {
          const { volume, watertight } = analyse(p.geometry)
          expect(watertight).toBe(true)
          expect(volume).toBeGreaterThan(0)
        }
        // Base and outline are each one piece; letters stand on the outline.
        expect(islands(base.profile!.region)).toHaveLength(1)
        expect(islands(bubble.profile!.region)).toHaveLength(1)
        // Letters stay apart so the outline colour shows between them.
        expect(islands(face.profile!.region).length).toBeGreaterThanOrEqual(Math.floor(Array.from(text.replace(/\s/g, '')).length * 0.8))
        const bb = bounds(bubble.profile!.region)
        const fb = bounds(face.profile!.region)
        expect(fb.minX).toBeGreaterThanOrEqual(bb.minX - 1e-6)
        expect(fb.maxX).toBeLessThanOrEqual(bb.maxX + 1e-6)
        if (shape === 'circle') {
          let far = 0
          for (const poly of bubble.profile!.region) for (const [x, y] of poly) far = Math.max(far, Math.hypot(x, y))
          expect(far).toBeLessThanOrEqual(o.size / 2 - RIM + 0.05)
          // Uses the space: the outline nearly reaches the rim.
          expect(far).toBeGreaterThan(o.size / 2 - RIM - 1)
        } else {
          expect(Math.max(bb.w, bb.h)).toBeLessThanOrEqual(o.size - 2 * RIM + 0.1)
        }
        // The ring tab sits above the base with its hole open.
        // The ring tab is joined on, its hole open and clear of the plate.
        const plain = buildBubble(mitr, { ...o, loop: false }, colours).parts[0].profile!.region
        const b = bounds(base.profile!.region)
        expect(b.maxY).toBeGreaterThan(bounds(plain).maxY + TAB.hole)
        expect(regionArea(diff(plain, base.profile!.region))).toBeLessThan(0.01)
        expect(regionArea(diff(base.profile!.region, plain))).toBeGreaterThan(Math.PI * (TAB.r ** 2 - TAB.hole ** 2) * 0.4)
        expect(base.profile!.region.length).toBe(plain.length + 1)
        expect(model.letterHeight).toBeGreaterThan(4)
      })
    }
  }

  it('drops the tab when the loop is off and grows with size', () => {
    const small = buildBubble(mitr, opts({ text: 'Ploy', size: 40, loop: false }), colours)
    const large = buildBubble(mitr, opts({ text: 'Ploy', size: 60, loop: false }), colours)
    expect(small.parts[0].profile!.region).toHaveLength(1)
    expect(small.width).toBeCloseTo(40, 0)
    expect(large.letterHeight).toBeGreaterThan(small.letterHeight * 1.4)
    expect(regionArea(large.parts[2].profile!.region)).toBeGreaterThan(regionArea(small.parts[2].profile!.region))
  })

  it('returns nothing for an empty name and warns about tiny letters', () => {
    expect(buildBubble(mitr, opts({ text: '   ' }), colours).parts).toEqual([])
    const tiny = buildBubble(mitr, opts({ text: 'ABCDEFGHIJKLMNOPQRSTUVWX', size: 30 }), colours)
    expect(tiny.warning).toMatch(/ตัวอักษรสูงแค่/)
  })

  it('exports a ZIP whose files match the preview', () => {
    const o = opts({ text: 'มะลิ ใจดี' })
    const model = buildBubble(mitr, o, colours)
    const readme = bubbleReadme(model, o, colours, partsList(partStats(model.parts)))
    const files = unzipSync(buildZip({ baseName: 'มะลิ', parts: model.parts, readme }))
    const names = Object.keys(files)
    expect(names.filter((n) => n.endsWith('.stl'))).toHaveLength(4)
    expect(names.some((n) => n.endsWith('.dxf'))).toBe(false)
    const text = strFromU8(files['รายการชิ้นส่วน.txt'])
    expect(text).toContain('มะลิ / ใจดี')
    expect(text).toContain(colours.bubble)
    expect(text).toContain(`จำนวนแถว: ${model.rows.length}`)
    if (model.warning) expect(text).toContain(model.warning)
    const changed = { ...colours, letter: '#123456' }
    expect(bubbleReadme(model, o, changed, '')).toContain(changed.letter)
    const size = modelSize(model.parts)
    expect(text).toContain(`${size.w.toFixed(1)} × ${size.h.toFixed(1)}`)
    expect(printableStl(model.parts).byteLength).toBe(84 + 50 * model.parts.reduce((n, p) => n + (p.geometry.index?.count ?? p.geometry.getAttribute('position').count) / 3, 0))
  })
})

describe('initial style and grip discs', () => {
  it('picks the first consonant or Latin letter as the big letter', () => {
    expect(initialOf('เมย์')).toBe('ม')
    expect(initialOf('  Ploy')).toBe('P')
    expect(initialOf('ปิ่น')).toBe('ป')
  })

  for (const shape of ['circle', 'contour'] as const) {
    for (const text of ['Mali', 'เมย์ ใจดี', 'น้องปิ่น']) {
      it(`${shape} ${text}: big letter, name banner and base are watertight and inside the base`, () => {
        const model = buildBubble(mitr, opts({ text, shape, style: 'initial' }), colours)
        expect(model.parts.map((p) => p.label)).toEqual(['ฐาน', 'ตัวอักษรใหญ่', 'ชื่อ'])
        for (const part of model.parts) expect(analyse(part.geometry).watertight, part.label).toBe(true)
        expect(model.letterHeight).toBeGreaterThan(3)
        const size = modelSize(model.parts)
        if (shape === 'circle') expect(Math.max(size.w, size.h)).toBeLessThanOrEqual(50 + 2 * 4 + 1)
        expect(size.d).toBeCloseTo(DEFAULT_BUBBLE.base + DEFAULT_BUBBLE.puff + DEFAULT_BUBBLE.letter, 3)
      })
    }
  }

  it('a grip disc is a circle with no tab, whatever was saved', () => {
    const model = buildBubble(mitr, opts({ text: 'Ploy', purpose: 'grip', shape: 'contour', loop: true, size: 40 }), colours)
    expect(model.width).toBeCloseTo(40, 0)
    expect(model.height).toBeCloseTo(40, 0)
    const readme = bubbleReadme(model, opts({ purpose: 'grip', loop: true }), colours, '')
    expect(readme).toContain('Griptok')
    expect(readme).not.toContain('รวมหูห้อย')
  })

  it('restores purpose and style safely', () => {
    expect(cleanBubble({ purpose: 'grip', style: 'initial' })).toMatchObject({ purpose: 'grip', style: 'initial' })
    expect(cleanBubble({ purpose: 'x', style: 7 })).toMatchObject({ purpose: 'keychain', style: 'name' })
  })
})

 it('ignores marks, vowels, digits and emoji when choosing an initial', () => {
   for (const text of ['่ิ', 'เแโใไะาำฤๅ', '123', '😀']) expect(initialOf(text)).toBe('')
   expect(initialOf('😀12 เÉva')).toBe('E')
   expect(initialOf('่ เเมย์')).toBe('ม')
   const model = buildBubble(mitr, opts({ text: '123', style: 'initial' }), colours)
   expect(model.parts).toEqual([])
   expect(model.warning).toContain('พยัญชนะไทย')
 })
 it('normalizes hidden grip shape and restored size while preserving the loop preference', () => {
   expect(cleanBubble({ purpose: 'grip', shape: 'contour', size: 80, loop: true })).toMatchObject({ shape: 'circle', size: 60, loop: true })
   expect(cleanBubble({ purpose: 'grip' }).size).toBe(40)
   expect(cleanBubble({})).toEqual(DEFAULT_BUBBLE)
 })

describe('bubble rim setting', () => {
  it('a wider rim leaves more base round the outline at the same overall size', () => {
    const thin = buildBubble(mitr, opts({ text: 'Ploy', shape: 'contour', rim: 0.6, loop: false }), colours)
    const wide = buildBubble(mitr, opts({ text: 'Ploy', shape: 'contour', rim: 4, loop: false }), colours)
    expect(Math.max(wide.width, wide.height)).toBeCloseTo(Math.max(thin.width, thin.height), 0)
    expect(wide.letterHeight).toBeLessThan(thin.letterHeight)
    expect(cleanBubble({ rim: 9 }).rim).toBe(4)
  })
})
