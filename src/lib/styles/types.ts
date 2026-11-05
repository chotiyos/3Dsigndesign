import type * as THREE from 'three'
import type { Bounds, Region } from '../geo2d'

export type MaterialId =
  | 'acrylic'
  | 'opal'
  | 'print'
  | 'accent'
  | 'metal'
  | 'plaswood'
  | 'led'
  | 'mirror'
  | 'rubber'

export interface SignPart {
  /** Stable id, unique within one model. */
  id: string
  /** Catalogue letter shown in callouts and file names (A, B, C …). */
  code: string
  label: string
  material: MaterialId
  geometry: THREE.BufferGeometry
  /** Flat outline in mm when this part can be laser- or CNC-cut. */
  cut?: Region
  /** How far this part travels per mm of the explode slider, along Z. */
  explode: number
}

export interface ParamDef {
  key: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  hint?: string
}

export interface StyleContext {
  /** The artwork in mm, centred on the origin. Empty for hardware styles that ignore text. */
  art: Region
  box: Bounds
  v: Record<string, number>
}

export type StyleGroup = 'lit' | 'mini' | 'desk' | 'box' | 'deco' | 'gift' | 'hardware'

export interface StyleDef {
  id: string
  code: string
  group: StyleGroup
  name: string
  blurb: string
  /** What is made and how: print, cut, or both. */
  make: 'print' | 'cut' | 'mixed'
  /** false when the style is a stand-alone part that ignores the artwork. */
  usesArt: boolean
  params: ParamDef[]
  build: (ctx: StyleContext) => SignPart[]
}

export const GROUPS: { id: StyleGroup; letter: string; name: string; note: string }[] = [
  { id: 'lit', letter: 'A', name: 'ป้ายไฟตัวอักษร', note: 'ตัวอักษรกล่องไฟ ติดผนังหน้าร้าน' },
  { id: 'mini', letter: 'B', name: 'อักษรพิมพ์ทั้งตัว', note: 'งานเล็ก พิมพ์ 3D จบในเครื่องเดียว' },
  { id: 'desk', letter: 'C', name: 'ป้ายตั้งโต๊ะ', note: 'ตั้งบนเคาน์เตอร์ โต๊ะทำงาน ชั้นวาง' },
  { id: 'box', letter: 'D', name: 'กล่องไฟและถาด', note: 'ตู้ไฟ กล่องไฟ และภาชนะมีช่อง' },
  { id: 'deco', letter: 'E', name: 'อักษรตกแต่ง', note: 'งานผนัง ลวดลาย และอักษรติดมุม' },
  { id: 'gift', letter: 'F', name: 'ของที่ระลึก', note: 'พวงกุญแจ ปุ่มคีย์บอร์ด กรอบรูป ตรายาง' },
  { id: 'hardware', letter: 'G', name: 'อุปกรณ์และอะไหล่', note: 'ชิ้นส่วนติดตั้งและอะไหล่ทั่วไป' },
]
