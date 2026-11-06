import type * as THREE from 'three'
import { band, bounds, hull, islands, offset, type Region } from '../geo2d'
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

/** Plastics a lip can be printed in, as one piece with the wall. */
export const PLASTIC = new Set<MaterialId>(['print', 'accent', 'opalprint'])

/** The wall a front panel lip is printed onto: the last wall (or cup) part. */
export function lipHost(parts: SignPart[]) {
  return [...parts].reverse().find((part) => !part.addon && /^(ผนัง|ถ้วย)/.test(part.label))
}

/**
 * Applies the customer's material picks. A lip add-on always takes its
 * wall's material, and is left out entirely when that wall is not plastic.
 */
export function applyMaterials(parts: SignPart[], picks: Record<string, MaterialId> | undefined): SignPart[] {
  const picked = parts.map((part) => (!part.addon && picks?.[part.code] ? withMaterial(part, picks[part.code]) : part))
  return picked.flatMap((part) => {
    if (!part.addon) return [part]
    const wall = picked.find((p) => p.code === part.addon!.wall)
    if (!wall || !PLASTIC.has(wall.material)) return []
    return [withMaterial(part, wall.material)]
  })
}

/** The catalogue letter for the part at `index`. */
export const codeAt = (index: number) => CODES[index] ?? `Z${index}`

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

  /**
   * The plate that closes the back of a lit letter or box. Wire passages and
   * wall mounting holes (see rear.ts) are cut into it, inside `cavity`.
   */
  back(label: string, material: MaterialId, region: Region, depth: number, z: number, explode: number, cavity: Region) {
    const before = this.list.length
    this.slab(label, material, region, depth, z, explode)
    if (this.list.length > before) this.list[before].rear = { cavity, z }
    return this
  }

  solid(label: string, material: MaterialId, geometry: THREE.BufferGeometry, explode = 0, cut?: Region) {
    const index = this.nextCode++
    if (!geometry.getAttribute('position') || geometry.getAttribute('position').count === 0) {
      geometry.dispose()
      return this
    }
    const code = codeAt(index)
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
  seat(on: number, label: string, outline: Region, wall: number, width: number, thick: number, panelBottom: number, floor = -Infinity, explode?: number) {
    const host = lipHost(this.list)
    // A segmented wall can start above the panel underside. Keep the ledge
    // within its actual host rather than printing it into the light band.
    host?.geometry.computeBoundingBox()
    const box = host?.geometry.boundingBox
    const t = Math.min(thick, panelBottom - Math.max(floor, box?.min.z ?? floor))
    if (!on || !host || !box || panelBottom > box.max.z + 0.001 || !(t > 0.2)) {
      this.nextCode++
      return this
    }
    // The lip is printed onto the wall, and follows its material.
    const before = this.list.length
    this.slab(label, host.material, band(outline, wall - 0.01, width), t, panelBottom - t, explode ?? host.explode)
    if (this.list.length > before) this.list[before].addon = { kind: 'lip', wall: host.code }
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
  front: (value = 3) => p('front', 'ความหนาแผ่นหน้า', value, 1, 10, 0.5),
  back: (value = 3) => p('back', 'ความหนาแผ่นหลัง', value, 1, 10, 0.5),
  lip: (value = 4) => p('lip', 'ความกว้างบ่า', value, 1, 15, 0.5),
  gap: (value = 0.2) => p('gap', 'ระยะเผื่อสวม', value, 0, 1, 0.05, 'มม.', 'เผื่อให้ชิ้นสวมเข้ากันได้'),
  /** On/off switch for the ledge that holds the front panel (see Parts.seat). */
  seatLip: (on = 0): ParamDef => ({
    ...p('seatLip', 'บ่ารับแผ่นหน้า', on, 0, 1, 1, '', 'ขอบด้านในผนังสำหรับวางแผ่นหน้า พิมพ์ติดไปกับผนัง'),
    kind: 'toggle',
    kicker: 'ออปชั่นเสริม · ผนังพลาสติก',
  }),
  lipWidth: (value = 3): ParamDef => ({ ...p('lip', 'ความกว้างบ่า', value, 1, 15, 0.5), when: 'seatLip' }),
  lipThick: (value = 2): ParamDef => ({ ...p('lipT', 'ความหนาบ่า', value, 0.8, 6, 0.1), when: 'seatLip' }),
  /**
   * Add-ons for the back of a lit sign: wire passages, wall mounting holes
   * and a desk base. The style must build its back with Parts.back; rear.ts
   * applies them after the style is built. All are off by default.
   */
  rear: (): ParamDef[] => [
    {
      ...p('wire', 'รูร้อยสายไฟด้านหลัง', 0, 0, 1, 1, '', 'เจาะรูที่แผ่นหลังทุกชิ้นที่มีช่องไฟ ให้สาย LED ออกด้านหลัง'),
      kind: 'toggle',
      kicker: 'ออปชั่นเสริม · งานไฟ',
    },
    { ...p('wireD', 'ขนาดรูสายไฟ', 6, 3, 20, 0.5), when: 'wire' },
    {
      ...p('mount', 'ตัวยึดผนัง', 0, 0, 2, 1, '', 'รูที่แผ่นหลังสำหรับยึดป้ายเข้ากับผนัง'),
      kind: 'choice',
      choices: ['หลังเรียบ', 'รูสกรู', 'รูแขวน'],
      kicker: 'ออปชั่นเสริม · ติดตั้ง',
    },
    { ...p('screwD', 'ขนาดสกรู', 4, 3, 8, 0.5, 'มม.', 'รูแขวนเผื่อหัวสกรูไว้ 2 เท่าของขนาดสกรู'), when: 'mount' },
    {
      ...p('deskBase', 'ฐานตั้งโต๊ะ', 0, 0, 1, 1, '', 'แท่นใต้ป้าย มีร่องหน้าหลังกันล้ม ใช้ตั้งบนเคาน์เตอร์หรือชั้นวาง'),
      kind: 'toggle',
      kicker: 'ออปชั่นเสริม · ตั้งโต๊ะ',
    },
    { ...p('baseH', 'ความสูงแท่น', 15, 6, 60), when: 'deskBase' },
    { ...p('baseOver', 'แท่นยื่นหน้าและหลัง', 25, 8, 120, 1), when: 'deskBase' },
  ],
}

/**
 * The artwork grown by `grow` mm into one connected outline, for parts that
 * must be a single piece (a keychain base, a box that follows the text).
 * Gaps between letters are closed a little at a time, scaled to the text
 * height; artwork that still falls apart gets its outer hull.
 */
export function silhouette(art: Region, grow: number): Region {
  const grown = offset(art, grow)
  if (islands(grown).length <= 1) return grown
  const h = Math.max(1, bounds(art).h)
  for (const k of [0.08, 0.15, 0.25, 0.4, 0.6]) {
    const close = h * k
    const closed = offset(offset(art, grow + close), -close)
    if (islands(closed).length === 1) return closed
  }
  return offset(hull(art), grow)
}
