import * as THREE from 'three'

/**
 * Minimal DXF (bare ENTITIES section, no HEADER — reads as plain R12) with
 * one closed POLYLINE per contour. POLYLINE/VERTEX/SEQEND is the most
 * broadly compatible entity type across AutoCAD, LightBurn and Illustrator.
 */
export function buildDxf(shapesByLayer: { layer: string; shapes: THREE.Shape[] }[], scale: number): string {
  const lines: string[] = ['0', 'SECTION', '2', 'ENTITIES']

  for (const { layer, shapes } of shapesByLayer) {
    for (const shape of shapes) {
      const outer = shape.getPoints(64).map((p) => p.multiplyScalar(scale))
      writePolyline(lines, layer, outer)
      for (const hole of shape.holes) {
        const pts = hole.getPoints(64).map((p) => p.multiplyScalar(scale))
        writePolyline(lines, layer, pts)
      }
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\n')
}

function writePolyline(lines: string[], layer: string, points: THREE.Vector2[]) {
  lines.push('0', 'POLYLINE', '8', layer, '66', '1', '70', '1')
  for (const p of points) {
    lines.push('0', 'VERTEX', '8', layer, '10', p.x.toFixed(4), '20', p.y.toFixed(4))
  }
  lines.push('0', 'SEQEND')
}
