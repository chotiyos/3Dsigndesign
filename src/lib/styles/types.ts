import type * as THREE from 'three'
import type { Bounds, Region } from '../geo2d'

export type MaterialId =
  | 'acrylic'
  | 'opal'
  | 'opalprint'
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
  /** Outline and thickness of a flat extruded part, so a material change can re-derive `cut`. */
  profile?: { region: Region; depth: number }
  /** How far this part travels per mm of the explode slider, along Z. */
  explode: number
  /**
   * Optional add-on printed onto another part: a front panel lip belongs to
   * the wall with code `wall`, takes that wall's material, and is only made
   * when that wall is plastic.
   */
  addon?: { kind: 'lip'; wall: string }
  /**
   * The plate that closes the back of a lit letter or box. Wire and wall
   * mounting holes are cut into it; `cavity` is the hollow inside the walls,
   * where those holes may go, and `z` is where the plate starts.
   */
  rear?: { cavity: Region; z: number }
  /** Shown in the editor when the style had to adjust the user's settings. */
  warning?: string
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
  /**
   * 'toggle' shows an on/off switch (value 0 or 1); 'choice' shows one button
   * per entry in `choices` (value is the index). Both show as option cards.
   */
  kind?: 'toggle' | 'choice'
  choices?: string[]
  /** Small heading on an option card, e.g. who the option is for. */
  kicker?: string
  /** Only shown while the toggle or choice with this key is above 0. */
  when?: string
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
