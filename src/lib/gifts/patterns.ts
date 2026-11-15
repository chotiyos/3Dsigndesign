import { bounds, circle, diff, intersect, ngon, offset, rect, rotate, scale, stroke, translate, union, type Region } from '../geo2d'

/**
 * Infill patterns: an open web inside a region, strong enough to print
 * (web strands about 1.2 mm), made by cutting a grid of holes out of it.
 */
export type PatternKind = 'lattice' | 'rattan' | 'hex' | 'dots' | 'slats' | 'daisy' | 'stripes'

export const PATTERNS: { id: PatternKind; label: string }[] = [
  { id: 'lattice', label: 'ตาข่าย' },
  { id: 'rattan', label: 'หวายสาน' },
  { id: 'hex', label: 'รังผึ้ง' },
  { id: 'dots', label: 'จุด' },
  { id: 'slats', label: 'ระแนง' },
  { id: 'daisy', label: 'ดอกไม้' },
  { id: 'stripes', label: 'ลายเฉียง' },
]

/** Holes for one pattern, covering `area` (mm), with cells about `cell` mm apart. */
function holes(kind: PatternKind, area: Region, cell: number): Region {
  const b = bounds(area)
  const out: Region = []
  const add = (r: Region) => out.push(...r)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const span = Math.hypot(b.w, b.h) / 2 + cell * 2
  const web = Math.max(1.2, cell * 0.16)
  if (kind === 'slats' || kind === 'stripes') {
    // Bars across the whole area, then turned for the diagonal stripes.
    const bars: Region = []
    for (let x = -span; x <= span; x += cell) bars.push(...rect(x, 0, cell - web, span * 2))
    add(translate(kind === 'stripes' ? rotate(bars, Math.PI / 4) : bars, cx, cy))
    return out
  }
  if (kind === 'lattice') {
    const d = (cell - web) / Math.SQRT2
    for (let i = -span; i <= span; i += cell) {
      for (let j = -span; j <= span; j += cell) add(translate(rotate(rect(0, 0, d, d), Math.PI / 4), cx + i, cy + j))
    }
    // Every other row shifted half a cell makes a diamond net.
    for (let i = -span + cell / 2; i <= span; i += cell) {
      for (let j = -span + cell / 2; j <= span; j += cell) add(translate(rotate(rect(0, 0, d, d), Math.PI / 4), cx + i, cy + j))
    }
    return out
  }
  if (kind === 'hex') {
    const r = (cell - web) / Math.sqrt(3)
    const dx = cell
    const dy = (cell * Math.sqrt(3)) / 2
    let row = 0
    for (let y = -span; y <= span; y += dy, row++) {
      for (let x = -span + (row % 2 ? dx / 2 : 0); x <= span; x += dx) add(ngon(cx + x, cy + y, r, 6, Math.PI / 6))
    }
    return out
  }
  if (kind === 'rattan') {
    // Octagons with small diamonds between them, like cane webbing.
    const r = (cell - web) / 2 / Math.cos(Math.PI / 8)
    const d = Math.max(0.9, cell * 0.22)
    for (let x = -span; x <= span; x += cell) {
      for (let y = -span; y <= span; y += cell) {
        add(ngon(cx + x, cy + y, r, 8, Math.PI / 8))
        add(translate(rotate(rect(0, 0, d, d), Math.PI / 4), cx + x + cell / 2, cy + y + cell / 2))
      }
    }
    return out
  }
  if (kind === 'dots') {
    let row = 0
    for (let y = -span; y <= span; y += cell * 0.87, row++) {
      for (let x = -span + (row % 2 ? cell / 2 : 0); x <= span; x += cell) add(circle(cx + x, cy + y, (cell - web) / 2, 24))
    }
    return out
  }
  // Daisy: five-petal flower holes on a staggered grid.
  const petal = (cell - web) * 0.26
  let row = 0
  for (let y = -span; y <= span; y += cell * 0.9, row++) {
    for (let x = -span + (row % 2 ? cell / 2 : 0); x <= span; x += cell) {
      for (let k = 0; k < 5; k++) {
        const a = Math.PI / 2 + (k * 2 * Math.PI) / 5
        add(circle(cx + x + Math.cos(a) * petal * 1.15, cy + y + Math.sin(a) * petal * 1.15, petal, 16))
      }
    }
  }
  return out
}

/**
 * The web left inside `area` once the pattern's holes are cut. Holes that
 * would leave a thin sliver at the edge are trimmed by keeping a solid border.
 */
export function patternWeb(kind: PatternKind, area: Region, cell: number, border = 1.2): Region {
  if (!area.length) return []
  const inner = offset(area, -border)
  const cut = intersect(union(holes(kind, area, cell)), inner)
  // Round the hole corners a hair so no needle points print.
  return diff(area, offset(offset(cut, -0.25), 0.25))
}

/** A leafy branch from `a` to `b`: a curved stem with leaves on alternate sides. */
export function leafBranch(a: [number, number], b: [number, number], size: number, leaves = 7): Region {
  const [ax, ay] = a
  const [bx, by] = b
  const len = Math.hypot(bx - ax, by - ay)
  const ang = Math.atan2(by - ay, bx - ax)
  const pts: [number, number][] = []
  const bow = len * 0.08
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    pts.push([t * len, Math.sin(t * Math.PI) * bow])
  }
  const parts: Region[] = [stroke(pts, Math.max(1.2, size * 0.12))]
  for (let i = 0; i < leaves; i++) {
    const t = 0.12 + (0.86 * i) / Math.max(1, leaves - 1)
    const side = i % 2 ? 1 : -1
    const lx = t * len
    const ly = Math.sin(t * Math.PI) * bow
    const k = size * (0.7 + 0.3 * Math.sin(t * Math.PI))
    const leaf = rotate(scale(circle(0, 0, 1, 28), k * 0.5, k * 0.22), side * 0.75)
    parts.push(translate(leaf, lx + Math.cos(side * 0.75) * k * 0.45, ly + Math.sin(side * 0.75) * k * 0.45))
  }
  // The leaf at the tip.
  parts.push(translate(scale(circle(0, 0, 1, 28), size * 0.42, size * 0.2), len + size * 0.3, 0))
  return translate(rotate(union(...parts), ang), ax, ay)
}

/** A simple daisy: petals round a centre, the centre cut free as its own piece. */
export function daisy(x: number, y: number, r: number): { petals: Region; centre: Region } {
  const petals: Region[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    petals.push(translate(rotate(scale(circle(0, 0, 1, 24), r * 0.42, r * 0.2), a), x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55))
  }
  const centre = circle(x, y, r * 0.3, 28)
  return { petals: diff(union(...petals), offset(centre, 0.5)), centre }
}
