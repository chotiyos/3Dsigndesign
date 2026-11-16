import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, intersect, offset, rect, roundRect, scale, stroke, translate, union, type Region } from '../geo2d'
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
function text(ctx: GiftContext, v: GiftValues, key: string, w: number, h: number) {
  const fit = fitText(fontOf(ctx, v, key), str(v, key), w, h * 1.5, h, false)
  return fit.art.length ? puffUp(fit.art, Math.min(0.5, fit.height * 0.035)) : []
}
const missing = (ctx: GiftContext, v: GiftValues, keys: string[]) => keys.some((k) => missingGlyphs(fontOf(ctx, v, k), str(v, k)))
const colours = (list: [string, string, string][]) => list.map(([key, label, c]) => ({ key, label, default: c }))

/** Santa candy box: a ribbed green box, Santa's face on the front, the name under him. */
function santaBox(ctx: GiftContext, v: GiftValues) {
  if (missing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = num(v, 'height')
  const D = W * 0.8
  const wall = num(v, 'wall')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const shape = roundRect(0, 0, W, D, 8)
  // Vertical ribs all round the outside.
  const ribs: Region[] = []
  const outline = shape[0]
  for (let i = 0; i < outline.length; i += Math.max(1, Math.floor(outline.length / 60))) ribs.push(circle(outline[i][0], outline[i][1], 1.6, 12))
  const ribbed = union(shape, ...ribs)
  const layers: GiftLayer[] = [
    { colour: 'box', region: ribbed, z: 0, h: 2 },
    { colour: 'box', region: diff(ribbed, offset(shape, -wall)), z: 2, h: H - 2 },
  ]
  const santa = centreAt(sized(charmArt('santa'), H * 0.62), 0, H * 0.72)
  const name = text(ctx, v, 'name', W * 0.85, H * 0.24)
  const face = name.length ? centreAt(name, 0, H * 0.28) : []
  // The plate sinks half into the front wall, past the ribs, so it is fused to the jar.
  const front = bounds(shape).minY + wall / 2
  layers.push({ colour: 'plate', region: silhouette(union(santa, face), 2.4), z: 0, h: t, stand: front })
  layers.push({ colour: 'santa', region: filled(santa), z: t, h: r, stand: front })
  layers.push({ colour: 'mark', region: diff(filled(santa), santa), z: t + r, h: 0.6, stand: front })
  layers.push({ colour: 'text', region: face, z: t, h: r, stand: front })
  return { layers }
}

/**
 * Pet bowls: a lower body and an upper band, the name raised on the band and
 * wrapped round it. `curved` gives a barrel shape; otherwise a cone under a band.
 */
function bowl(ctx: GiftContext, v: GiftValues, curved: boolean) {
  if (missing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const R1 = num(v, 'width') / 2
  const H = num(v, 'height')
  const wall = num(v, 'wall')
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  const floor = 3
  const bandH = H * 0.38
  const lowH = H - bandH
  const steps = Math.max(16, Math.round(H / 0.5))
  // Radius at height z: a cone flaring up to the band, or a barrel bulging at mid height.
  const radius = (z: number) => {
    if (curved) return R1 * (0.84 + 0.16 * Math.sin((Math.PI * z) / H))
    return z < lowH ? R1 * (0.82 + 0.18 * (z / lowH)) : R1
  }
  const step = (H - floor) / steps
  // The floor is as wide as the first ring, so that ring has something under it.
  layers.push({ colour: 'body', region: circle(0, 0, radius(floor + step / 2), 128), z: 0, h: floor })
  for (let i = 0; i < steps; i++) {
    const z = floor + ((H - floor) * i) / steps
    const R = radius(z + (H - floor) / steps / 2)
    const inBand = curved ? z > H * 0.3 && z < H * 0.7 : z >= lowH
    layers.push({ colour: inBand ? 'band' : 'body', region: diff(circle(0, 0, R, 128), circle(0, 0, R - wall, 128)), z, h: (H - floor) / steps })
  }
  // A rim lip round the top, starting on a ring boundary and only 1.4 mm wider than the wall below.
  const lipZ = floor + step * Math.ceil((H - 2.4 - floor) / step)
  const Rtop = radius(lipZ - step / 2)
  layers.push({ colour: 'band', region: diff(circle(0, 0, Rtop + 1.4, 128), circle(0, 0, Rtop - wall, 128)), z: lipZ, h: H - lipZ })
  // The name, wrapped round the band at the front.
  const bandMid = curved ? H * 0.5 : lowH + bandH / 2
  const name = text(ctx, v, 'name', R1 * 2.2, bandH * 0.62)
  if (name.length) {
    const nb = bounds(name)
    const placed = translate(name, -(nb.minX + nb.maxX) / 2, -(nb.minY + nb.maxY) / 2)
    const Rb = curved ? radius(bandMid) : R1
    layers.push({ colour: 'text', region: placed, z: bandMid, h: r, wrap: Rb - 0.2 })
  }
  return { layers }
}

/** A portrait photo frame: lattice border, a dark photo window, the name on the bottom bar. */
function frame(ctx: GiftContext, v: GiftValues) {
  if (missing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const pw = num(v, 'photoW')
  const ph = num(v, 'photoH')
  const side = num(v, 'border')
  const bar = Math.max(24, pw * 0.32)
  const W = pw + 2 * side
  const H = ph + side + bar
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const outer = roundRect(0, 0, W, H, 8)
  const winY = H / 2 - side - ph / 2
  const window = rect(0, winY, pw, ph)
  const lip = rect(0, winY, pw - 6, ph - 6)
  const border = diff(outer, offset(window, 2))
  const name = text(ctx, v, 'name', W * 0.86, bar * 0.62)
  const face = name.length ? centreAt(name, 0, -H / 2 + bar / 2) : []
  return {
    layers: [
      { colour: 'frame', region: diff(outer, lip), z: 0, h: 2 },
      { colour: 'window', region: lip, z: 0, h: 0.6 },
      { colour: 'lattice', region: patternWeb('lattice', diff(offset(outer, -2.4), offset(window, 4.4)), 8, 1.4), z: 2, h: t - 2.8 },
      { colour: 'frame', region: diff(border, diff(offset(outer, -2.4), offset(window, 4.4))), z: 2, h: t - 2 },
      // Solid under the name so its outline does not sit over lattice holes.
      { colour: 'frame', region: silhouette(face, 2.2), z: 2, h: t - 2 },
      { colour: 'outline', region: silhouette(face, 2.2), z: t, h: 1 },
      { colour: 'text', region: face, z: t + 1, h: r },
    ],
  }
}

/** Fridge magnet: an arch with a lattice, a smiling dog and the name across the bottom. */
function magnet(ctx: GiftContext, v: GiftValues) {
  if (missing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const S = num(v, 'size')
  const t = Math.max(num(v, 'base'), 3.4)
  const r = num(v, 'raise')
  const arch = union(circle(0, S * 0.12, S * 0.4, 96), rect(0, -S * 0.12, S * 0.8, S * 0.48))
  const inner = offset(arch, -S * 0.06)
  const dog = centreAt(sized(charmArt('dog'), S * 0.48), 0, S * 0.14)
  const name = text(ctx, v, 'name', S * 0.95, S * 0.26)
  const face = name.length ? centreAt(name, 0, -S * 0.3) : []
  const md = num(v, 'magnet')
  const pocket = circle(0, 0, md / 2 + 0.15, 48)
  // The pocket must leave solid walls round it inside the arch.
  if (md > S * 0.4) return { layers: [], warning: 'แม่เหล็กใหญ่เกินชิ้นงาน ลดขนาดแม่เหล็กหรือเพิ่มขนาดชิ้น' }
  return {
    layers: [
      { colour: 'rim', region: diff(union(arch, silhouette(face, 2)), pocket), z: 0, h: 2.2 },
      { colour: 'rim', region: union(diff(arch, inner), silhouette(face, 2)), z: 2.2, h: t - 2.2 },
      { colour: 'lattice', region: patternWeb('lattice', inner, 6, 1.2), z: 2.2, h: t - 3 },
      { colour: 'dog', region: filled(dog), z: 2.2, h: t - 2.2 + r },
      { colour: 'mark', region: diff(filled(dog), dog), z: t + r, h: 0.6 },
      { colour: 'text', region: face, z: t, h: r },
    ],
  }
}

/** Party glasses: a blue frame with striped lenses, digits in the lenses, the name on top. */
function glasses(ctx: GiftContext, v: GiftValues) {
  if (missing(ctx, v, ['name', 'left', 'right'])) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const lw = W * 0.4
  const lh = lw * 0.62
  const lens = (sx: number) => roundRect((sx * W) / 4.1, 0, lw, lh, lh * 0.32)
  const lenses = union(lens(-1), lens(1))
  const frameOutline = union(offset(lenses, 4), stroke([[-W * 0.06, lh * 0.32], [W * 0.06, lh * 0.32]], 6))
  const temples = union(stroke([[-W / 2 + 4, lh * 0.25], [-W * 0.72, lh * 0.5]], 5), stroke([[W / 2 - 4, lh * 0.25], [W * 0.72, lh * 0.5]], 5))
  const stripes = intersect(lenses, union(...Array.from({ length: 9 }, (_, i) => rect(0, -lh / 2 + (i + 0.5) * (lh / 9), W, lh / 18))))
  const digit = (key: string, sx: number) => {
    const a = text(ctx, v, key, lw * 0.8, lh * 0.75)
    return a.length ? centreAt(a, (sx * W) / 4.1, 0) : []
  }
  const digits = union(digit('left', -1), digit('right', 1))
  const name = text(ctx, v, 'name', W * 0.5, lh * 0.45)
  const face = name.length ? centreAt(name, 0, lh / 2 + lh * 0.3) : []
  return {
    layers: [
      { colour: 'frame', region: union(diff(frameOutline, lenses), temples, silhouette(face, 2)), z: 0, h: t },
      { colour: 'lens', region: lenses, z: 0, h: 1.2 },
      { colour: 'stripe', region: stripes, z: 1.2, h: 0.8 },
      { colour: 'digitOutline', region: silhouette(digits, 1.4), z: 1.2, h: t - 0.4 },
      { colour: 'digit', region: digits, z: t + 0.8, h: r },
      { colour: 'text', region: face, z: t, h: r },
    ],
  }
}

const NAME = (d: string, font: string, max = 12): GiftParam => ({ key: 'name', label: 'ชื่อ', kind: 'text', default: d, maxChars: max, font })
const THICK: GiftParam[] = [
  { key: 'base', label: 'ความหนา', kind: 'number', default: 5, min: 2, max: 14, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.6, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
]

export const HOME: GiftDesign[] = [
  {
    id: 'home-santa-jar', name: 'กล่องขนมซานตาคลอส', group: 'home', blurb: 'กล่องเขียวลายร่อง ซานตาหน้ายิ้มและชื่อสีแดงด้านหน้า',
    params: [
      NAME('LUCAS', 'cherry-bomb'),
      { key: 'width', label: 'ความกว้าง', kind: 'number', default: 100, min: 60, max: 180, step: 1, unit: 'มม.' },
      { key: 'height', label: 'ความสูง', kind: 'number', default: 80, min: 40, max: 160, step: 1, unit: 'มม.' },
      { key: 'wall', label: 'ความหนาผนัง', kind: 'number', default: 2.2, min: 1.2, max: 4, step: 0.2, unit: 'มม.' },
      { key: 'base', label: 'ความหนาป้ายหน้า', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ลายและชื่อนูน', kind: 'number', default: 1.6, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
    ],
    colours: colours([['box', 'ตัวกล่อง', '#15803d'], ['plate', 'ป้ายหน้า', '#ffffff'], ['santa', 'ซานตา', '#fecaca'], ['mark', 'เส้นลาย', '#dc2626'], ['text', 'ชื่อ', '#dc2626']]),
    howTo: ['พิมพ์ตั้งตรงตามไฟล์ ป้ายด้านหน้ายื่นจากผนัง ไม่ต้องใช้ซัพพอร์ต'], upright: true, build: santaBox,
  },
  ...([false, true] as const).map((curved): GiftDesign => ({
    id: curved ? 'home-bowl-curved' : 'home-bowl-cone',
    name: curved ? 'ชามสัตว์เลี้ยงทรงถังใส่ชื่อ' : 'ชามสัตว์เลี้ยงทรงกรวยใส่ชื่อ',
    group: 'home',
    blurb: curved ? 'ชามทรงถังป่องกลาง ชื่อนูนโค้งรอบแถบกลางชาม' : 'ฐานกรวยสีเขียว แถบบนสีม่วง ชื่อนูนโค้งรอบแถบ',
    params: [
      NAME('LASSIE', 'cherry-bomb'),
      { key: 'width', label: 'ความกว้างปากชาม', kind: 'number', default: 140, min: 90, max: 220, step: 1, unit: 'มม.' },
      { key: 'height', label: 'ความสูง', kind: 'number', default: curved ? 90 : 70, min: 40, max: 130, step: 1, unit: 'มม.' },
      { key: 'wall', label: 'ความหนาผนัง', kind: 'number', default: 2.6, min: 1.6, max: 5, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ชื่อนูน', kind: 'number', default: 1.6, min: 0.6, max: 3, step: 0.2, unit: 'มม.' },
    ],
    colours: colours(curved ? [['body', 'ตัวชาม', '#059669'], ['band', 'แถบกลาง', '#10b981'], ['text', 'ชื่อ', '#f472b6']] : [['body', 'ฐานกรวย', '#a3e635'], ['band', 'แถบบน', '#c084fc'], ['text', 'ชื่อ', '#f472b6']]),
    howTo: ['พิมพ์ตั้งตรง ชื่อโค้งตามผนังชาม ใช้ PETG ล้างทำความสะอาดง่าย'],
    upright: true,
    build: (ctx, v) => bowl(ctx, v, curved),
  })),
  {
    id: 'home-photo-frame', name: 'กรอบรูปลายตาข่ายใส่ชื่อ', group: 'home', blurb: 'กรอบรูปแนวตั้ง ขอบลายตาข่าย ชื่อตัวอ้วนบนแถบล่าง',
    params: [
      NAME('MARCELO', 'coiny', 14),
      { key: 'photoW', label: 'ความกว้างรูป', kind: 'number', default: 89, min: 50, max: 180, step: 1, unit: 'มม.', hint: 'รูป 3.5 × 5 นิ้ว = 89 × 127 มม.' },
      { key: 'photoH', label: 'ความสูงรูป', kind: 'number', default: 127, min: 50, max: 220, step: 1, unit: 'มม.' },
      { key: 'border', label: 'ความกว้างขอบ', kind: 'number', default: 18, min: 8, max: 40, step: 1, unit: 'มม.' },
      ...THICK,
    ],
    colours: colours([['frame', 'กรอบ', '#c4b5fd'], ['lattice', 'ลายตาข่าย', '#ffffff'], ['window', 'พื้นหลังรูป', '#111827'], ['outline', 'ขอบชื่อ', '#7c3aed'], ['text', 'ชื่อ', '#ffffff']]),
    howTo: ['ใส่รูปจากด้านหน้า ติดเทปกาวสองหน้าที่มุมรูป ขอบในเล็กกว่ารูป 3 มม. รองรูปไว้'],
    build: frame,
  },
  {
    id: 'home-magnet', name: 'แม่เหล็กโค้งลายตาข่ายหน้าน้องหมา', group: 'home', blurb: 'ทรงโค้งขอบเหลือง ลายตาข่าย น้องหมาหน้ายิ้ม ชื่อพาดด้านล่าง',
    params: [
      NAME('Lassie', 'cherry-bomb'),
      { key: 'size', label: 'ขนาด', kind: 'number', default: 70, min: 40, max: 120, step: 1, unit: 'มม.' },
      { key: 'magnet', label: 'ขนาดแม่เหล็ก', kind: 'number', default: 12, min: 6, max: 20, step: 1, unit: 'มม.', hint: 'แม่เหล็กกลมหนา 2 มม.' },
      ...THICK,
    ],
    colours: colours([['rim', 'ขอบและพื้น', '#facc15'], ['lattice', 'ลายตาข่าย', '#ffffff'], ['dog', 'น้องหมา', '#fdba74'], ['mark', 'เส้นลาย', '#1f2937'], ['text', 'ชื่อ', '#f472b6']]),
    howTo: ['พิมพ์ด้านหลังติดแผ่นพิมพ์ ช่องแม่เหล็กลึก 2.2 มม. กดแม่เหล็กลงแล้วหยดกาว'],
    build: magnet,
  },
  {
    id: 'home-glasses', name: 'แว่นปาร์ตี้ใส่ชื่อ', group: 'home', blurb: 'แว่นปาร์ตี้กรอบฟ้า เลนส์ลายทาง ตัวเลขในเลนส์ ชื่ออยู่บนสันจมูก',
    params: [
      NAME('RICARDO', 'cherry-bomb'),
      { key: 'left', label: 'เลขเลนส์ซ้าย', kind: 'text', default: '20', maxChars: 3, font: 'coiny' },
      { key: 'right', label: 'เลขเลนส์ขวา', kind: 'text', default: '26', maxChars: 3, font: 'coiny' },
      { key: 'width', label: 'ความกว้างกรอบหน้า', kind: 'number', default: 140, min: 110, max: 170, step: 1, unit: 'มม.' },
      ...THICK.map((p) => (p.key === 'base' ? { ...p, default: 3.4, max: 6 } : p)),
    ],
    colours: colours([['frame', 'กรอบ', '#3b82f6'], ['lens', 'เลนส์', '#e0f2fe'], ['stripe', 'ลายทาง', '#ffffff'], ['digitOutline', 'ขอบตัวเลข', '#ef4444'], ['digit', 'ตัวเลข', '#ffffff'], ['text', 'ชื่อ', '#1f2937']]),
    howTo: ['พิมพ์คว่ำด้านหน้าลง ขาแว่นพิมพ์ติดกับกรอบเป็นชิ้นเดียว ใส่เล่นในงานปาร์ตี้ ไม่ใช่แว่นกันแดด'],
    build: glasses,
  },
]
