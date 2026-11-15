import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, diff, offset, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  filled, fitText, missingGlyphs, num, str, textArt, THICKNESS,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues,
} from './core'
import { patternWeb, PATTERNS, type PatternKind } from './patterns'

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
  const outline = filled(m)
  return [
    { colour: fill, region: outline, z, h },
    { colour: line, region: diff(outline, m), z: z + h, h: 0.6 },
  ]
}

function plinth(region: Region, h: number): Region {
  const b = bounds(region)
  return roundRect((b.minX + b.maxX) / 2, b.minY - h / 2 + 0.6, Math.max(30, b.w * 0.62), h, Math.min(2, h / 2))
}

// ——— sports awards ———

type IconSpot = 'corner' | 'top' | 'side' | 'behind'

const AWARD_PARAMS: GiftParam[] = [
  { key: 'number', label: 'หมายเลข', kind: 'text', default: '23', maxChars: 2 },
  { key: 'name', label: 'ชื่อ', kind: 'text', default: 'ANDREW', maxChars: 16 },
  { key: 'size', label: 'ความสูงตัวเลข', kind: 'number', default: 110, min: 60, max: 200, step: 1, unit: 'มม.' },
  { key: 'rim', label: 'ขอบตัวเลข', kind: 'number', default: 3.2, min: 2, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'cell', label: 'ขนาดช่องลาย', kind: 'number', default: 8, min: 5, max: 16, step: 0.5, unit: 'มม.' },
  { key: 'pattern', label: 'ลายในตัวเลข', kind: 'choice', default: 'lattice', options: PATTERNS },
  ...THICKNESS,
]

const AWARD_COLOURS = [
  { key: 'back', label: 'แผ่นหลังตัวเลข', default: '#ffffff' },
  { key: 'pattern', label: 'ลายในตัวเลข', default: '#c4a5ff' },
  { key: 'frame', label: 'ขอบตัวเลข', default: '#9775fa' },
  { key: 'icon', label: 'ลูกบอลและอุปกรณ์', default: '#ff922b' },
  { key: 'plate', label: 'ป้ายชื่อ', default: '#343a40' },
  { key: 'name', label: 'ชื่อและเส้นลาย', default: '#ffd43b' },
]

function award(ctx: GiftContext, v: GiftValues, icon: string, spot: IconSpot) {
  const number = str(v, 'number').trim() || '1'
  const name = str(v, 'name').trim()
  if (missingGlyphs(ctx.font, number + name)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const top = t + 0.8
  const digits = sized(textArt(ctx.font, [number], 100), H)
  const inner = offset(digits, -num(v, 'rim'))
  const b = bounds(digits)
  const layers: GiftLayer[] = []
  // The icon: behind the number (goal posts), above it (hoop), or at a corner.
  const iconH = spot === 'behind' ? H * 1.15 : spot === 'top' ? H * 0.6 : H * 0.55
  const art = sized(charmArt(icon), iconH)
  const place = {
    corner: [b.minX + iconH * 0.15, b.maxY - iconH * 0.15],
    top: [(b.minX + b.maxX) / 2, b.maxY + iconH * 0.32],
    side: [b.maxX - iconH * 0.05, b.minY + iconH * 0.55],
    behind: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 + H * 0.12],
  }[spot]
  const iconArt = centreAt(art, place[0], place[1])
  if (spot === 'behind') layers.push({ colour: 'icon', region: iconArt, z: 0, h: t })
  layers.push({ colour: 'back', region: digits, z: 0, h: 1.2 })
  layers.push({ colour: 'pattern', region: patternWeb(str(v, 'pattern') as PatternKind, inner, num(v, 'cell')), z: 1.2, h: t - 1.2 })
  layers.push({ colour: 'frame', region: diff(digits, inner), z: 0, h: top })
  if (spot !== 'behind') layers.push(...motifLayers(iconArt, 'icon', 'name', 0, top + 0.4))
  // The name plate across the foot of the number.
  const fit = fitText(ctx.font, name, Math.max(b.w * 1.1, H * 0.9), H * 0.22, H * 0.2, false)
  if (fit.art.length) {
    const face = soft(centreAt(fit.art, (b.minX + b.maxX) / 2, b.minY + H * 0.02), fit.height)
    const fb = bounds(face)
    const plate = roundRect(fb.minX + fb.w / 2, fb.minY + fb.h / 2, Math.max(b.w * 1.05, fb.w + fit.height * 1.4), fb.h + fit.height * 0.9, (fb.h + fit.height * 0.9) / 2)
    layers.push({ colour: 'plate', region: plate, z: 0, h: top + 0.4 })
    layers.push({ colour: 'name', region: face, z: top + 0.4, h: r })
  }
  const all = union(...layers.map((l) => l.region))
  layers.unshift({ colour: 'plate', region: plinth(all, 7), z: 0, h: top + 0.4 })
  return { layers }
}

const awardDesign = (id: string, name: string, blurb: string, icon: string, spot: IconSpot): GiftDesign => ({
  id, name, blurb, group: 'award', params: AWARD_PARAMS, colours: AWARD_COLOURS,
  build: (ctx, v) => award(ctx, v, icon, spot),
})

// ——— birth stats ———

const BIRTH_PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อลูก', kind: 'text', default: 'Pearl', maxChars: 14 },
  { key: 'date', label: 'วันเกิด', kind: 'text', default: '13.02.2026', maxChars: 12 },
  { key: 'time', label: 'เวลาเกิด', kind: 'text', default: '10:05', maxChars: 8 },
  { key: 'weight', label: 'น้ำหนัก', kind: 'text', default: '3,250 g', maxChars: 10 },
  { key: 'length', label: 'ความยาว', kind: 'text', default: '49 cm', maxChars: 8 },
  { key: 'size', label: 'ความกว้างป้าย', kind: 'number', default: 150, min: 100, max: 260, step: 5, unit: 'มม.' },
  { key: 'margin', label: 'ขอบฐาน', kind: 'number', default: 4, min: 2, max: 10, step: 0.2, unit: 'มม.' },
  ...THICKNESS,
]

const BIRTH_COLOURS = [
  { key: 'base', label: 'ฐาน', default: '#ffffff' },
  { key: 'motif', label: 'ลายหลัก', default: '#74c0fc' },
  { key: 'line', label: 'เส้นลาย', default: '#1c3d5a' },
  { key: 'pill', label: 'ช่องข้อมูล', default: '#ffa8a8' },
  { key: 'text', label: 'ชื่อและข้อมูล', default: '#1c3d5a' },
]

function birthSign(ctx: GiftContext, v: GiftValues, motif: string) {
  const name = str(v, 'name')
  const stats = ['date', 'time', 'weight', 'length'].map((k) => str(v, k).trim()).filter(Boolean)
  if (missingGlyphs(ctx.font, name + stats.join(''))) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  const pieces: Region[] = []
  // Motif on top, name under it, then the facts in two rows of rounded pills.
  const m = centreAt(sized(charmArt(motif), W * 0.46), 0, W * 0.3)
  pieces.push(m)
  layers.push(...motifLayers(m, 'motif', 'line', t, r))
  const nameFit = fitText(ctx.font, name, W * 0.92, W * 0.2, W * 0.17, false)
  let y = bounds(m).minY - W * 0.03
  if (nameFit.art.length) {
    const face = soft(centreAt(nameFit.art, 0, y - bounds(nameFit.art).h / 2), nameFit.height)
    pieces.push(face)
    layers.push({ colour: 'text', region: face, z: t, h: r })
    y = bounds(face).minY - W * 0.04
  }
  const pillW = (W * 0.92 - 6) / 2
  const pillH = W * 0.11
  stats.forEach((s, i) => {
    const cx = (i % 2 ? 1 : -1) * (pillW / 2 + 3)
    const cy = y - pillH / 2 - Math.floor(i / 2) * (pillH + 5)
    const pill = roundRect(cx, cy, pillW, pillH, pillH / 2)
    const fit = fitText(ctx.font, s, pillW - pillH * 0.8, pillH * 0.62, pillH * 0.62, false)
    pieces.push(pill)
    layers.push({ colour: 'pill', region: pill, z: t, h: 0.6 })
    if (fit.art.length) layers.push({ colour: 'text', region: soft(centreAt(fit.art, cx, cy), fit.height), z: t + 0.6, h: r })
  })
  let base = silhouette(union(...pieces), num(v, 'margin'))
  base = union(base, plinth(base, 7))
  layers.unshift({ colour: 'base', region: base, z: 0, h: t })
  return { layers }
}

const birthDesign = (id: string, name: string, blurb: string, motif: string): GiftDesign => ({
  id, name, blurb, group: 'birth', params: BIRTH_PARAMS, colours: BIRTH_COLOURS,
  build: (ctx, v) => birthSign(ctx, v, motif),
})

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
  awardDesign('award-basketball', 'ถ้วยเลขใหญ่ บาสเกตบอล', 'เลขเสื้อตัวใหญ่ไส้ลายตาข่าย ลูกบาสที่มุม ป้ายชื่อด้านล่าง', 'basketball', 'corner'),
  awardDesign('award-hoop', 'ป้ายเลขลอดห่วงบาส', 'แป้นบาสอยู่เหนือตัวเลข เหมือนลูกลอดห่วง ป้ายชื่อด้านล่าง', 'hoop', 'top'),
  awardDesign('award-soccer', 'ถ้วยเลขใหญ่ ฟุตบอล', 'เลขเสื้อไส้ลาย ลูกฟุตบอลที่มุม ป้ายชื่อด้านล่าง', 'soccer', 'corner'),
  awardDesign('award-soccer-side', 'ป้ายเลขฟุตบอลลูกข้าง', 'เลขเสื้อตัวใหญ่ ลูกฟุตบอลชิดด้านขวา', 'soccer', 'side'),
  awardDesign('award-usfootball', 'ถ้วยเลขใหญ่ อเมริกันฟุตบอล', 'เลขเสื้อไส้ลาย ลูกอเมริกันฟุตบอลที่มุม', 'usfootball', 'corner'),
  awardDesign('award-goalpost', 'ป้ายเลขเสาประตูอเมริกันฟุตบอล', 'เสาประตูรูปตัว Y อยู่หลังตัวเลข ป้ายชื่อด้านล่าง', 'goalpost', 'behind'),
  birthDesign('birth-rocket', 'ป้ายวันเกิดลายจรวด', 'จรวดด้านบน ชื่อลูก วันเวลาเกิด น้ำหนัก ความยาว', 'rocket'),
  birthDesign('birth-strawberry', 'ป้ายวันเกิดลายสตรอว์เบอร์รี่', 'สตรอว์เบอร์รี่ด้านบน ชื่อลูกและข้อมูลวันเกิด', 'strawberry'),
  birthDesign('birth-bunny', 'ป้ายวันเกิดลายกระต่าย', 'กระต่ายด้านบน ชื่อลูกและข้อมูลวันเกิด', 'bunny'),
  topperDesign('topper-butterfly', 'ป้ายปักเค้กผีเสื้อ', 'ผีเสื้อ ข้อความอวยพร และชื่อ มีขาปักสองขา', 'butterfly'),
  topperDesign('topper-unicorn', 'ป้ายปักเค้กยูนิคอร์น', 'ยูนิคอร์น ข้อความอวยพร และชื่อ', 'unicorn'),
  topperDesign('topper-racecar', 'ป้ายปักเค้กรถแข่ง', 'รถแข่ง ข้อความอวยพร และชื่อ', 'racecar'),
]
