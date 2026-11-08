import * as ClipperLib from 'clipper-lib'
import { bounds, circle, diff, intersect, islands, offset, regionArea, regionFromShapes, translate, union, type Bounds, type Region } from './geo2d'
import { hb, type LoadedFont } from './hb'
import { silhouette, Parts } from './styles/kit'
import type { SignPart } from './styles'
import { shapeTextToShapes } from './textToShapes'

/** A name keychain: puffy lettering on a coloured outline, on a flat base. */
export type BubbleShape = 'circle' | 'contour'

export interface BubbleOptions {
  text: string
  /** 0 lets the page choose the row count that gives the tallest letters. */
  rows: number
  shape: BubbleShape
  /** Circle diameter, or the longest side of a contour keychain, in mm. */
  size: number
  /** Base plate thickness. */
  base: number
  /** Height of the outline layer above the base. */
  puff: number
  /** How far the letters stand above the outline layer. */
  letter: number
  /** Width of the outline around the letters. */
  outline: number
  /** A tab with a hole for the key ring. */
  loop: boolean
}

export interface BubbleColours {
  base: string
  bubble: string
  letter: string
}

export const DEFAULT_BUBBLE: BubbleOptions = {
  text: 'JJ Design',
  rows: 0,
  shape: 'circle',
  size: 50,
  base: 2,
  puff: 2.4,
  letter: 1.2,
  outline: 2,
  loop: true,
}

export const MAX_CHARS = 24
export const MAX_ROWS = 4
/** Plain base showing round the outline, in mm. */
export const RIM = 1.4
/** Letters are fattened by this share of their em height for the puffy look. */
const FAT = 0.05
const LINE_GAP = 1.08
/** Extra space after each letter, as a share of the em. */
const TRACKING = 0.05
/** The key-ring tab: outer radius, hole radius and how far it sits past the base. */
export const TAB = { r: 4, hole: 1.75, reach: 2.4 }
/** Smaller letters than this print poorly on a 0.4 mm nozzle. */
export const SMALL_LETTER = 5

/** Colour sets named for Thai places and flowers. Base, outline, letters. */
export const PALETTES: { id: string; name: string; colours: BubbleColours }[] = [
  { id: 'mono', name: 'ขาวดำ', colours: { base: '#f4f4f1', bubble: '#1d1d1f', letter: '#ffffff' } },
  { id: 'andaman', name: 'ทะเลอันดามัน', colours: { base: '#e3f5f6', bubble: '#0e7c8c', letter: '#ffffff' } },
  { id: 'ratchaphruek', name: 'ราชพฤกษ์', colours: { base: '#fff4cf', bubble: '#e0a400', letter: '#5a3b00' } },
  { id: 'chaba', name: 'ชบา', colours: { base: '#ffe7e8', bubble: '#d62839', letter: '#ffffff' } },
  { id: 'baitong', name: 'ใบตอง', colours: { base: '#ecf5e3', bubble: '#3f8f3a', letter: '#fdfbea' } },
  { id: 'doi', name: 'ดอยหมอก', colours: { base: '#eef1f6', bubble: '#5b6b8c', letter: '#ffffff' } },
  { id: 'sontaya', name: 'สนธยา', colours: { base: '#ffe6d3', bubble: '#ff6b35', letter: '#2b1a4a' } },
  { id: 'bua', name: 'บึงบัว', colours: { base: '#fff0f5', bubble: '#e5739a', letter: '#ffffff' } },
  { id: 'night', name: 'ฟ้ายามค่ำ', colours: { base: '#1f2440', bubble: '#f6c945', letter: '#1f2440' } },
  { id: 'sak', name: 'ไม้สัก', colours: { base: '#f3e6d3', bubble: '#8a5a2b', letter: '#fff8ec' } },
  { id: 'rain', name: 'ฟ้าหลังฝน', colours: { base: '#ffffff', bubble: '#4aa3df', letter: '#fff27a' } },
  { id: 'emerald', name: 'มรกต', colours: { base: '#e3f4ee', bubble: '#0b6e4f', letter: '#f2e8c9' } },
  { id: 'som', name: 'ส้มสายน้ำผึ้ง', colours: { base: '#fff3e0', bubble: '#f28c28', letter: '#ffffff' } },
  { id: 'ember', name: 'ถ่านไฟ', colours: { base: '#2b2b2b', bubble: '#ff4d2e', letter: '#ffd23f' } },
  { id: 'cloud', name: 'ปุยเมฆ', colours: { base: '#f2f6ff', bubble: '#b8c7ff', letter: '#3a3f73' } },
  { id: 'coral', name: 'ปะการัง', colours: { base: '#fff1ec', bubble: '#ff7f6a', letter: '#ffffff' } },
]

const HEX = /^#[0-9a-f]{6}$/i
const layer = (n: number) => Math.round(n / 0.2) / 5
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** Options read back from storage or a link, with every value in range. */
export function cleanBubble(raw: unknown): BubbleOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_BUBBLE
  return {
    text: typeof o.text === 'string' ? cleanText(o.text) : d.text,
    rows: Math.round(num(o.rows, 0, MAX_ROWS, d.rows)),
    shape: o.shape === 'contour' ? 'contour' : 'circle',
    size: num(o.size, 30, 80, d.size),
    base: layer(num(o.base, 1.2, 4, d.base)),
    puff: layer(num(o.puff, 0.8, 5, d.puff)),
    letter: layer(num(o.letter, 0.4, 3, d.letter)),
    outline: num(o.outline, 1.2, 5, d.outline),
    loop: typeof o.loop === 'boolean' ? o.loop : d.loop,
  }
}

export function cleanColours(raw: unknown): BubbleColours {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = PALETTES[0].colours
  const pick = (k: keyof BubbleColours) => (typeof o[k] === 'string' && HEX.test(o[k] as string) ? (o[k] as string).toLowerCase() : d[k])
  return { base: pick('base'), bubble: pick('bubble'), letter: pick('letter') }
}

/** One line, single spaces, at most MAX_CHARS characters (whole graphemes). */
const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })
export const graphemes = (text: string) => Array.from(segmenter.segment(text), (s) => s.segment)

export function cleanText(text: string) {
  const flat = text.replace(/\s+/g, ' ').replace(/^ /, '')
  return graphemes(flat).slice(0, MAX_CHARS).join('')
}

export const words = (text: string) => text.trim().split(/\s+/).filter(Boolean)

/** Every way to cut `list` into `k` consecutive, non-empty rows. */
export function splits(list: string[], k: number): string[][] {
  if (k <= 1 || list.length <= 1) return [list.join(' ')].filter(Boolean).map((row) => [row])
  if (k > list.length) return []
  const out: string[][] = []
  for (let i = 1; i <= list.length - k + 1; i++) {
    const head = list.slice(0, i).join(' ')
    for (const rest of splits(list.slice(i), k - 1)) out.push([head, ...rest])
  }
  return out
}

/** Rows of text laid out at a 1 mm em height, centred on the origin. */
function layoutRows(font: LoadedFont, rows: string[], cache: Map<string, Region>): Region {
  // Work at 100 mm em so geo2d's physical area cutoff preserves Thai marks.
  const unit = 100 / font.upem
  const shaped = rows.map((row) => {
    let region = cache.get(row)
    if (!region) {
      // A little extra letter spacing leaves room for the outline between letters.
      region = scaleRegion(regionFromShapes(shapeTextToShapes(font, row, TRACKING * font.upem).shapes, unit), 0.01)
      cache.set(row, region)
    }
    return region
  })
  let bottom = Infinity
  let baseline = 0
  const placed = shaped.map((region, i) => {
    if (!region.length) return region
    const b = bounds(region)
    // Stacked Thai marks can extend past an em; do not collide with the next row.
    baseline = i === 0 ? 0 : Math.min(baseline - LINE_GAP, bottom - b.maxY - TRACKING)
    bottom = b.minY + baseline
    return translate(region, -(b.minX + b.maxX) / 2, baseline)
  })
  // Candidate fitting needs vertices only, not an expensive polygon union.
  const all = placed.flat()
  if (!all.length) return all
  const b = bounds(all)
  return translate(all, -(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2)
}

/** Farthest point of a region from the origin. */
function reach(region: Region) {
  let r = 0
  for (const poly of region) for (const [x, y] of poly) r = Math.max(r, Math.hypot(x, y))
  return r
}

/** Room for the outline layer: the circle less the rim and the outline. */
function room(o: BubbleOptions) {
  return o.shape === 'circle' ? o.size / 2 - RIM - o.outline : o.size - 2 * (RIM + o.outline)
}

/**
 * The em height that fits a 1 mm layout into the keychain. Fattening grows
 * with the letters, the outline and rim do not, so this is exact.
 */
function fitHeight(art: Region, o: BubbleOptions) {
  if (!art.length) return 0
  const space = room(o)
  if (space <= 0) return 0
  if (o.shape === 'circle') return space / (reach(art) + FAT)
  const b = bounds(art)
  return space / (Math.max(b.w, b.h) + 2 * FAT)
}

export interface BubbleLayout {
  rows: string[]
  /** Em height of the letters in mm. */
  height: number
}

/** The split into rows that gives the tallest letters, honouring a fixed row count. */
export function chooseRows(font: LoadedFont, o: BubbleOptions, cache = new Map<string, Region>()): BubbleLayout {
  const list = words(o.text)
  if (!list.length) return { rows: [], height: 0 }
  const counts = o.rows > 0 ? [Math.min(o.rows, list.length)] : Array.from({ length: Math.min(MAX_ROWS, list.length) }, (_, i) => i + 1)
  let best: BubbleLayout = { rows: [], height: 0 }
  for (const k of counts) {
    for (const rows of splits(list, k)) {
      const height = fitHeight(layoutRows(font, rows, cache), o)
      // Fewer rows win ties, so a short name stays on one line.
      if (height > best.height * 1.03) best = { rows, height }
    }
  }
  return best
}

export interface BubbleModel {
  parts: SignPart[]
  colours: Record<string, string>
  rows: string[]
  /** Em height of the letters, mm. */
  letterHeight: number
  width: number
  height: number
  warning?: string
}

/**
 * Builds the keychain as three stacked layers that line up exactly, one per
 * filament colour: base, outline and letters.
 */
export function buildBubble(font: LoadedFont, o: BubbleOptions, colours: BubbleColours): BubbleModel {
  const empty: BubbleModel = { parts: [], colours: {}, rows: [], letterHeight: 0, width: 0, height: 0 }
  const buffer = new hb.Buffer()
  buffer.addText(o.text.trim())
  buffer.guessSegmentProperties()
  hb.shape(font.hbFont, buffer)
  const missing = buffer.getGlyphInfos().some((g) => g.codepoint === 0)
  if (missing) return { ...empty, warning: 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ' }
  const cache = new Map<string, Region>()
  const layout = chooseRows(font, o, cache)
  if (!layout.rows.length || layout.height <= 0) return empty
  const h = layout.height
  const art = simplify(union(scaleRegion(layoutRows(font, layout.rows, cache), h)))
  // Fatten for round, puffy strokes, but only as far as letters, marks and
  // counters stay apart: the outline colour must still show between them.
  let face = puffUp(art, FAT * h)
  // One outline piece behind all the letters, counters filled.
  let bubble = silhouette(face, o.outline)
  let base: Region
  if (o.shape === 'circle') {
    const R = o.size / 2
    // Rounding in the offsets may overshoot by a hair; keep the rim clear.
    const inner = circle(0, 0, R - RIM, 128)
    bubble = intersect(bubble, inner)
    face = intersect(face, bubble)
    base = circle(0, 0, R, 160)
  } else {
    base = silhouette(bubble, RIM)
  }
  // Offset closing can leave coincident edges; canonicalize before triangulation.
  bubble = union(bubble)
  if (o.loop) base = withTab(base)
  const parts = new Parts()
    .slab('ฐาน', 'print', base, o.base, 0, 0)
    .slab('ขอบบับเบิล', 'print', bubble, o.puff, o.base, 0.6)
    .slab('ตัวอักษร', 'print', face, o.letter, o.base + o.puff, 1.2)
    .done()
  const tint = [colours.base, colours.bubble, colours.letter]
  const tints: Record<string, string> = {}
  parts.forEach((part, i) => (tints[part.code] = tint[i]))
  const b = bounds(base)
  return {
    parts,
    colours: tints,
    rows: layout.rows,
    letterHeight: h,
    width: b.w,
    height: b.h,
    warning: printWarnings(face, h, o).join(' ') || undefined,
  }
}

/** Narrowest gap of outline colour left between letters, marks and inside counters, mm. */
export const SEAM = 0.5

/**
 * Puffs the letters up by as much as `max`. Each letter or mark grows on its
 * own, as far as its counters stay open, and where two pieces would meet a
 * SEAM-wide gap is cut back so the outline colour still shows between them.
 * Smaller pieces (vowels, tone marks, dots) are placed first, so a bigger
 * letter gives way to them rather than the reverse.
 */
export function puffUp(art: Region, max: number): Region {
  const pieces = islands(art).sort((a, b) => regionArea(a) - regionArea(b))
  // A tight counter limits only its own letter. Check consecutive offsets:
  // a single coarse offset does not describe the actual grown counter.
  const growths = pieces.map((piece) => {
    // Letters without counters are checked too: growth that pinches a narrow
    // channel shut makes a new pocket, and that must stop it as well.
    const holes = piece.length - 1
    const counters = piece.slice(1).map((poly) => poly.slice().reverse())
    const preserved = (region: Region) => {
      const remaining = region.filter((poly) => regionArea([poly]) < 0).map((poly) => poly.slice().reverse())
      return remaining.length === holes && counters.every((counter) =>
        remaining.some((hole) => regionArea(intersect([counter], [hole])) > 0))
    }
    const open = (d: number) => {
      const grown = offset(piece, d)
      return preserved(grown) && preserved(offset(grown, SEAM / 2))
    }
    if (open(max)) return max
    let lo = 0
    let hi = max
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2
      if (open(mid)) lo = mid
      else hi = mid
    }
    return lo
  })
  const areas = pieces.map((p) => regionArea(p))
  const median = areas[Math.floor((areas.length - 1) / 2)] ?? 0
  const boxes = pieces.map((p) => bounds(p))
  const reach = max + SEAM + 0.1
  const buffered = pieces.map((piece) => seamFence(piece))
  const close = (a: Bounds, b: Bounds) =>
    a.minX - reach < b.maxX && b.minX - reach < a.maxX && a.minY - reach < b.maxY && b.minY - reach < a.maxY
  const placed: { region: Region; fence: Region; box: Bounds }[] = []
  pieces.forEach((piece, i) => {
    const lo = growths[i]
    const box = boxes[i]
    // Only pieces within reach matter; this keeps long names fast.
    const before = placed.filter((p) => close(box, p.box)).map((p) => p.fence)
    const others = buffered.filter((_, j) => j !== i && close(box, boxes[j]))
    const fence = before.flat()
    // Growth never comes within SEAM of a neighbour's outline or its growth.
    const keepOut = [...fence, ...others.flat()]
    // Fill only pockets created by puffing, before cutting neighbour clearance:
    // a clearance pocket around another mark must stay empty.
    const counters = piece.slice(1).map((poly) => poly.slice().reverse())
    const expanded = lo > 0.02 ? offset(piece, lo).filter((poly) => regionArea([poly]) > 0 ||
      (counters.length > 0 && regionArea(intersect([poly.slice().reverse()], counters)) > 0)) : []
    const growth = keepOut.length ? diff(expanded, keepOut) : expanded
    // Marks and small letters keep their whole outline; a big letter gives
    // way by a seam where the font set it closer than SEAM to a smaller piece.
    const core = areas[i] <= median || !fence.length ? piece : diff(piece, fence)
    let grown = growth.length ? union(core, growth) : core
    // Remove new detached seam-cut specks, never an original small mark.
    if (areas[i] > median) {
      const fragments = islands(grown)
      if (fragments.length > 1) {
        const main = fragments.reduce((a, b) => regionArea(a) >= regionArea(b) ? a : b)
        grown = fragments.filter((part) => part === main || offset(part, -0.2).length > 0).flat()
      }
    }
    if (grown.length) placed.push({ region: grown, fence: seamFence(grown), box: bounds(grown) })
  })
  return union(...placed.map((p) => p.region))
}

/** Warn without removing marks or changing designs that already print well. */
export function printWarnings(face: Region, h: number, o: BubbleOptions) {
  const warnings: string[] = []
  const thin = thinFeatures(face)
  const grown = offset(face, 0.22)
  const outerCount = (region: Region) => region.filter((poly) => regionArea([poly]) > 0).length
  const count = outerCount(face)
  const grownCount = outerCount(grown)
  const narrow = grownCount < count || grown.length - grownCount !== face.length - count
  if (h < SMALL_LETTER && (thin || narrow)) warnings.push(`ตัวอักษรสูงแค่ ${h.toFixed(1)} มม. อาจพิมพ์ไม่คม ลองเพิ่มขนาด ลดจำนวนตัวอักษร หรือเว้นวรรคให้แบ่งแถวได้`)
  if (thin)
    warnings.push('มีจุดหรือเส้นตัวอักษรเล็กกว่า 0.4 มม. อาจพิมพ์ไม่ติด ตรวจภาพแบ่งชั้นก่อนพิมพ์')
  if (narrow)
    warnings.push('มีช่องระหว่างตัวอักษรหรือช่องในตัวอักษรแคบกว่า 0.45 มม. อาจพิมพ์ตัน')
  if ([o.base, o.puff, o.letter].some((v) => Math.abs(v / 0.2 - Math.round(v / 0.2)) > 1e-6))
    warnings.push('ความหนาบางชั้นหารด้วย 0.2 มม. ไม่ลงตัว สีอาจเปลี่ยนไม่ตรงรอยต่อ')
  return warnings
}

/** Whether any piece or stroke is under 0.4 mm wide. Checks the whole region at once, for speed. */
function thinFeatures(region: Region) {
  const core = offset(region, -0.2)
  // Counting islands can miss a vanished dot when another stroke splits in two.
  // Erosion stays inside the input, so one core point proves a piece survived.
  const points = core.filter((poly) => regionArea([poly]) > 0).map((poly) => ({ X: poly[0][0], Y: poly[0][1] }))
  if (islands(region).some((piece) => {
    const [outer, ...holes] = piece.map((poly) => poly.map(([X, Y]) => ({ X, Y })))
    return !points.some((point) => ClipperLib.Clipper.PointInPolygon(point, outer) !== 0 &&
      holes.every((hole) => ClipperLib.Clipper.PointInPolygon(point, hole) === 0))
  })) return true
  // Ignore normal corner rounding, but catch narrow attached strokes too.
  return islands(diff(region, offset(core, 0.3))).some((piece) => regionArea(piece) > 0.16)
}

function scaleRegion(region: Region, k: number): Region {
  return region.map((poly) => poly.map(([x, y]) => [x * k, y * k] as [number, number]))
}

/** Adds the key-ring tab at the top of the base, its hole clear of the base. */
export function withTab(base: Region): Region {
  const b = bounds(base)
  const mid = (b.minX + b.maxX) / 2
  // A high point near the middle, so the keychain hangs about level rather
  // than from a tone mark at one end.
  let top: [number, number] = [mid, b.maxY]
  let best = -Infinity
  for (const poly of base) {
    for (const [x, y] of poly) {
      const score = y - 0.4 * Math.abs(x - mid)
      if (score > best) [best, top] = [score, [x, y]]
    }
  }
  const cx = top[0]
  // Clear of the base everywhere under the hole, and overlapping it at `top`.
  let under = top[1]
  for (const poly of base) for (const [x, y] of poly) if (Math.abs(x - cx) <= TAB.hole + 0.8) under = Math.max(under, y)
  // The tab (radius TAB.r) still overlaps the base at that highest point.
  const cy = Math.max(top[1] + TAB.reach, under + TAB.hole + 0.9)
  return diff(union(base, circle(cx, cy, TAB.r, 48)), circle(cx, cy, TAB.hole, 32))
}

/** The parts list and Bambu Studio steps that go in the ZIP. */
export function bubbleReadme(model: BubbleModel, o: BubbleOptions, colours: BubbleColours, list: string) {
  const [a, b, c] = model.parts
  return [
    'JJDesign — พวงกุญแจชื่อบับเบิล',
    `ชื่อ: ${model.rows.join(' / ')}`,
    `ขนาด ${model.width.toFixed(1)} × ${model.height.toFixed(1)} มม.${o.loop ? ' รวมหูห้อย' : ''} · ตัวอักษรสูง ${model.letterHeight.toFixed(1)} มม.`,
    `ความหนา: ฐาน ${o.base} มม. + ขอบบับเบิล ${o.puff} มม. + ตัวอักษร ${o.letter} มม. = ${(o.base + o.puff + o.letter).toFixed(1)} มม.`,
    `จำนวนแถว: ${model.rows.length}`,
    model.warning ?? '',
    '',
    list,
    '',
    'สีที่เลือก',
    a ? `  ${a.code} ฐาน          ${colours.base}` : '',
    b ? `  ${b.code} ขอบบับเบิล    ${colours.bubble}` : '',
    c ? `  ${c.code} ตัวอักษร      ${colours.letter}` : '',
    '',
    'พิมพ์หลายสีใน Bambu Studio (หรือ OrcaSlicer)',
    '1. ลากไฟล์ STL ทั้ง 3 ไฟล์ในโฟลเดอร์ พลาสติกพิมพ์ เข้าโปรแกรมพร้อมกัน',
    '2. เมื่อถามว่าจะโหลดเป็นวัตถุเดียวที่มีหลายชิ้นไหม ให้ตอบ "ใช่" ทุกชิ้นจะวางตรงกันเอง',
    '3. ในรายการวัตถุ เลือกแต่ละชิ้นแล้วกำหนดเส้นพลาสติกตามสีด้านบน',
    '4. ชั้น 0.2 มม. ผนัง 2–3 เส้น เติม 15–20% วางฐานติดแผ่นพิมพ์ ไม่ต้องใช้ซัพพอร์ต',
    'ถ้าพิมพ์สีเดียว ใช้ไฟล์ -ทั้งหมด.stl ไฟล์เดียว',
    '',
    'ไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ขึ้น',
    '',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n')
}

/** Remove redundant font sampling points within 0.005 mm (invisible at this scale). */
function simplify(region: Region): Region {
  return ClipperLib.Clipper.CleanPolygons(region.map((poly) => poly.map(([x, y]) => ({ X: x * 1000, Y: y * 1000 }))), 5)
    .map((poly) => poly.map((p) => [p.X / 1000, p.Y / 1000] as [number, number]))
}

/** Fine arcs prevent the shared offset's 0.06 mm tolerance eating into the seam. */
function seamFence(region: Region): Region {
  const co = new ClipperLib.ClipperOffset(4, 1)
  co.AddPaths(region.map((poly) => poly.map(([x, y]) => ({ X: Math.round(x * 1000), Y: Math.round(y * 1000) }))), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const out: ClipperLib.Paths = []
  co.Execute(out, (SEAM + 0.002) * 1000)
  return out.map((poly) => poly.map((p) => [p.X / 1000, p.Y / 1000] as [number, number]))
}
