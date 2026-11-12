import { bounds, diff, intersect, islands, offset, regionArea, roundRect, translate, union, type Region } from './geo2d'
import { CHARMS } from './charms'
import { cleanText, DEFAULT_BUBBLE, graphemes, initialOf, layoutRows, printWarnings, puffUp, splits, withTab, words } from './bubbleKeychain'
import { hb, type LoadedFont } from './hb'
import { Parts, silhouette } from './styles/kit'
import type { SignPart } from './styles'

/**
 * Two-colour name keychains: a solid coloured base with the lettering (and
 * motif or rim) raised on top in white or black. Four ways to lay it out.
 */
export type TwoToneMode = 'charm' | 'initial' | 'word' | 'plate'
export type TwoToneSize = 'small' | 'large'

export interface TwoToneOptions {
  mode: TwoToneMode
  text: string
  /** Motif id for the 'charm' mode. */
  charm: string
  size: TwoToneSize
  loop: boolean
}

export interface TwoToneColours {
  base: string
  art: string
}

export const DEFAULT_TWOTONE: TwoToneOptions = { mode: 'charm', text: 'Mali', charm: 'bunny', size: 'small', loop: true }
export const TWOTONE_MAX = 24

/** Base and raised layer thickness, mm (6 mm overall, 0.2 mm layers). */
export const BASE_H = 4.8
export const ART_H = 1.2
/** Letter height for each size, mm; the big letter's height in the 'initial' mode. */
export const LETTER = { small: 11, large: 14 }
export const BIG = { small: 50, large: 62 }
/** Longest piece, not counting the tab. Long names shrink to fit. */
export const MAX_LENGTH = { small: 80, large: 100 }
/** Smallest letters before a name goes onto two rows. */
const MIN_LETTER = 7
const FAT = 0.06
/** Base showing round the raised art, mm. */
const MARGIN = { charm: 2.6, word: 1.8, plate: 3.2, initial: 1.6 }

export const TWOTONE_PALETTES: { id: string; name: string; colours: TwoToneColours }[] = [
  { id: 'pink', name: 'ชมพูขาว', colours: { base: '#f48fb1', art: '#ffffff' } },
  { id: 'sky', name: 'ฟ้าขาว', colours: { base: '#64b5f6', art: '#ffffff' } },
  { id: 'mint', name: 'มิ้นต์ขาว', colours: { base: '#4db6ac', art: '#ffffff' } },
  { id: 'lilac', name: 'ม่วงขาว', colours: { base: '#9575cd', art: '#ffffff' } },
  { id: 'sun', name: 'เหลืองดำ', colours: { base: '#ffd54f', art: '#212121' } },
  { id: 'orange', name: 'ส้มขาว', colours: { base: '#ff8a50', art: '#ffffff' } },
  { id: 'red', name: 'แดงขาว', colours: { base: '#d32f2f', art: '#ffffff' } },
  { id: 'leaf', name: 'เขียวขาว', colours: { base: '#66bb6a', art: '#ffffff' } },
  { id: 'navy', name: 'กรมท่าขาว', colours: { base: '#1f3a68', art: '#ffffff' } },
  { id: 'black', name: 'ดำขาว', colours: { base: '#212121', art: '#ffffff' } },
  { id: 'white', name: 'ขาวดำ', colours: { base: '#f5f5f5', art: '#212121' } },
  { id: 'cream', name: 'ครีมน้ำตาล', colours: { base: '#f3e5c0', art: '#5d4037' } },
]

export const TWOTONE_MODES: { id: TwoToneMode; label: string; note: string }[] = [
  { id: 'charm', label: 'ชื่อ + ลายการ์ตูน', note: 'ชื่อและลายนูนบนฐานที่ตัดตามรูป' },
  { id: 'initial', label: 'ตัวอักษรใหญ่ + ชื่อ', note: 'ตัวแรกของชื่อเป็นฐานตัวใหญ่ ชื่อนูนคาดบนตัว' },
  { id: 'word', label: 'ชื่อทั้งคำ', note: 'ตัวอักษรอ้วนติดกันเป็นชิ้นเดียว' },
  { id: 'plate', label: 'ชื่อมีขอบ', note: 'ป้ายชื่อทรงมน มีขอบนูนรอบชื่อ' },
]

const HEX = /^#[0-9a-f]{6}$/i

export function cleanTwoTone(raw: unknown): TwoToneOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_TWOTONE
  return {
    mode: TWOTONE_MODES.some((m) => m.id === o.mode) ? (o.mode as TwoToneMode) : d.mode,
    text: typeof o.text === 'string' ? cleanText(o.text) : d.text,
    charm: typeof o.charm === 'string' && CHARMS.some((c) => c.id === o.charm) ? o.charm : d.charm,
    size: o.size === 'large' ? 'large' : 'small',
    loop: typeof o.loop === 'boolean' ? o.loop : d.loop,
  }
}

export function cleanTwoToneColours(raw: unknown): TwoToneColours {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = TWOTONE_PALETTES[0].colours
  const pick = (k: keyof TwoToneColours) => (typeof o[k] === 'string' && HEX.test(o[k] as string) ? (o[k] as string).toLowerCase() : d[k])
  return { base: pick('base'), art: pick('art') }
}

export interface TwoToneModel {
  parts: SignPart[]
  colours: Record<string, string>
  rows: string[]
  /** Height of the name's letters, mm. */
  letterHeight: number
  width: number
  height: number
  warning?: string
}

const empty = (warning?: string): TwoToneModel => ({ parts: [], colours: {}, rows: [], letterHeight: 0, width: 0, height: 0, warning })

function missingGlyphs(font: LoadedFont, text: string) {
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(font.hbFont, buffer)
  return buffer.getGlyphInfos().some((g) => g.codepoint === 0)
}

/** The name laid out on one or two rows at the largest em height that fits `maxW` × `maxH` (capped at `cap`). */
function fitName(font: LoadedFont, text: string, maxW: number, maxH: number, cap: number, charm = '') {
  const cache = new Map<string, Region>()
  const list = words(text)
  const options = [[text.trim()], ...(list.length > 1 ? splits(list, 2) : [])]
  let best = { rows: [] as string[], h: 0, unit: [] as Region }
  for (const rows of options) {
    const unit = layoutRows(font, rows, cache, charm)
    if (!unit.length) continue
    const b = bounds(unit)
    const h = Math.min(cap, maxW / (b.w + 2 * FAT), maxH / (b.h + 2 * FAT))
    // One row wins unless two rows give clearly bigger letters and one row is under the minimum.
    if (h > best.h * (best.rows.length === 1 && best.h >= MIN_LETTER ? 1.5 : 1.03)) best = { rows, h, unit }
  }
  return best
}

const grow = (region: Region, k: number) => region.map((poly) => poly.map(([x, y]) => [x * k, y * k] as [number, number]))

export function buildTwoTone(font: LoadedFont, o: TwoToneOptions, colours: TwoToneColours): TwoToneModel {
  const name = o.text.trim()
  if (!name) return empty()
  if (missingGlyphs(font, name)) return empty('ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ')
  const L = LETTER[o.size]
  const long = MAX_LENGTH[o.size]
  let base: Region
  let art: Region
  let face: Region
  let rows: string[]
  let h: number

  if (o.mode === 'initial') {
    // Capital initials keep dotted i/j from becoming detached pieces of base.
    const first = Array.from(initialOf(name).toUpperCase())[0]
    if (!first) return empty('ไม่มีพยัญชนะไทยหรือตัวอักษรอังกฤษให้ทำตัวใหญ่ ลองพิมพ์ชื่อใหม่')
    const H = BIG[o.size]
    // Boolean operations have a physical area cutoff: scale before unioning.
    const bigUnit = layoutRows(font, [first], new Map())
    const bb0 = bounds(bigUnit)
    let big = offset(union(grow(bigUnit, H / bb0.h)), 0.6)
    if (islands(big).length > 1) {
      // Join detached Thai descenders (ฐ/ญ) while retaining letter counters.
      const counters = big.filter((poly) => regionArea([poly]) < 0).map((poly) => poly.slice().reverse())
      big = diff(silhouette(big, 0), counters)
    }
    const bb = bounds(big)
    // The name runs across the letter's middle, as wide as the letter (at least 70% of its height).
    const fit = fitName(font, name, Math.max(bb.w, 0.7 * bb.h) * 0.92, 0.42 * bb.h, 0.3 * H)
    if (!fit.rows.length) return empty()
    ;({ rows, h } = fit)
    const nameArt = union(grow(fit.unit, h))
    const nb = bounds(nameArt)
    face = puffUp(translate(nameArt, (bb.minX + bb.maxX) / 2 - (nb.minX + nb.maxX) / 2, (bb.minY + bb.maxY) / 2 - (nb.minY + nb.maxY) / 2 - 0.06 * bb.h), FAT * h)
    // The name's own backing joins the letter where the name runs past it.
    base = union(big, silhouette(face, MARGIN.initial))
    art = face
  } else {
    const charm = o.mode === 'charm' ? o.charm : ''
    const margin = MARGIN[o.mode]
    const border = o.mode === 'plate' ? 2.4 : 0
    const fit = fitName(font, name, long - 2 * margin - border, Math.min(40, long - 2 * margin - border), L, charm)
    if (!fit.rows.length) return empty()
    ;({ rows, h } = fit)
    const unit = fit.unit
    // layoutRows appends the motif after the name; both are rounded a little.
    face = puffUp(union(grow(unit, h)), FAT * h)
    if (o.mode === 'word') {
      // Letters fattened until they join into one piece, with a thin rim of base round them.
      base = silhouette(face, margin)
      art = face
    } else if (o.mode === 'charm') {
      base = silhouette(face, margin)
      art = face
    } else {
      const b = bounds(face)
      const w = b.w + 2 * margin + 2.4
      const hh = b.h + 2 * margin + 2.4
      base = roundRect((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, w, hh, Math.min(hh / 2, 6))
      const rim = diff(offset(base, -1), offset(base, -2.2))
      art = union(face, rim)
    }
  }

  if (o.loop) base = withTab(base)
  art = intersect(art, base)
  const parts = new Parts()
    .slab('ฐาน', 'print', base, BASE_H, 0, 0)
    .slab('ตัวอักษรและลาย', 'print', art, ART_H, BASE_H, 1)
    .done()
  const tints: Record<string, string> = {}
  parts.forEach((p, i) => (tints[p.code] = i === 0 ? colours.base : colours.art))
  const b = bounds(base)
  const warn = printWarnings(face, h, { ...DEFAULT_BUBBLE, base: BASE_H, puff: 0.2, letter: ART_H })
  return { parts, colours: tints, rows, letterHeight: h, width: b.w, height: b.h, warning: warn.join(' ') || undefined }
}

/** Grapheme count for the counter under the name field. */
export const twoToneChars = (text: string) => graphemes(text.trim()).length

export function twoToneReadme(model: TwoToneModel, o: TwoToneOptions, colours: TwoToneColours, list: string) {
  const mode = TWOTONE_MODES.find((m) => m.id === o.mode)!
  const charm = o.mode === 'charm' ? CHARMS.find((c) => c.id === o.charm)?.name : ''
  return [
    `JJDesign — พวงกุญแจชื่อสองสี แบบ${mode.label}${charm ? ` (ลาย${charm})` : ''}`,
    `ชื่อ: ${model.rows.join(' / ')}`,
    `ขนาด ${model.width.toFixed(1)} × ${model.height.toFixed(1)} มม.${o.loop ? ' รวมหูห้อย' : ''} · ตัวอักษรสูง ${model.letterHeight.toFixed(1)} มม.`,
    `ความหนา: ฐาน ${BASE_H} มม. + ลายนูน ${ART_H} มม. = ${(BASE_H + ART_H).toFixed(1)} มม.`,
    model.warning ?? '',
    '',
    list,
    '',
    'สีที่เลือก',
    `  ฐาน              ${colours.base}`,
    `  ตัวอักษรและลาย    ${colours.art}`,
    '',
    'พิมพ์สองสีใน Bambu Studio (หรือ OrcaSlicer)',
    '1. ลากไฟล์ STL ทั้ง 2 ไฟล์ในโฟลเดอร์ พลาสติกพิมพ์ เข้าโปรแกรมพร้อมกัน',
    '2. เมื่อถามว่าจะโหลดเป็นวัตถุเดียวที่มีหลายชิ้นไหม ให้ตอบ "ใช่" ทุกชิ้นจะวางตรงกันเอง',
    '3. กำหนดเส้นพลาสติกให้แต่ละชิ้นตามสีด้านบน',
    '4. ชั้น 0.2 มม. ผนัง 2–3 เส้น เติม 15–20% วางฐานติดแผ่นพิมพ์ ไม่ต้องใช้ซัพพอร์ต',
    'ไม่มี AMS: หยุดเปลี่ยนเส้นพลาสติกที่ความสูง 4.8 มม. (ตั้งจุดหยุดในแถบชั้นของโปรแกรม)',
    'ถ้าพิมพ์สีเดียว ใช้ไฟล์ -ทั้งหมด.stl ไฟล์เดียว',
    '',
    'ไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ขึ้น',
    '',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n')
}

