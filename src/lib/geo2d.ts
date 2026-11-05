import * as ClipperLib from 'clipper-lib'
import * as THREE from 'three'

/** All 2D work happens in millimetres. */
export type Point = [number, number]
export type Poly = Point[]
/**
 * A filled area: positive-area contours are solid, negative-area contours are
 * holes. Every function here returns regions that follow this rule.
 */
export type Region = Poly[]

const SCALE = 1000
const CURVE_DIVISIONS = 10

function area(poly: Poly): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function toPaths(region: Region): ClipperLib.Paths {
  return region.map((poly) =>
    poly.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })),
  )
}

function fromPaths(paths: ClipperLib.Paths): Region {
  return paths
    .filter((path) => path.length >= 3)
    .map((path) => path.map((p) => [p.X / SCALE, p.Y / SCALE] as Point))
    .filter((poly) => Math.abs(area(poly)) > 0.01)
}

function boolean(type: number, subject: Region, clip: Region): Region {
  if (subject.length === 0 && type !== ClipperLib.ClipType.ctUnion) return []
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(toPaths(subject), ClipperLib.PolyType.ptSubject, true)
  if (clip.length > 0) clipper.AddPaths(toPaths(clip), ClipperLib.PolyType.ptClip, true)
  const solution: ClipperLib.Paths = []
  clipper.Execute(type, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return fromPaths(solution)
}

export const union = (...regions: Region[]): Region =>
  boolean(ClipperLib.ClipType.ctUnion, regions.flat(), [])
export const diff = (a: Region, b: Region): Region => boolean(ClipperLib.ClipType.ctDifference, a, b)
export const intersect = (a: Region, b: Region): Region =>
  boolean(ClipperLib.ClipType.ctIntersection, a, b)

/** Grow (d > 0) or shrink (d < 0) a region. Rounded corners unless `miter`. */
export function offset(region: Region, d: number, miter = false): Region {
  if (region.length === 0) return []
  if (d === 0) return region
  const co = new ClipperLib.ClipperOffset(4, 60)
  co.AddPaths(
    toPaths(region),
    miter ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon,
  )
  const solution: ClipperLib.Paths = []
  co.Execute(solution, d * SCALE)
  return fromPaths(solution)
}

/** Thickens a polyline into a solid band `width` wide. */
export function stroke(points: Poly, width: number, closed = false, square = false): Region {
  const co = new ClipperLib.ClipperOffset(4, 60)
  const end = closed
    ? ClipperLib.EndType.etClosedLine
    : square
      ? ClipperLib.EndType.etOpenButt
      : ClipperLib.EndType.etOpenRound
  co.AddPaths(toPaths([points]), square ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtRound, end)
  const solution: ClipperLib.Paths = []
  co.Execute(solution, (width / 2) * SCALE)
  return fromPaths(solution)
}

/** A wall ring `t` thick that follows the inside of a region's outline. */
export const ring = (region: Region, t: number): Region => diff(region, offset(region, -t))

/** A band between `inset` and `inset + width` measured in from the outline. */
export const band = (region: Region, inset: number, width: number): Region =>
  diff(offset(region, -inset), offset(region, -inset - width))

export function rect(cx: number, cy: number, w: number, h: number): Region {
  const x = w / 2
  const y = h / 2
  return [[[cx - x, cy - y], [cx + x, cy - y], [cx + x, cy + y], [cx - x, cy + y]]]
}

export function circle(cx: number, cy: number, r: number, segments = 48): Region {
  return ngon(cx, cy, r, segments)
}

export function ngon(cx: number, cy: number, r: number, sides: number, rotation = 0): Region {
  const poly: Poly = []
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2
    poly.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return [poly]
}

export function roundRect(cx: number, cy: number, w: number, h: number, r: number): Region {
  const radius = Math.min(r, w / 2 - 0.01, h / 2 - 0.01)
  if (radius <= 0) return rect(cx, cy, w, h)
  return offset(rect(cx, cy, w - radius * 2, h - radius * 2), radius)
}

export function translate(region: Region, dx: number, dy: number): Region {
  return region.map((poly) => poly.map(([x, y]) => [x + dx, y + dy] as Point))
}

export function scale(region: Region, sx: number, sy = sx): Region {
  const flips = sx * sy < 0
  return region.map((poly) => {
    const next = poly.map(([x, y]) => [x * sx, y * sy] as Point)
    return flips ? next.reverse() : next
  })
}

export const mirrorX = (region: Region): Region => scale(region, -1, 1)

export function rotate(region: Region, angle: number): Region {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return region.map((poly) => poly.map(([x, y]) => [x * c - y * s, x * s + y * c] as Point))
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  w: number
  h: number
  cx: number
  cy: number
}

export function bounds(region: Region): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const poly of region) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0, cx: 0, cy: 0 }
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

export const regionArea = (region: Region): number =>
  region.reduce((sum, poly) => sum + area(poly), 0)

/** Moves a region so its bounding box is centred on the origin. */
export function center(region: Region): Region {
  const b = bounds(region)
  return translate(region, -b.cx, -b.cy)
}

/** The convex hull, used for backing plates and box outlines around artwork. */
export function hull(region: Region): Region {
  const points = region
    .filter((poly) => area(poly) > 0)
    .flat()
    .slice()
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (points.length < 3) return []
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Point[] = []
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [lower.slice(0, -1).concat(upper.slice(0, -1))]
}

/** Each separate solid island of a region, along with its own holes. */
export function islands(region: Region): Region[] {
  const outers = region.filter((poly) => area(poly) > 0)
  const holes = region.filter((poly) => area(poly) < 0)
  const groups: Region[] = outers.map((outer) => [outer])
  for (const hole of holes) {
    let bestIndex = -1
    let bestArea = Infinity
    outers.forEach((outer, i) => {
      if (!containsPoint(outer, hole[0])) return
      const a = area(outer)
      if (a < bestArea) {
        bestArea = a
        bestIndex = i
      }
    })
    if (bestIndex !== -1) groups[bestIndex].push(hole)
  }
  return groups
}

export function regionToShapes(region: Region): THREE.Shape[] {
  return islands(region).map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)))
    shape.holes = holes.map((hole) => new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))))
    return shape
  })
}

function containsPoint(polygon: Poly, [px, py]: Point): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Converts glyph or SVG shapes into one clean region in millimetres. Overlapping
 * glyphs (Thai marks can touch their base letter) merge into a single solid.
 */
export function regionFromShapes(shapes: THREE.Shape[], unitToMM: number): Region {
  const input: Region = []
  for (const shape of shapes) {
    const { shape: outer, holes } = shape.extractPoints(CURVE_DIVISIONS)
    const outerPoly = outer.map((p) => [p.x * unitToMM, p.y * unitToMM] as Point)
    if (outerPoly.length < 3) continue
    input.push(area(outerPoly) >= 0 ? outerPoly : outerPoly.reverse())
    for (const hole of holes) {
      const holePoly = hole.map((p) => [p.x * unitToMM, p.y * unitToMM] as Point)
      if (holePoly.length < 3) continue
      input.push(area(holePoly) <= 0 ? holePoly : holePoly.reverse())
    }
  }
  return union(input)
}
