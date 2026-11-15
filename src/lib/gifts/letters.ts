import { initialOf, puffUp } from '../bubbleKeychain'
import { bounds, circle, diff, offset, rotate, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  connectedLetter, fitText, fontOf, missingGlyphs, num, standingFoot, str, textArt,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues,
} from './core'
import { face as kawaiiFace } from './kawaii'
import { leafBranch, patternWeb, PATTERNS, type PatternKind } from './patterns'

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
 * Big initial signs: a deep letter frame with a recessed patterned panel, and
 * the name in script across it on its own backing, raised highest.
 */
type Look = 'greenery' | 'rattan' | 'patterned' | 'lattice' | 'circle'

interface Spec {
  id: string
  name: string
  blurb: string
  look: Look
  pattern: PatternKind
  person: string
  nameFont: string
  colours: { frame: string; panel: string; pattern: string; deco: string; plate: string; name: string }
}

function letterOf(ctx: GiftContext, v: GiftValues, h: number): Region {
  const ch = str(v, 'letter').trim() || initialOf(str(v, 'name')).toUpperCase() || 'A'
  const art = textArt(fontOf(ctx, v, 'letter'), [ch], 100)
  return art.length ? connectedLetter(sized(art, h)) : []
}

function build(ctx: GiftContext, v: GiftValues, spec: Spec) {
  const name = str(v, 'name').trim()
  const ch = str(v, 'letter').trim() || initialOf(name).toUpperCase() || 'A'
  if (missingGlyphs(fontOf(ctx, v, 'letter'), ch) || missingGlyphs(fontOf(ctx, v, 'name'), name)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const rim = num(v, 'rim')
  const recess = Math.min(3, t * 0.3)
  const cell = num(v, 'cell')
  const layers: GiftLayer[] = []
  let body: Region
  if (spec.look === 'circle') {
    // A patterned disc in a ring, the letter standing solid in the middle.
    body = circle(0, 0, H / 2, 128)
    const inner = offset(body, -rim)
    const letter = letterOf(ctx, v, H * 0.6)
    layers.push({ colour: 'panel', region: body, z: 0, h: 1.6 })
    layers.push({ colour: 'pattern', region: patternWeb(spec.pattern, inner, cell), z: 1.6, h: t - recess - 1.6 })
    layers.push({ colour: 'frame', region: diff(body, inner), z: 0, h: t })
    layers.push({ colour: 'deco', region: diff(offset(letter, 2.2), letter), z: 0, h: t + 0.4 })
    layers.push({ colour: 'frame', region: letter, z: 0, h: t + 0.4 })
  } else {
    body = letterOf(ctx, v, H)
    const inner = offset(body, -rim)
    layers.push({ colour: 'panel', region: body, z: 0, h: 1.6 })
    if (spec.look === 'rattan') {
      // A wide woven border round slats.
      const band = offset(body, -rim * 2.6)
      layers.push({ colour: 'pattern', region: patternWeb('slats', band, cell * 0.8), z: 1.6, h: t - recess - 1.6 })
      layers.push({ colour: 'frame', region: patternWeb('rattan', diff(body, band), Math.max(4, rim * 1.1), 1), z: 0, h: t })
    } else {
      layers.push({ colour: 'pattern', region: patternWeb(spec.pattern, inner, cell), z: 1.6, h: t - recess - 1.6 })
      layers.push({ colour: 'frame', region: diff(body, inner), z: 0, h: t })
    }
  }
  const b = bounds(body)
  if (spec.look === 'greenery') {
    const size = H * 0.2
    layers.push({ colour: 'deco', region: leafBranch([b.minX - size * 0.5, b.maxY - H * 0.05], [b.minX + b.w * 0.8, b.maxY - H * 0.32], size, 8), z: 0, h: t + 0.6 })
    layers.push({ colour: 'deco', region: leafBranch([b.maxX + size * 0.4, b.minY + H * 0.38], [b.minX + b.w * 0.42, b.minY + H * 0.08], size * 0.9, 7), z: 0, h: t + 0.6 })
  }
  // The name: script across the middle (tilted for the patterned look) on a backing.
  const fit = fitText(fontOf(ctx, v, 'name'), name, Math.max(b.w * 1.15, H * 0.95), H * 0.4, H * 0.3)
  if (fit.art.length) {
    let art = puffUp(fit.art, Math.min(0.5, fit.height * 0.03))
    const angle = num(v, 'angle')
    if (angle) art = rotate(art, (angle * Math.PI) / 180)
    const y = spec.look === 'circle' ? b.minY + H * 0.12 : (b.minY + b.maxY) / 2 - H * 0.06
    const face = centreAt(art, (b.minX + b.maxX) / 2, y)
    layers.push({ colour: 'plate', region: silhouette(face, num(v, 'outline')), z: 0, h: t + 0.8 })
    layers.push({ colour: 'name', region: face, z: t + 0.8, h: r })
  }
  if (v.stand) layers.unshift(standingFoot(union(...layers.map((l) => l.region)), 'frame', t))
  return { layers }
}

const params = (spec: Spec): GiftParam[] => [
  { key: 'name', label: 'ชื่อ', kind: 'text', default: spec.person, maxChars: 14, font: spec.nameFont },
  { key: 'letter', label: 'ตัวอักษรใหญ่', kind: 'text', default: '', maxChars: 1, hint: 'เว้นว่าง ใช้ตัวแรกของชื่อ', font: 'lilita' },
  { key: 'size', label: 'ความสูงตัวอักษรใหญ่', kind: 'number', default: 150, min: 70, max: 260, step: 1, unit: 'มม.' },
  { key: 'rim', label: 'ขอบตัวอักษรใหญ่', kind: 'number', default: 4.4, min: 2.4, max: 10, step: 0.2, unit: 'มม.' },
  { key: 'cell', label: 'ขนาดช่องลาย', kind: 'number', default: 8, min: 4, max: 18, step: 0.5, unit: 'มม.' },
  { key: 'pattern', label: 'ลายด้านใน', kind: 'choice', default: spec.pattern, options: PATTERNS },
  { key: 'outline', label: 'ขอบรอบชื่อ', kind: 'number', default: 2.6, min: 1.2, max: 6, step: 0.2, unit: 'มม.' },
  { key: 'angle', label: 'เอียงชื่อ', kind: 'number', default: spec.look === 'patterned' ? 28 : 0, min: -45, max: 45, step: 1, unit: 'องศา' },
  { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: false, hint: 'ตัวป้ายหนาตั้งได้เอง' },
  { key: 'base', label: 'ความหนาตัวอักษรใหญ่', kind: 'number', default: 12, min: 4, max: 30, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ชื่อนูน', kind: 'number', default: 1.6, min: 0.4, max: 5, step: 0.2, unit: 'มม.' },
]

const SPECS: Spec[] = [
  { id: 'initial-greenery', name: 'ป้ายอักษรใบไม้เขียว', blurb: 'ตัวอักษรใหญ่ไส้ระแนง กิ่งใบไม้พาด ชื่อตัวเขียนคาดกลาง', look: 'greenery', pattern: 'slats', person: 'Emma', nameFont: 'pacifico',
    colours: { frame: '#5b6bbf', panel: '#e8d9b8', pattern: '#d4b483', deco: '#2f9e44', plate: '#1f2937', name: '#ffffff' } },
  { id: 'initial-rattan', name: 'ป้ายอักษรขอบหวาย', blurb: 'ขอบตัวอักษรสานหวาย ไส้ระแนงสีฟ้า ชื่อตัวเขียนคาดกลาง', look: 'rattan', pattern: 'slats', person: 'Harriet', nameFont: 'pacifico',
    colours: { frame: '#d6a46a', panel: '#93a8e8', pattern: '#6f86d6', deco: '#d6a46a', plate: '#ffffff', name: '#1f2937' } },
  { id: 'initial-pattern', name: 'ป้ายอักษรลายข้าวหลามตัด', blurb: 'ตัวอักษรใหญ่ไส้ลายข้าวหลามตัด ชื่อตัวหนาพาดเฉียง', look: 'patterned', pattern: 'lattice', person: 'ANGELINA', nameFont: 'lilita',
    colours: { frame: '#f9a8d4', panel: '#f3f4f6', pattern: '#9ca3af', deco: '#c4b5fd', plate: '#a78bfa', name: '#ffffff' } },
  { id: 'initial-lattice', name: 'ป้ายอักษรตาข่าย', blurb: 'ตัวอักษรใหญ่สีครีมไส้ตาข่าย ชื่อตัวเขียนคาดกลาง', look: 'lattice', pattern: 'lattice', person: 'Maisie', nameFont: 'pacifico',
    colours: { frame: '#e9d5b5', panel: '#ffffff', pattern: '#d6c4a4', deco: '#e9d5b5', plate: '#ffffff', name: '#1f2937' } },
  { id: 'initial-hex', name: 'ป้ายอักษรวงกลมลายดอก', blurb: 'วงกลมไส้ลาย ตัวอักษรตั้งกลาง ชื่อคาดล่าง', look: 'circle', pattern: 'daisy', person: 'Harrison', nameFont: 'cherry-bomb',
    colours: { frame: '#f3e3c3', panel: '#ffffff', pattern: '#5b7bd6', deco: '#1f2937', plate: '#ffffff', name: '#3b5bc4' } },
]

const design = (spec: Spec): GiftDesign => ({
  id: spec.id, name: spec.name, blurb: spec.blurb, group: 'initial',
  params: params(spec),
  colours: [
    { key: 'frame', label: 'ขอบตัวอักษรใหญ่', default: spec.colours.frame },
    { key: 'panel', label: 'แผ่นหลัง', default: spec.colours.panel },
    { key: 'pattern', label: 'ลายด้านใน', default: spec.colours.pattern },
    { key: 'deco', label: 'ใบไม้และขอบเสริม', default: spec.colours.deco },
    { key: 'plate', label: 'ขอบรอบชื่อ', default: spec.colours.plate },
    { key: 'name', label: 'ชื่อ', default: spec.colours.name },
  ],
  howTo: ['ตัวอักษรใหญ่หนา วางด้านหลังติดแผ่นพิมพ์ ลายด้านในพิมพ์ได้โดยไม่ต้องใช้ซัพพอร์ต'],
  build: (ctx, v) => build(ctx, v, spec),
})

/** A big daisy whose round yellow middle carries the letter. */
function daisyLetter(ctx: GiftContext, v: GiftValues) {
  const ch = str(v, 'letter').trim() || 'H'
  if (missingGlyphs(fontOf(ctx, v, 'letter'), ch)) return { layers: [], warning: NO_GLYPH }
  const S = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const petals: Region[] = []
  const n = 8
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n
    petals.push(translate(rotate(scale(circle(0, 0, 1, 48), S * 0.26, S * 0.15), a), Math.cos(a) * S * 0.3, Math.sin(a) * S * 0.3))
  }
  const centre = circle(0, 0, S * 0.24, 96)
  const ring = diff(centre, offset(centre, -S * 0.03))
  const art = textArt(fontOf(ctx, v, 'letter'), [ch], 100)
  const letter = art.length ? puffUp(sized(art, S * 0.26), 0.4) : []
  const layers: GiftLayer[] = [
    { colour: 'petal', region: union(...petals, centre), z: 0, h: t },
    { colour: 'centre', region: centre, z: t, h: 1.2 },
    { colour: 'ring', region: ring, z: t + 1.2, h: 0.8 },
    { colour: 'letter', region: letter, z: t + 1.2, h: r },
  ]
  if (v.face) {
    // A tiny smile under the letter.
    const f = kawaiiFace(0, -S * 0.15, S * 0.12, false)
    layers.push({ colour: 'ring', region: f.marks, z: t + 1.2, h: 0.6 })
  }
  return { layers }
}

export const LETTERS: GiftDesign[] = [
  ...SPECS.map(design),
  {
    id: 'initial-daisy', name: 'ตัวอักษรในดอกเดซี่', group: 'initial', blurb: 'ดอกเดซี่กลีบขาว เกสรเหลืองมีตัวอักษรอยู่กลาง',
    params: [
      { key: 'letter', label: 'ตัวอักษร', kind: 'text', default: 'H', maxChars: 2, font: 'coiny' },
      { key: 'size', label: 'ขนาดดอก', kind: 'number', default: 120, min: 50, max: 220, step: 1, unit: 'มม.' },
      { key: 'face', label: 'หน้ายิ้มใต้ตัวอักษร', kind: 'toggle', default: false },
      { key: 'base', label: 'ความหนากลีบ', kind: 'number', default: 6, min: 2, max: 20, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 3, min: 0.6, max: 8, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'petal', label: 'กลีบดอก', default: '#ffffff' },
      { key: 'centre', label: 'เกสร', default: '#facc15' },
      { key: 'ring', label: 'ขอบเกสร', default: '#f59e0b' },
      { key: 'letter', label: 'ตัวอักษร', default: '#f0abfc' },
    ],
    build: daisyLetter,
  },
]
