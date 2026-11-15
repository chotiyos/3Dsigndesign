import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, offset, rotate, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import { filled, fitText, fontOf, LOOP, missingGlyphs, num, str, type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues } from './core'
import { daisy } from './patterns'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์ (ฟอนต์อังกฤษตัวอ้วนใช้กับภาษาไทยไม่ได้)'

/**
 * Name keychains: puffy lettering with one or two outline bands, small
 * motifs at the start or end, and a ring tab on the first motif.
 */
type Icon = 'heart' | 'flower' | 'daisy' | 'heart-leaf'

const ell = (x: number, y: number, rx: number, ry: number, turn = 0): Region => translate(rotate(scale(circle(0, 0, 1, 40), rx, ry), turn), x, y)

/** An icon `s` tall at (x, y): fill pieces by colour role. */
function icon(kind: Icon, s: number, x: number, y: number): { region: Region; colour: string }[] {
  if (kind === 'daisy') {
    const d = daisy(x, y, s / 2)
    return [{ region: d.petals, colour: 'petal' }, { region: d.centre, colour: 'centre' }]
  }
  if (kind === 'flower') {
    // Five round petals and a centre: a simple hibiscus.
    const petals: Region[] = []
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 5
      petals.push(circle(x + Math.cos(a) * s * 0.26, y + Math.sin(a) * s * 0.26, s * 0.24, 36))
    }
    const centre = circle(x, y, s * 0.14, 32)
    return [{ region: diff(union(...petals), offset(centre, 0.6)), colour: 'petal' }, { region: centre, colour: 'centre' }]
  }
  const heart = translate(scale(filled(charmArt('heart')), s / 10), x, y)
  const hb = bounds(heart)
  const h = translate(heart, x - (hb.minX + hb.maxX) / 2, y - (hb.minY + hb.maxY) / 2)
  if (kind === 'heart-leaf') {
    const leaf = ell(x + s * 0.32, y + s * 0.42, s * 0.2, s * 0.11, 0.6)
    return [{ region: h, colour: 'petal' }, { region: diff(leaf, h), colour: 'centre' }]
  }
  return [{ region: h, colour: 'petal' }]
}

interface KeyLook {
  icons: { kind: Icon; at: 'start' | 'end' | 'topStart' | 'bottomEnd' }[]
  bands: number
}

function nameKey(ctx: GiftContext, v: GiftValues, look: KeyLook) {
  const font = fontOf(ctx, v, 'name')
  const text = str(v, 'name')
  if (missingGlyphs(font, text)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const fit = fitText(font, text, H * 8, H * 1.6, H, true)
  if (!fit.art.length) return { layers: [] }
  const face = puffUp(fit.art, Math.min(0.6, fit.height * 0.04))
  const b = bounds(face)
  const s = num(v, 'icon')
  const at = {
    start: [b.minX - s * 0.35, (b.minY + b.maxY) / 2],
    end: [b.maxX + s * 0.35, (b.minY + b.maxY) / 2],
    topStart: [b.minX + s * 0.25, b.maxY + s * 0.05],
    bottomEnd: [b.maxX - s * 0.25, b.minY - s * 0.05],
  }
  const icons = look.icons.flatMap((i) => icon(i.kind, s, at[i.at][0], at[i.at][1]))
  const iconAll = union(...icons.map((i) => i.region))
  const band1 = num(v, 'band')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  // Outer band (the body), an optional inner band, then the letters and icons.
  const inner = silhouette(union(face, iconAll), band1)
  let outer = look.bands > 1 ? silhouette(inner, band1) : inner
  if (v.loop) {
    // The tab goes on the first motif's side, like a charm.
    const first = look.icons[0]?.at ?? 'start'
    outer = sideTab(outer, first === 'end' || first === 'bottomEnd' ? 'right' : 'left')
  }
  const layers: GiftLayer[] = [{ colour: 'base', region: outer, z: 0, h: t }]
  if (look.bands > 1) layers.push({ colour: 'band', region: inner, z: t, h: 0.6 })
  const z = look.bands > 1 ? t + 0.6 : t
  layers.push({ colour: 'text', region: face, z, h: r })
  for (const i of icons) layers.push({ colour: i.colour, region: i.region, z, h: r })
  return { layers }
}

/** A ring tab beside the far left (or right) of the outline, its hole clear of the body. */
function sideTab(region: Region, side: 'left' | 'right'): Region {
  let best: [number, number] = [0, 0]
  let edge = side === 'left' ? Infinity : -Infinity
  for (const poly of region) for (const [x, y] of poly) if (side === 'left' ? x < edge : x > edge) { edge = x; best = [x, y] }
  const cx = best[0] + (side === 'left' ? -2.6 : 2.6)
  return diff(union(region, circle(cx, best[1], 4, 48)), circle(cx, best[1], 1.75, 32))
}

const PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Melis', maxChars: 16, font: 'fredoka' },
  { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 20, min: 10, max: 40, step: 0.5, unit: 'มม.' },
  { key: 'icon', label: 'ขนาดลาย', kind: 'number', default: 16, min: 8, max: 30, step: 0.5, unit: 'มม.' },
  { key: 'band', label: 'ความกว้างขอบ', kind: 'number', default: 2.4, min: 1.2, max: 5, step: 0.2, unit: 'มม.' },
  LOOP,
  { key: 'base', label: 'ความหนาฐาน', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ตัวอักษรและลายนูน', kind: 'number', default: 1.4, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
]

const design = (id: string, name: string, blurb: string, look: KeyLook, text: string, font: string, colours: [string, string, string, string, string]): GiftDesign => ({
  id, name, blurb, group: 'keychain',
  params: PARAMS.map((p) => (p.key === 'name' ? { ...p, default: text, font } : p)),
  colours: [
    { key: 'base', label: 'ขอบนอก', default: colours[0] },
    { key: 'band', label: 'ขอบใน', default: colours[1] },
    { key: 'text', label: 'ตัวอักษร', default: colours[2] },
    { key: 'petal', label: 'ลายสีหลัก', default: colours[3] },
    { key: 'centre', label: 'ลายสีรอง', default: colours[4] },
  ],
  build: (ctx, v) => nameKey(ctx, v, look),
})

export const NAME_KEYS: GiftDesign[] = [
  design('key-shape2', 'พวงกุญแจชื่อ 2 สี', 'ตัวอักษรอ้วนบนขอบสีเดียว หัวใจเล็กพร้อมห่วงที่หัว', { icons: [{ kind: 'heart-leaf', at: 'start' }], bands: 1 }, 'Melis', 'fredoka', ['#c4b5fd', '#ffffff', '#ffffff', '#f472b6', '#4ade80']),
  design('key-shape3', 'พวงกุญแจชื่อ 3 สี', 'ตัวอักษรบนขอบสองชั้น ดอกไม้เล็กพร้อมห่วงที่หัว', { icons: [{ kind: 'flower', at: 'start' }], bands: 2 }, 'Samuel', 'cherry-bomb', ['#c4b5fd', '#ffffff', '#f472b6', '#86efac', '#f472b6']),
  design('key-double-heart', 'พวงกุญแจหัวใจกับตัวอักษร', 'หัวใจคู่กับตัวอักษรหรือชื่อสั้น บนขอบสีอ่อน', { icons: [{ kind: 'heart', at: 'start' }], bands: 1 }, 'E', 'coiny', ['#e9d5ff', '#ffffff', '#ffffff', '#fb7185', '#ffffff']),
  design('key-flower', 'พวงกุญแจชื่อดอกไม้', 'ชื่อตัวอ้วนขอบสองชั้น ดอกชบาสองดอกที่มุม', { icons: [{ kind: 'flower', at: 'topStart' }, { kind: 'flower', at: 'bottomEnd' }], bands: 2 }, 'Gabri', 'cherry-bomb', ['#f9a8d4', '#ec4899', '#ffffff', '#f472b6', '#facc15']),
  design('key-daisy-name', 'พวงกุญแจชื่อดอกเดซี่', 'ดอกเดซี่ที่หัว ชื่อตัวอ้วนขอบสองชั้น', { icons: [{ kind: 'daisy', at: 'start' }], bands: 2 }, 'Emma', 'cherry-bomb', ['#f9a8d4', '#ffffff', '#c084fc', '#ffffff', '#facc15']),
]
