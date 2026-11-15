import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, intersect, rect, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import { filled, fitText, fontOf, missingGlyphs, num, str, type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues } from './core'
import { patternWeb } from './patterns'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์ (ฟอนต์อังกฤษใช้กับภาษาไทยไม่ได้)'

const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}
const centreAt = (region: Region, x: number, y: number): Region => {
  const b = bounds(region)
  return translate(region, x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2)
}

/**
 * Cake toppers: a motif, the age and the name, all puffy on one outline,
 * with two pointed stakes underneath.
 */
type Theme = 'garden' | 'butterflies' | 'unicorn' | 'racecar'

function text(ctx: GiftContext, v: GiftValues, key: string, w: number, h: number) {
  const fit = fitText(fontOf(ctx, v, key), str(v, key), w, h * 1.5, h, false)
  return fit.art.length ? puffUp(fit.art, Math.min(0.6, fit.height * 0.04)) : []
}

/** A charm as filled shape plus its drawn details. */
function charm(id: string, h: number, x: number, y: number) {
  const art = centreAt(sized(charmArt(id), h), x, y)
  const fill = filled(art)
  return { fill, marks: diff(fill, art) }
}

function topper(ctx: GiftContext, v: GiftValues, theme: Theme) {
  if (missingGlyphs(fontOf(ctx, v, 'name'), str(v, 'name')) || missingGlyphs(fontOf(ctx, v, 'number'), str(v, 'number'))) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  const parts: Region[] = []
  const name = text(ctx, v, 'name', W * 0.95, W * 0.24)
  const number = text(ctx, v, 'number', W * 0.4, W * 0.3)
  const motifs: { fill: Region; marks: Region }[] = []
  let nameY = 0
  if (theme === 'garden') {
    // The age on top, a lace dome of daisies and butterflies, the name below.
    const R = W * 0.42
    const dome = intersect(circle(0, 0, R, 128), rect(0, R / 2, R * 2.2, R))
    const lace = patternWeb('daisy', dome, W * 0.08, 1.6)
    layers.push({ colour: 'motif', region: lace, z: t, h: r * 0.6 })
    parts.push(dome)
    for (const [x, y, s] of [[-R * 0.45, R * 0.42, W * 0.17], [R * 0.45, R * 0.42, W * 0.17], [0, R * 0.62, W * 0.2]] as const) motifs.push(charm('butterfly', s, x, y))
    if (number.length) {
      const n = centreAt(number, 0, R + W * 0.16)
      layers.push({ colour: 'number', region: n, z: t, h: r })
      parts.push(n)
    }
    nameY = -W * 0.13
  } else {
    // Motif on the left, the age on the right, the name across the bottom.
    const mh = W * (theme === 'racecar' ? 0.32 : 0.48)
    const id = theme === 'butterflies' ? 'butterfly' : theme
    const mx = theme === 'racecar' ? -W * 0.18 : -W * 0.2
    motifs.push(charm(id, mh, mx, mh / 2))
    if (theme === 'butterflies') motifs.push(charm('butterfly', mh * 0.6, mx - W * 0.22, mh * 0.85), charm('leaf', mh * 0.5, mx + W * 0.2, mh * 0.75))
    if (number.length) {
      const n = centreAt(number, W * 0.3, mh * 0.55)
      layers.push({ colour: 'number', region: n, z: t, h: r })
      parts.push(n)
    }
    nameY = -W * 0.1
  }
  // On the white lace the butterflies swap colours: purple bodies, white details.
  const [fillColour, markColour] = theme === 'garden' ? ['mark', 'motif'] : ['motif', 'mark']
  for (const m of motifs) {
    layers.push({ colour: fillColour, region: m.fill, z: t, h: r })
    layers.push({ colour: markColour, region: m.marks, z: t + r, h: 0.6 })
    parts.push(m.fill)
  }
  if (name.length) {
    const n = centreAt(name, 0, nameY)
    layers.push({ colour: 'name', region: n, z: t, h: r })
    parts.push(n)
  }
  // One outline round everything, then two pointed stakes joined by a bar.
  let body = silhouette(union(...parts), num(v, 'margin'))
  const b = bounds(body)
  const L = num(v, 'stake')
  const sw = 6
  const stakes: Region[] = [roundRect((b.minX + b.maxX) / 2, b.minY + 2, b.w * 0.45, 8, 3)]
  for (const x of [-b.w * 0.17, b.w * 0.17]) {
    const cx = (b.minX + b.maxX) / 2 + x
    stakes.push([[[cx - sw / 2, b.minY + 4], [cx - sw / 2, b.minY - L + sw], [cx, b.minY - L], [cx + sw / 2, b.minY - L + sw], [cx + sw / 2, b.minY + 4]]])
  }
  body = filled(union(body, ...stakes))
  layers.unshift({ colour: 'outline', region: body, z: 0, h: t })
  return { layers }
}

const PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อ', kind: 'text', default: 'EMMA', maxChars: 12, font: 'coiny' },
  { key: 'number', label: 'อายุ', kind: 'text', default: '5', maxChars: 2, font: 'coiny' },
  { key: 'size', label: 'ความกว้าง', kind: 'number', default: 140, min: 80, max: 240, step: 5, unit: 'มม.' },
  { key: 'stake', label: 'ความยาวขาปัก', kind: 'number', default: 60, min: 30, max: 110, step: 1, unit: 'มม.' },
  { key: 'margin', label: 'ขอบรอบ', kind: 'number', default: 3.4, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'base', label: 'ความหนาขอบ', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ลายและตัวอักษรนูน', kind: 'number', default: 1.6, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
]

const LOOKS: { id: string; name: string; blurb: string; theme: Theme; person: string; age: string; colours: [string, string, string, string, string] }[] = [
  { id: 'topper-garden', name: 'ป้ายปักเค้กสวนผีเสื้อ', blurb: 'อายุด้านบน โดมลายลูกไม้กับผีเสื้อ ชื่อตัวอ้วนด้านล่าง ขาปักสองขา', theme: 'garden', person: 'EMMA', age: '5', colours: ['#c4b5fd', '#ffffff', '#facc15', '#facc15', '#7c3aed'] },
  { id: 'topper-butterfly', name: 'ป้ายปักเค้กผีเสื้อ', blurb: 'ผีเสื้อสามตัวกับใบไม้ อายุด้านขวา ชื่อด้านล่าง', theme: 'butterflies', person: 'THOMAS', age: '5', colours: ['#1e3a8a', '#60a5fa', '#fb923c', '#fb923c', '#1e3a8a'] },
  { id: 'topper-unicorn', name: 'ป้ายปักเค้กยูนิคอร์น', blurb: 'ยูนิคอร์นด้านซ้าย อายุสีเหลือง ชื่อสีม่วงด้านล่าง', theme: 'unicorn', person: 'GRACE', age: '6', colours: ['#f9a8d4', '#ffffff', '#facc15', '#a78bfa', '#a855f7'] },
  { id: 'topper-racecar', name: 'ป้ายปักเค้กรถแข่ง', blurb: 'รถแข่งด้านซ้าย อายุสีฟ้า ชื่อสีเหลืองด้านล่าง', theme: 'racecar', person: 'OLIVER', age: '3', colours: ['#c4b5fd', '#5eead4', '#60a5fa', '#facc15', '#1f2937'] },
]

export const TOPPERS: GiftDesign[] = LOOKS.map((look) => ({
  id: look.id, name: look.name, blurb: look.blurb, group: 'topper',
  params: PARAMS.map((p) => (p.key === 'name' ? { ...p, default: look.person } : p.key === 'number' ? { ...p, default: look.age } : p)),
  colours: [
    { key: 'outline', label: 'ขอบและขาปัก', default: look.colours[0] },
    { key: 'motif', label: 'ลายหลัก', default: look.colours[1] },
    { key: 'number', label: 'อายุ', default: look.colours[2] },
    { key: 'name', label: 'ชื่อ', default: look.colours[3] },
    { key: 'mark', label: 'เส้นลาย', default: look.colours[4] },
  ],
  howTo: ['ป้ายปักเค้ก: ใช้ PLA หรือ PETG ล้างและเช็ดก่อนใช้ ถ้าจะสัมผัสอาหารนาน ห่อขาปักด้วยฟิล์มหรือใช้วัสดุที่รับรองสัมผัสอาหาร'],
  build: (ctx, v) => topper(ctx, v, look.theme),
}))
