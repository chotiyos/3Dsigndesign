import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, diff, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  filled, fitText, missingGlyphs, num, str,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues,
} from './core'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ'

const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}
const centreAt = (region: Region, x: number, y: number): Region => {
  const b = bounds(region)
  return translate(region, x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2)
}
const soft = (art: Region, h: number) => puffUp(art, Math.min(0.5, h * 0.04))

/**
 * A motif as two colours: its filled outline, and its drawn details (the
 * cut-outs of the charm) raised a little higher in a darker colour.
 */
function motifLayers(m: Region, fill: string, line: string, z: number, h: number): GiftLayer[] {
  const outline = silhouette(m, 0)
  return [
    { colour: fill, region: outline, z, h },
    { colour: line, region: diff(outline, m), z: z + h, h: 0.6 },
  ]
}


// ——— cake toppers ———

const TOPPER_PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Ploy', maxChars: 14 },
  { key: 'line2', label: 'ข้อความเล็ก', kind: 'text', default: 'Happy Birthday', maxChars: 24 },
  { key: 'size', label: 'ความกว้าง', kind: 'number', default: 130, min: 80, max: 220, step: 5, unit: 'มม.' },
  { key: 'stake', label: 'ความยาวขาปัก', kind: 'number', default: 55, min: 30, max: 100, step: 1, unit: 'มม.' },
  { key: 'margin', label: 'ขอบฐาน', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'base', label: 'ความหนาฐาน', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ตัวอักษรและลายนูน', kind: 'number', default: 1, min: 0.4, max: 3, step: 0.2, unit: 'มม.' },
]

const TOPPER_COLOURS = [
  { key: 'base', label: 'ตัวป้ายและขาปัก', default: '#e6b422' },
  { key: 'motif', label: 'ลายหลัก', default: '#ffffff' },
  { key: 'line', label: 'เส้นลาย', default: '#7a5c00' },
  { key: 'text', label: 'ตัวอักษร', default: '#ffffff' },
]

function topper(ctx: GiftContext, v: GiftValues, motif: string) {
  const name = str(v, 'name')
  const small = str(v, 'line2')
  if (missingGlyphs(ctx.font, name + small)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  const pieces: Region[] = []
  const m = centreAt(sized(charmArt(motif), W * 0.32), 0, W * 0.2)
  pieces.push(m)
  layers.push(...motifLayers(m, 'motif', 'line', t, r))
  let y = bounds(m).minY - W * 0.02
  const smallFit = fitText(ctx.font, small, W * 0.8, W * 0.1, W * 0.08, false)
  if (smallFit.art.length) {
    const face = soft(centreAt(smallFit.art, 0, y - bounds(smallFit.art).h / 2), smallFit.height)
    pieces.push(face)
    layers.push({ colour: 'text', region: face, z: t, h: r })
    y = bounds(face).minY - W * 0.02
  }
  const nameFit = fitText(ctx.font, name, W, W * 0.3, W * 0.26, false)
  if (nameFit.art.length) {
    const face = soft(centreAt(nameFit.art, 0, y - bounds(nameFit.art).h / 2), nameFit.height)
    pieces.push(face)
    layers.push({ colour: 'text', region: face, z: t, h: r })
  }
  let body = silhouette(union(...pieces), num(v, 'margin'))
  // Two pointed stakes under the lettering, joined by a bar for strength.
  const b = bounds(body)
  const L = num(v, 'stake')
  const sw = 6
  const stakes: Region[] = [roundRect((b.minX + b.maxX) / 2, b.minY + 2, b.w * 0.5, 8, 3)]
  for (const x of [-b.w * 0.18, b.w * 0.18]) {
    const cx = (b.minX + b.maxX) / 2 + x
    stakes.push([[[cx - sw / 2, b.minY + 4], [cx - sw / 2, b.minY - L + sw], [cx, b.minY - L], [cx + sw / 2, b.minY - L + sw], [cx + sw / 2, b.minY + 4]]])
  }
  // Filled: the bar and stakes can close a small gap into a hole.
  body = filled(union(body, ...stakes))
  layers.unshift({ colour: 'base', region: body, z: 0, h: t })
  return { layers }
}

const topperDesign = (id: string, name: string, blurb: string, motif: string): GiftDesign => ({
  id, name, blurb, group: 'topper', params: TOPPER_PARAMS, colours: TOPPER_COLOURS,
  howTo: ['ป้ายปักเค้ก: ใช้พลาสติก PLA หรือ PETG ล้างและเช็ดก่อนใช้ ถ้าจะสัมผัสอาหารนาน ห่อขาปักด้วยฟิล์มหรือใช้วัสดุที่รับรองสัมผัสอาหาร'],
  build: (ctx, v) => topper(ctx, v, motif),
})

export const ROUND2: GiftDesign[] = [
  topperDesign('topper-butterfly', 'ป้ายปักเค้กผีเสื้อ', 'ผีเสื้อ ข้อความอวยพร และชื่อ มีขาปักสองขา', 'butterfly'),
  topperDesign('topper-unicorn', 'ป้ายปักเค้กยูนิคอร์น', 'ยูนิคอร์น ข้อความอวยพร และชื่อ', 'unicorn'),
  topperDesign('topper-racecar', 'ป้ายปักเค้กรถแข่ง', 'รถแข่ง ข้อความอวยพร และชื่อ', 'racecar'),
]
