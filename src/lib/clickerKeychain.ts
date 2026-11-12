import * as THREE from 'three'
import { bounds, circle, diff, intersect, islands, offset, rect, regionArea, regionFromShapes, roundRect, scale, translate, union, type Region } from './geo2d'
import { hb, type LoadedFont } from './hb'
import { chamfer, extrude, merge } from './solid'
import { Parts } from './styles/kit'
import type { SignPart } from './styles'
import { shapeTextToShapes } from './textToShapes'

/**
 * A key-cap keychain: one letter per key, keys joined in a strip.
 * `solid` prints in one go as a flat decoration; `switch` makes a housing for
 * an MX-compatible key switch and a separate key cap that clicks on top.
 */
export type ClickerBuild = 'solid' | 'switch'
/** Frame outline; `pencil` butts square keys into a pencil body with an eraser and a sharpened tip. */
export type ClickerEdge = 'scallop' | 'round' | 'circle' | 'pencil'
export type ClickerLayout = 'column' | 'row'

export interface ClickerOptions {
  text: string
  build: ClickerBuild
  edge: ClickerEdge
  layout: ClickerLayout
  loop: boolean
  /** Key size, mm (decorative keys only; switch keys stay at the MX size). */
  keySize: number
  /** Frame (or pencil body) thickness, mm, decorative keys only. */
  frame: number
  /** Key cap height above the frame, mm, decorative keys only. */
  capH: number
  /** How far the letters stand above the cap, mm. */
  letterH: number
  /** Letter size as a share of the cap face, percent. */
  letterSize: number
}

export interface ClickerColours {
  /** Frame colour per key, repeated when there are more keys than colours. */
  frames: string[]
  cap: string
  letter: string
}

export const DEFAULT_CLICKER: ClickerOptions = {
  text: 'JJ', build: 'solid', edge: 'scallop', layout: 'column', loop: true, keySize: 20, frame: 3.6, capH: 3.2, letterH: 0.8, letterSize: 100,
}

/** Allowed ranges for the detailed settings: [min, max, step]. */
export const CLICKER_RANGES = {
  keySize: [16, 30, 1],
  frame: [2, 6, 0.2],
  capH: [1.6, 5, 0.2],
  letterH: [0.4, 2, 0.2],
  letterSize: [60, 100, 5],
} as const satisfies Record<string, readonly [number, number, number]>

export const MAX_KEYS = 10
/** Picture keys, drawn here rather than taken from the font. */
export const ICONS = ['♥', '★', '☺', '✿'] as const

/** Frame outer size and the distance between key centres, mm. */
export const KEY = 20
export const PITCH = 19
/** Decorative cap: base size, height and how far its shoulder rounds in. */
const CAP_SHAPE = { size: 15.6, inset: 1.2, r: 2.4 }
/** Letters fit in this square on the cap top. */
export const LETTER_BOX = 9.4

/**
 * MX-compatible switch fit (Cherry MX, Gateron, Kailh, Outemu). Plate hole
 * 14 mm plus print clearance, 1.5 mm plate, room below for the housing and pins.
 */
export const SWITCH = {
  hole: 14.1,
  plate: 1.5,
  cavity: 15.8,
  depth: 8.6,
  floor: 1.2,
  /** Stem top above the plate, mm, at rest. */
  // MX drawing: 11.6 mm housing + 3.6 mm stem - 5 mm plate seat.
  stemTop: 10.2,
}
/** Switch key cap: outer size, wall, skirt and stem depth, top thickness. */
export const SWITCH_CAP = { size: 17.4, wall: 1.2, skirt: 4.0, top: 2.4, inset: 1.4, r: 2.4, stemR: 2.8, cross: 4.15, arm: 1.35 }
const SWITCH_BODY_H = SWITCH.floor + SWITCH.depth + SWITCH.plate
/** Cap underside sits this far above the plate so the stem never bottoms out on the slider. */
const CAP_LIFT = SWITCH.stemTop + 0.5
const TAB = { r: 4, hole: 1.75, reach: 2.6 }

export const CLICKER_PALETTES: { id: string; name: string; colours: ClickerColours }[] = [
  { id: 'rainbow', name: 'เจ็ดสี', colours: { frames: ['#e5484d', '#f5a524', '#f2d63a', '#46a758', '#3e8ed0', '#6e56cf', '#d6409f'], cap: '#f7f7f5', letter: '#1f1f1f' } },
  { id: 'mono', name: 'ขาวดำ', colours: { frames: ['#1f1f1f'], cap: '#f7f7f5', letter: '#1f1f1f' } },
  { id: 'sea', name: 'ชายหาด', colours: { frames: ['#2bb3c0', '#f3e2b3', '#2b7fb8'], cap: '#ffffff', letter: '#1d4e6e' } },
  { id: 'garden', name: 'สวนดอกไม้', colours: { frames: ['#f28cb1', '#9bd37a', '#f9d36a', '#b59be8'], cap: '#fffaf2', letter: '#5b3a52' } },
  { id: 'dusk', name: 'โพล้เพล้', colours: { frames: ['#f08a5d', '#b83b5e', '#6a2c70'], cap: '#fbeee0', letter: '#3b1f3f' } },
  { id: 'forest', name: 'ป่าเขา', colours: { frames: ['#2f6b4f', '#7da46a', '#c9b37e'], cap: '#f1ede2', letter: '#2b3a2e' } },
  { id: 'night', name: 'กลางคืน', colours: { frames: ['#1d2b53', '#3a4a8c'], cap: '#e9e6f7', letter: '#f2c14e' } },
  { id: 'temple', name: 'ลายทอง', colours: { frames: ['#c8102e', '#d4a72c'], cap: '#fff6dc', letter: '#8a1c1c' } },
  { id: 'cloud', name: 'ฟ้าใส', colours: { frames: ['#9fd3f2', '#ffffff'], cap: '#ffffff', letter: '#3e8ed0' } },
  { id: 'coal', name: 'ถ่านแดง', colours: { frames: ['#2a2a2a'], cap: '#3a3a3a', letter: '#ff5a36' } },
  { id: 'pastel', name: 'พาสเทล', colours: { frames: ['#ffc8dd', '#bde0fe', '#cdeac0', '#fff1a8'], cap: '#ffffff', letter: '#555566' } },
  { id: 'mint', name: 'มิ้นต์', colours: { frames: ['#7fd8be'], cap: '#ffffff', letter: '#2d6a5a' } },
]

const HEX = /^#[0-9a-f]{6}$/i
const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })

/** Keys for a name: one per grapheme (so Thai marks stay on their letter), spaces dropped. */
export function keysOf(text: string) {
  return Array.from(segmenter.segment(text), (s) => s.segment).filter((g) => g.trim() !== '').slice(0, MAX_KEYS)
}

export function cleanClickerText(text: string) {
  // Keep whole graphemes only, and at most MAX_KEYS of them.
  const out: string[] = []
  let keys = 0
  for (const { segment } of segmenter.segment(text.replace(/\s+/g, ' ').replace(/^ /, ''))) {
    if (segment.trim() !== '') {
      if (keys === MAX_KEYS) break
      keys++
    }
    out.push(segment)
  }
  return out.join('')
}

export function cleanClicker(raw: unknown): ClickerOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T) => (list.includes(v as T) ? (v as T) : fallback)
  return {
    text: typeof o.text === 'string' ? cleanClickerText(o.text) : DEFAULT_CLICKER.text,
    build: pick(o.build, ['solid', 'switch'] as const, DEFAULT_CLICKER.build),
    edge: pick(o.edge, ['scallop', 'round', 'circle', 'pencil'] as const, DEFAULT_CLICKER.edge),
    layout: pick(o.layout, ['column', 'row'] as const, DEFAULT_CLICKER.layout),
    loop: typeof o.loop === 'boolean' ? o.loop : DEFAULT_CLICKER.loop,
    ...Object.fromEntries((Object.keys(CLICKER_RANGES) as (keyof typeof CLICKER_RANGES)[]).map((k) => {
      const [min, max, step] = CLICKER_RANGES[k]
      const v = typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : DEFAULT_CLICKER[k]
      return [k, Number((Math.round(Math.min(max, Math.max(min, v)) / step) * step).toFixed(2))]
    })) as Pick<ClickerOptions, keyof typeof CLICKER_RANGES>,
  }
}

export function cleanClickerColours(raw: unknown): ClickerColours {
  const fallback = CLICKER_PALETTES[0].colours
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d)
  const frames = Array.isArray(c.frames) ? c.frames.filter((v): v is string => typeof v === 'string' && HEX.test(v)).slice(0, MAX_KEYS) : []
  return {
    frames: frames.length ? frames.map((v) => v.toLowerCase()) : fallback.frames,
    cap: hex(c.cap, fallback.cap),
    letter: hex(c.letter, fallback.letter),
  }
}

/** Colour of key `i`. */
export const frameColour = (colours: ClickerColours, i: number) => colours.frames[i % colours.frames.length]

/** Compare repeating palettes even after they have been expanded per key. */
export function sameClickerColours(a: ClickerColours, b: ClickerColours) {
  return a.cap === b.cap && a.letter === b.letter &&
    Array.from({ length: MAX_KEYS }, (_, i) => frameColour(a, i) === frameColour(b, i)).every(Boolean)
}

/** An edit affects only this key, including when more text is added later. */
export function withClickerKeyColour(colours: ClickerColours, i: number, colour: string): ClickerColours {
  const frames = Array.from({ length: MAX_KEYS }, (_, k) => frameColour(colours, k))
  frames[i] = colour
  return { ...colours, frames }
}

/** Replace a selection without splitting a grapheme or dropping a full name's last key. */
export function insertClickerIcon(text: string, icon: string, start: number, end = start) {
  const segments = Array.from(segmenter.segment(text))
  const left = segments.find((s) => s.index <= start && s.index + s.segment.length > start)?.index ?? text.length
  const last = segments.find((s) => s.index < end && s.index + s.segment.length >= end)
  const right = end === start ? left : last ? last.index + last.segment.length : text.length
  const prefix = text.slice(0, left)
  const suffix = text.slice(right)
  if (keysOf(prefix + suffix).length >= MAX_KEYS) return { text, caret: start }
  return { text: cleanClickerText(prefix + icon + suffix), caret: cleanClickerText(prefix + icon).length }
}

/**
 * Round frame radius: the switch cavity, clipped to a 10 mm circle (still
 * clear of the 13.9 mm housing corners), keeps a 1.2 mm wall.
 */
export const CIRCLE_R = 11.2
const CIRCLE_CAVITY = 10

/** Centre of key `i`; the first key is at the top (column) or on the left (row). */
export function keyCentre(i: number, layout: ClickerLayout, edge: ClickerEdge = 'scallop'): [number, number] {
  const pitch = edge === 'pencil' ? KEY : edge === 'circle' ? 2 * CIRCLE_R - 1 : PITCH
  return layout === 'column' ? [0, -i * pitch] : [i * pitch, 0]
}

/** One frame outline, centred on the origin. */
export function frameShape(edge: ClickerEdge): Region {
  if (edge === 'circle') return circle(0, 0, CIRCLE_R, 96)
  if (edge === 'round') return roundRect(0, 0, KEY, KEY, 4)
  if (edge === 'pencil') return rect(0, 0, KEY, KEY)
  // Scalloped: round bumps all the way round a rounded square.
  const bump = 1.25
  const core = roundRect(0, 0, KEY - 2 * bump, KEY - 2 * bump, 3)
  const ring = core[0]
  const length = ring.reduce((sum, p, i) => sum + Math.hypot(p[0] - ring[(i + 1) % ring.length][0], p[1] - ring[(i + 1) % ring.length][1]), 0)
  const count = Math.max(12, Math.round(length / (bump * 1.7)))
  const step = length / count
  const bumps: Region[] = []
  let walked = 0
  let next = 0
  for (let i = 0; i < ring.length && bumps.length < count; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[(i + 1) % ring.length]
    const seg = Math.hypot(bx - ax, by - ay)
    while (next <= walked + seg && bumps.length < count) {
      const t = seg ? (next - walked) / seg : 0
      bumps.push(circle(ax + (bx - ax) * t, ay + (by - ay) * t, bump, 20))
      next += step
    }
    walked += seg
  }
  return union(core, ...bumps)
}

/** Each key's share of the joined strip: frames overlap, the earlier key keeps the overlap's first half. */
export function frameCells(n: number, o: ClickerOptions): Region[] {
  const shape = frameShape(o.edge)
  // Divide the joined silhouette, not each outline separately: staggered
  // scallops can otherwise lose their overlap at the colour boundary.
  const outline = union(...Array.from({ length: n }, (_, i) => translate(shape, ...keyCentre(i, o.layout, o.edge))))
  const pitch = Math.abs(keyCentre(1, o.layout, o.edge)[o.layout === 'column' ? 1 : 0])
  const big = KEY * 2
  return Array.from({ length: n }, (_, i) => {
    const [cx, cy] = keyCentre(i, o.layout, o.edge)
    let cell = outline
    // Cut at the midline to each neighbour so neighbouring colours meet without overlap.
    if (o.layout === 'column') {
      if (i > 0) cell = intersect(cell, rect(cx, cy - big / 2 + pitch / 2, big, big))
      if (i < n - 1) cell = intersect(cell, rect(cx, cy + big / 2 - pitch / 2, big, big))
    } else {
      if (i > 0) cell = intersect(cell, rect(cx + big / 2 - pitch / 2, cy, big, big))
      if (i < n - 1) cell = intersect(cell, rect(cx - big / 2 + pitch / 2, cy, big, big))
    }
    return cell
  })
}

/** The key-ring tab past the first key, its hole clear of the frame. */
function tab(o: ClickerOptions): { solid: Region; hole: Region } {
  const shape = frameShape(o.edge)
  const b = bounds(shape)
  if (o.layout === 'column') {
    const cy = b.maxY + TAB.reach
    return { solid: circle(0, cy, TAB.r, 48), hole: circle(0, cy, TAB.hole, 32) }
  }
  const cx = b.minX - TAB.reach
  return { solid: circle(cx, 0, TAB.r, 48), hole: circle(cx, 0, TAB.hole, 32) }
}

/** Glyphs for one key, fitted into LETTER_BOX and centred on the origin. */
export function keyArt(font: LoadedFont, key: string, box = LETTER_BOX): Region {
  const icon = iconArt(key, box)
  if (icon) return icon
  const unit = 100 / font.upem
  const art = union(regionFromShapes(shapeTextToShapes(font, key).shapes, unit))
  if (!art.length) return art
  const b = bounds(art)
  const k = box / Math.max(b.w, b.h)
  return art.map((poly) => poly.map(([x, y]) => [(x - (b.minX + b.maxX) / 2) * k, (y - (b.minY + b.maxY) / 2) * k] as [number, number]))
}

/** Our own picture keys, sized like a letter. */
export function iconArt(key: string, box = LETTER_BOX): Region | null {
  const s = box / 2
  if (key === '♥') {
    // Two circles and a point.
    const r = s * 0.52
    const lobes = union(circle(-r * 0.92, s * 0.3, r, 48), circle(r * 0.92, s * 0.3, r, 48))
    const tip: Region = [[[-s * 0.98, s * 0.12], [0, -s * 0.98], [s * 0.98, s * 0.12], [0, s * 0.4]]]
    return union(lobes, tip)
  }
  if (key === '★') {
    const pts: [number, number][] = []
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 ? s * 0.45 : s * 1.02
      pts.push([Math.cos(a) * r, Math.sin(a) * r - s * 0.06])
    }
    // Softly rounded points print cleaner than needle tips.
    return offset(offset([pts], -0.3), 0.3)
  }
  if (key === '☺') {
    const face = circle(0, 0, s, 64)
    const eyes = union(circle(-s * 0.36, s * 0.26, s * 0.15, 24), circle(s * 0.36, s * 0.26, s * 0.15, 24))
    const smile = diff(circle(0, -s * 0.05, s * 0.6, 48), union(circle(0, s * 0.12, s * 0.62, 48), rect(0, s * 0.4, s * 2, s * 0.8)))
    return diff(face, union(eyes, smile))
  }
  if (key === '✿') {
    const petals: Region[] = []
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 5
      petals.push(circle(Math.cos(a) * s * 0.52, Math.sin(a) * s * 0.52, s * 0.46, 36))
    }
    return diff(union(...petals), circle(0, 0, s * 0.22, 24))
  }
  return null
}

export interface ClickerModel {
  /** Assembled, for the preview. */
  parts: SignPart[]
  /** Laid out flat on the print bed (switch caps beside the housing). */
  print: SignPart[]
  /** Part code → colour, for both lists. */
  colours: Record<string, string>
  keys: string[]
  width: number
  height: number
  thickness: number
  warning?: string
}

interface Layer {
  label: string
  colour: string
  geometry: THREE.BufferGeometry[]
  explode: number
}

/** Builds the keychain; `colours` decides how frames are grouped into print files. */
export function buildClicker(font: LoadedFont, o: ClickerOptions, colours: ClickerColours): ClickerModel {
  const keys = keysOf(o.text)
  const empty: ClickerModel = { parts: [], print: [], colours: {}, keys, width: 0, height: 0, thickness: 0 }
  if (!keys.length) return empty
  const letters = [...new Set(keys)].filter((k) => !ICONS.includes(k as typeof ICONS[number]))
  if (letters.length) {
    const buffer = new hb.Buffer()
    buffer.addText(letters.join(''))
    buffer.guessSegmentProperties()
    hb.shape(font.hbFont, buffer)
    if (buffer.getGlyphInfos().some((g) => g.codepoint === 0)) {
      return { ...empty, warning: 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ' }
    }
  }
  const artCache = new Map<string, Region>()
  const arts = keys.map((k) => {
    if (!artCache.has(k)) artCache.set(k, keyArt(font, k, (LETTER_BOX * o.letterSize) / 100))
    return artCache.get(k)!
  })
  if (arts.some((a) => !a.length)) return { ...empty, warning: 'มีปุ่มที่ไม่มีลาย ลองลบอักขระพิเศษออก' }

  const n = keys.length
  const cells = frameCells(n, o)
  const ends = o.edge === 'pencil' ? pencilEnds(n, o) : []
  const t = o.loop && o.edge !== 'pencil' ? tab(o) : null
  if (t) cells[0] = union(cells[0], t.solid)

  // Frames of the same colour print as one file.
  const byColour = new Map<string, number[]>()
  cells.forEach((_, i) => {
    const c = frameColour(colours, i)
    byColour.set(c, [...(byColour.get(c) ?? []), i])
  })
  const frameGroups = [...byColour.entries()].map(([colour, idx]) => ({ colour, region: cut(union(...idx.map((i) => cells[i])), t?.hole) }))
  const centres = keys.map((_, i) => keyCentre(i, o.layout, o.edge))
  const placedArt = arts.map((a, i) => translate(a, ...centres[i]))

  const view: Layer[] = []
  const print: Layer[] = []
  const groupLabel = (i: number) => (frameGroups.length === 1 ? 'กรอบ' : `กรอบ ${i + 1}`)
  // Pencil ends stand as tall as the frames or the switch housing.
  const FRAME_H = o.frame
  const LETTER_H = o.letterH
  const CAP = { ...CAP_SHAPE, h: o.capH }
  const endHeight = o.build === 'solid' ? FRAME_H : SWITCH_BODY_H
  for (const e of ends) {
    const layer: Layer = { label: e.label, colour: e.colour, geometry: [extrude(e.region, endHeight, 0)], explode: 0 }
    view.push(layer)
    if (o.build === 'switch') print.push(layer)
  }
  if (o.build === 'solid') {
    frameGroups.forEach((g, i) => view.push({ label: groupLabel(i), colour: g.colour, geometry: [extrude(g.region, FRAME_H, 0)], explode: 0 }))
    const cap = roundRect(0, 0, CAP.size, CAP.size, CAP.r)
    const capTemplate = chamfer(cap, CAP.h, CAP.inset, FRAME_H, 6)
    view.push({
      label: 'ปุ่ม',
      colour: colours.cap,
      geometry: centres.map(([x, y]) => capTemplate.clone().translate(x, y, 0)),
      explode: 0.6,
    })
    capTemplate.dispose()
    view.push({ label: 'ตัวอักษร', colour: colours.letter, geometry: [extrude(union(...placedArt), LETTER_H, FRAME_H + CAP.h)], explode: 1.2 })
  } else {
    const cavity = union(...centres.map(([x, y]) => {
      const pocket = roundRect(x, y, SWITCH.cavity, SWITCH.cavity, 0.6)
      return o.edge === 'circle' ? intersect(pocket, circle(x, y, CIRCLE_CAVITY, 64)) : pocket
    }))
    const hole = union(...centres.map(([x, y]) => rect(x, y, SWITCH.hole, SWITCH.hole)))
    frameGroups.forEach((g, i) => {
      const layer: Layer = {
        label: `ตัวเรือน${frameGroups.length === 1 ? '' : ' ' + (i + 1)}`,
        colour: g.colour,
        // Floor and plate sit 0.01 mm inside the wall so the three shells never
        // share an edge; the slicer fuses them into one solid.
        geometry: [
          extrude(offset(g.region, -0.01), SWITCH.floor, 0),
          extrude(diff(g.region, cavity), SWITCH.depth, SWITCH.floor),
          extrude(offset(diff(g.region, hole), -0.01), SWITCH.plate, SWITCH.floor + SWITCH.depth),
        ],
        explode: 0,
      }
      view.push(layer)
      print.push(layer)
    })
    const lift = SWITCH_BODY_H + CAP_LIFT - SWITCH_CAP.skirt
    // Caps print upright beside the housing: skirt and stem on the bed, the top bridges over.
    const strip = bounds(union(...cells, ...ends.map((e) => e.region)))
    const bed = centres.map(([x, y]): [number, number] =>
      o.layout === 'column' ? [strip.maxX + 4 + SWITCH_CAP.size / 2, y] : [x, strip.minY - 4 - SWITCH_CAP.size / 2])
    const capTemplate = capSolid(0, 0, 0)
    const capAt = (at: [number, number][], z: number) => at.map(([x, y]) => capTemplate.clone().translate(x, y, z))
    view.push({ label: 'ปุ่ม', colour: colours.cap, geometry: capAt(centres, lift), explode: 2 })
    print.push({ label: 'ปุ่ม', colour: colours.cap, geometry: capAt(bed, 0), explode: 0 })
    const capTop = SWITCH_CAP.skirt + SWITCH_CAP.top
    view.push({ label: 'ตัวอักษร', colour: colours.letter, geometry: [extrude(union(...placedArt), LETTER_H, lift + capTop)], explode: 2.4 })
    print.push({ label: 'ตัวอักษร', colour: colours.letter, geometry: [extrude(union(...arts.map((a, i) => translate(a, ...bed[i]))), LETTER_H, capTop)], explode: 0 })
    capTemplate.dispose()
    // A grey stand-in for the bought switch, preview only.
    const proxy = switchProxy(0, 0, SWITCH_BODY_H)
    view.push({ label: 'สวิตช์ (ซื้อแยก)', colour: '#9aa0a6', geometry: centres.map(([x, y]) => proxy.clone().translate(x, y, 0)), explode: 1 })
    proxy.dispose()
  }

  const toParts = (layers: Layer[], material: (l: Layer) => SignPart['material']) => {
    const list = new Parts()
    for (const l of layers) list.solid(l.label, material(l), merge(l.geometry), l.explode)
    return list.done()
  }
  const isSwitch = (l: Layer) => l.label.startsWith('สวิตช์')
  const parts = toParts(view, (l) => (isSwitch(l) ? 'rubber' : 'print'))
  // The decorative keychain prints exactly as shown.
  const printParts = print.length ? toParts(print, () => 'print') : parts
  for (const l of new Set([...view, ...print])) l.geometry.forEach((g) => g.dispose())
  const tints: Record<string, string> = {}
  parts.forEach((p, i) => (tints[p.code] = view[i].colour))
  printParts.forEach((p, i) => (tints[p.code] ??= print[i].colour))

  // Decorative keys are drawn at the 20 mm standard and scaled across;
  // switch keys must keep the MX fit, so they never scale.
  const k = o.build === 'solid' ? o.keySize / KEY : 1
  if (k !== 1) for (const part of new Set([...parts, ...printParts])) part.geometry.scale(k, k, 1)
  const outline = union(...cells, ...ends.map((e) => e.region))
  const b = bounds(outline)
  const thickness = o.build === 'solid' ? FRAME_H + CAP.h + LETTER_H : SWITCH_BODY_H + CAP_LIFT + SWITCH_CAP.top + LETTER_H
  const warning = printWarnings(k === 1 ? arts : arts.map((a) => scale(a, k)), keys)
  return { parts, print: printParts, colours: tints, keys, width: b.w * k, height: b.h * k, thickness, warning }
}

/** Fixed colours for the pencil's ends. */
export const PENCIL_COLOURS = { eraser: '#f29bb0', ferrule: '#c4c8cc', wood: '#e8c48e', lead: '#3b3b3b' }

/**
 * Eraser, metal band, wood cone and lead around a strip of square keys, laid
 * along the key axis. The key-ring tab, if any, sits past the eraser.
 */
export function pencilEnds(n: number, o: ClickerOptions): { label: string; colour: string; region: Region }[] {
  const w = KEY / 2
  const start = -KEY / 2
  const end = (n - 1) * KEY + KEY / 2
  const ferrule = rect(start - 2.5, 0, 5, KEY - 0.6)
  let eraser = union(roundRect(start - 10, 0, 6, KEY - 1.6, 3), rect(start - 7, 0, 4, KEY - 1.6))
  // A flat 0.8 mm tip avoids a needle or a detached rounding sliver.
  const coneBody: Region = [[[end, -w], [end + 22, -0.4], [end + 22, 0.4], [end, w]]]
  const lead = intersect(coneBody, rect(end + 16 + 12, 0, 24, KEY))
  const wood = diff(coneBody, lead)
  if (o.loop) {
    const cx = start - 13 - TAB.reach + 2
    eraser = diff(union(eraser, circle(cx, 0, TAB.r, 48)), circle(cx, 0, TAB.hole, 32))
  }
  // Rows run along +x; columns turn so the eraser is at the top.
  const place = (r: Region): Region => (o.layout === 'row' ? r : r.map((poly) => poly.map(([x, y]) => [y, -x] as [number, number])))
  return [
    { label: 'ยางลบ', colour: PENCIL_COLOURS.eraser, region: place(eraser) },
    { label: 'ปลอกโลหะ', colour: PENCIL_COLOURS.ferrule, region: place(ferrule) },
    { label: 'เนื้อไม้', colour: PENCIL_COLOURS.wood, region: place(wood) },
    { label: 'ไส้ดินสอ', colour: PENCIL_COLOURS.lead, region: place(lead) },
  ]
}

function cut(region: Region, hole?: Region) {
  return hole ? diff(region, hole) : region
}

/** A switch key cap standing on `z`: skirt, cross stem, rounded top. */
export function capSolid(x: number, y: number, z: number): THREE.BufferGeometry {
  const c = SWITCH_CAP
  const outer = roundRect(x, y, c.size, c.size, c.r)
  const skirt = diff(outer, roundRect(x, y, c.size - 2 * c.wall, c.size - 2 * c.wall, Math.max(0.4, c.r - c.wall)))
  const cross = union(rect(x, y, c.cross, c.arm), rect(x, y, c.arm, c.cross))
  const stem = diff(circle(x, y, c.stemR, 40), cross)
  return merge([
    extrude(union(skirt, stem), c.skirt, z),
    chamfer(outer, c.top, c.inset, z + c.skirt, 6),
  ])
}

function switchProxy(x: number, y: number, plateTop: number) {
  return merge([
    extrude(roundRect(x, y, 13.9, 13.9, 0.8), 5, plateTop - 5),
    extrude(roundRect(x, y, 15.4, 15.4, 0.8), 1, plateTop),
    chamfer(roundRect(x, y, 14.6, 14.6, 1), 5.6, 2.2, plateTop + 1, 4),
    extrude(union(rect(x, y, 4, 1.2), rect(x, y, 1.2, 4)), SWITCH.stemTop - 6.6, plateTop + 6.6),
  ])
}

/** Thin strokes and closed-up counters print poorly at letter size. */
export function printWarnings(arts: Region[], keys: string[]) {
  const thin: string[] = []
  const checked = new Set<string>()
  arts.forEach((art, i) => {
    if (checked.has(keys[i])) return
    checked.add(keys[i])
    // A stroke narrower than 0.8 mm (two nozzle widths) disappears when shrunk by 0.4.
    const core = offset(art, -0.4)
    const lost = islands(diff(art, offset(core, 0.4))).some((piece) => regionArea(piece) > 0.5)
    if (lost && !thin.includes(keys[i])) thin.push(keys[i])
  })
  return thin.length ? `เส้นบางของ ${thin.join(' ')} บางกว่า 0.8 มม. อาจพิมพ์ไม่ชัด ลองฟอนต์ที่หนากว่า` : undefined
}

/** The parts list and print steps that go in the ZIP. */
export function clickerReadme(model: ClickerModel, o: ClickerOptions, list: string) {
  const isSwitch = o.build === 'switch'
  const colourRows = model.print.map((p) => `  ${p.code} ${p.label.padEnd(12)} ${model.colours[p.code]}`)
  return [
    'JJDesign — พวงกุญแจปุ่มคีย์บอร์ด',
    `ปุ่ม: ${model.keys.join(' ')} (${model.keys.length} ปุ่ม)`,
    `ขนาด ${model.width.toFixed(1)} × ${model.height.toFixed(1)} มม.${o.loop ? ' รวมหูห้อย' : ''} · หนา ${model.thickness.toFixed(1)} มม.${isSwitch ? ' เมื่อประกอบสวิตช์แล้ว' : ''}`,
    isSwitch ? `ตัวอักษรนูน ${o.letterH} มม. · ขนาดตัวอักษร ${o.letterSize}% ของหน้าปุ่ม` : `ปุ่ม ${o.keySize} มม. · กรอบหนา ${o.frame} มม. · ปุ่มสูง ${o.capH} มม. · ตัวอักษรนูน ${o.letterH} มม. · ขนาดตัวอักษร ${o.letterSize}% ของหน้าปุ่ม`,
    isSwitch ? 'แบบกดได้: ใช้สวิตช์คีย์บอร์ดแบบ MX (Cherry MX, Gateron, Kailh, Outemu) ซื้อแยก 1 ตัวต่อ 1 ปุ่ม' : 'แบบตกแต่ง: พิมพ์ชิ้นเดียวจบ ไม่ต้องประกอบ',
    model.warning ?? '',
    '',
    list,
    '',
    'สีที่เลือก',
    ...colourRows,
    '',
    'พิมพ์หลายสีใน Bambu Studio (หรือ OrcaSlicer)',
    '1. ลากไฟล์ STL ทุกไฟล์ในโฟลเดอร์ พลาสติกพิมพ์ เข้าโปรแกรมพร้อมกัน',
    '2. เมื่อถามว่าจะโหลดเป็นวัตถุเดียวที่มีหลายชิ้นไหม ให้ตอบ "ใช่" ทุกชิ้นจะวางตรงกันเอง',
    '3. ในรายการวัตถุ เลือกแต่ละชิ้นแล้วกำหนดเส้นพลาสติกตามสีด้านบน',
    '4. เริ่มที่ชั้น 0.2 มม. ผนัง 3 เส้น เติม 20% ตรวจทุกชั้นในตัวอย่างก่อนพิมพ์',
    'ไฟล์แยกสีเป็นชิ้นส่วนของงานเดียวกัน ตัวอักษรวางบนปุ่ม ไม่ต้องย้ายแต่ละสีลงเตียงแยกกัน',
    ...(isSwitch
      ? [
          '',
          'ประกอบแบบกดได้',
          `- รูใส่สวิตช์ ${SWITCH.hole} มม. แผ่นหนา ${SWITCH.plate} มม. กดสวิตช์ลงจากด้านบนจนขาล็อกดังคลิก`,
          '- ปุ่มพิมพ์ตั้งตรงข้างตัวเรือน กระโปรงและปลอกแกนเริ่มบนเตียง หลังคาปุ่มมีช่วงบริดจ์ได้ถึงประมาณ 15 มม. ตรวจการบริดจ์ก่อนพิมพ์โดยไม่ใช้ซัพพอร์ต',
          '- ตรวจระยะกดสุด 4 มม. และความพอดีกับสวิตช์ที่ใช้ ก่อนกดประกอบทุกปุ่ม',
          '- แนะนำพิมพ์ 1 ปุ่มลองก่อน ถ้าแน่นหรือหลวม ปรับค่า X-Y hole compensation ในโปรแกรมพิมพ์',
          '- ถ้าสวิตช์หลวม หยดกาวที่ขอบรูเล็กน้อย',
        ]
      : []),
    'ถ้าพิมพ์สีเดียว ใช้ไฟล์ -ทั้งหมด.stl ไฟล์เดียว',
    '',
    'ไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ขึ้น',
    '',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n')
}
