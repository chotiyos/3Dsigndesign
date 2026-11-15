import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, diff, intersect, offset, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  standingFoot, fitText, missingGlyphs, num, str, THICKNESS,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues,
} from './core'
import { patternWeb, PATTERNS, type PatternKind } from './patterns'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ'

/** A shape scaled so its height is `h`, centred on the origin. */
const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}

/** Text rounded a little so strokes print cleanly. */
const soft = (art: Region, h: number) => puffUp(art, Math.min(0.5, h * 0.04))

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

