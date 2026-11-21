import { bounds, hull, offset, rect, scale, translate, union, type Region } from '../geo2d'
import { fontOf, missingGlyphs, num, str, textArt, type GiftContext, type GiftDesign, type GiftLayer, type GiftValues } from './core'

/** Height of each slice of the letters, mm: fine enough for smooth letter edges. */
const STEP = 0.4

/** The glyph of `ch`, scaled to exactly `h` tall, its left edge at x = 0 and its foot at y = 0. */
function glyph(ctx: GiftContext, v: GiftValues, key: string, ch: string, h: number): Region {
  const art = textArt(fontOf(ctx, v, key), [ch], 100)
  if (!art.length) return []
  const b = bounds(art)
  return scale(translate(art, -b.minX, -b.minY), h / b.h)
}

/** Where a horizontal line at height `y` crosses into ink: sorted [from, to] pairs. */
export function spans(region: Region, y: number): [number, number][] {
  const xs: number[] = []
  for (const poly of region) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
  }
  xs.sort((a, b) => a - b)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) out.push([xs[i], xs[i + 1]])
  return out
}

/**
 * Dual-view ambigram: each letter block is the space where the first word's
 * letter (seen from the front) and the second word's letter (seen from the
 * right) overlap. Built in thin horizontal slices: at each height the block is
 * every front span times every side span. The blocks step along a diagonal so
 * both words read left to right from their own side.
 */
function ambigram(ctx: GiftContext, v: GiftValues) {
  const a = [...str(v, 'front').toUpperCase().replace(/\s+/g, '')]
  const b = [...str(v, 'side').toUpperCase().replace(/\s+/g, '')]
  if (!a.length || !b.length) return { layers: [] }
  // Only solid letters and digits: accents, punctuation and Thai marks would
  // become loose floating pieces or be stretched to a full letter's height.
  if (![...a, ...b].every((ch) => /^[A-Z0-9]$/.test(ch))) return { layers: [], warning: 'ใช้ได้เฉพาะตัวอักษรอังกฤษ A–Z และตัวเลข 0–9' }
  if (a.length !== b.length) return { layers: [], warning: `สองคำต้องมีจำนวนตัวอักษรเท่ากัน (ตอนนี้ ${a.length} กับ ${b.length} ตัว)` }
  if (missingGlyphs(fontOf(ctx, v, 'front'), a.join('')) || missingGlyphs(fontOf(ctx, v, 'side'), b.join(''))) {
    return { layers: [], warning: 'ใช้ตัวอักษรอังกฤษหรือตัวเลขเท่านั้น' }
  }
  const H = num(v, 'size')
  const gap = num(v, 'gap')
  const base = num(v, 'base')
  const fronts = a.map((ch) => glyph(ctx, v, 'front', ch, H))
  const sides = b.map((ch) => glyph(ctx, v, 'side', ch, H))
  // Each block steps right by its front letter's width and back by its side letter's width.
  let x = 0
  let y = 0
  const at = fronts.map((f, i) => {
    const here = [x, y] as const
    x += bounds(f).w + gap
    y += bounds(sides[i]).w + gap
    return here
  })
  const layers: GiftLayer[] = []
  let last = ''
  for (let z = STEP / 2; z < H; z += STEP) {
    const rects: Region[] = []
    fronts.forEach((f, i) => {
      for (const [x1, x2] of spans(f, z)) {
        for (const [y1, y2] of spans(sides[i], z)) {
          rects.push(rect(at[i][0] + (x1 + x2) / 2, at[i][1] + (y1 + y2) / 2, x2 - x1, y2 - y1))
        }
      }
    })
    const region = union(...rects)
    const key = JSON.stringify(region)
    const bottom = base + z - STEP / 2
    // Equal neighbouring slices become one taller layer.
    if (key === last && layers.length) layers[layers.length - 1].h += STEP
    else if (region.length) layers.push({ colour: 'letters', region, z: bottom, h: STEP })
    last = region.length ? key : ''
  }
  if (!layers.length) return { layers: [], warning: 'ตัวอักษรสองคำไม่มีส่วนที่ซ้อนกัน ลองคู่ตัวอักษรอื่น' }
  // A plinth under every block, joining them.
  const foot = layers[0].region
  const plinth = offset(hull(union(foot, ...layers.slice(1, 4).map((l) => l.region))), num(v, 'margin'))
  layers.unshift({ colour: 'base', region: plinth, z: 0, h: base })
  return { layers }
}

export const AMBIGRAMS: GiftDesign[] = [
  {
    id: 'desk-ambigram', name: 'ตัวอักษรแอมบิแกรมสองคำ', group: 'desk',
    blurb: 'ตัวอักษรตั้งโต๊ะ มองจากด้านหน้าเห็นคำหนึ่ง หมุนไปมองด้านข้างเห็นอีกคำ',
    params: [
      { key: 'front', label: 'คำที่เห็นจากด้านหน้า', kind: 'text', default: 'LOVE', maxChars: 8, font: 'lilita', hint: 'ภาษาอังกฤษหรือตัวเลข ตัวพิมพ์ใหญ่' },
      { key: 'side', label: 'คำที่เห็นจากด้านข้าง', kind: 'text', default: 'HOME', maxChars: 8, font: 'lilita', hint: 'จำนวนตัวอักษรต้องเท่ากับคำแรก' },
      { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 40, min: 20, max: 100, step: 1, unit: 'มม.' },
      { key: 'gap', label: 'ช่องไฟ', kind: 'number', default: 3, min: 0, max: 12, step: 0.5, unit: 'มม.' },
      { key: 'margin', label: 'ขอบฐาน', kind: 'number', default: 4, min: 2, max: 12, step: 0.5, unit: 'มม.' },
      { key: 'base', label: 'ความหนาฐาน', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'base', label: 'ฐาน', default: '#1f2937' },
      { key: 'letters', label: 'ตัวอักษร', default: '#f6c62f' },
    ],
    howTo: [
      'พิมพ์ตั้งตรงตามไฟล์ เปิดซัพพอร์ตแบบต้นไม้ (tree) สำหรับส่วนที่ยื่นออก ชั้น 0.12–0.16 มม. ให้ขอบตัวอักษรเรียบ',
      'วางให้มุมของแถวตัวอักษรชี้มาหาคนดู: ด้านหน้าอ่านคำแรก ด้านขวาอ่านคำที่สอง',
    ],
    upright: true,
    needsSupport: true,
    build: ambigram,
  },
]
