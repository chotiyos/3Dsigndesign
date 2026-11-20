import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, offset, rect, rotate, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import { filled, fitText, fontOf, missingGlyphs, num, str, type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues } from './core'
import { daisy, leafBranch, patternWeb } from './patterns'

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

/** An open box: floor and walls. */
function box(shape: Region, height: number, wall: number, colour: string, z = 0): GiftLayer[] {
  return [
    { colour, region: shape, z, h: 2 },
    { colour, region: diff(shape, offset(shape, -wall)), z: z + 2, h: height - 2 },
  ]
}

function text(ctx: GiftContext, v: GiftValues, key: string, w: number, h: number) {
  const fit = fitText(fontOf(ctx, v, key), str(v, key), w, h * 1.5, h, false)
  return fit.art.length ? puffUp(fit.art, Math.min(0.5, fit.height * 0.035)) : []
}

/** A front plate standing at `front`; callers sink it half into the box wall so it is fused, not just touching. */
function plate(front: number, t: number, r: number, base: { region: Region; colour: string }, raised: { region: Region; colour: string; up?: number }[]): GiftLayer[] {
  return [
    { colour: base.colour, region: base.region, z: 0, h: t, stand: front },
    ...raised.map((p) => ({ colour: p.colour, region: p.region, z: t + (p.up ?? 0), h: r, stand: front })),
  ]
}

const anyMissing = (ctx: GiftContext, v: GiftValues, keys: string[]) => keys.some((k) => missingGlyphs(fontOf(ctx, v, k), str(v, k)))

/** Busy bee: a white box whose front plate is honeycomb, with the name, a bee and daisies. */
function bee(ctx: GiftContext, v: GiftValues) {
  if (anyMissing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = num(v, 'height')
  const D = W * 0.5
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const shape = roundRect(0, 0, W, D, 6)
  const ph = H * 0.55
  const back = roundRect(0, ph / 2 + 4, W * 0.96, ph, 8)
  const comb = patternWeb('hex', offset(back, -3), 7, 1.4)
  const name = text(ctx, v, 'name', W * 0.66, ph * 0.38)
  const face = centreAt(name, -W * 0.04, ph * 0.42)
  const outline = diff(silhouette(face, 1.8), face)
  // The bee and the daisy keep 3 mm inside the plate's sides at any size.
  const beeArt = sized(charmArt('bee'), ph * 0.42)
  const half = (W * 0.96) / 2
  const b = centreAt(beeArt, half - bounds(beeArt).w / 2 - 3, ph * 0.78)
  const dr = Math.min(ph * 0.2, half * 0.3)
  const d = daisy(-half + dr * 0.97 + 3, ph * 0.72, dr)
  return {
    layers: [
      ...box(shape, H, num(v, 'wall'), 'box'),
      { colour: 'plate', region: back, z: 0, h: t - 1, stand: -D / 2 + num(v, 'wall') / 2 },
      ...plate(-D / 2 + num(v, 'wall') / 2, t - 1, r, { region: comb, colour: 'comb' }, [
        { region: outline, colour: 'outline' },
        { region: face, colour: 'text' },
        { region: filled(b), colour: 'plate' },
        { region: diff(filled(b), b), colour: 'mark', up: r },
        { region: d.petals, colour: 'outline' },
        { region: d.centre, colour: 'plate' },
      ]),
    ],
  }
}

/** A big pencil lying on its side, an open box on top, the name on the pencil's face. */
function pencil(ctx: GiftContext, v: GiftValues) {
  if (anyMissing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const L = num(v, 'width') * 1.6
  const R = num(v, 'height') * 0.3
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  // A hexagonal pencil lying flat, built from thin slices of its width.
  const H = R * Math.sqrt(3)
  const steps = 14
  const tipL = R * 2.2
  const bodyL = L - tipL - R * 0.9
  const x0 = -L / 2
  for (let i = 0; i < steps; i++) {
    const zc = ((i + 0.5) / steps) * H
    const w = R + (2 * R - R) * (1 - Math.abs(zc - H / 2) / (H / 2))
    const z = (i / steps) * H
    const h = H / steps
    layers.push({ colour: 'eraser', region: rect(x0 + R * 0.3, 0, R * 0.6, w), z, h })
    layers.push({ colour: 'band', region: rect(x0 + R * 0.75, 0, R * 0.3, w), z, h })
    layers.push({ colour: 'body', region: rect(x0 + R * 0.9 + bodyL / 2, 0, bodyL, w), z, h })
    const tip: Region = [[[x0 + R * 0.9 + bodyL, -w / 2], [L / 2, 0], [x0 + R * 0.9 + bodyL, w / 2]]]
    const lead = diff(tip, rect(L / 2 - tipL * 0.3 - L, 0, L * 2, w * 2))
    layers.push({ colour: 'wood', region: diff(tip, lead), z, h })
    layers.push({ colour: 'lead', region: lead, z, h })
  }
  // The box sits on the flat top of the pencil.
  const bw = bodyL * 0.7
  const bd = R * 0.98
  const bh = num(v, 'height')
  layers.push(...box(roundRect(x0 + R * 0.9 + bodyL * 0.45, 0, bw, bd, 3), bh, num(v, 'wall'), 'box', H))
  // The name across the pencil's flat top face, in front of the box.
  const name = text(ctx, v, 'name', bodyL * 0.85, R * 0.75)
  if (name.length) {
    const face = centreAt(name, x0 + R * 0.9 + bodyL / 2, 0)
    layers.push({ colour: 'outline', region: diff(silhouette(face, 1.2), face), z: H, h: r })
    layers.push({ colour: 'text', region: face, z: H, h: r })
  }
  return { layers }
}

/** A box with a three-line name plate over a lattice. */
function nameplateBox(ctx: GiftContext, v: GiftValues) {
  if (anyMissing(ctx, v, ['first', 'last', 'title'])) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = num(v, 'height')
  const D = W * 0.55
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const shape = roundRect(0, 0, W, D, 6)
  const lines = [['first', 'text', 0.3], ['last', 'second', 0.3], ['title', 'third', 0.24]] as const
  const art: { region: Region; colour: string }[] = []
  let y = H * 0.92
  for (const [key, colour, share] of lines) {
    const a = text(ctx, v, key, W * 0.9, H * share)
    if (!a.length) continue
    const b = bounds(a)
    const face = centreAt(a, 0, y - b.h / 2)
    art.push({ region: diff(silhouette(face, 1.6), face), colour: 'outline' }, { region: face, colour })
    y -= b.h + H * 0.04
  }
  if (!art.length) return { layers: [], warning: 'ใส่ชื่ออย่างน้อย 1 บรรทัด' }
  // Tall lines (stacked Thai marks) may not fit the box's height: shrink the
  // plate to fit, and keep its lattice margin 5 mm above the bed.
  const ab = bounds(union(...art.map((p) => p.region)))
  const k = Math.min(1, (H - 12) / Math.max(ab.h, 1))
  const lift = Math.max(0, 5 - (ab.maxY - (ab.maxY - ab.minY) * k))
  const fit = (region: Region) => translate(scale(translate(region, 0, -ab.maxY), k), 0, ab.maxY + lift)
  for (const p of art) p.region = fit(p.region)
  const all = union(...art.map((p) => p.region))
  const backing = silhouette(all, 3)
  const lattice = patternWeb('lattice', diff(roundRect(0, (bounds(all).minY + bounds(all).maxY) / 2, W * 0.95, bounds(all).h + 10, 6), backing), 8, 1.4)
  return {
    layers: [
      ...box(shape, H * 0.7, num(v, 'wall'), 'box'),
      { colour: 'lattice', region: lattice, z: 0, h: t - 1, stand: -D / 2 + num(v, 'wall') / 2 },
      ...plate(-D / 2 + num(v, 'wall') / 2, t, r, { region: backing, colour: 'plate' }, art),
    ],
  }
}

/** An orange box with the name in big letters on the front and a cat at the start. */
function catBox(ctx: GiftContext, v: GiftValues) {
  if (anyMissing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width') * 1.5
  const H = num(v, 'height') * 0.65
  const D = W * 0.42
  const t = num(v, 'base')
  const r = num(v, 'raise')
  // A scalloped top edge on the back wall.
  const shape = roundRect(0, 0, W, D, 6)
  const scallops = union(...Array.from({ length: 7 }, (_, i) => circle(-W / 2 + (W * (i + 0.5)) / 7, 0, W / 14, 32)))
  const name = text(ctx, v, 'name', W * 0.72, H * 0.5)
  const face = centreAt(name, W * 0.08, H * 0.5)
  const cat = centreAt(sized(charmArt('cat'), H * 0.42), -W * 0.38, H * 0.55)
  return {
    layers: [
      ...box(shape, H, num(v, 'wall'), 'box'),
      { colour: 'box', region: translate(diff(scallops, rect(0, -W, W * 2, W * 2)), 0, H), z: 0, h: num(v, 'wall'), stand: D / 2 },
      ...plate(-D / 2 + num(v, 'wall') / 2, t, r, { region: silhouette(union(face, filled(cat)), 2.4), colour: 'outline' }, [
        { region: face, colour: 'text' },
        { region: filled(cat), colour: 'plate' },
        { region: diff(filled(cat), cat), colour: 'mark', up: r },
      ]),
    ],
  }
}

/** Two L-shaped bookends: a tall lattice panel with leaves and the word running up it. */
function bookends(ctx: GiftContext, v: GiftValues) {
  if (anyMissing(ctx, v, ['left', 'right'])) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'height')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  const pw = H * 0.42
  ;(['left', 'right'] as const).forEach((key, i) => {
    // Side by side, 8 mm apart: close enough for one print bed.
    const cx = (i ? 1 : -1) * ((pw + 30) / 2 + 4)
    const panel = union(roundRect(cx, H / 2, pw, H, 8), rect(cx, 6, pw + 30, 12))
    const inner = offset(roundRect(cx, H / 2 + 6, pw - 10, H - 22, 5), 0)
    const word = text(ctx, v, key, H * 0.85, pw * 0.42)
    const turned = word.length ? centreAt(rotate(word, Math.PI / 2), cx + pw * 0.18, H * 0.55) : []
    const leaves = leafBranch([cx - pw * 0.5, H * 0.35], [cx - pw * 0.05, H * 0.62], pw * 0.28, 6)
    layers.push({ colour: 'panel', region: rect(cx, 0, pw + 30, 70), z: 0, h: 4 })
    layers.push({ colour: 'panel', region: diff(panel, inner), z: 0, h: t, stand: 30 })
    layers.push({ colour: 'lattice', region: patternWeb('lattice', inner, 9, 1.4), z: 0, h: t - 1, stand: 30 })
    // The outline doubles as a solid backing under the letters, over the lattice.
    layers.push({ colour: 'outline', region: silhouette(union(turned, leaves), 1.6), z: 0, h: t + r, stand: 30 })
    layers.push({ colour: 'text', region: turned, z: t, h: r, stand: 30 })
    layers.push({ colour: 'leaf', region: diff(leaves, offset(turned, 2)), z: t, h: r, stand: 30 })
  })
  return { layers }
}

const SIZE: GiftParam[] = [
  { key: 'width', label: 'ความกว้าง', kind: 'number', default: 110, min: 60, max: 200, step: 1, unit: 'มม.' },
  { key: 'height', label: 'ความสูง', kind: 'number', default: 75, min: 40, max: 160, step: 1, unit: 'มม.' },
  { key: 'wall', label: 'ความหนาผนัง', kind: 'number', default: 2.2, min: 1.2, max: 4, step: 0.2, unit: 'มม.' },
  { key: 'base', label: 'ความหนาป้ายหน้า', kind: 'number', default: 3.4, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.6, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
]

const HOWTO = ['พิมพ์ตั้งตรงตามไฟล์ ป้ายด้านหน้ายื่นจากผนัง ไม่ต้องใช้ซัพพอร์ต ตัวอักษรบนผนังตั้งต้องใช้เครื่องพิมพ์หลายสีแบบแยกวัตถุ (AMS) หรือทาสีเอง']

const colours = (list: [string, string, string][]) => list.map(([key, label, c]) => ({ key, label, default: c }))

export const DESK: GiftDesign[] = [
  {
    id: 'desk-bee-holder', name: 'กล่องดินสอผึ้งน้อย', group: 'desk', blurb: 'กล่องขาว ป้ายหน้าลายรังผึ้งสีเหลือง ชื่อชมพู ผึ้งกับดอกเดซี่',
    params: [{ key: 'name', label: 'ชื่อ', kind: 'text', default: 'Magnolia', maxChars: 12, font: 'cherry-bomb' }, ...SIZE],
    colours: colours([['box', 'ตัวกล่อง', '#ffffff'], ['plate', 'ป้ายหน้า', '#facc15'], ['comb', 'ลายรังผึ้ง', '#fde68a'], ['outline', 'ขอบชื่อและกลีบดอก', '#ffffff'], ['text', 'ชื่อ', '#ec4899'], ['mark', 'เส้นลาย', '#1f2937']]),
    howTo: HOWTO, upright: true, build: bee,
  },
  {
    id: 'desk-pencil-cup', name: 'ที่ใส่ปากกาดินสอยักษ์', group: 'desk', blurb: 'ดินสอหกเหลี่ยมนอนมีกล่องส้มด้านบน ชื่อตัวอ้วนบนตัวดินสอ',
    params: [{ key: 'name', label: 'ชื่อ', kind: 'text', default: 'OLIVIA', maxChars: 12, font: 'cherry-bomb' }, ...SIZE.filter((p) => p.key !== 'base')],
    colours: colours([['box', 'กล่องด้านบน', '#fb923c'], ['body', 'ตัวดินสอ', '#facc15'], ['wood', 'เนื้อไม้', '#fde68a'], ['lead', 'ไส้ดินสอ', '#1f2937'], ['band', 'ปลอกโลหะ', '#d1d5db'], ['eraser', 'ยางลบ', '#f9a8d4'], ['outline', 'ขอบชื่อ', '#1f2937'], ['text', 'ชื่อ', '#ffffff']]),
    howTo: ['ดินสอนอนพิมพ์ด้านแบนติดแผ่นพิมพ์ ด้านเอียงทำมุม 60 องศา ไม่ต้องใช้ซัพพอร์ต'], upright: true, build: pencil,
  },
  {
    id: 'desk-pen-tray', name: 'กล่องดินสอป้ายชื่อสามบรรทัด', group: 'desk', blurb: 'กล่องส้ม ป้ายหน้าสามบรรทัด ชื่อ นามสกุล ตำแหน่ง บนพื้นลายตาข่าย',
    params: [
      { key: 'first', label: 'บรรทัด 1 (ชื่อ)', kind: 'text', default: 'ROSALIE', maxChars: 12, font: 'coiny' },
      { key: 'last', label: 'บรรทัด 2 (นามสกุล)', kind: 'text', default: 'BENNETT', maxChars: 12, font: 'coiny' },
      { key: 'title', label: 'บรรทัด 3 (ตำแหน่ง)', kind: 'text', default: 'Director', maxChars: 16, font: 'cherry-bomb' },
      ...SIZE,
    ],
    colours: colours([['box', 'ตัวกล่อง', '#fb923c'], ['lattice', 'ลายตาข่าย', '#ffffff'], ['plate', 'พื้นป้าย', '#fed7aa'], ['outline', 'ขอบตัวอักษร', '#1f2937'], ['text', 'บรรทัด 1', '#374151'], ['second', 'บรรทัด 2', '#a3e635'], ['third', 'บรรทัด 3', '#fdba74']]),
    howTo: HOWTO, upright: true, build: nameplateBox,
  },
  {
    id: 'desk-name-box', name: 'กล่องดินสอชื่อกับแมวเหมียว', group: 'desk', blurb: 'กล่องส้มขอบหลังเป็นลอน ชื่อเหลืองตัวโตด้านหน้า แมวเหมียวหัวชื่อ',
    params: [{ key: 'name', label: 'ชื่อ', kind: 'text', default: 'JASPER', maxChars: 12, font: 'lilita' }, ...SIZE],
    colours: colours([['box', 'ตัวกล่อง', '#fb923c'], ['outline', 'ขอบชื่อ', '#ffffff'], ['text', 'ชื่อ', '#facc15'], ['plate', 'แมว', '#fde68a'], ['mark', 'เส้นลาย', '#1f2937']]),
    howTo: HOWTO, upright: true, build: catBox,
  },
  {
    id: 'desk-bookends', name: 'ที่กั้นหนังสือใบไม้ลายตาข่าย', group: 'desk', blurb: 'ที่กั้นหนังสือคู่ แผ่นตั้งลายตาข่าย ใบไม้ และคำวิ่งขึ้นตามแนวตั้ง',
    params: [
      { key: 'left', label: 'คำฝั่งซ้าย', kind: 'text', default: 'BOOKS', maxChars: 10, font: 'lilita' },
      { key: 'right', label: 'คำฝั่งขวา', kind: 'text', default: 'BOOKS', maxChars: 10, font: 'lilita' },
      { key: 'height', label: 'ความสูง', kind: 'number', default: 150, min: 90, max: 220, step: 1, unit: 'มม.' },
      { key: 'base', label: 'ความหนาแผ่นตั้ง', kind: 'number', default: 8, min: 4, max: 14, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.6, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
    ],
    colours: colours([['panel', 'ตัวที่กั้น', '#a5b4fc'], ['lattice', 'ลายตาข่าย', '#ffffff'], ['leaf', 'ใบไม้', '#16a34a'], ['outline', 'ขอบตัวอักษร', '#ffffff'], ['text', 'ตัวอักษร', '#1f2937']]),
    howTo: ['พิมพ์ตั้งตรงตามไฟล์ เติมไส้ 40% ขึ้นไปให้หนัก หรือติดยางกันลื่นใต้ฐาน'], upright: true, build: bookends,
  },
]
