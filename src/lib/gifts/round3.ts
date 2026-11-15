import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, intersect, ngon, offset, rect, roundRect, scale, stroke, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  connectedLetter, filled, standingFoot, fillSmallHoles, fitText, missingGlyphs, num, str, THICKNESS,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues,
} from './core'
import { daisy, leafBranch } from './patterns'

const KEY_SHAPES = [
  { id: 'heart', label: 'หัวใจ' },
  { id: 'star', label: 'ดาว' },
  { id: 'cloud', label: 'ก้อนเมฆ' },
  { id: 'flower', label: 'ดอกไม้' },
  { id: 'circle', label: 'วงกลม' },
  { id: 'bear', label: 'หมี' },
  { id: 'cat', label: 'แมว' },
]

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ'

const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}
const centreAt = (region: Region, x: number, y: number): Region => {
  const b = bounds(region)
  return translate(region, x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2)
}
const soft = (art: Region, h: number) => puffUp(art, Math.min(0.5, h * 0.04))


/** An open container: a floor and a wall following `shape` (seen from above). */
function cup(shape: Region, height: number, wall: number, floor: number, colour: string): GiftLayer[] {
  // A flat front wall gives the standing plate an area of contact instead of
  // touching a round/hexagonal cup only along a tangent line.
  const b = bounds(shape)
  shape = union(shape, rect(b.cx, b.minY + wall / 2, b.w * 0.65, wall))
  return [
    { colour, region: shape, z: 0, h: floor },
    { colour, region: diff(shape, offset(shape, -wall)), z: floor, h: height - floor },
  ]
}

/**
 * A name plate standing against the front of a container whose front face is
 * at `front` (y): the plate drawn in front view, then the name raised on it.
 */
function frontPlate(plate: Region, face: Region, extra: { region: Region; colour: string }[], front: number, t: number, r: number): GiftLayer[] {
  return [
    { colour: 'plate', region: plate, z: 0, h: t, stand: front },
    { colour: 'text', region: face, z: t, h: r, stand: front },
    ...extra.map((e) => ({ colour: e.colour, region: e.region, z: t, h: r, stand: front })),
  ]
}

// ——— desk ———

const CUP_PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Magno', maxChars: 12 },
  { key: 'height', label: 'ความสูง', kind: 'number', default: 95, min: 60, max: 160, step: 1, unit: 'มม.' },
  { key: 'width', label: 'ความกว้าง', kind: 'number', default: 80, min: 50, max: 140, step: 1, unit: 'มม.' },
  { key: 'wall', label: 'ความหนาผนัง', kind: 'number', default: 2, min: 1.2, max: 4, step: 0.2, unit: 'มม.' },
  { key: 'base', label: 'ความหนาป้ายชื่อ', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ชื่อนูน', kind: 'number', default: 1.2, min: 0.4, max: 3, step: 0.2, unit: 'มม.' },
]

const CUP_COLOURS = [
  { key: 'cup', label: 'ตัวกล่อง', default: '#ffffff' },
  { key: 'plate', label: 'ป้ายชื่อ', default: '#ffd43b' },
  { key: 'text', label: 'ชื่อ', default: '#e64980' },
  { key: 'motif', label: 'ลาย', default: '#343a40' },
  { key: 'accent', label: 'สีเสริม', default: '#ffffff' },
  { key: 'tip', label: 'ไส้และยางลบ', default: '#ff8787' },
]

const CUP_HOWTO = [
  'กล่องพิมพ์ตั้งตรง ป้ายชื่อยื่นจากผนังด้านหน้า เปิดซัพพอร์ตใต้ป้ายและลายที่ยื่น ตัวอักษรบนผนังตั้งใช้พิมพ์หลายสีแบบแยกวัตถุ (AMS)',
  'ถ้าพิมพ์สีเดียว ทาสีตัวอักษรภายหลังได้',
]

/** Busy-bee holder: a hexagonal cup with a honeycomb name plate, a bee and daisies. */
function beeHolder(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = num(v, 'height')
  const shape = ngon(0, 0, W / 2, 6, Math.PI / 6)
  const front = bounds(shape).minY
  const plateW = W * 0.86
  const plateH = H * 0.42
  const plate = roundRect(0, H * 0.42, plateW, plateH, plateH * 0.2)
  const fit = fitText(ctx.font, name, plateW * 0.8, plateH * 0.42, plateH * 0.38, false)
  const face = fit.art.length ? soft(centreAt(fit.art, 0, H * 0.38), fit.height) : []
  const bee = centreAt(sized(charmArt('bee'), plateH * 0.42), plateW * 0.3, H * 0.42 + plateH * 0.42)
  const d = daisy(-plateW * 0.38, H * 0.42 + plateH * 0.36, plateH * 0.22)
  return {
    layers: [
      ...cup(shape, H, num(v, 'wall'), 2, 'cup'),
      ...frontPlate(union(plate, filled(bee), d.petals, d.centre), face, [
        { region: filled(bee), colour: 'accent' },
        { region: diff(filled(bee), bee), colour: 'motif' },
        { region: d.petals, colour: 'accent' },
        { region: d.centre, colour: 'motif' },
      ], front, num(v, 'base'), num(v, 'raise')),
    ],
  }
}

/** A round cup with a pencil-shaped name plate across the front. */
function pencilCup(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = num(v, 'height')
  const shape = circle(0, 0, W / 2, 96)
  const L = W * 1.25
  const h = H * 0.3
  const y = H * 0.4
  const bodyL = L * 0.62
  const body = rect(-L / 2 + bodyL / 2 + L * 0.08, y, bodyL, h)
  const band = rect(-L / 2 + L * 0.06, y, L * 0.04, h)
  const eraser = roundRect(-L / 2 + L * 0.02, y, L * 0.04, h, h * 0.2)
  const tipStart = -L / 2 + L * 0.08 + bodyL
  const cone: Region = [[[tipStart, y - h / 2], [L / 2, y], [tipStart, y + h / 2]]]
  const lead = diff(cone, rect(tipStart - 1, y, (L / 2 - tipStart) * 1.4, h * 2))
  const wood = diff(cone, offset(lead, 0.01))
  const fit = fitText(ctx.font, name, bodyL * 0.86, h * 0.62, h * 0.55, false)
  const face = fit.art.length ? soft(centreAt(fit.art, -L / 2 + L * 0.08 + bodyL / 2, y), fit.height) : []
  const t = num(v, 'base')
  const front = bounds(shape).minY
  return {
    layers: [
      ...cup(shape, H, num(v, 'wall'), 2, 'cup'),
      { colour: 'plate', region: body, z: 0, h: t, stand: front },
      { colour: 'accent', region: union(band, wood), z: 0, h: t, stand: front },
      { colour: 'tip', region: union(eraser, lead), z: 0, h: t, stand: front },
      { colour: 'text', region: face, z: t, h: num(v, 'raise'), stand: front },
    ],
  }
}

/** A long pen tray with a rounded name plate on its front edge. */
function penTray(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width') * 2.4
  const D = num(v, 'width') * 0.8
  const H = num(v, 'height') * 0.35
  const shape = roundRect(0, 0, W, D, 6)
  const plate = roundRect(0, H * 0.55, W * 0.6, H * 0.8, H * 0.2)
  const fit = fitText(ctx.font, name, W * 0.52, H * 0.6, H * 0.55, false)
  const face = fit.art.length ? soft(centreAt(fit.art, 0, H * 0.55), fit.height) : []
  return {
    layers: [
      ...cup(shape, H, num(v, 'wall'), 2, 'cup'),
      // A divider for small items.
      { colour: 'cup', region: rect(W * 0.25, 0, num(v, 'wall'), D - 1), z: 2, h: H * 0.7 },
      ...frontPlate(plate, face, [], bounds(shape).minY, num(v, 'base'), num(v, 'raise')),
    ],
  }
}

/** A box whose front carries the name as standing letters on a fitted backing. */
function nameBox(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width') * 1.6
  const D = num(v, 'width') * 0.75
  const H = num(v, 'height')
  const shape = roundRect(0, 0, W, D, 4)
  const fit = fitText(ctx.font, name, W * 0.9, H * 0.5, H * 0.45, false)
  const face = fit.art.length ? soft(centreAt(fit.art, 0, H * 0.45), fit.height) : []
  const backing = face.length ? silhouette(face, 2.4) : []
  return {
    layers: [
      ...cup(shape, H, num(v, 'wall'), 2, 'cup'),
      ...frontPlate(backing, face, [], bounds(shape).minY, num(v, 'base'), num(v, 'raise')),
    ],
  }
}

/** A pair of L-shaped bookends, each an upright letter panel with a leafy branch. */
function bookends(ctx: GiftContext, v: GiftValues) {
  const left = str(v, 'name').trim()
  const right = str(v, 'name2').trim()
  if (missingGlyphs(ctx.font, left + right)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'height') * 1.3
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  const gap = 40
  ;[left, right].forEach((word, i) => {
    if (!word) return
    const side = i ? 1 : -1
    const cx = side * (H * 0.4 + gap / 2)
    const panel = roundRect(cx, H / 2, H * 0.75, H, 10)
    const fit = fitText(ctx.font, word, H * 0.62, H * 0.75, H * 0.45, true)
    const face = fit.art.length ? soft(centreAt(fit.art, cx, H * 0.5), fit.height) : []
    const branch = leafBranch([cx - H * 0.36, H * 0.92], [cx + H * 0.1, H * 0.68], H * 0.11, 6)
    const back = 30
    // The foot runs forward under the books; the panel stands at its back edge.
    layers.push({ colour: 'plate', region: rect(cx, back - 35, H * 0.75, 70), z: 0, h: 4 })
    layers.push({ colour: 'plate', region: panel, z: 0, h: t, stand: back })
    layers.push({ colour: 'text', region: face, z: t, h: r, stand: back })
    layers.push({ colour: 'motif', region: diff(branch, offset(face, 1.5)), z: t, h: r, stand: back })
  })
  return { layers }
}

/** A round candy jar with Santa on the front and the name under him. */
function santaJar(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = num(v, 'height')
  const shape = circle(0, 0, W / 2, 96)
  const santa = centreAt(sized(charmArt('santa'), H * 0.55), 0, H * 0.62)
  const fit = fitText(ctx.font, name, W * 0.9, H * 0.2, H * 0.17, false)
  const face = fit.art.length ? soft(centreAt(fit.art, 0, bounds(santa).minY - fit.height * 0.55), fit.height) : []
  const plate = silhouette(union(santa, face), 3)
  return {
    layers: [
      ...cup(shape, H, num(v, 'wall'), 2, 'cup'),
      ...frontPlate(plate, face, [
        { region: filled(santa), colour: 'accent' },
        { region: diff(filled(santa), santa), colour: 'motif' },
      ], bounds(shape).minY, num(v, 'base'), num(v, 'raise')),
    ],
  }
}

// ——— home ———

const BOWL_PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อสัตว์เลี้ยง', kind: 'text', default: 'Mochi', maxChars: 12 },
  { key: 'width', label: 'ความกว้างปากชาม', kind: 'number', default: 150, min: 90, max: 220, step: 1, unit: 'มม.' },
  { key: 'height', label: 'ความสูง', kind: 'number', default: 55, min: 30, max: 100, step: 1, unit: 'มม.' },
  { key: 'wall', label: 'ความหนาผนัง', kind: 'number', default: 2.4, min: 1.6, max: 5, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ชื่อนูนในก้นชาม', kind: 'number', default: 0.8, min: 0.4, max: 2, step: 0.2, unit: 'มม.' },
]

/** A bowl from thin stacked rings: straight (cone) or rounded sides. */
function petBowl(ctx: GiftContext, v: GiftValues, curved: boolean) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const R1 = num(v, 'width') / 2
  const H = num(v, 'height')
  // Bound the maximum radial slope, including the curved profile's pi/2 factor.
  const R0 = Math.max(R1 * 0.72, R1 - (H - 3) / (curved ? Math.PI / 2 : 1))
  const wall = num(v, 'wall')
  const floor = 3
  const steps = Math.max(12, Math.round(H / 0.6))
  const layers: GiftLayer[] = [{ colour: 'cup', region: circle(0, 0, R0, 128), z: 0, h: floor }]
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const k = curved ? Math.sin((t * Math.PI) / 2) : t
    const R = R0 + (R1 - R0) * k
    const z = floor + ((H - floor) * i) / steps
    layers.push({ colour: 'cup', region: diff(circle(0, 0, R, 128), circle(0, 0, R - wall, 128)), z, h: (H - floor) / steps })
  }
  // The name and two paws raised inside, on the floor.
  const fit = fitText(ctx.font, name, R0 * 1.3, R0 * 0.5, R0 * 0.4, false)
  const face = fit.art.length ? soft(centreAt(fit.art, 0, -R0 * 0.1), fit.height) : []
  const paw = sized(charmArt('paw'), R0 * 0.28)
  layers.push({ colour: 'text', region: face, z: floor, h: num(v, 'raise') })
  layers.push({ colour: 'motif', region: union(centreAt(paw, -R0 * 0.35, R0 * 0.48), centreAt(paw, R0 * 0.35, R0 * 0.48)), z: floor, h: num(v, 'raise') })
  return { layers }
}

/** A photo frame: a recess at the front for the photo, the name on the bottom bar. */
function photoFrame(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const pw = num(v, 'photoW')
  const ph = num(v, 'photoH')
  const bar = Math.max(22, ph * 0.3)
  const side = 10
  const W = pw + 2 * side
  const H = ph + side + bar
  const t = num(v, 'base')
  const outer = roundRect(0, 0, W, H, 8)
  const winY = (H / 2 - side) - ph / 2
  const window = rect(0, winY, pw, ph)
  const lip = rect(0, winY, pw - 6, ph - 6)
  const fit = fitText(ctx.font, name, Math.max(1, W - 2 * side - bar), bar * 0.7, bar * 0.6, false)
  const face = fit.art.length ? soft(centreAt(fit.art, 0, -H / 2 + bar / 2), fit.height) : []
  const heart = sized(charmArt('heart'), bar * 0.4)
  const hearts = union(centreAt(heart, -W / 2 + side + bar * 0.25, -H / 2 + bar / 2), centreAt(heart, W / 2 - side - bar * 0.25, -H / 2 + bar / 2))
  return {
    layers: [
      // Back with a slightly smaller window: the photo sits in the front recess on this lip.
      standingFoot(outer, 'plate', 1.6 + t, 8),
      { colour: 'plate', region: diff(outer, lip), z: 0, h: 1.6 },
      { colour: 'plate', region: diff(outer, window), z: 1.6, h: t },
      { colour: 'text', region: face, z: 1.6 + t, h: num(v, 'raise') },
      { colour: 'motif', region: hearts, z: 1.6 + t, h: num(v, 'raise') },
    ],
  }
}

/** A fridge magnet: a shape with the name, and a pocket underneath for a round magnet. */
function magnet(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const s = num(v, 'size')
  const shape = str(v, 'shape') === 'circle' ? circle(0, 0, s / 2, 96) : sized(filled(charmArt(str(v, 'shape'))), s)
  const b = bounds(shape)
  const fit = fitText(ctx.font, name, b.w * 0.72, b.h * 0.42, b.h * 0.34)
  const face = fit.art.length ? soft(centreAt(fit.art, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 - b.h * 0.04), fit.height) : []
  const md = num(v, 'magnet')
  const t = Math.max(num(v, 'base'), 3.4)
  const pocket = circle(b.cx, b.cy, md / 2 + 0.15, 48)
  if (diff(offset(pocket, 1.2), shape).length) return { layers: [], warning: 'ช่องแม่เหล็กใหญ่เกินรูปทรง ลองลดขนาดแม่เหล็กหรือเพิ่มขนาดป้าย' }
  return {
    layers: [
      { colour: 'plate', region: diff(shape, circle((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, md / 2 + 0.15, 48)), z: 0, h: 2.2 },
      { colour: 'plate', region: shape, z: 2.2, h: t - 2.2 },
      { colour: 'text', region: intersect(face, shape), z: t, h: num(v, 'raise') },
    ],
  }
}

/** A song plaque: title and artist, a sound wave (or heartbeat), a progress bar and controls. */
function musicPlaque(ctx: GiftContext, v: GiftValues, heartbeat: boolean) {
  const title = str(v, 'title')
  const artist = str(v, 'artist')
  if (missingGlyphs(ctx.font, title + artist)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = W * 0.62
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const plate = roundRect(0, 0, W, H, 8)
  const art: Region[] = []
  const tFit = fitText(ctx.font, title, W * 0.84, H * 0.16, H * 0.13, false)
  if (tFit.art.length) art.push(soft(centreAt(tFit.art, 0, H * 0.32), tFit.height))
  const aFit = fitText(ctx.font, artist, W * 0.7, H * 0.1, H * 0.075, false)
  if (aFit.art.length) art.push(soft(centreAt(aFit.art, 0, H * 0.17), aFit.height))
  const waveY = -H * 0.02
  if (heartbeat) {
    // A pulse line with a heart in the middle.
    const pts: [number, number][] = []
    const w = W * 0.8
    const beats = [-0.32, -0.18, 0.18, 0.32]
    for (let i = 0; i <= 80; i++) {
      const x = -w / 2 + (w * i) / 80
      const u = x / w
      let y = 0
      for (const c0 of beats) {
        const d = (u - c0) * 40
        if (Math.abs(d) < 1) y += (d < 0 ? 1 + d : 1 - d) * H * 0.12 * (Math.abs(c0) < 0.25 ? 1 : 0.6) * (Math.round(c0 * 10) % 2 ? -1 : 1)
      }
      pts.push([x, waveY + y])
    }
    const heart = centreAt(sized(charmArt('heart'), H * 0.2), 0, waveY)
    art.push(union(diff(stroke(pts, 1.6), offset(heart, 1.2)), heart))
  } else {
    // Bars whose heights follow the title's letters, so every song looks different.
    const n = 34
    const bw = (W * 0.8) / n
    let seed = 0
    for (const ch of title + artist) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      const env = Math.sin((Math.PI * (i + 0.5)) / n)
      const hgt = Math.max(2.4, H * 0.24 * (0.25 + 0.75 * env * ((seed >>> 16) % 100) / 100))
      art.push(roundRect(-W * 0.4 + bw * (i + 0.5), waveY, bw * 0.55, hgt, Math.min(bw * 0.27, hgt / 2)))
    }
  }
  // Progress bar and controls.
  const barY = -H * 0.24
  art.push(roundRect(0, barY, W * 0.8, 1.6, 0.8), circle(-W * 0.12, barY, 2.6, 24))
  const cy = -H * 0.37
  const s = H * 0.05
  const play: Region = [[[-s * 0.8, cy - s], [s, cy], [-s * 0.8, cy + s]]]
  const prev = union([[[-W * 0.18, cy], [-W * 0.18 + s * 1.4, cy - s * 0.9], [-W * 0.18 + s * 1.4, cy + s * 0.9]]], rect(-W * 0.18 - 0.8, cy, 1.6, s * 1.8))
  const next = union([[[W * 0.18, cy], [W * 0.18 - s * 1.4, cy + s * 0.9], [W * 0.18 - s * 1.4, cy - s * 0.9]]], rect(W * 0.18 + 0.8, cy, 1.6, s * 1.8))
  art.push(diff(circle(0, cy, s * 1.9, 48), offset(play, 0.6)), prev, next)
  return {
    layers: [
      standingFoot(plate, 'plate', t, 8),
      { colour: 'plate', region: plate, z: 0, h: t },
      { colour: 'text', region: union(...art), z: t, h: r },
    ],
  }
}

/** Glasses: two lens frames with a bridge, and the name on a bar underneath. */
function glassesSign(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  if (missingGlyphs(ctx.font, name)) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const lens = W * 0.36
  const t = num(v, 'base')
  const lensAt = (x: number) => roundRect(x, 0, lens, lens * 0.78, lens * 0.32)
  const frames = union(...[-1, 1].map((sx) => diff(lensAt((sx * W) / 4), offset(lensAt((sx * W) / 4), -3))))
  const bridge = stroke([[-W / 4 + lens / 2 - 1.5, lens * 0.12], [0, lens * 0.22], [W / 4 - lens / 2 + 1.5, lens * 0.12]], 3)
  // The arms start inside the frame so they join it along an edge, not at a point.
  const temples = union(stroke([[-W / 4 - lens / 2 + 1.5, lens * 0.2], [-W / 2 - 6, lens * 0.4]], 3), stroke([[W / 4 + lens / 2 - 1.5, lens * 0.2], [W / 2 + 6, lens * 0.4]], 3))
  const fit = fitText(ctx.font, name, W * 0.85, lens * 0.4, lens * 0.32, false)
  const face = fit.art.length ? soft(centreAt(fit.art, 0, -lens * 0.68), fit.height) : []
  const body = connectedLetter(union(frames, bridge, temples, face.length ? silhouette(face, 3) : []))
  return {
    layers: [
      // Small gaps between the plinth and the name backing are filled; the lens openings stay.
      standingFoot(body, 'plate', t),
      { colour: 'plate', region: fillSmallHoles(body, 200), z: 0, h: t },
      { colour: 'text', region: face, z: t, h: num(v, 'raise') },
      { colour: 'motif', region: union(...[-1, 1].map((sx) => offset(lensAt((sx * W) / 4), -2.8))), z: 0, h: 1.2 },
    ],
  }
}

const HOME_COLOURS = [
  { key: 'cup', label: 'ตัวชาม', default: '#4dabf7' },
  { key: 'plate', label: 'ตัวป้าย', default: '#1c3d5a' },
  { key: 'text', label: 'ตัวอักษรและลาย', default: '#ffffff' },
  { key: 'motif', label: 'ลายเสริม', default: '#ff8787' },
]

export const ROUND3: GiftDesign[] = [
  {
    id: 'desk-bee-holder', name: 'กล่องดินสอผึ้งน้อย', group: 'desk', blurb: 'กล่องหกเหลี่ยม ป้ายชื่อด้านหน้ามีผึ้งและดอกเดซี่',
    params: CUP_PARAMS, colours: CUP_COLOURS, howTo: CUP_HOWTO, upright: true, build: beeHolder,
  },
  {
    id: 'desk-pencil-cup', name: 'กระบอกปากกาป้ายดินสอ', group: 'desk', blurb: 'กระบอกกลม ป้ายชื่อรูปดินสอยาวคาดด้านหน้า',
    params: CUP_PARAMS, colours: CUP_COLOURS, howTo: CUP_HOWTO, upright: true, build: pencilCup,
  },
  {
    id: 'desk-pen-tray', name: 'ถาดปากกาใส่ชื่อ', group: 'desk', blurb: 'ถาดยาวมีช่องแบ่ง ป้ายชื่อที่ขอบหน้า',
    params: CUP_PARAMS, colours: CUP_COLOURS, howTo: CUP_HOWTO, upright: true, build: penTray,
  },
  {
    id: 'desk-name-box', name: 'กล่องเก็บของชื่อนูน', group: 'desk', blurb: 'กล่องเหลี่ยม ตัวอักษรชื่อติดผนังหน้าบนฐานตามรูปตัวอักษร',
    params: CUP_PARAMS, colours: CUP_COLOURS, howTo: CUP_HOWTO, upright: true, build: nameBox,
  },
  {
    id: 'desk-bookends', name: 'ที่คั่นหนังสือกิ่งใบไม้', group: 'desk', blurb: 'ที่กั้นหนังสือคู่ ตั้งชื่อคนละฝั่ง มีกิ่งใบไม้',
    params: [
      { key: 'name', label: 'ฝั่งซ้าย', kind: 'text', default: 'Book', maxChars: 10 },
      { key: 'name2', label: 'ฝั่งขวา', kind: 'text', default: 'Club', maxChars: 10 },
      { key: 'height', label: 'ความสูง', kind: 'number', default: 110, min: 70, max: 180, step: 1, unit: 'มม.' },
      { key: 'base', label: 'ความหนาแผ่นตั้ง', kind: 'number', default: 5, min: 3, max: 10, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.4, min: 0.4, max: 3, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'plate', label: 'ตัวที่กั้น', default: '#9775fa' },
      { key: 'text', label: 'ตัวอักษร', default: '#ffffff' },
      { key: 'motif', label: 'ใบไม้', default: '#2f9e44' },
    ],
    howTo: ['พิมพ์แต่ละชิ้นตั้งตรง แผ่นตั้งยึดกับฐานในตัว ถ้าต้องการให้หนักขึ้น เติมไส้ 40% ขึ้นไป หรือติดยางกันลื่นใต้ฐาน'],
    upright: true, build: bookends,
  },
  {
    id: 'home-santa-jar', name: 'โถขนมซานตาคลอส', group: 'home', blurb: 'โถกลมใส่ขนม ซานตาคลอสและชื่อด้านหน้า',
    params: CUP_PARAMS.map((p) => (p.key === 'name' ? { ...p, default: 'Noel' } : p)),
    colours: [
      { key: 'cup', label: 'ตัวโถ', default: '#c92a2a' },
      { key: 'plate', label: 'ป้ายด้านหน้า', default: '#ffffff' },
      { key: 'text', label: 'ชื่อ', default: '#c92a2a' },
      { key: 'accent', label: 'ซานตาคลอส', default: '#ffe3e3' },
      { key: 'motif', label: 'เส้นลาย', default: '#343a40' },
    ],
    howTo: CUP_HOWTO, upright: true, build: santaJar,
  },
  {
    id: 'home-bowl-cone', name: 'ชามสัตว์เลี้ยงทรงกรวย', group: 'home', blurb: 'ชามผนังตรงเอียง ชื่อและรอยเท้านูนในก้นชาม',
    params: BOWL_PARAMS, colours: HOME_COLOURS, upright: true,
    howTo: ['ชามพิมพ์ตั้งตรง ผนังเอียงไม่เกิน 45 องศา ไม่ต้องใช้ซัพพอร์ต ใช้ PETG ล้างทำความสะอาดง่ายกว่า PLA'],
    build: (ctx, v) => petBowl(ctx, v, false),
  },
  {
    id: 'home-bowl-curved', name: 'ชามสัตว์เลี้ยงทรงโค้ง', group: 'home', blurb: 'ชามผนังโค้งมน ชื่อและรอยเท้านูนในก้นชาม',
    params: BOWL_PARAMS, colours: HOME_COLOURS, upright: true,
    howTo: ['ชามพิมพ์ตั้งตรง ใช้ PETG ล้างทำความสะอาดง่ายกว่า PLA'],
    build: (ctx, v) => petBowl(ctx, v, true),
  },
  {
    id: 'home-photo-frame', name: 'กรอบรูปใส่ชื่อ', group: 'home', blurb: 'กรอบรูปตั้งโต๊ะ ช่องใส่รูปด้านหน้า ชื่อและหัวใจที่ขอบล่าง',
    params: [
      { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Ploy & Ton', maxChars: 20 },
      { key: 'photoW', label: 'ความกว้างรูป', kind: 'number', default: 89, min: 50, max: 180, step: 1, unit: 'มม.', hint: 'รูป 3.5 × 5 นิ้ว = 89 × 127 มม.' },
      { key: 'photoH', label: 'ความสูงรูป', kind: 'number', default: 64, min: 40, max: 180, step: 1, unit: 'มม.' },
      ...THICKNESS.map((p) => (p.key === 'base' ? { ...p, label: 'ความลึกช่องรูป', default: 2.4 } : p)),
    ],
    colours: HOME_COLOURS.filter((c) => c.key !== 'cup'),
    howTo: ['วางรูปลงช่องด้านหน้า รูปจะวางบนขอบในที่เล็กกว่าเล็กน้อย ติดเทปกาวสองหน้าที่มุมรูป หรือปิดหน้าด้วยแผ่นใสบาง'],
    build: photoFrame,
  },
  {
    id: 'home-magnet', name: 'แม่เหล็กติดตู้เย็นใส่ชื่อ', group: 'home', blurb: 'รูปทรงน่ารักใส่ชื่อ มีช่องใส่แม่เหล็กกลมด้านหลัง',
    params: [
      { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Mali', maxChars: 12 },
      { key: 'shape', label: 'รูปทรง', kind: 'choice', default: 'cloud', options: KEY_SHAPES },
      { key: 'size', label: 'ขนาด', kind: 'number', default: 50, min: 30, max: 100, step: 1, unit: 'มม.' },
      { key: 'magnet', label: 'ขนาดแม่เหล็ก', kind: 'number', default: 10, min: 6, max: 20, step: 1, unit: 'มม.', hint: 'แม่เหล็กกลมหนา 2 มม.' },
      ...THICKNESS.map((p) => p.key === 'base' ? { ...p, min: 3.4 } : p),
    ],
    colours: HOME_COLOURS.filter((c) => c.key === 'plate' || c.key === 'text'),
    howTo: ['พิมพ์คว่ำด้านเรียบลง ช่องแม่เหล็กลึก 2.2 มม. กดแม่เหล็กลงแล้วหยดกาวร้อนหรืออีพ็อกซี'],
    build: magnet,
  },
  {
    id: 'home-music', name: 'ป้ายเพลงคู่รัก', group: 'home', blurb: 'ป้ายเพลงโปรด ชื่อเพลง ศิลปิน คลื่นเสียง แถบเวลา และปุ่มเล่น',
    params: [
      { key: 'title', label: 'ชื่อเพลง', kind: 'text', default: 'Our Song', maxChars: 28 },
      { key: 'artist', label: 'ศิลปินหรือชื่อคู่รัก', kind: 'text', default: 'Ploy & Ton', maxChars: 28 },
      { key: 'width', label: 'ความกว้าง', kind: 'number', default: 150, min: 90, max: 260, step: 5, unit: 'มม.' },
      ...THICKNESS,
    ],
    colours: HOME_COLOURS.filter((c) => c.key === 'plate' || c.key === 'text'),
    build: (ctx, v) => musicPlaque(ctx, v, false),
  },
  {
    id: 'home-heartbeat', name: 'ป้ายเพลงคู่รักเส้นหัวใจ', group: 'home', blurb: 'ป้ายเพลงคู่รัก เส้นชีพจรมีหัวใจตรงกลาง',
    params: [
      { key: 'title', label: 'ชื่อเพลง', kind: 'text', default: 'Heartbeat', maxChars: 28 },
      { key: 'artist', label: 'ศิลปินหรือชื่อคู่รัก', kind: 'text', default: 'Ploy & Ton', maxChars: 28 },
      { key: 'width', label: 'ความกว้าง', kind: 'number', default: 150, min: 90, max: 260, step: 5, unit: 'มม.' },
      ...THICKNESS,
    ],
    colours: HOME_COLOURS.filter((c) => c.key === 'plate' || c.key === 'text'),
    build: (ctx, v) => musicPlaque(ctx, v, true),
  },
  {
    id: 'home-glasses', name: 'ป้ายชื่อทรงแว่นตา', group: 'home', blurb: 'ป้ายตั้งโต๊ะรูปแว่นตา เลนส์อีกสี ชื่อด้านล่าง',
    params: [
      { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Dr. Mali', maxChars: 16 },
      { key: 'width', label: 'ความกว้าง', kind: 'number', default: 150, min: 90, max: 240, step: 5, unit: 'มม.' },
      ...THICKNESS,
    ],
    colours: HOME_COLOURS.filter((c) => c.key !== 'cup'),
    build: glassesSign,
  },
]

