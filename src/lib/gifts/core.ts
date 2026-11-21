import type * as THREE from 'three'
import { GIFT_FONTS } from '../fonts'
import { layoutRows, splits, withTab, words } from '../bubbleKeychain'
import { bounds, diff, islands, offset, roundRect, stroke, translate, union, type Region } from '../geo2d'
import { hb, type LoadedFont } from '../hb'
import { extrude, merge } from '../solid'
import { Parts } from '../styles/kit'
import type { SignPart } from '../styles'

/**
 * A personalised gift: a parametric design whose settings come from a small
 * list of parameters, built as stacked colour layers (flat extrusions), so one
 * page can show, preview and export every design the same way.
 */
export type GiftGroup = 'initial' | 'namesign' | 'award' | 'birth' | 'desk' | 'topper' | 'keychain' | 'home'

export const GIFT_GROUPS: { id: GiftGroup; name: string }[] = [
  { id: 'initial', name: 'ป้ายอักษรตัวแรก' },
  { id: 'namesign', name: 'ป้ายชื่อ' },
  { id: 'award', name: 'ถ้วยรางวัลกีฬา' },
  { id: 'birth', name: 'ป้ายวันเกิดทารก' },
  { id: 'desk', name: 'ของใช้บนโต๊ะ' },
  { id: 'topper', name: 'ป้ายปักเค้ก' },
  { id: 'keychain', name: 'พวงกุญแจ' },
  { id: 'home', name: 'ของแต่งบ้าน' },
]

export interface GiftOption {
  id: string
  label: string
}

export interface GiftParam {
  key: string
  label: string
  kind: 'text' | 'number' | 'choice' | 'toggle'
  default: string | number | boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
  /** Text: most characters (whole graphemes). */
  maxChars?: number
  /** Text: the font it starts in (an id from GIFT_FONTS); each text can change its own. */
  font?: string
  options?: GiftOption[]
  /** Shown only when another setting has this value. */
  when?: { key: string; is: (string | number | boolean)[] }
}

export interface GiftColour {
  key: string
  label: string
  default: string
}

/** One flat extrusion: the outline seen from above, its bottom and its height. */
export interface GiftLayer {
  colour: string
  region: Region
  z: number
  h: number
  /**
   * Standing layers (upright designs): the region is drawn as seen from the
   * front, its y is the height, and it is extruded towards the front from
   * the plane at y = stand (plus z) — a name plate on the front of a cup.
   */
  stand?: number
  /**
   * Wrapped layers (round containers): the region's x is the distance round
   * a cylinder of this radius (0 = straight ahead, the front), its y the
   * height; it is raised outwards by h from the cylinder, starting at z.
   */
  wrap?: number
}

/** Which plane a layer lies in: only layers in the same plane can overlap. */
const planeOf = (l: GiftLayer) => (l.wrap !== undefined ? `w${l.wrap}` : l.stand !== undefined ? `s${l.stand}` : 'flat')

export type GiftValues = Record<string, string | number | boolean>

export interface GiftContext {
  /** The font for text that names no font of its own. */
  font: LoadedFont
  /** Loaded fonts by id, for texts with their own font. */
  fonts?: Record<string, LoadedFont>
}

/** The value key that holds a text's font id. */
export const fontKey = (key: string) => `${key}@font`
export const DEFAULT_GIFT_FONT = 'kanit-bold'

/** The font a text should be drawn in: its own choice when loaded, else the context font. */
export function fontOf(ctx: GiftContext, v: GiftValues, key: string): LoadedFont {
  return ctx.fonts?.[String(v[fontKey(key)] ?? '')] ?? ctx.font
}

/** Font ids a design needs for these values. */
export function neededFonts(design: GiftDesign, v: GiftValues): string[] {
  const ids = design.params.filter((p) => p.kind === 'text').map((p) => String(v[fontKey(p.key)] ?? p.font ?? DEFAULT_GIFT_FONT))
  return [...new Set([DEFAULT_GIFT_FONT, ...ids])]
}

export interface GiftResult {
  layers: GiftLayer[]
  warning?: string
}

export interface GiftDesign {
  id: string
  name: string
  group: GiftGroup
  blurb: string
  params: GiftParam[]
  colours: GiftColour[]
  /** Extra lines for the print readme. */
  howTo?: string[]
  /** Modelled standing up in print orientation (cups, bookends): the preview turns it to face the viewer. */
  upright?: boolean
  /**
   * Printed turned over (face down on the bed), like lit boxes whose face is
   * a bridge in this orientation: support is checked the other way up.
   */
  printFlipped?: boolean
  /** Has overhangs by nature (an ambigram): printed with supports, so not checked for them. */
  needsSupport?: boolean
  build(ctx: GiftContext, v: GiftValues): GiftResult
}

// ——— settings ———

const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })
export const graphemeCount = (text: string) => Array.from(segmenter.segment(text)).length

export function cleanText(text: string, maxChars = 24) {
  const out: string[] = []
  for (const { segment } of segmenter.segment(text.replace(/\s+/g, ' ').replace(/^ /, ''))) {
    if (out.length === maxChars) break
    out.push(segment)
  }
  return out.join('')
}

/** Values read back from storage, each within its parameter's rules. */
export function cleanValues(design: GiftDesign, raw: unknown): GiftValues {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: GiftValues = {}
  for (const p of design.params) {
    const v = o[p.key]
    if (p.kind === 'text') {
      out[p.key] = typeof v === 'string' ? cleanText(v, p.maxChars) : (p.default as string)
      const f = o[fontKey(p.key)]
      out[fontKey(p.key)] = typeof f === 'string' && GIFT_FONTS.some((x) => x.id === f) ? f : (p.font ?? DEFAULT_GIFT_FONT)
    }
    else if (p.kind === 'toggle') out[p.key] = typeof v === 'boolean' ? v : (p.default as boolean)
    else if (p.kind === 'choice') out[p.key] = p.options?.some((op) => op.id === v) ? (v as string) : (p.default as string)
    else {
      const n = typeof v === 'number' && Number.isFinite(v) ? v : (p.default as number)
      const step = p.step ?? 1
      const clamped = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, n))
      const origin = p.min ?? 0
      out[p.key] = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, Number((origin + Math.round((clamped - origin) / step) * step).toFixed(3))))
    }
  }
  return out
}

export const defaults = (design: GiftDesign) => cleanValues(design, {})

export interface SavedGift {
  values?: unknown
  colours?: Record<string, string>
  fontId?: string
}

/** Ignore corrupt entries individually so one bad draft does not lose the rest. */
export function parseGiftStorage(raw: string): Record<string, SavedGift> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry)))
  } catch {
    return {}
  }
}

/** Parameters every flat design shares: thickness of the body and the raised layer. */
export const THICKNESS: GiftParam[] = [
  { key: 'base', label: 'ความหนาฐาน', kind: 'number', default: 4, min: 1.6, max: 10, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ตัวอักษรและลายนูน', kind: 'number', default: 1.2, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
]

export const LOOP: GiftParam = { key: 'loop', label: 'หูห้อยพร้อมรู', kind: 'toggle', default: true, hint: 'รู 3.5 มม.' }

export const num = (v: GiftValues, key: string) => Number(v[key])
export const str = (v: GiftValues, key: string) => String(v[key] ?? '')

// ——— text ———

/** The text missing from the font, if any. */
export function missingGlyphs(font: LoadedFont, text: string) {
  if (!text.trim()) return false
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(font.hbFont, buffer)
  return buffer.getGlyphInfos().some((g) => g.codepoint === 0)
}

const scaleBy = (region: Region, k: number): Region => region.map((poly) => poly.map(([x, y]) => [x * k, y * k] as [number, number]))

/** Rows of text at `height` mm per em, centred on the origin. */
export function textArt(font: LoadedFont, rows: string[], height: number): Region {
  const unit = layoutRows(font, rows.filter((r) => r.trim()), new Map())
  return unit.length ? union(scaleBy(unit, height)) : []
}

/**
 * The text at the largest em height up to `cap` that fits `maxW` × `maxH`,
 * on one row or (if allowed and better) two rows split at a space.
 */
export function fitText(font: LoadedFont, text: string, maxW: number, maxH: number, cap: number, twoRows = true) {
  const cache = new Map<string, Region>()
  const list = words(text)
  const options = [[text.trim()], ...(twoRows && list.length > 1 ? splits(list, 2) : [])]
  let best = { rows: [] as string[], h: 0, unit: [] as Region }
  for (const rows of options) {
    const unit = layoutRows(font, rows, cache)
    if (!unit.length) continue
    const b = bounds(unit)
    const h = Math.min(cap, maxW / b.w, maxH / b.h)
    if (h > best.h * (best.rows.length === 1 ? 1.25 : 1)) best = { rows, h, unit }
  }
  return { rows: best.rows, height: best.h, art: best.unit.length ? union(scaleBy(best.unit, best.h)) : [] }
}

// ——— shapes ———

/** Holes smaller than `maxArea` mm² filled in (gaps closed by joining a plinth or a bar). */
export function fillSmallHoles(region: Region, maxArea: number): Region {
  const small = region.filter((poly) => area(poly) < 0 && -area(poly) <= maxArea)
  // A hole turned the other way round is a solid patch that covers it.
  return small.length ? union(region, small.map((poly) => poly.slice().reverse())) : region
}

/** Outline only: holes (counters, cut-out details) filled in. */
export const filled = (region: Region): Region => union(region.filter((poly) => area(poly) > 0))

function area(poly: [number, number][]) {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}


export { withTab }

/** Join detached marks in structural letters while retaining their counters. */
export function connectedLetter(region: Region): Region {
  const pieces = islands(region).sort((a, b) => Math.abs(area(b[0])) - Math.abs(area(a[0])))
  if (pieces.length < 2) return region
  const joined = [pieces.shift()!]
  const bridges: Region[] = []
  while (pieces.length) {
    let best = { distance: Infinity, index: 0, a: [0, 0] as [number, number], b: [0, 0] as [number, number] }
    pieces.forEach((piece, index) => {
      for (const a of piece[0]) for (const other of joined) for (const b of other[0]) {
        const distance = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
        if (distance < best.distance) best = { distance, index, a, b }
      }
    })
    bridges.push(stroke([best.a, best.b], 1.6))
    joined.push(pieces.splice(best.index, 1)[0])
  }
  return union(region, ...bridges)
}

/** A centred foot gives a flat-printed sign real depth when stood on its edge. */
export function standingFoot(region: Region, colour: string, top: number, height = 6): GiftLayer {
  const b = bounds(region)
  const depth = Math.max(24, b.h * 0.22, top)
  return {
    colour,
    region: roundRect(b.cx, b.minY - height / 2 + 2, Math.max(30, b.w + 4), height, 2),
    z: (top - depth) / 2,
    h: depth,
  }
}

// ——— layers to parts ———

/**
 * Later layers win where layers overlap in plan and in height, so no two
 * colours ever fill the same space (a multi-colour slicer needs that).
 */
export function resolve(layers: GiftLayer[]): GiftLayer[] {
  const out: GiftLayer[] = []
  const valid = layers.filter((l) => l.region.length && l.h > 0 && Number.isFinite(l.z) && Number.isFinite(l.h))
  const boxes = valid.map((l) => bounds(l.region))
  for (let i = 0; i < valid.length; i++) {
    const layer = valid[i]
    const box = boxes[i]
    const cutters = valid.slice(i + 1).filter((b, j) => {
      const bb = boxes[i + 1 + j]
      return box.minX < bb.maxX && bb.minX < box.maxX && box.minY < bb.maxY && bb.minY < box.maxY &&
        planeOf(layer) === planeOf(b) && b.z < layer.z + layer.h - 1e-6 && layer.z < b.z + b.h - 1e-6
    })
    const cuts = [...new Set([layer.z, layer.z + layer.h, ...cutters.flatMap((b) =>
      [Math.max(layer.z, b.z), Math.min(layer.z + layer.h, b.z + b.h)])])].sort((a, b) => a - b)
    for (let k = 0; k < cuts.length - 1; k++) {
      const z = cuts[k], end = cuts[k + 1]
      const clips = cutters.filter((b) => b.z < end - 1e-6 && b.z + b.h > z + 1e-6)
      out.push({ ...layer, z, h: end - z, region: clips.length ? diff(layer.region, union(...clips.map((b) => b.region))) : layer.region })
    }
  }
  // Opened a hair: cuts and unions can leave edges that touch
  // along a line (a hole meeting its outline), which does not close as a solid.
  // Specks under 0.1 mm² are dropped too: they print as nothing and break the mesh.
  for (const l of out) {
    const opened = offset(offset(l.region, -0.05), 0.05)
    // Clipper's 0.001 mm rounding can leave edges shorter than STL welding
    // tolerance at acute cuts. Remove those redundant vertices before meshing.
    const clean = opened.map((poly) => {
      const points: [number, number][] = []
      for (const p of poly) {
        const last = points.at(-1)
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.005) points.push(p)
      }
      if (points.length > 1 && Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) < 0.005) points.pop()
      return points
    }).filter((poly) => poly.length >= 3)
    l.region = islands(union(clean)).filter((island) => area(island[0]) >= 0.1).flat()
  }
  return out.filter((l) => l.region.length && l.h > 0)
}

export interface GiftModel {
  parts: SignPart[]
  /** Part code → preview colour. */
  tints: Record<string, string>
  width: number
  height: number
  thickness: number
  layers: GiftLayer[]
  warning?: string
}

/** One part per colour (merged layers), named after the design's colour list. */
export function toModel(design: GiftDesign, result: GiftResult, colours: Record<string, string>): GiftModel {
  const layers = resolve(result.layers)
  const parts = new Parts()
  const tints: Record<string, string> = {}
  const order = design.colours.filter((c) => layers.some((l) => l.colour === c.key))
  // The exploded view lifts colours in the order they stack: a colour's place is
  // its lowest layer, so nothing lower ever rises through something above it.
  const base = (key: string) => Math.min(...layers.filter((l) => l.colour === key).map((l) => l.z))
  const lift = new Map([...new Set(order.map((c) => base(c.key)))].sort((a, b) => a - b).map((z, i) => [z, i * 0.6]))
  order.forEach((c) => {
    const geometries: THREE.BufferGeometry[] = layers.filter((l) => l.colour === c.key).map((l) => {
      if (l.wrap !== undefined) return wrapped(l)
      const g = extrude(l.region, l.h, l.z)
      // Stand it up: drawing y becomes height, the extrusion points to the front (−y).
      if (l.stand !== undefined) g.rotateX(Math.PI / 2).translate(0, l.stand, 0)
      return g
    })
    const geometry = merge(geometries)
    geometries.forEach((g) => g.dispose())
    parts.solid(c.label, 'print', geometry, lift.get(base(c.key)) ?? 0)
  })
  const list = parts.done()
  list.forEach((p, i) => (tints[p.code] = colours[order[i].key] ?? order[i].default))
  // Size from the solids themselves, so standing parts count too.
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (const part of list) {
    part.geometry.computeBoundingBox()
    const bb = part.geometry.boundingBox!
    box.minX = Math.min(box.minX, bb.min.x); box.maxX = Math.max(box.maxX, bb.max.x)
    box.minY = Math.min(box.minY, bb.min.y); box.maxY = Math.max(box.maxY, bb.max.y)
    box.minZ = Math.min(box.minZ, bb.min.z); box.maxZ = Math.max(box.maxZ, bb.max.z)
  }
  const some = list.length > 0
  const thinText = result.layers.some((l) => ['text', 'name'].includes(l.colour) &&
    islands(l.region).some((island) => !offset(island, -0.5).length))
  const warning = [result.warning,
    thinText ? 'ตัวอักษรบางส่วนเล็กกว่า 1 มม. ลองเพิ่มขนาดหรือลดข้อความ' : undefined,
    layers.some((l) => l.z < 0) ? 'ฐานตั้งยื่นสองด้าน เปิดซัพพอร์ตใต้แผ่นป้ายและตรวจทิศทางก่อนพิมพ์' : undefined,
    some && Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) > 256
      ? 'ชิ้นงานใหญ่กว่าฐานพิมพ์ทั่วไป (256 มม.) ลดขนาด หรือตัดแบ่งใน slicer แล้วต่อด้วยกาว' : undefined,
    some && box.minZ < -0.01 && !layers.some((l) => l.z < 0) ? 'บางส่วนต่ำกว่าฐานพิมพ์ ลดขนาดตัวอักษรหรือข้อความ' : undefined,
  ].filter(Boolean).join('\n') || undefined
  return {
    parts: list, tints, layers, warning,
    width: some ? box.maxX - box.minX : 0,
    height: some ? box.maxY - box.minY : 0,
    thickness: some ? box.maxZ - box.minZ : 0,
  }
}

/** SVG path data, y flipped, for one region. */
export function svgPath(region: Region) {
  return region.map((poly) => 'M' + poly.map(([x, y]) => `${x.toFixed(2)} ${(-y).toFixed(2)}`).join('L') + 'Z').join('')
}

/** A top view of the design for catalogue cards: layers drawn bottom to top. */
export function topView(layers: GiftLayer[], colours: Record<string, string>, upright = false) {
  if (upright) layers = frontView(layers)
  const all = layers.flatMap((l) => l.region)
  if (!all.length) return null
  const b = bounds(all)
  const pad = Math.max(b.w, b.h) * 0.06
  const sorted = [...layers].sort((a, c) => a.z + a.h - (c.z + c.h))
  return {
    viewBox: `${(b.minX - pad).toFixed(2)} ${(-b.maxY - pad).toFixed(2)} ${(b.w + 2 * pad).toFixed(2)} ${(b.h + 2 * pad).toFixed(2)}`,
    paths: sorted.map((l) => ({ d: svgPath(l.region), fill: colours[l.colour] ?? '#cccccc' })),
  }
}

/**
 * An upright design seen from the front: flat layers become their width ×
 * height boxes, standing layers keep their drawing, front-most drawn last.
 */
function frontView(layers: GiftLayer[]): GiftLayer[] {
  const flat = layers.filter((l) => l.stand === undefined && l.wrap === undefined && l.region.length).map((l) => {
    const b = bounds(l.region)
    const region: Region = union(...islands(l.region).map((piece) => {
      const p = bounds(piece)
      return [[[p.minX, l.z], [p.maxX, l.z], [p.maxX, l.z + l.h], [p.minX, l.z + l.h]]] as Region
    }))
    return { ...l, region, z: -b.minY, h: 0 }
  })
  const standing = layers.filter((l) => l.stand !== undefined).map((l) => ({ ...l, z: 1e6 - (l.stand ?? 0) + l.z, h: 0 }))
  const round = layers.filter((l) => l.wrap !== undefined).map((l) => ({ ...l, region: translate(l.region, 0, l.z), z: 2e6, h: 0 }))
  standing.push(...round)
  return [...flat, ...standing]
}

/**
 * A wrapped layer as a solid: the flat drawing, with its edges split into
 * short steps, extruded and bent round the cylinder.
 */
function wrapped(l: GiftLayer): THREE.BufferGeometry {
  const R = l.wrap!
  const step = 1
  const fine = l.region.map((poly) => poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length]
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step))
    return Array.from({ length: n }, (_, k) => [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n] as [number, number])
  }))
  const g = extrude(fine, l.h, 0)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i) / R
    const r = R + pos.getZ(i)
    pos.setXYZ(i, Math.sin(a) * r, -Math.cos(a) * r, pos.getY(i) + l.z)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return g
}
