import { puffUp } from '../bubbleKeychain'
import { bounds, circle, diff, offset, roundRect, scale, stroke, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  connectedLetter, fitText, fontOf, missingGlyphs, num, standingFoot, str, textArt,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues,
} from './core'
import { athlete, flamingBall, footballRing, type PoseId } from './athletes'
import { patternWeb, PATTERNS, type PatternKind } from './patterns'

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
 * Sports awards: a big shirt number (one digit solid, one patterned), an
 * athlete in action, and the name on a two-tier plate across the foot.
 */
type Kind = 'basketball' | 'hoop' | 'ring' | 'soccer' | 'usfootball' | 'goalpost'

interface Spec {
  id: string
  name: string
  blurb: string
  kind: Kind
  pose: PoseId
  number: string
  person: string
  pattern: PatternKind
  colours: Record<'solid' | 'frame' | 'pattern' | 'athlete' | 'plateBase' | 'plate' | 'name' | 'accent' | 'accent2', string>
}

/** The digits side by side, the second overlapping the first a little. */
function digits(ctx: GiftContext, v: GiftValues, H: number) {
  // Whole characters (a Thai consonant with its marks is one), not code points.
  const chars = [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(str(v, 'number').trim() || '1')].map((g) => g.segment).slice(0, 2)
  const font = fontOf(ctx, v, 'number')
  const out: Region[] = []
  let x = 0
  for (const ch of chars) {
    const art = textArt(font, [ch], 100)
    if (!art.length) continue
    const d = connectedLetter(sized(art, H))
    const b = bounds(d)
    out.push(translate(d, x - b.minX, 0))
    x += b.w * 0.86
  }
  const all = union(...out)
  if (!all.length) return { list: out, all }
  const b = bounds(all)
  const dx = -(b.minX + b.maxX) / 2
  return { list: out.map((d) => translate(d, dx, 0)), all: translate(all, dx, 0) }
}

function namePlate(ctx: GiftContext, v: GiftValues, width: number, cx: number, cy: number) {
  const fit = fitText(fontOf(ctx, v, 'name'), str(v, 'name'), width * 0.86, num(v, 'nameH') * 1.4, num(v, 'nameH'), false)
  const h = num(v, 'nameH') * 1.55 + 6
  const w = Math.max(width, (fit.art.length ? bounds(fit.art).w : 0) + h)
  const base = roundRect(cx, cy, w, h, h / 2)
  const plate = offset(base, -3)
  const face = fit.art.length ? centreAt(puffUp(fit.art, 0.4), cx, cy) : []
  return { base, plate, face }
}

function award(ctx: GiftContext, v: GiftValues, spec: Spec) {
  if (missingGlyphs(fontOf(ctx, v, 'number'), str(v, 'number')) || missingGlyphs(fontOf(ctx, v, 'name'), str(v, 'name'))) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const cell = num(v, 'cell')
  const pattern = str(v, 'pattern') as PatternKind
  const layers: GiftLayer[] = []
  const nh = spec.kind === 'hoop' ? H * 0.45 : spec.kind === 'ring' ? H * 0.5 : H
  const { list, all } = digits(ctx, v, nh)
  let numbers = list
  let centreY = 0
  let extra: Region = []
  if (spec.kind === 'hoop') {
    // A patterned backboard; the number sits in its top half, the hoop and net under it.
    const board = roundRect(0, H * 0.18, H * 1.05, H * 0.95, 6)
    const boardIn = offset(board, -4)
    layers.push({ colour: 'frame', region: diff(board, boardIn), z: 0, h: t })
    layers.push({ colour: 'pattern', region: patternWeb('lattice', boardIn, cell), z: 0, h: t - 2 })
    numbers = list.map((d) => translate(d, 0, H * 0.3))
    const rim = roundRect(0, H * 0.02, H * 0.55, H * 0.06, H * 0.03)
    const net: Region = [[[-H * 0.25, H * 0.02], [H * 0.25, H * 0.02], [H * 0.17, -H * 0.3], [-H * 0.17, -H * 0.3]]]
    layers.push({ colour: 'plate', region: patternWeb('lattice', net, cell * 0.8, 1.4), z: 0, h: t + 0.8 })
    layers.push({ colour: 'accent', region: rim, z: 0, h: t + 1.6 })
    centreY = H * 0.3
    extra = union(board, net)
  }
  if (spec.kind === 'ring') {
    // A football ring round the number.
    const R = H * 0.55
    const fr = footballRing(R, H * 0.13)
    layers.push({ colour: 'accent2', region: circle(0, 0, R - H * 0.13, 96), z: 0, h: t - 2 })
    layers.push({ colour: 'accent', region: fr.ring, z: 0, h: t })
    layers.push({ colour: 'pattern', region: fr.patches, z: 0, h: t })
    extra = circle(0, 0, R, 96)
  }
  if (spec.kind === 'goalpost') {
    // Yellow posts behind the number: a stem, a crossbar and two uprights.
    const post = union(
      stroke([[0, -H * 0.75], [0, -H * 0.25]], H * 0.09),
      stroke([[-H * 0.62, -H * 0.25], [H * 0.62, -H * 0.25]], H * 0.09),
      stroke([[-H * 0.62, -H * 0.25], [-H * 0.62, H * 0.6]], H * 0.08),
      stroke([[H * 0.62, -H * 0.25], [H * 0.62, H * 0.6]], H * 0.08),
    )
    layers.push({ colour: 'accent2', region: post, z: 0, h: t - 1 })
    extra = post
  }
  // Numbers: the first solid, the second a frame round a pattern (one digit: patterned).
  numbers.forEach((d, i) => {
    const patterned = numbers.length === 1 || i === numbers.length - 1
    const z = i * 0.6
    if (patterned) {
      const inner = offset(d, -num(v, 'rim'))
      layers.push({ colour: 'pattern', region: patternWeb(pattern, inner, cell), z, h: t - 1.6 })
      layers.push({ colour: 'frame', region: diff(d, inner), z, h: t })
      layers.push({ colour: 'plateBase', region: inner, z, h: 1.2 })
    } else {
      layers.push({ colour: 'solid', region: d, z, h: t })
    }
  })
  const nb = bounds(union(...numbers, extra))
  // The athlete, and for American football a flaming ball.
  const pose = athlete(spec.pose, H * 0.72, spec.kind === 'usfootball' || spec.kind === 'goalpost')
  const at: Record<Kind, [number, number]> = {
    basketball: [nb.maxX - H * 0.2, nb.maxY + H * 0.05],
    hoop: [nb.maxX - H * 0.05, nb.maxY - H * 0.25],
    ring: [nb.maxX - H * 0.12, nb.maxY - H * 0.05],
    soccer: [(nb.minX + nb.maxX) / 2, nb.maxY + H * 0.22],
    usfootball: [nb.minX + H * 0.05, nb.maxY + H * 0.12],
    goalpost: [nb.minX + H * 0.1, nb.maxY + H * 0.05],
  }
  const man = centreAt(pose, at[spec.kind][0], at[spec.kind][1])
  layers.push({ colour: 'athlete', region: man, z: 0, h: t + 1.2 })
  if (spec.kind === 'usfootball' || spec.kind === 'goalpost') {
    const fb = flamingBall(H * 0.62)
    const mb = bounds(man)
    const shift = (r: Region) => translate(r, mb.maxX + H * 0.05, mb.maxY - H * 0.12)
    layers.push({ colour: 'accent', region: shift(fb.flame), z: 0, h: t + 1.2 })
    layers.push({ colour: 'accent2', region: shift(fb.core), z: 0, h: t + 1.6 })
    layers.push({ colour: 'athlete', region: shift(fb.ball), z: 0, h: t + 1.6 })
    layers.push({ colour: 'name', region: shift(fb.laces), z: 0, h: t + 1.6 })
  }
  // The name plate across the foot (the goal post's runs through the middle).
  const width = Math.max(bounds(all).w * 1.15, H * 0.95)
  const py = spec.kind === 'goalpost' ? centreY - H * 0.12 : nb.minY + H * 0.02
  const p = namePlate(ctx, v, spec.kind === 'goalpost' ? H * 1.6 : width, 0, py)
  layers.push({ colour: 'plateBase', region: p.base, z: 0, h: t + 1.2 })
  layers.push({ colour: 'plate', region: p.plate, z: t + 1.2, h: 1 })
  layers.push({ colour: 'name', region: p.face, z: t + 2.2, h: r })
  if (v.stand) layers.unshift(standingFoot(union(...layers.map((l) => l.region)), 'plateBase', t))
  // Everything is held together by a thin back plate under the whole outline.
  layers.unshift({ colour: 'plateBase', region: silhouette(union(...layers.map((l) => l.region)), 0.01), z: 0, h: 1.2 })
  return { layers }
}

const params = (spec: Spec): GiftParam[] => [
  { key: 'number', label: 'หมายเลข', kind: 'text', default: spec.number, maxChars: 2, font: 'lilita' },
  { key: 'name', label: 'ชื่อ', kind: 'text', default: spec.person, maxChars: 16, font: 'lilita' },
  { key: 'size', label: 'ความสูงตัวเลข', kind: 'number', default: 120, min: 60, max: 220, step: 1, unit: 'มม.' },
  { key: 'nameH', label: 'ความสูงชื่อ', kind: 'number', default: 18, min: 8, max: 40, step: 0.5, unit: 'มม.' },
  { key: 'rim', label: 'ขอบตัวเลขที่มีลาย', kind: 'number', default: 4, min: 2.4, max: 10, step: 0.2, unit: 'มม.' },
  { key: 'cell', label: 'ขนาดช่องลาย', kind: 'number', default: 7, min: 4, max: 16, step: 0.5, unit: 'มม.' },
  { key: 'pattern', label: 'ลายในตัวเลข', kind: 'choice', default: spec.pattern, options: PATTERNS },
  { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: true },
  { key: 'base', label: 'ความหนาตัวเลข', kind: 'number', default: 10, min: 4, max: 24, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ชื่อนูน', kind: 'number', default: 1.6, min: 0.4, max: 5, step: 0.2, unit: 'มม.' },
]

const SPECS: Spec[] = [
  { id: 'award-basketball', name: 'ถ้วยเลขใหญ่ บาสเกตบอล', blurb: 'เลขเสื้อสองหลัก หลักหลังไส้ตาข่าย นักบาสกำลังดังก์ ป้ายชื่อสองชั้น', kind: 'basketball', pose: 'dunk', number: '34', person: 'ANDREW', pattern: 'lattice',
    colours: { solid: '#c084fc', frame: '#a78bfa', pattern: '#ddd6fe', athlete: '#1f2937', plateBase: '#fb923c', plate: '#1f2937', name: '#ffffff', accent: '#f97316', accent2: '#fde68a' } },
  { id: 'award-hoop', name: 'ป้ายเลขลอดห่วงบาส', blurb: 'แป้นลายตาข่าย ตัวเลขเหนือห่วงและตาข่าย นักบาสกระโดดข้างแป้น', kind: 'hoop', pose: 'dunk', number: '3', person: 'ANDREW', pattern: 'lattice',
    colours: { solid: '#fb923c', frame: '#fb923c', pattern: '#fdba74', athlete: '#1f2937', plateBase: '#fb923c', plate: '#1f2937', name: '#ffffff', accent: '#f97316', accent2: '#fde68a' } },
  { id: 'award-soccer', name: 'ป้ายเลขในลูกฟุตบอล', blurb: 'ตัวเลขในวงลูกฟุตบอล นักเตะกำลังยิงประตู ป้ายชื่อด้านล่าง', kind: 'ring', pose: 'kick', number: '7', person: 'Archie', pattern: 'hex',
    colours: { solid: '#facc15', frame: '#facc15', pattern: '#3b82f6', athlete: '#ffffff', plateBase: '#93c5fd', plate: '#ffffff', name: '#1f2937', accent: '#facc15', accent2: '#ffffff' } },
  { id: 'award-soccer-side', name: 'ถ้วยเลขใหญ่ ฟุตบอล', blurb: 'เลขเสื้อสองหลักลายตาราง นักเตะยืนบนตัวเลข ป้ายชื่อสีเขียว', kind: 'soccer', pose: 'kick', number: '17', person: 'ROBERTO', pattern: 'lattice',
    colours: { solid: '#3b82f6', frame: '#3b82f6', pattern: '#bfdbfe', athlete: '#facc15', plateBase: '#16a34a', plate: '#facc15', name: '#14532d', accent: '#16a34a', accent2: '#ffffff' } },
  { id: 'award-usfootball', name: 'ถ้วยเลขใหญ่ อเมริกันฟุตบอล', blurb: 'เลขสองหลักสีส้ม นักเตะกับลูกบอลไฟลุก ป้ายชื่อสองชั้น', kind: 'usfootball', pose: 'punt', number: '26', person: 'GRAYSON', pattern: 'lattice',
    colours: { solid: '#fb923c', frame: '#f97316', pattern: '#fed7aa', athlete: '#1f2937', plateBase: '#60a5fa', plate: '#1f2937', name: '#ffffff', accent: '#ef4444', accent2: '#facc15' } },
  { id: 'award-goalpost', name: 'ป้ายเลขเสาประตูอเมริกันฟุตบอล', blurb: 'เสาประตูสีเหลือง ตัวเลขลายทาง ชื่อคาดกลาง นักเตะกับลูกไฟลุก', kind: 'goalpost', pose: 'punt', number: '5', person: 'TYLER SMITH', pattern: 'stripes',
    colours: { solid: '#ef4444', frame: '#ef4444', pattern: '#1f2937', athlete: '#1f2937', plateBase: '#ef4444', plate: '#1f2937', name: '#ffffff', accent: '#ef4444', accent2: '#facc15' } },
]

export const AWARDS: GiftDesign[] = SPECS.map((spec) => ({
  id: spec.id, name: spec.name, blurb: spec.blurb, group: 'award',
  params: params(spec),
  colours: [
    { key: 'solid', label: 'ตัวเลขทึบ', default: spec.colours.solid },
    { key: 'frame', label: 'ขอบตัวเลขลาย', default: spec.colours.frame },
    { key: 'pattern', label: 'ลายในตัวเลข', default: spec.colours.pattern },
    { key: 'athlete', label: 'นักกีฬา', default: spec.colours.athlete },
    { key: 'plateBase', label: 'ฐานป้ายชื่อและแผ่นหลัง', default: spec.colours.plateBase },
    { key: 'plate', label: 'ป้ายชื่อ', default: spec.colours.plate },
    { key: 'name', label: 'ชื่อ', default: spec.colours.name },
    { key: 'accent', label: 'สีเสริม 1', default: spec.colours.accent },
    { key: 'accent2', label: 'สีเสริม 2', default: spec.colours.accent2 },
  ],
  howTo: ['วางด้านหลังติดแผ่นพิมพ์ แผ่นหลังบาง 1.2 มม. ยึดทุกชิ้นเข้าด้วยกัน'],
  build: (ctx, v) => award(ctx, v, spec),
}))
