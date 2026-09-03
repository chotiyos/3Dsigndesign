import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

export interface SvgShapesResult {
  shapes: THREE.Shape[]
  /** Bounding-box height of the parsed artwork, in SVG user units — used
   *  as the "upem" reference so the same heightMM/upem scaling that
   *  normalizes fonts also normalizes uploaded SVGs. */
  upem: number
  width: number
}

const FLATTEN_SEGMENTS = 48

/**
 * Parse an SVG file into extrudable shapes. SVG uses a y-down coordinate
 * system (origin top-left); everything here gets flipped to y-up so it
 * drops into the same extrusion/offset pipeline used for shaped text.
 */
export function parseSvgToShapes(svgText: string): SvgShapesResult {
  const loader = new SVGLoader()
  const { paths } = loader.parse(svgText)

  const rawShapes = paths.flatMap((path) => path.toShapes())
  if (rawShapes.length === 0) {
    throw new Error('ไม่พบเส้นทางที่วาดเป็นรูปปิดได้ในไฟล์ SVG นี้')
  }

  const shapes = rawShapes.map(flipShapeY)

  const bbox = new THREE.Box2()
  for (const shape of shapes) {
    for (const p of shape.getPoints(4)) bbox.expandByPoint(p)
  }

  return {
    shapes,
    upem: Math.max(bbox.max.y - bbox.min.y, 1),
    width: bbox.max.x - bbox.min.x,
  }
}

/** Rebuilds a shape (and its holes) with Y negated, flattening curves to
 *  line segments in the process — consistent with how the rest of the
 *  pipeline (wall offsetting) already treats geometry as polygons. */
function flipShapeY(shape: THREE.Shape): THREE.Shape {
  const outer = shape.getPoints(FLATTEN_SEGMENTS)
  const flipped = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, -p.y)))
  flipped.holes = shape.holes.map((hole) => {
    const pts = hole.getPoints(FLATTEN_SEGMENTS)
    return new THREE.Path(pts.map((p) => new THREE.Vector2(p.x, -p.y)))
  })
  return flipped
}
