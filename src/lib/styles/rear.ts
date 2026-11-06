import * as THREE from 'three'
import { bounds, circle, diff, intersect, islands, offset, rect, regionArea, union, type Point, type Region } from '../geo2d'
import { extrude, merge } from '../solid'
import { codeAt, isCuttable } from './kit'
import { holeGrid } from './lit'
import type { SignPart } from './types'

/** Rear add-on settings, read from a style's values (see common.rear). */
export const REAR_KEYS = ['wire', 'mount', 'deskBase'] as const

const area = (region: Region) => Math.abs(regionArea(region))
const far = (a: Point, b: Point, d: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) >= d

/** True when `shape` lies wholly inside `room`. */
function fits(shape: Region, room: Region) {
  const a = area(shape)
  return a > 0 && area(intersect(shape, room)) >= a * 0.995
}

/** Points inside `island` with at least `clear` mm to its edge, nearest `target` first. */
function spots(island: Region, clear: number, target: Point) {
  const b = bounds(island)
  const pitch = Math.max(0.8, Math.min(b.w, b.h) / 16)
  return holeGrid(island, pitch, clear, 2500).sort(
    (a, c) => Math.hypot(a[0] - target[0], a[1] - target[1]) - Math.hypot(c[0] - target[0], c[1] - target[1]),
  )
}

/**
 * A keyhole slot for hanging on a screw: the head goes through the round
 * opening, then the sign drops so the shank sits at the top of the slot.
 */
export function keyhole(x: number, y: number, screw: number): Region {
  const head = screw
  const slot = head * 1.6
  return union(circle(x, y, head, 32), rect(x, y + slot / 2, screw, slot), circle(x, y + slot, screw / 2, 24))
}

/**
 * Where the wire passage and wall fixings go: one wire hole per hollow
 * letter (or box), and one or two fixings on each letter big enough to hang.
 * Pure geometry, so it can be tested without building a sign.
 */
export function rearHoles(cavity: Region, v: Record<string, number>) {
  const holes: Region[] = []
  const used: { at: Point; r: number }[] = []
  const notes: string[] = []
  const pieces = islands(cavity).filter((piece) => area(piece) > 1)
  const biggest = Math.max(0, ...pieces.map(area))

  if (v.wire > 0) {
    const r = v.wireD / 2
    let missed = 0
    for (const piece of pieces) {
      const b = bounds(piece)
      const at = spots(piece, r + 1, [b.cx, b.cy])[0]
      if (!at) {
        missed++
        continue
      }
      holes.push(circle(at[0], at[1], r, 32))
      used.push({ at, r })
    }
    if (missed) notes.push(`เจาะรูสายไฟได้ ${pieces.length - missed} จาก ${pieces.length} ชิ้น ชิ้นที่ช่องแคบกว่ารูไม่ได้เจาะ`)
  }

  if (v.mount > 0) {
    const screw = v.screwD
    const hang = v.mount === 2
    const reach = hang ? screw * 2.6 : screw / 2
    let placed = 0
    // Small islands (accents, tone marks) ride on the letters around them.
    for (const piece of pieces.filter((piece) => area(piece) >= biggest * 0.2)) {
      const b = bounds(piece)
      const y = b.maxY - b.h * 0.3
      const targets: Point[] = b.w > 80 ? [[b.minX + b.w * 0.22, y], [b.maxX - b.w * 0.22, y]] : [[b.cx, y]]
      const room = offset(piece, -1)
      for (const target of targets) {
        for (const at of spots(piece, (hang ? screw : screw / 2) + 1, target).slice(0, 60)) {
          const shape = hang ? keyhole(at[0], at[1], screw) : circle(at[0], at[1], screw / 2, 32)
          if (!used.every((u) => far(u.at, at, u.r + reach + 4))) continue
          if (!fits(shape, room)) continue
          holes.push(shape)
          used.push({ at, r: reach })
          placed++
          break
        }
      }
    }
    if (!placed) notes.push('ช่องในตัวอักษรแคบเกินกว่าจะเจาะรูยึดผนัง ลองลดขนาดสกรู หรือใช้เทปกาวสองหน้าแทน')
  }

  return { holes: union(...holes), notes }
}

function partIndex(part: SignPart) {
  const n = Number(part.id.split('-').pop())
  return Number.isFinite(n) ? n : 0
}

/** A plinth under the sign, with a rail in front of and behind it. */
function deskBase(parts: SignPart[], v: Record<string, number>, index: number): SignPart | null {
  const box = new THREE.Box3()
  for (const part of parts) {
    if (part.material === 'led') continue
    part.geometry.computeBoundingBox()
    if (part.geometry.boundingBox) box.union(part.geometry.boundingBox)
  }
  if (box.isEmpty()) return null
  const cx = (box.min.x + box.max.x) / 2
  const w = box.max.x - box.min.x + 20
  const depth = box.max.z - box.min.z
  const rail = Math.min(8, v.baseH)
  const railRegion = rect(cx, box.min.y + rail / 2 - 0.5, w, rail + 1)
  const geometry = merge([
    extrude(rect(cx, box.min.y - v.baseH / 2, w, v.baseH), depth + v.baseOver * 2, box.min.z - v.baseOver),
    // 0.2 mm each side so the sign slides into the slot between the rails.
    extrude(railRegion, 3, box.max.z + 0.2),
    extrude(railRegion, 3, box.min.z - 3.2),
  ])
  const code = codeAt(index)
  return { id: `${code}-${index}`, code, label: 'แท่นตั้งโต๊ะ', material: 'print', geometry, explode: 0 }
}

/**
 * Applies the rear add-ons a style was built with: holes cut into its back
 * plate, and an optional desk base added as the last part.
 */
export function applyRear(parts: SignPart[], v: Record<string, number>): SignPart[] {
  if (!REAR_KEYS.some((key) => v[key] > 0)) return parts
  let out = parts
  const back = parts.find((part) => part.rear && part.profile)
  if (back && (v.wire > 0 || v.mount > 0)) {
    const { holes, notes } = rearHoles(back.rear!.cavity, v)
    let next: SignPart = back
    if (holes.length) {
      const { depth } = back.profile!
      const region = diff(back.profile!.region, holes)
      back.geometry.dispose()
      next = {
        ...back,
        geometry: extrude(region, depth, back.rear!.z),
        profile: { region, depth },
        cut: isCuttable(back.material, depth) ? region : undefined,
      }
    }
    if (notes.length) next = { ...next, warning: [next.warning, ...notes].filter(Boolean).join(' · ') }
    out = out.map((part) => (part === back ? next : part))
  }
  if (v.deskBase > 0) {
    const base = deskBase(out, v, Math.max(-1, ...out.map(partIndex)) + 1)
    if (base) {
      // Letters that end above the base (upper vowels, tone marks, dots) need fixing to it.
      const outline = back?.profile?.region ?? []
      const floor = outline.length ? bounds(outline).minY : 0
      const floating = islands(outline).filter((piece) => bounds(piece).minY > floor + 1).length
      if (floating) base.warning = `มี ${floating} ชิ้นที่ไม่แตะแท่น เช่น สระบนหรือวรรณยุกต์ ต้องยึดเพิ่ม เช่น ติดกับแผ่นรองหลัง`
      out = [...out, base]
    }
  }
  return out
}
