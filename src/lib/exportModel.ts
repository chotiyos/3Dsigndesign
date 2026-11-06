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

/** Where a part's files go inside the ZIP: one folder per material, so each shop gets its own pile. */
export function partFolder(part: SignPart) {
  return MATERIAL_INFO[part.material].folder
}

/** How a part is made with its current material. */
export function partMethod(part: SignPart) {
  if (part.material === 'led') return 'ซื้อสำเร็จ'
  return part.cut ? 'ตัดแผ่น · DXF' : 'พิมพ์ 3D · STL'
}

/** DXF layer name: part letter plus material id, ASCII so every CAM program accepts it. */
export const dxfLayer = (part: SignPart) => `${part.code}_${part.material}`

/**
 * A combined STL, plus a folder per material: every part gets an STL, and
 * parts cut from sheet in that material also get a DXF.
 */
export function buildZip({ baseName, parts, readme }: ZipOptions): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  files[`${baseName}-ทั้งหมด.stl`] = partsToStl(parts)
  for (const part of parts) {
    const stem = `${partFolder(part)}/${part.code}-${safeName(part.label)}`
    files[`${stem}.stl`] = partsToStl([part])
    if (part.cut) files[`${stem}.dxf`] = strToU8(buildDxf([{ layer: dxfLayer(part), region: part.cut }]))
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

export const MATERIAL_INFO: Record<MaterialId, { name: string; folder: string; density: number }> = {
  print: { name: 'เส้นพลาสติกพิมพ์ 3D (PETG)', folder: 'พลาสติกพิมพ์', density: 1.27 },
  opal: { name: 'อะคริลิกขาวขุ่น (แผ่น)', folder: 'อะคริลิกขาวขุ่น', density: 1.19 },
  opalprint: { name: 'เส้นพลาสติกพิมพ์ขาวขุ่น (PETG)', folder: 'พลาสติกพิมพ์ขาวขุ่น', density: 1.27 },
  acrylic: { name: 'อะคริลิกใส', folder: 'อะคริลิกใส', density: 1.19 },
  accent: { name: 'เส้นพลาสติกสีหลัก', folder: 'พลาสติกสีหลัก', density: 1.24 },
  metal: { name: 'อะลูมิเนียม หรือพิมพ์สีโลหะ', folder: 'โลหะ', density: 2.7 },
  plaswood: { name: 'พลาสวูด', folder: 'พลาสวูด', density: 0.55 },
  led: { name: 'ไฟ LED (ตำแหน่งอ้างอิง)', folder: 'ไฟ LED', density: 0 },
  mirror: { name: 'อะคริลิกกระจกเงา', folder: 'กระจกเงา', density: 1.19 },
  rubber: { name: 'ยาง หรือเส้น TPU', folder: 'ยาง TPU', density: 1.21 },
}

/** Materials a customer may pick for a part (lights stay lights). */
export const PICKABLE_MATERIALS: readonly MaterialId[] = (Object.keys(MATERIAL_INFO) as MaterialId[]).filter((m) => m !== 'led')

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
