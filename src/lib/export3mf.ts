import { strToU8, zipSync } from 'fflate'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import type { SignPart } from './styles'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A colour as 3MF wants it: #RRGGBBAA. */
function colour3mf(hex: string | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  return `#${(m ? m[1] : 'cccccc').toUpperCase()}FF`
}

/** One part's mesh: shared vertices, then triangles, in millimetres. */
function meshXml(geometry: THREE.BufferGeometry) {
  const bare = new THREE.BufferGeometry()
  bare.setAttribute('position', geometry.getAttribute('position'))
  if (geometry.index) bare.setIndex(geometry.index)
  const welded = mergeVertices(bare, 1e-4)
  const p = welded.getAttribute('position')
  const index = welded.index!
  const vertices: string[] = []
  for (let i = 0; i < p.count; i++) vertices.push(`<vertex x="${p.getX(i).toFixed(4)}" y="${p.getY(i).toFixed(4)}" z="${p.getZ(i).toFixed(4)}"/>`)
  const triangles: string[] = []
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2)
    if (a === b || b === c || a === c) continue
    triangles.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`)
  }
  welded.dispose()
  return `<mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh>`
}

/**
 * A 3MF file with every printed part as its own coloured body, all grouped as
 * one object so a slicer loads them in place as one multi-colour print. Each
 * body carries its colour (3MF base materials) and its name, so Bambu Studio,
 * OrcaSlicer and PrusaSlicer show which filament goes where.
 */
export function build3mf(parts: SignPart[], tints: Record<string, string>, name: string): Uint8Array {
  const printed = parts.filter((part) => part.material !== 'led' && part.geometry.getAttribute('position')?.count)
  if (!printed.length) throw new Error('ไม่มีชิ้นส่วนสำหรับพิมพ์ 3D')
  const materials = printed.map((part) => `<base name="${esc(`${part.code} ${part.label}`)}" displaycolor="${colour3mf(tints[part.code])}"/>`)
  const objects = printed.map((part, i) =>
    `<object id="${i + 2}" type="model" name="${esc(`${part.code} ${part.label}`)}" pid="1" pindex="${i}">${meshXml(part.geometry)}</object>`)
  const group = printed.map((_, i) => `<component objectid="${i + 2}"/>`).join('')
  const groupId = printed.length + 2
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="th-TH" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${esc(name)}</metadata>`,
    '<metadata name="Application">JJDesign</metadata>',
    '<resources>',
    `<basematerials id="1">${materials.join('')}</basematerials>`,
    ...objects,
    `<object id="${groupId}" type="model" name="${esc(name)}"><components>${group}</components></object>`,
    '</resources>',
    `<build><item objectid="${groupId}"/></build>`,
    '</model>',
  ].join('\n')
  const files = {
    '[Content_Types].xml': strToU8([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
      '</Types>',
    ].join('\n')),
    '_rels/.rels': strToU8([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
      '</Relationships>',
    ].join('\n')),
    '3D/3dmodel.model': strToU8(model),
  }
  return zipSync(files, { level: 6 })
}
