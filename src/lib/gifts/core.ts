import type * as THREE from 'three'
import { layoutRows, splits, withTab, words } from '../bubbleKeychain'
import { bounds, diff, union, type Region } from '../geo2d'
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
}

export type GiftValues = Record<string, string | number | boolean>

export interface GiftContext {
  font: LoadedFont
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
    if (p.kind === 'text') out[p.key] = typeof v === 'string' ? cleanText(v, p.maxChars) : (p.default as string)
    else if (p.kind === 'toggle') out[p.key] = typeof v === 'boolean' ? v : (p.default as boolean)
    else if (p.kind === 'choice') out[p.key] = p.options?.some((op) => op.id === v) ? (v as string) : (p.default as string)
    else {
      const n = typeof v === 'number' && Number.isFinite(v) ? v : (p.default as number)
      const step = p.step ?? 1
      const clamped = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, n))
      out[p.key] = Number((Math.round(clamped / step) * step).toFixed(3))
    }
  }
  return out
}

export const defaults = (design: GiftDesign) => cleanValues(design, {})

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

// ——— layers to parts ———

/**
 * Later layers win where layers overlap in plan and in height, so no two
 * colours ever fill the same space (a multi-colour slicer needs that).
 */
export function resolve(layers: GiftLayer[]): GiftLayer[] {
  const out = layers.map((l) => ({ ...l }))
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i]
      const b = out[j]
      if (a.z >= b.z + b.h - 1e-6 || b.z >= a.z + a.h - 1e-6) continue
      a.region = diff(a.region, b.region)
    }
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
  order.forEach((c, i) => {
    const geometries: THREE.BufferGeometry[] = layers.filter((l) => l.colour === c.key).map((l) => extrude(l.region, l.h, l.z))
    const geometry = merge(geometries)
    geometries.forEach((g) => g.dispose())
    parts.solid(c.label, 'print', geometry, i * 0.6)
  })
  const list = parts.done()
  list.forEach((p, i) => (tints[p.code] = colours[order[i].key] ?? order[i].default))
  const all = union(...layers.map((l) => l.region))
  const b = all.length ? bounds(all) : { w: 0, h: 0 }
  const thickness = layers.reduce((m, l) => Math.max(m, l.z + l.h), 0)
  return { parts: list, tints, width: b.w, height: b.h, thickness, layers, warning: result.warning }
}

/** SVG path data, y flipped, for one region. */
export function svgPath(region: Region) {
  return region.map((poly) => 'M' + poly.map(([x, y]) => `${x.toFixed(2)} ${(-y).toFixed(2)}`).join('L') + 'Z').join('')
}

/** A top view of the design for catalogue cards: layers drawn bottom to top. */
export function topView(layers: GiftLayer[], colours: Record<string, string>) {
  const all = union(...layers.map((l) => l.region))
  if (!all.length) return null
  const b = bounds(all)
  const pad = Math.max(b.w, b.h) * 0.06
  const sorted = [...layers].sort((a, c) => a.z + a.h - (c.z + c.h))
  return {
    viewBox: `${(b.minX - pad).toFixed(2)} ${(-b.maxY - pad).toFixed(2)} ${(b.w + 2 * pad).toFixed(2)} ${(b.h + 2 * pad).toFixed(2)}`,
    paths: sorted.map((l) => ({ d: svgPath(l.region), fill: colours[l.colour] ?? '#cccccc' })),
  }
}
