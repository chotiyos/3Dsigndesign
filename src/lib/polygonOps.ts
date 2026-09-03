import * as ClipperLib from 'clipper-lib'
import * as THREE from 'three'

export type Point = [number, number]
/** A single closed contour. */
export type Polygon = Point[]

/**
 * Clipper works in integers. Font-unit coordinates (typically 0-2048) are
 * scaled up before going in and back down on the way out, so curve/offset
 * precision doesn't get lost to rounding.
 */
const CLIPPER_SCALE = 64

const CURVE_SEGMENTS = 24

/** Flatten a Shape (outer contour + holes) into plain polygons. */
export function shapeToPolygons(shape: THREE.Shape): Polygon[] {
  const { shape: outer, holes } = shape.extractPoints(CURVE_SEGMENTS)
  return [toPolygon(outer), ...holes.map(toPolygon)]
}

function toPolygon(points: THREE.Vector2[]): Polygon {
  return points.map((p) => [p.x, p.y])
}

function signedArea(poly: Polygon): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

function toClipperPath(poly: Polygon, wantPositiveArea: boolean): ClipperLib.Path {
  const area = signedArea(poly)
  const points = area >= 0 === wantPositiveArea ? poly : [...poly].reverse()
  return points.map(([x, y]) => ({
    X: Math.round(x * CLIPPER_SCALE),
    Y: Math.round(y * CLIPPER_SCALE),
  }))
}

function fromClipperPath(path: ClipperLib.Path): Polygon {
  return path.map((p) => [p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE])
}

/**
 * Shrink (delta < 0) or grow (delta > 0) a shape's combined outline —
 * outer contour and holes are offset together as one polygon so a
 * negative delta correctly shrinks the solid area everywhere (outer
 * boundary moves in, hole boundaries move out).
 */
export function offsetShape(shape: THREE.Shape, delta: number): Polygon[] {
  return offsetPolygons(shapeToPolygons(shape), delta)
}

export function offsetPolygons(polygons: Polygon[], delta: number): Polygon[] {
  if (polygons.length === 0) return []
  const outer = toClipperPath(polygons[0], true)
  const holes = polygons.slice(1).map((p) => toClipperPath(p, false))

  const co = new ClipperLib.ClipperOffset()
  co.AddPaths([outer, ...holes], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const solution: ClipperLib.Paths = []
  co.Execute(solution, delta * CLIPPER_SCALE)
  return solution.map(fromClipperPath)
}

/** Boolean `subject - clip`, e.g. the outer letter shape minus its shrunk
 *  interior gives a constant-thickness wall ring. */
export function differencePolygons(subject: Polygon[], clip: Polygon[]): Polygon[] {
  if (subject.length === 0) return []
  const subjectPaths = [
    toClipperPath(subject[0], true),
    ...subject.slice(1).map((p) => toClipperPath(p, false)),
  ]
  const clipPaths =
    clip.length === 0
      ? []
      : [toClipperPath(clip[0], true), ...clip.slice(1).map((p) => toClipperPath(p, false))]

  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(subjectPaths, ClipperLib.PolyType.ptSubject, true)
  if (clipPaths.length > 0) {
    clipper.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true)
  }
  const solution: ClipperLib.Paths = []
  clipper.Execute(
    ClipperLib.ClipType.ctDifference,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  )
  return solution.map(fromClipperPath)
}

/**
 * Regroup a flat list of polygons (as returned by Clipper — no notion of
 * "which contour is whose hole") back into THREE.Shape objects, using a
 * point-in-polygon containment test: a contour contained by an odd number
 * of other contours is a hole of its tightest enclosing contour.
 */
export function polygonsToShapes(polygons: Polygon[]): THREE.Shape[] {
  if (polygons.length === 0) return []

  const areas = polygons.map((p) => Math.abs(signedArea(p)))
  const containment = polygons.map((poly, i) =>
    polygons.reduce(
      (count, other, j) => (j !== i && polygonContainsPoint(other, poly[0]) ? count + 1 : count),
      0,
    ),
  )

  const shapes: THREE.Shape[] = []
  const shapeForIndex = new Map<number, THREE.Shape>()

  polygons.forEach((poly, i) => {
    if (containment[i] % 2 === 0) {
      const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)))
      shapes.push(shape)
      shapeForIndex.set(i, shape)
    }
  })

  polygons.forEach((poly, i) => {
    if (containment[i] % 2 !== 0) {
      let parent = -1
      let parentArea = Infinity
      polygons.forEach((other, j) => {
        if (j === i || containment[j] % 2 !== 0) return
        if (!polygonContainsPoint(other, poly[0])) return
        if (areas[j] < parentArea) {
          parentArea = areas[j]
          parent = j
        }
      })
      const parentShape = parent !== -1 ? shapeForIndex.get(parent) : undefined
      if (parentShape) {
        parentShape.holes.push(new THREE.Path(poly.map(([x, y]) => new THREE.Vector2(x, y))))
      }
    }
  })

  return shapes
}

function polygonContainsPoint(polygon: Polygon, point: Point): boolean {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}
