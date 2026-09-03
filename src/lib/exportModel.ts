import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import type { SignPart, SignPartId } from './signParts'

/**
 * Builds the sign as a single mesh in real millimetre coordinates — the
 * back plate's back face sits at z=0 so the model sits flat on a print
 * bed, matching how a slicer expects an STL to be oriented.
 */
function buildExportGroup(
  parts: SignPart[],
  upem: number,
  heightMM: number,
  visibility: Record<SignPartId, boolean>,
): THREE.Group {
  const scale = heightMM / upem
  const visibleParts = parts.filter((p) => visibility[p.id] && p.shapes.length > 0)

  const footprint = new THREE.Box2()
  for (const part of visibleParts) {
    for (const shape of part.shapes) {
      for (const p of shape.getPoints(4)) footprint.expandByPoint(p)
    }
  }
  const center = new THREE.Vector2()
  footprint.getCenter(center)

  const group = new THREE.Group()
  for (const part of visibleParts) {
    const geometry = new THREE.ExtrudeGeometry(part.shapes, {
      depth: part.depthFontUnits,
      bevelEnabled: false,
      curveSegments: 16,
    })
    const mesh = new THREE.Mesh(geometry)
    mesh.scale.setScalar(scale)
    mesh.position.set(-center.x * scale, -center.y * scale, part.zOffsetMM)
    group.add(mesh)
  }
  return group
}

export function exportStlBinary(
  parts: SignPart[],
  upem: number,
  heightMM: number,
  visibility: Record<SignPartId, boolean>,
): ArrayBuffer {
  const group = buildExportGroup(parts, upem, heightMM, visibility)
  const exporter = new STLExporter()
  const result = exporter.parse(group, { binary: true })
  return result instanceof DataView ? result.buffer : new TextEncoder().encode(result).buffer
}

export function downloadBlob(data: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([data], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
