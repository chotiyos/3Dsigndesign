import { initialOf, puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, intersect, offset, rotate, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  filled, fitText, LOOP, missingGlyphs, num, str, textArt, THICKNESS, withTab,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues,
} from './core'
import { daisy, leafBranch, patternWeb, PATTERNS, type PatternKind } from './patterns'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ'

/** A shape scaled so its height is `h`, centred on the origin. */
const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}

/** One letter, `h` mm tall, centred. */
function letterArt(ctx: GiftContext, ch: string, h: number): Region {
  const art = textArt(ctx.font, [ch], 100)
  return art.length ? sized(art, h) : []
}

/** Text rounded a little so strokes print cleanly. */
const soft = (art: Region, h: number) => puffUp(art, Math.min(0.5, h * 0.04))

/** A plinth under a standing piece so it does not rock. */
function plinth(region: Region, h: number): Region {
  const b = bounds(region)
  return roundRect((b.minX + b.maxX) / 2, b.minY - h / 2 + 0.6, Math.max(30, b.w * 0.62), h, Math.min(2, h / 2))
}

// ——— letter signs ———

const NAME_IN_LETTER: GiftParam[] = [
  { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Lily', maxChars: 16 },
  { key: 'letter', label: 'ตัวอักษรใหญ่', kind: 'text', default: '', maxChars: 1, hint: 'เว้นว่างไว้ ใช้ตัวแรกของชื่อ' },
  { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 120, min: 60, max: 220, step: 1, unit: 'มม.' },
  { key: 'rim', label: 'ขอบตัวอักษร', kind: 'number', default: 3.2, min: 2, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'cell', label: 'ขนาดช่องลาย', kind: 'number', default: 9, min: 5, max: 18, step: 0.5, unit: 'มม.' },
  { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: true },
  ...THICKNESS,
]

const LETTER_COLOURS = [
  { key: 'back', label: 'แผ่นหลัง', default: '#f2e6d0' },
  { key: 'pattern', label: 'ลายด้านใน', default: '#c79a5b' },
  { key: 'frame', label: 'ขอบตัวอักษร', default: '#8a5a2b' },
  { key: 'deco', label: 'ใบไม้และดอกไม้', default: '#3f8f5a' },
  { key: 'plate', label: 'พื้นชื่อ', default: '#ffffff' },
  { key: 'name', label: 'ชื่อ', default: '#2b2b2b' },
]

type Deco = 'none' | 'leaves' | 'daisies'

function letterSign(ctx: GiftContext, v: GiftValues, pattern: PatternKind, deco: Deco, round = false) {
  const name = str(v, 'name').trim()
  const ch = str(v, 'letter').trim() || initialOf(name) || 'A'
  if (missingGlyphs(ctx.font, name + ch)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const rim = num(v, 'rim')
  const top = t + 0.8
  const layers: GiftLayer[] = []
  let body: Region
  if (round) {
    // A ring with a honeycomb inside and the letter standing solid in the middle.
    body = circle(0, 0, H / 2, 128)
    const inner = offset(body, -rim)
    const letter = letterArt(ctx, ch, H * 0.62)
    layers.push({ colour: 'back', region: body, z: 0, h: 1.2 })
    layers.push({ colour: 'pattern', region: patternWeb(pattern, inner, num(v, 'cell')), z: 1.2, h: t - 1.2 })
    layers.push({ colour: 'frame', region: diff(body, inner), z: 0, h: top })
    layers.push({ colour: 'frame', region: union(letter, diff(offset(letter, 1.4), letter)), z: 0, h: top })
  } else {
    body = letterArt(ctx, ch, H)
    const inner = offset(body, -rim)
    layers.push({ colour: 'back', region: body, z: 0, h: 1.2 })
    layers.push({ colour: 'pattern', region: patternWeb(pattern, inner, num(v, 'cell')), z: 1.2, h: t - 1.2 })
    layers.push({ colour: 'frame', region: diff(body, inner), z: 0, h: top })
  }
  const b = bounds(body)
  if (deco === 'leaves') {
    const size = H * 0.16
    layers.push({ colour: 'deco', region: leafBranch([b.minX - size * 0.2, b.maxY - H * 0.12], [b.minX + b.w * 0.75, b.maxY - H * 0.4], size, 7), z: 0, h: top + 0.4 })
    layers.push({ colour: 'deco', region: leafBranch([b.maxX + size * 0.1, b.minY + H * 0.3], [b.minX + b.w * 0.45, b.minY + H * 0.12], size * 0.85, 5), z: 0, h: top + 0.4 })
  }
  if (deco === 'daisies') {
    const spots: [number, number][] = [[b.minX + b.w * 0.15, b.maxY - H * 0.08], [b.maxX - b.w * 0.12, b.minY + H * 0.62], [b.minX + b.w * 0.2, b.minY + H * 0.12]]
    for (const [x, y] of spots) {
      const d = daisy(x, y, H * 0.11)
      layers.push({ colour: 'plate', region: d.petals, z: 0, h: top + 0.4 })
      layers.push({ colour: 'deco', region: d.centre, z: 0, h: top + 0.8 })
    }
  }
  // The name across the lower middle, on its own backing.
  const fit = fitText(ctx.font, name, Math.max(b.w * 1.05, H * 0.85), H * 0.34, H * 0.24)
  if (fit.art.length) {
    const nb = bounds(fit.art)
    const face = soft(translate(fit.art, -(nb.minX + nb.maxX) / 2 + (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 - H * 0.1 - (nb.minY + nb.maxY) / 2), fit.height)
    layers.push({ colour: 'plate', region: silhouette(face, 2), z: 0, h: top + 0.4 })
    layers.push({ colour: 'name', region: face, z: top + 0.4, h: r })
  }
  if (v.stand) {
    const all = union(...layers.map((l) => l.region))
    layers.unshift({ colour: 'frame', region: plinth(all, 6), z: 0, h: top })
  }
  return { layers }
}

const letterDesign = (id: string, name: string, blurb: string, pattern: PatternKind, deco: Deco, round = false): GiftDesign => ({
  id, name, blurb, group: 'initial',
  params: [...NAME_IN_LETTER, { key: 'pattern', label: 'ลายด้านใน', kind: 'choice', default: pattern, options: PATTERNS }],
  colours: LETTER_COLOURS,
  build: (ctx, v) => letterSign(ctx, v, str(v, 'pattern') as PatternKind, deco, round),
})

// ——— name signs ———

const SIGN_COLOURS = [
  { key: 'base', label: 'ฐาน', default: '#f06595' },
  { key: 'pattern', label: 'ลายพื้น', default: '#c2255c' },
  { key: 'text', label: 'ตัวอักษร', default: '#ffffff' },
  { key: 'motif', label: 'ลายการ์ตูน', default: '#ffffff' },
]

const TWO_LINES: GiftParam[] = [
  { key: 'line1', label: 'บรรทัดบน (ชื่อ)', kind: 'text', default: 'Mali', maxChars: 16 },
  { key: 'line2', label: 'บรรทัดล่าง', kind: 'text', default: 'Happy Birthday', maxChars: 24 },
  { key: 'size', label: 'ความสูงตัวอักษรบรรทัดบน', kind: 'number', default: 26, min: 12, max: 60, step: 1, unit: 'มม.' },
  { key: 'length', label: 'ความยาวสูงสุด', kind: 'number', default: 160, min: 80, max: 300, step: 5, unit: 'มม.' },
  { key: 'margin', label: 'ขอบฐานรอบตัวอักษร', kind: 'number', default: 4, min: 2, max: 10, step: 0.2, unit: 'มม.' },
  { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: true },
  ...THICKNESS,
]

/** Two lines of text, the second smaller, centred under the first. */
function twoLines(ctx: GiftContext, v: GiftValues, room: number) {
  const h1 = num(v, 'size')
  const l1 = fitText(ctx.font, str(v, 'line1'), room, h1 * 1.6, h1, false)
  const l2 = fitText(ctx.font, str(v, 'line2'), room, h1, h1 * 0.45, false)
  const parts: Region[] = []
  let y = 0
  if (l1.art.length) {
    const b = bounds(l1.art)
    parts.push(soft(translate(l1.art, -(b.minX + b.maxX) / 2, -b.maxY), l1.height))
    y = -b.h - l1.height * 0.18
  }
  if (l2.art.length) {
    const b = bounds(l2.art)
    parts.push(soft(translate(l2.art, -(b.minX + b.maxX) / 2, y - b.maxY), l2.height))
  }
  const art = union(...parts)
  return { art, height: l1.height || l2.height }
}

function nameSign(ctx: GiftContext, v: GiftValues, motif: string) {
  if (missingGlyphs(ctx.font, str(v, 'line1') + str(v, 'line2'))) return { layers: [], warning: NO_GLYPH }
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const margin = num(v, 'margin')
  const length = num(v, 'length')
  let { art } = twoLines(ctx, v, length - 2 * margin)
  if (!art.length) return { layers: [] }
  let tb = bounds(art)
  let picture: Region = []
  if (motif) {
    // The motif to the left, as tall as both lines; the text shrinks to make room.
    const mh = tb.h * 1.15
    const m = sized(charmArt(motif), mh)
    const mb = bounds(m)
    const room = length - 2 * margin - mb.w - margin
    if (tb.w > room) {
      art = scale(art, room / tb.w)
      tb = bounds(art)
    }
    picture = translate(m, tb.minX - margin - mb.maxX, (tb.minY + tb.maxY) / 2)
  }
  const face = union(art, picture)
  let base = silhouette(face, margin)
  if (v.stand) base = union(base, plinth(base, 6))
  return {
    layers: [
      { colour: 'base', region: base, z: 0, h: t },
      { colour: 'text', region: art, z: t, h: r },
      { colour: 'motif', region: picture, z: t, h: r },
    ],
  }
}

const signDesign = (id: string, name: string, blurb: string, motif: string): GiftDesign => ({
  id, name, blurb, group: 'namesign',
  params: TWO_LINES,
  colours: SIGN_COLOURS,
  build: (ctx, v) => nameSign(ctx, v, motif),
})

/** The name on a plate filled with a turned pattern, framed by a rim. */
function patternPlate(ctx: GiftContext, v: GiftValues, kind: PatternKind, banner: boolean) {
  const text = str(v, 'line1')
  if (missingGlyphs(ctx.font, text)) return { layers: [], warning: NO_GLYPH }
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const margin = num(v, 'margin')
  const fit = fitText(ctx.font, text, num(v, 'length') - 4 * margin - (banner ? 40 : 0), num(v, 'size') * 2.4, num(v, 'size'))
  if (!fit.art.length) return { layers: [] }
  const face = soft(fit.art, fit.height)
  const b = bounds(face)
  let plate: Region
  const hearts: Region[] = []
  if (banner) {
    // A ribbon with notched tails and a heart at each end.
    const w = b.w + 4 * margin + 36
    const h = b.h + 4 * margin
    const notch = h * 0.35
    plate = [[[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2 - notch, 0], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2 + notch, 0]]]
    const heart = sized(charmArt('heart'), h * 0.42)
    hearts.push(translate(heart, -b.w / 2 - margin - 11, 0), translate(heart, b.w / 2 + margin + 11, 0))
  } else {
    plate = roundRect(0, 0, b.w + 4 * margin + 8, b.h + 4 * margin + 6, Math.min(10, (b.h + 4 * margin) / 2))
  }
  const inner = offset(plate, -2.4)
  const backing = silhouette(face, margin * 0.8)
  const layers: GiftLayer[] = [
    { colour: 'base', region: plate, z: 0, h: 1.2 },
    { colour: 'pattern', region: banner ? inner : patternWeb(kind, inner, num(v, 'size') * 0.45), z: 1.2, h: t - 1.2 },
    { colour: 'base', region: union(diff(plate, inner), backing), z: 0, h: t },
    { colour: 'text', region: face, z: t, h: r },
    { colour: 'motif', region: union(...hearts), z: t, h: r },
  ]
  if (v.stand) layers.unshift({ colour: 'base', region: plinth(plate, 6), z: 0, h: t })
  return { layers }
}

const PLATE_PARAMS: GiftParam[] = [
  { key: 'line1', label: 'ข้อความ', kind: 'text', default: 'Ploy', maxChars: 20 },
  { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 30, min: 12, max: 70, step: 1, unit: 'มม.' },
  { key: 'length', label: 'ความยาวสูงสุด', kind: 'number', default: 170, min: 80, max: 300, step: 5, unit: 'มม.' },
  { key: 'margin', label: 'ขอบรอบตัวอักษร', kind: 'number', default: 4, min: 2, max: 10, step: 0.2, unit: 'มม.' },
  { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: true },
  ...THICKNESS,
]

/** Each letter a frame filled with a pattern, all joined on a thin backing. */
function patternText(ctx: GiftContext, v: GiftValues) {
  const text = str(v, 'line1')
  if (missingGlyphs(ctx.font, text)) return { layers: [], warning: NO_GLYPH }
  const t = num(v, 'base')
  const fit = fitText(ctx.font, text, num(v, 'length'), num(v, 'size') * 2.4, num(v, 'size') * 1.6)
  if (!fit.art.length) return { layers: [] }
  const face = puffUp(fit.art, fit.height * 0.08)
  const rim = Math.max(1.6, fit.height * 0.08)
  const inner = offset(face, -rim)
  const back = silhouette(face, num(v, 'margin') * 0.5)
  const layers: GiftLayer[] = [
    { colour: 'base', region: back, z: 0, h: 1.2 },
    { colour: 'pattern', region: patternWeb(str(v, 'pattern') as PatternKind, inner, Math.max(4, fit.height * 0.22)), z: 1.2, h: t - 1.2 },
    // Opened a hair with square joins: puffed letters can leave the ring with
    // edges that touch along a line, which does not close as a solid.
    { colour: 'text', region: offset(offset(diff(face, inner), -0.02, true), 0.02, true), z: 0, h: t + num(v, 'raise') },
  ]
  if (v.stand) layers.unshift({ colour: 'base', region: plinth(back, 5), z: 0, h: 1.2 })
  return { layers }
}

// ——— keychains ———

export const KEY_SHAPES = [
  { id: 'heart', label: 'หัวใจ' },
  { id: 'star', label: 'ดาว' },
  { id: 'cloud', label: 'ก้อนเมฆ' },
  { id: 'flower', label: 'ดอกไม้' },
  { id: 'circle', label: 'วงกลม' },
  { id: 'bear', label: 'หมี' },
  { id: 'cat', label: 'แมว' },
]

function shapeOf(id: string, h: number): Region {
  if (id === 'circle') return circle(0, 0, h / 2, 96)
  return sized(filled(charmArt(id)), h)
}

const KEY_PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Ploy', maxChars: 12 },
  { key: 'shape', label: 'รูปทรง', kind: 'choice', default: 'heart', options: KEY_SHAPES },
  { key: 'size', label: 'ขนาด', kind: 'number', default: 45, min: 25, max: 90, step: 1, unit: 'มม.' },
  { key: 'border', label: 'ขอบสีที่ 2', kind: 'number', default: 2.4, min: 1.2, max: 6, step: 0.2, unit: 'มม.' },
  LOOP,
  ...THICKNESS,
]

const KEY_COLOURS = [
  { key: 'base', label: 'ฐาน', default: '#ff8fab' },
  { key: 'inner', label: 'ชั้นกลาง', default: '#ffffff' },
  { key: 'text', label: 'ชื่อ', default: '#d6336c' },
  { key: 'centre', label: 'เกสร', default: '#ffd43b' },
]

/** A name fitted inside a shape's middle. */
function nameInside(ctx: GiftContext, name: string, shape: Region, share = 0.72) {
  const b = bounds(shape)
  const fit = fitText(ctx.font, name, b.w * share, b.h * 0.42, b.h * 0.34)
  if (!fit.art.length) return []
  const nb = bounds(fit.art)
  return soft(translate(fit.art, (b.minX + b.maxX) / 2 - (nb.minX + nb.maxX) / 2, (b.minY + b.maxY) / 2 - (nb.minY + nb.maxY) / 2 - b.h * 0.04), fit.height)
}

function shapeKeychain(ctx: GiftContext, v: GiftValues, three: boolean) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const shape = shapeOf(str(v, 'shape'), num(v, 'size'))
  const text = nameInside(ctx, name, shape)
  let base = shape
  if (v.loop) base = withTab(base)
  const layers: GiftLayer[] = [{ colour: 'base', region: base, z: 0, h: t }]
  if (three) {
    const inner = offset(shape, -num(v, 'border'))
    layers.push({ colour: 'inner', region: inner, z: t, h: 0.6 })
    layers.push({ colour: 'text', region: intersect(text, inner), z: t + 0.6, h: r })
  } else {
    layers.push({ colour: 'text', region: text, z: t, h: r })
  }
  return { layers }
}

function doubleHeart(ctx: GiftContext, v: GiftValues) {
  const a = str(v, 'name')
  const b2 = str(v, 'name2')
  if (missingGlyphs(ctx.font, a + b2)) return { layers: [], warning: NO_GLYPH }
  const s = num(v, 'size')
  const left = translate(rotate(shapeOf('heart', s), 0.18), -s * 0.36, 0)
  const right = translate(rotate(shapeOf('heart', s), -0.18), s * 0.36, -s * 0.04)
  const t = num(v, 'base')
  let base = union(left, right)
  if (v.loop) base = withTab(base)
  const ra = nameInside(ctx, a, translate(shapeOf('heart', s), -s * 0.36, 0), 0.62)
  const rb = nameInside(ctx, b2, translate(shapeOf('heart', s), s * 0.36, -s * 0.04), 0.62)
  return {
    layers: [
      { colour: 'base', region: base, z: 0, h: t },
      { colour: 'inner', region: diff(right, offset(left, 1)), z: t, h: 0.6 },
      { colour: 'text', region: union(ra, rb), z: t + 0.6, h: num(v, 'raise') },
    ],
  }
}

function flowerKeychain(ctx: GiftContext, v: GiftValues, nameOnly: boolean) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const s = num(v, 'size')
  if (nameOnly) {
    // The name with a daisy at each end, on a base that follows them.
    const fit = fitText(ctx.font, name, s * 2, s * 0.7, s * 0.5, false)
    if (!fit.art.length) return { layers: [] }
    const face = soft(fit.art, fit.height)
    const b = bounds(face)
    const R = b.h * 0.62
    const d1 = daisy(b.minX - R * 0.9, 0, R)
    const d2 = daisy(b.maxX + R * 0.9, 0, R)
    let base = silhouette(union(face, d1.petals, d2.petals, d1.centre, d2.centre), 2.4)
    if (v.loop) base = withTab(base)
    return {
      layers: [
        { colour: 'base', region: base, z: 0, h: t },
        { colour: 'text', region: face, z: t, h: r },
        { colour: 'inner', region: union(d1.petals, d2.petals), z: t, h: r },
        { colour: 'centre', region: union(d1.centre, d2.centre), z: t, h: r + 0.4 },
      ],
    }
  }
  // A flower whose round centre carries the name.
  const petals: Region[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 2
    petals.push(circle(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, s * 0.22, 48))
  }
  const centre = circle(0, 0, s * 0.27, 96)
  let base = union(...petals, centre)
  if (v.loop) base = withTab(base)
  const text = nameInside(ctx, name, centre, 0.86)
  return {
    layers: [
      { colour: 'base', region: base, z: 0, h: t },
      { colour: 'centre', region: centre, z: t, h: 0.6 },
      { colour: 'text', region: intersect(text, centre), z: t + 0.6, h: r },
    ],
  }
}

export const ROUND1: GiftDesign[] = [
  letterDesign('initial-greenery', 'ป้ายอักษรใบไม้เขียว', 'ตัวอักษรใหญ่ไส้ระแนง มีกิ่งใบไม้พาดและชื่อคาด', 'slats', 'leaves'),
  letterDesign('initial-rattan', 'ป้ายอักษรลายหวาย', 'ตัวอักษรใหญ่ไส้ลายหวายสาน ขอบหนา ชื่อคาดกลาง', 'rattan', 'none'),
  letterDesign('initial-pattern', 'ป้ายอักษรลายดอก', 'ตัวอักษรใหญ่ไส้ลายดอกไม้ฉลุ ชื่อคาดกลาง', 'daisy', 'none'),
  letterDesign('initial-lattice', 'ป้ายอักษรตาข่าย', 'ตัวอักษรใหญ่ไส้ตาข่ายข้าวหลามตัด ชื่อคาดกลาง', 'lattice', 'none'),
  letterDesign('initial-hex', 'ป้ายอักษรวงกลมรังผึ้ง', 'วงกลมไส้รังผึ้ง ตัวอักษรตั้งกลาง ชื่อคาดล่าง', 'hex', 'none', true),
  letterDesign('initial-daisy', 'ตัวอักษรดอกเดซี่', 'ตัวอักษรใหญ่ประดับดอกเดซี่ ไส้ลายจุด ชื่อคาด', 'dots', 'daisies'),
  signDesign('sign-flower', 'ป้ายชื่อ 2 บรรทัด ลายดอกไม้', 'ชื่อตัวใหญ่ ข้อความบรรทัดล่าง และดอกไม้ด้านหน้า', 'flower'),
  signDesign('sign-rocket', 'ป้ายชื่อ 2 บรรทัด ลายจรวด', 'ชื่อกับข้อความ คู่กับจรวด เหมาะห้องเด็ก', 'rocket'),
  signDesign('sign-bunny', 'ป้ายชื่อ 2 บรรทัด ลายกระต่าย', 'ชื่อกับข้อความ คู่กับกระต่าย', 'bunny'),
  signDesign('sign-planet', 'ป้ายชื่อ 2 บรรทัด ลายดาวเคราะห์', 'ชื่อกับข้อความ คู่กับดาวเคราะห์มีวงแหวน', 'planet'),
  {
    id: 'sign-pattern', name: 'ป้ายชื่อพื้นลายเฉียง', group: 'namesign', blurb: 'ป้ายทรงมน พื้นลายเฉียงฉลุ ชื่อนูนบนพื้นเรียบ',
    params: [...PLATE_PARAMS, { key: 'pattern', label: 'ลายพื้น', kind: 'choice', default: 'stripes', options: PATTERNS }],
    colours: SIGN_COLOURS,
    build: (ctx, v) => patternPlate(ctx, v, str(v, 'pattern') as PatternKind, false),
  },
  {
    id: 'sign-banner', name: 'ป้ายริบบิ้นหัวใจ', group: 'namesign', blurb: 'ริบบิ้นปลายแฉก ชื่อตรงกลาง หัวใจสองข้าง',
    params: PLATE_PARAMS.map((p) => (p.key === 'line1' ? { ...p, default: 'LOVE' } : p)),
    colours: SIGN_COLOURS,
    build: (ctx, v) => patternPlate(ctx, v, 'stripes', true),
  },
  {
    id: 'pattern-text', name: 'ตัวอักษรไส้ลาย', group: 'namesign', blurb: 'ตัวอักษรอ้วนเป็นกรอบ ไส้ลายฉลุ ต่อกันเป็นชิ้นเดียว',
    params: [
      ...PLATE_PARAMS.map((p) => (p.key === 'size' ? { ...p, default: 40, max: 90 } : p)),
      { key: 'pattern', label: 'ลายไส้', kind: 'choice', default: 'hex', options: PATTERNS },
    ],
    colours: SIGN_COLOURS,
    build: patternText,
  },
  {
    id: 'key-shape2', name: 'พวงกุญแจรูปทรง 2 สี', group: 'keychain', blurb: 'รูปทรงน่ารัก ชื่อนูนอีกสี',
    params: KEY_PARAMS.filter((p) => p.key !== 'border'), colours: KEY_COLOURS,
    build: (ctx, v) => shapeKeychain(ctx, v, false),
  },
  {
    id: 'key-shape3', name: 'พวงกุญแจรูปทรง 3 สี', group: 'keychain', blurb: 'รูปทรงมีขอบ ชั้นกลางอีกสี และชื่อสีที่สาม',
    params: KEY_PARAMS, colours: KEY_COLOURS,
    build: (ctx, v) => shapeKeychain(ctx, v, true),
  },
  {
    id: 'key-double-heart', name: 'พวงกุญแจหัวใจคู่ 2 ชื่อ', group: 'keychain', blurb: 'หัวใจสองดวงซ้อนกัน ชื่อละดวง',
    params: [
      { key: 'name', label: 'ชื่อที่ 1', kind: 'text', default: 'Ploy', maxChars: 10 },
      { key: 'name2', label: 'ชื่อที่ 2', kind: 'text', default: 'Ton', maxChars: 10 },
      { key: 'size', label: 'ขนาดหัวใจ', kind: 'number', default: 40, min: 25, max: 80, step: 1, unit: 'มม.' },
      LOOP, ...THICKNESS,
    ],
    colours: KEY_COLOURS,
    build: doubleHeart,
  },
  {
    id: 'key-flower', name: 'พวงกุญแจดอกไม้', group: 'keychain', blurb: 'ดอกไม้หกกลีบ ชื่ออยู่กลางเกสร',
    params: KEY_PARAMS.filter((p) => p.key !== 'shape' && p.key !== 'border'), colours: KEY_COLOURS,
    build: (ctx, v) => flowerKeychain(ctx, v, false),
  },
  {
    id: 'key-daisy-name', name: 'พวงกุญแจชื่อดอกเดซี่', group: 'keychain', blurb: 'ชื่อตัวนูน ดอกเดซี่หัวท้าย',
    params: KEY_PARAMS.filter((p) => p.key !== 'shape' && p.key !== 'border').map((p) => (p.key === 'size' ? { ...p, label: 'ความสูง', default: 30, min: 18, max: 60 } : p)),
    colours: KEY_COLOURS,
    build: (ctx, v) => flowerKeychain(ctx, v, true),
  },
]

