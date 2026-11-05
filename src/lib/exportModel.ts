import { strToU8, zipSync } from 'fflate'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { buildDxf } from './exportDxf'
import { analyse } from './solid'
import type { MaterialId, SignPart } from './styles'

const stlExporter = new STLExporter()

/** Binary STL in real millimetres, Z up, exactly as modelled (no explode offsets). */
export function partsToStl(parts: SignPart[]): Uint8Array {
  const group = new THREE.Group()
  for (const part of parts) group.add(new THREE.Mesh(part.geometry))
  const result = stlExporter.parse(group, { binary: true }) as unknown as DataView
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
}

export function safeName(text: string) {
  const cleaned = text.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 40)
  return cleaned || 'jjdesign'
}

export interface ZipOptions {
  baseName: string
  parts: SignPart[]
  readme: string
}

/** One STL per part, one DXF per cuttable part, plus a combined STL and a parts list. */
export function buildZip({ baseName, parts, readme }: ZipOptions): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  files[`${baseName}-ทั้งหมด.stl`] = partsToStl(parts)
  for (const part of parts) {
    const stem = `${part.code}-${safeName(part.label)}`
    files[`stl/${stem}.stl`] = partsToStl([part])
    if (part.cut) files[`dxf/${stem}.dxf`] = strToU8(buildDxf([{ layer: part.code, region: part.cut }]))
  }
  files['รายการชิ้นส่วน.txt'] = strToU8(readme)
  return zipSync(files, { level: 6 })
}

export function downloadBlob(data: BlobPart | Uint8Array, filename: string, mimeType: string) {
  const blob = new Blob([data as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const MATERIAL_INFO: Record<MaterialId, { name: string; density: number }> = {
  print: { name: 'เส้นพลาสติกพิมพ์ 3D (PETG)', density: 1.27 },
  opal: { name: 'อะคริลิก/เส้นพิมพ์ขาวขุ่น', density: 1.19 },
  acrylic: { name: 'อะคริลิกใส', density: 1.19 },
  accent: { name: 'เส้นพลาสติกสีหลัก', density: 1.24 },
  metal: { name: 'อะลูมิเนียม หรือพิมพ์สีโลหะ', density: 2.7 },
  plaswood: { name: 'พลาสวูด', density: 0.55 },
  led: { name: 'ไฟ LED (ตำแหน่งอ้างอิง)', density: 0 },
  mirror: { name: 'อะคริลิกกระจกเงา', density: 1.19 },
  rubber: { name: 'ยาง หรือเส้น TPU', density: 1.21 },
}

export interface PartStat {
  part: SignPart
  volumeCm3: number
  grams: number
  watertight: boolean
  size: THREE.Vector3
}

export function partStats(parts: SignPart[]): PartStat[] {
  return parts.map((part) => {
    const { volume, watertight } = analyse(part.geometry)
    part.geometry.computeBoundingBox()
    const size = new THREE.Vector3()
    part.geometry.boundingBox?.getSize(size)
    const volumeCm3 = Math.abs(volume) / 1000
    return { part, volumeCm3, grams: volumeCm3 * MATERIAL_INFO[part.material].density, watertight, size }
  })
}
