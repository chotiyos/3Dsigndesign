import type { Region } from './geo2d'

/**
 * Minimal DXF (bare ENTITIES section, no HEADER, so it reads as plain R12) with
 * one closed POLYLINE per contour, in millimetres. POLYLINE/VERTEX/SEQEND is
 * the most widely accepted entity across AutoCAD, LightBurn, and Illustrator.
 */
export function buildDxf(layers: { layer: string; region: Region }[]): string {
  const lines: string[] = ['0', 'SECTION', '2', 'ENTITIES']
  for (const { layer, region } of layers) {
    for (const poly of region) {
      lines.push('0', 'POLYLINE', '8', layer, '66', '1', '70', '1')
      for (const [x, y] of poly) {
        lines.push('0', 'VERTEX', '8', layer, '10', x.toFixed(4), '20', y.toFixed(4))
      }
      lines.push('0', 'SEQEND')
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\n')
}
