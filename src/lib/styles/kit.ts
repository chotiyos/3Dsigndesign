import type * as THREE from 'three'
import { band, type Region } from '../geo2d'
import { extrude } from '../solid'
import type { MaterialId, ParamDef, SignPart } from './types'

const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const SHEET = new Set<MaterialId>(['acrylic', 'opal', 'plaswood', 'mirror', 'metal'])

/**
 * Whether a flat part is cut from sheet (DXF). Only sheet materials are:
 * printed plastics, accent filament and TPU are 3D-printed (STL) however
 * thin the part is.
 */
export function isCuttable(material: MaterialId, depth: number) {
  return SHEET.has(material) && depth <= 12
}

/**
 * The same part made from another material. Flat parts gain or lose their
 * cutting outline to match; shaped parts stay printed (STL only).
 */
export function withMaterial(part: SignPart, material: MaterialId): SignPart {
  if (part.material === material || part.material === 'led' || material === 'led') return part
  const cut = part.profile && isCuttable(material, part.profile.depth) ? part.profile.region : undefined
  return { ...part, material, cut }
}

/** Collects parts and hands out catalogue letters in order. */
export class Parts {
  private list: SignPart[] = []
  private nextCode = 0

  /**
   * An extruded flat part. Thin sheet-material parts also carry their outline
   * for laser or CNC cutting; deep printed walls do not.
   */
  slab(label: string, material: MaterialId, region: Region, depth: number, z: number, explode = 0) {
    const before = this.list.length
    this.solid(label, material, extrude(region, depth, z), explode, isCuttable(material, depth) ? region : undefined)
    if (this.list.length > before) this.list[before].profile = { region, depth }
    return this
  }

  solid(label: string, material: MaterialId, geometry: THREE.BufferGeometry, explode = 0, cut?: Region) {
    const index = this.nextCode++
    if (!geometry.getAttribute('position') || geometry.getAttribute('position').count === 0) {
      geometry.dispose()
      return this
    }
    const code = CODES[index] ?? `Z${index}`
    this.list.push({ id: `${code}-${index}`, code, label, material, geometry, cut, explode })
    return this
  }

  /**
   * The ledge inside a wall that a front panel rests on (the "lip").
   * `outline` is the wall's outer outline; the ledge runs inward from the
   * wall's inner face and sits directly under `panelBottom`, never lower than
   * `floor`. When switched off it still takes its letter, so the parts after
   * it keep their codes (and any material picks saved against them).
   */
  seat(on: number, label: string, outline: Region, wall: number, width: number, thick: number, panelBottom: number, floor = -Infinity, explode = 0) {
    const t = Math.min(thick, panelBottom - floor)
    if (!on || !(t > 0.2)) {
      this.nextCode++
      return this
    }
    return this.slab(label, 'print', band(outline, wall - 0.01, width), t, panelBottom - t, explode)
  }

  done() {
    return this.list
  }
}

export const p = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step = 0.5,
  unit = 'มม.',
  hint?: string,
): ParamDef => ({ key, label, value, min, max, step, unit, hint })

/** Parameters most letter styles share, so similar styles feel the same to adjust. */
export const common = {
  depth: (value = 50) => p('depth', 'ความลึกตัวอักษร', value, 5, 200, 1),
  wall: (value = 2) => p('wall', 'ความหนาผนัง', value, 0.8, 10, 0.1),
  front: (value = 3) => p('front', 'ความหนาแผ่นหน้า', value, 1, 10, 0.5),
  back: (value = 3) => p('back', 'ความหนาแผ่นหลัง', value, 1, 10, 0.5),
  lip: (value = 4) => p('lip', 'ความกว้างบ่า', value, 1, 15, 0.5),
  gap: (value = 0.2) => p('gap', 'ระยะเผื่อสวม', value, 0, 1, 0.05, 'มม.', 'เผื่อให้ชิ้นสวมเข้ากันได้'),
  /** On/off switch for the ledge that holds the front panel (see Parts.seat). */
  seatLip: (on = 0): ParamDef => ({
    ...p('seatLip', 'บ่ารับแผ่นหน้า', on, 0, 1, 1, '', 'ขอบด้านในผนังสำหรับวางแผ่นหน้า พิมพ์ติดไปกับผนัง'),
    kind: 'toggle',
  }),
  lipWidth: (value = 3): ParamDef => ({ ...p('lip', 'ความกว้างบ่า', value, 1, 15, 0.5), when: 'seatLip' }),
  lipThick: (value = 2): ParamDef => ({ ...p('lipT', 'ความหนาบ่า', value, 0.8, 6, 0.1), when: 'seatLip' }),
}
