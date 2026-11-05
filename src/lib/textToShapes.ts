import * as THREE from 'three'
import { hb, type LoadedFont } from './hb'

interface PathCommand {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z'
  values: number[]
}

export interface TextShapesResult {
  /** Filled shapes (with holes already assigned), in font design units. */
  shapes: THREE.Shape[]
  /** Total advance width of the shaped line, in font design units. */
  width: number
  upem: number
}

/**
 * Shape `text` with HarfBuzz (handles Thai mark-to-base attachment so
 * vowels/tone marks land in the right place) and convert every glyph
 * outline into positioned THREE.Shape objects (holes resolved via a
 * point-in-polygon containment test, since glyph contour winding
 * direction isn't reliable across font sources).
 */
export function shapeTextToShapes(
  font: LoadedFont,
  text: string,
  /** Extra space added after each base glyph, in font design units. */
  tracking = 0,
): TextShapesResult {
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(font.hbFont, buffer)

  const infos = buffer.getGlyphInfos()
  const positions = buffer.getGlyphPositions()

  const shapes: THREE.Shape[] = []
  let cursorX = 0
  let cursorY = 0

  for (let i = 0; i < infos.length; i++) {
    const pos = positions[i]
    const gid = infos[i].codepoint
    const originX = cursorX + pos.xOffset
    const originY = cursorY + pos.yOffset

    const commands = font.hbFont.glyphToJson(gid) as PathCommand[]
    shapes.push(...glyphCommandsToShapes(commands, originX, originY))

    // Thai marks have zero advance; tracking only widens the gap after base glyphs.
    cursorX += pos.xAdvance + (pos.xAdvance !== 0 ? tracking : 0)
    cursorY += pos.yAdvance
  }

  return { shapes, width: cursorX, upem: font.upem }
}

interface SubPath {
  commands: PathCommand[]
  /** Flattened polygon used only for point-in-polygon containment tests. */
  polygon: [number, number][]
  area: number
}

function glyphCommandsToShapes(
  commands: PathCommand[],
  offsetX: number,
  offsetY: number,
): THREE.Shape[] {
  const subPaths = splitIntoSubPaths(commands, offsetX, offsetY)
  if (subPaths.length === 0) return []

  // Classify each contour as fill or hole by counting how many *other*
  // contours contain its representative point (even-odd rule), then
  // attach each hole to its tightest enclosing fill contour.
  const containment = subPaths.map((sp, i) =>
    subPaths.reduce(
      (count, other, j) =>
        j !== i && polygonContainsPoint(other.polygon, sp.polygon[0])
          ? count + 1
          : count,
      0,
    ),
  )

  const shapes: THREE.Shape[] = []
  const shapeForIndex = new Map<number, THREE.Shape>()

  subPaths.forEach((sp, i) => {
    if (containment[i] % 2 === 0) {
      const shape = new THREE.Shape()
      applyCommands(shape, sp.commands)
      shapes.push(shape)
      shapeForIndex.set(i, shape)
    }
  })

  subPaths.forEach((sp, i) => {
    if (containment[i] % 2 !== 0) {
      const parent = findTightestParent(i, subPaths, containment)
      const parentShape = parent !== -1 ? shapeForIndex.get(parent) : undefined
      const hole = new THREE.Path()
      applyCommands(hole, sp.commands)
      if (parentShape) parentShape.holes.push(hole)
    }
  })

  return shapes
}

function findTightestParent(
  holeIndex: number,
  subPaths: SubPath[],
  containment: number[],
): number {
  let best = -1
  let bestArea = Infinity
  const point = subPaths[holeIndex].polygon[0]
  subPaths.forEach((sp, j) => {
    if (j === holeIndex) return
    if (containment[j] % 2 !== 0) return // parent must itself be a fill contour
    if (!polygonContainsPoint(sp.polygon, point)) return
    if (sp.area < bestArea) {
      bestArea = sp.area
      best = j
    }
  })
  return best
}

function splitIntoSubPaths(
  commands: PathCommand[],
  offsetX: number,
  offsetY: number,
): SubPath[] {
  const subPaths: SubPath[] = []
  let current: PathCommand[] = []

  const flush = () => {
    if (current.length === 0) return
    const polygon = flattenToPolygon(current)
    if (polygon.length >= 3) {
      subPaths.push({ commands: current, polygon, area: polygonArea(polygon) })
    }
    current = []
  }

  for (const cmd of commands) {
    if (cmd.type === 'M' && current.length > 0) flush()
    const values = offsetValues(cmd.values, offsetX, offsetY)
    current.push({ type: cmd.type, values })
    if (cmd.type === 'Z') flush()
  }
  flush()

  return subPaths
}

function offsetValues(values: number[], offsetX: number, offsetY: number) {
  const out: number[] = []
  for (let i = 0; i < values.length; i += 2) {
    out.push(values[i] + offsetX, values[i + 1] + offsetY)
  }
  return out
}

function applyCommands(path: THREE.Path, commands: PathCommand[]) {
  for (const cmd of commands) {
    const v = cmd.values
    switch (cmd.type) {
      case 'M':
        path.moveTo(v[0], v[1])
        break
      case 'L':
        path.lineTo(v[0], v[1])
        break
      case 'C':
        path.bezierCurveTo(v[0], v[1], v[2], v[3], v[4], v[5])
        break
      case 'Q':
        path.quadraticCurveTo(v[0], v[1], v[2], v[3])
        break
      case 'Z':
        path.closePath()
        break
    }
  }
}

const FLATTEN_SEGMENTS = 8

function flattenToPolygon(commands: PathCommand[]): [number, number][] {
  const points: [number, number][] = []
  let cur: [number, number] = [0, 0]

  for (const cmd of commands) {
    const v = cmd.values
    switch (cmd.type) {
      case 'M':
        cur = [v[0], v[1]]
        points.push(cur)
        break
      case 'L':
        cur = [v[0], v[1]]
        points.push(cur)
        break
      case 'C': {
        const p0 = cur
        const p1: [number, number] = [v[0], v[1]]
        const p2: [number, number] = [v[2], v[3]]
        const p3: [number, number] = [v[4], v[5]]
        for (let s = 1; s <= FLATTEN_SEGMENTS; s++) {
          const t = s / FLATTEN_SEGMENTS
          points.push(cubicPoint(p0, p1, p2, p3, t))
        }
        cur = p3
        break
      }
      case 'Q': {
        const p0 = cur
        const p1: [number, number] = [v[0], v[1]]
        const p2: [number, number] = [v[2], v[3]]
        for (let s = 1; s <= FLATTEN_SEGMENTS; s++) {
          const t = s / FLATTEN_SEGMENTS
          points.push(quadraticPoint(p0, p1, p2, t))
        }
        cur = p2
        break
      }
      case 'Z':
        break
    }
  }
  return points
}

function cubicPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ]
}

function quadraticPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t
  const a = mt * mt
  const b = 2 * mt * t
  const c = t * t
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]
}

function polygonArea(points: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

function polygonContainsPoint(
  polygon: [number, number][],
  point: [number, number],
): boolean {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}
