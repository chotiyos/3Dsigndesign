import type * as THREE from 'three'
import type { Region } from '../geo2d'
import { extrude } from '../solid'
import type { MaterialId, ParamDef, SignPart } from './types'

const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Collects parts and hands out catalogue letters in order. */
export class Parts {
  private list: SignPart[] = []

  /** An extruded flat part that can also be cut from sheet. */
  slab(label: string, material: MaterialId, region: Region, depth: number, z: number, explode = 0) {
    return this.solid(label, material, extrude(region, depth, z), explode, region)
  }

  solid(label: string, material: MaterialId, geometry: THREE.BufferGeometry, explode = 0, cut?: Region) {
    if (!geometry.getAttribute('position') || geometry.getAttribute('position').count === 0) return this
    const code = CODES[this.list.length] ?? `Z${this.list.length}`
    this.list.push({ id: `${code}-${this.list.length}`, code, label, material, geometry, cut, explode })
    return this
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
  front: (value = 3) => p('front', 'ความหนาหน้าอะคริลิก', value, 1, 10, 0.5),
  back: (value = 3) => p('back', 'ความหนาแผ่นหลัง', value, 1, 10, 0.5),
  lip: (value = 4) => p('lip', 'ความกว้างบ่า', value, 1, 15, 0.5),
  gap: (value = 0.2) => p('gap', 'ระยะเผื่อสวม', value, 0, 1, 0.05, 'มม.', 'เผื่อให้ชิ้นสวมเข้ากันได้'),
}
