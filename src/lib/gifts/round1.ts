import { initialOf, puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, intersect, offset, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  connectedLetter, standingFoot, fitText, missingGlyphs, num, str, textArt, THICKNESS,
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
  return art.length ? connectedLetter(sized(art, h)) : []
}

/** Text rounded a little so strokes print cleanly. */
const soft = (art: Region, h: number) => puffUp(art, Math.min(0.5, h * 0.04))

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
    layers.unshift(standingFoot(all, 'frame', top))
  }
  if (deco === 'daisies') {
    layers.unshift({ colour: 'back', region: connectedLetter(union(...layers.filter((l) => l.z === 0).map((l) => l.region))), z: 0, h: 1.2 })
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
    { colour: 'base', region: banner ? diff(plate, inner) : union(diff(plate, inner), backing), z: 0, h: t },
    { colour: 'text', region: face, z: t, h: r },
    { colour: 'motif', region: intersect(union(...hearts), plate), z: t, h: r },
  ]
  if (v.stand) layers.unshift(standingFoot(plate, 'base', t))
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
    { colour: 'text', region: diff(face, inner), z: 0, h: t + num(v, 'raise') },
  ]
  if (v.stand) layers.unshift(standingFoot(back, 'base', t + num(v, 'raise'), 5))
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

export const ROUND1: GiftDesign[] = [
  letterDesign('initial-greenery', 'ป้ายอักษรใบไม้เขียว', 'ตัวอักษรใหญ่ไส้ระแนง มีกิ่งใบไม้พาดและชื่อคาด', 'slats', 'leaves'),
  letterDesign('initial-rattan', 'ป้ายอักษรลายหวาย', 'ตัวอักษรใหญ่ไส้ลายหวายสาน ขอบหนา ชื่อคาดกลาง', 'rattan', 'none'),
  letterDesign('initial-pattern', 'ป้ายอักษรลายดอก', 'ตัวอักษรใหญ่ไส้ลายดอกไม้ฉลุ ชื่อคาดกลาง', 'daisy', 'none'),
  letterDesign('initial-lattice', 'ป้ายอักษรตาข่าย', 'ตัวอักษรใหญ่ไส้ตาข่ายข้าวหลามตัด ชื่อคาดกลาง', 'lattice', 'none'),
  letterDesign('initial-hex', 'ป้ายอักษรวงกลมรังผึ้ง', 'วงกลมไส้รังผึ้ง ตัวอักษรตั้งกลาง ชื่อคาดล่าง', 'hex', 'none', true),
  letterDesign('initial-daisy', 'ตัวอักษรดอกเดซี่', 'ตัวอักษรใหญ่ประดับดอกเดซี่ ไส้ลายจุด ชื่อคาด', 'dots', 'daisies'),
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





]

