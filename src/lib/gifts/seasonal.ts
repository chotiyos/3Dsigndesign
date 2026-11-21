import { puffUp } from '../bubbleKeychain'
import { bounds, circle, diff, intersect, offset, rect, regionArea, rotate, roundRect, scale, stroke, translate, union, type Region } from '../geo2d'
import { keyhole } from '../styles/rear'
import { silhouette } from '../styles/kit'
import { factIcon } from './birth'
import {
  connectedLetter, fitText, fontOf, missingGlyphs, num, str, textArt,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftValues,
} from './core'
import { spans } from './ambigram'
import { patternWeb, PATTERNS, type PatternKind } from './patterns'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์ (ฟอนต์อังกฤษใช้กับภาษาไทยไม่ได้)'

const centreAt = (region: Region, x: number, y: number): Region => {
  const b = bounds(region)
  return translate(region, x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2)
}
const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}
/** Slanted like italic lettering: x moves right as y rises. */
const slant = (region: Region, k: number): Region => region.map((poly) => poly.map(([x, y]) => [x + y * k, y] as [number, number]))

function text(ctx: GiftContext, v: GiftValues, key: string, w: number, h: number) {
  const fit = fitText(fontOf(ctx, v, key), str(v, key), w, h * 1.5, h, false)
  return fit.art.length ? puffUp(fit.art, Math.min(0.5, fit.height * 0.03)) : []
}
/** Drops slivers thinner than `w` mm. */
const opening = (region: Region, w: number) => offset(offset(region, -w / 2), w / 2)
const missing = (ctx: GiftContext, v: GiftValues, keys: string[]) => keys.some((k) => missingGlyphs(fontOf(ctx, v, k), str(v, k)))

/** A Santa hat, `s` mm tall: a drooping red cone, a white fur band and a pompom. Pieces by colour. */
function santaHat(s: number) {
  const cone: Region = [[
    [-s * 0.5, -s * 0.18], [-s * 0.32, s * 0.2], [-s * 0.05, s * 0.42], [s * 0.25, s * 0.48],
    [s * 0.5, s * 0.36], [s * 0.56, s * 0.18], [s * 0.42, s * 0.1], [s * 0.28, s * 0.26], [s * 0.05, s * 0.16], [s * 0.42, -s * 0.18],
  ]]
  const band = roundRect(-s * 0.02, -s * 0.24, s * 1.0, s * 0.24, s * 0.12)
  const pompom = circle(s * 0.5, s * 0.06, s * 0.14, 32)
  return { red: diff(union(cone), union(band, pompom)), white: union(band, pompom), pompom: [s * 0.5, s * 0.06] as [number, number] }
}

/**
 * Santa-hat name ornament: a slanted script name with candy-pattern letters in
 * a green outline on a cream backing, a Santa hat tipped over the first letter,
 * and a hanging loop on the hat's pompom.
 */
function santaOrnament(ctx: GiftContext, v: GiftValues) {
  if (missing(ctx, v, ['name'])) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const fit = fitText(fontOf(ctx, v, 'name'), str(v, 'name'), H * 8, H * 1.6, H, false)
  if (!fit.art.length) return { layers: [], warning: 'ใส่ชื่อก่อน' }
  const name = slant(puffUp(fit.art, Math.min(0.6, fit.height * 0.03)), 0.18)
  const nb = bounds(name)
  // The hat sits on the first letter, tipped by the chosen angle.
  const hs = num(v, 'hat')
  const hat = santaHat(hs)
  const turn = (num(v, 'hatTurn') * Math.PI) / 180
  const hx = nb.minX + hs * 0.35 + num(v, 'hatX')
  const hy = nb.maxY + hs * 0.05 + num(v, 'hatY')
  const place = (region: Region) => translate(rotate(region, turn), hx, hy)
  const red = place(hat.red)
  const white = place(hat.white)
  const [px, py] = [hat.pompom[0] * Math.cos(turn) - hat.pompom[1] * Math.sin(turn) + hx, hat.pompom[0] * Math.sin(turn) + hat.pompom[1] * Math.cos(turn) + hy]
  // The loop: a ring past the pompom, turning with the hat, pushed further out
  // until its 3.5 mm hole is at least 1 mm clear of the hat, name and outline.
  const outline = silhouette(name, 1.4)
  const busy = offset(union(outline, red, white), 1 + 1.75)
  // Search rays from the pompom, upward first so the ornament hangs straight,
  // for the nearest point clear of everything.
  const near = intersect(busy, rect(px, py, 140, 140))
  const clear = (x: number, y: number) => !spans(near, y).some(([p, q]) => x >= p - 0.2 && x <= q + 0.2)
  let spot: [number, number] | null = null
  for (const deg of [90, 70, 110, 50, 130, 30, 150, 10, 170]) {
    const a = (deg * Math.PI) / 180
    for (let d = hs * 0.2; d < hs * 0.2 + 60; d += 0.5) {
      const x = px + Math.cos(a) * d
      const y = py + Math.sin(a) * d
      if (clear(x, y)) { if (!spot || d < Math.hypot(spot[0] - px, spot[1] - py)) spot = [x, y]; break }
    }
    if (spot && deg <= 110) break
  }
  if (!spot) return { layers: [], warning: 'ไม่มีที่ว่างพอทำห่วงแขวน ลองเลื่อนหรือหมุนหมวก' }
  const [cx, cy] = spot
  const hole = circle(cx, cy, 1.75, 32)
  // The loop's ring reaches back to the hat so it stays attached.
  const loop = union(circle(cx, cy, 4.2, 40), stroke([[cx, cy], [px, py]], 6))
  // One shape grown from everything on top, so the outline can never pass the backing.
  // (A silhouette also bridges the gap between the name and a hat moved away, and fills pinholes.)
  const backing = diff(union(silhouette(union(outline, red, white), num(v, 'margin')), loop), hole)
  // The pattern's openings become the white candy marks on red letters.
  const inside = offset(name, -0.8)
  const cell = Math.max(num(v, 'cell'), H / 12)
  const pattern = opening(diff(inside, patternWeb(str(v, 'pattern') as PatternKind, inside, cell)), 0.6)
  const layers: GiftLayer[] = [
    { colour: 'backing', region: backing, z: 0, h: t },
    { colour: 'outline', region: diff(outline, union(red, white)), z: t, h: 0.8 },
    { colour: 'letters', region: diff(name, union(red, white)), z: t, h: r },
    { colour: 'candy', region: diff(pattern, union(red, white)), z: t + r, h: 0.4 },
    { colour: 'hat', region: red, z: t, h: r + 0.8 },
    { colour: 'candy', region: white, z: t, h: r + 1.2 },
  ]
  return { layers }
}

/** A little fir tree with a star, `s` mm tall. */
function tree(s: number, x: number, y: number) {
  const tiers = union(
    ...[0, 1, 2].map((i) => {
      const w = s * (0.78 - i * 0.2)
      const top = y + s * (0.08 + i * 0.22) + w * 0.6
      const bottom = y + s * (0.08 + i * 0.22)
      return [[[x - w / 2, bottom], [x + w / 2, bottom], [x, top]]] as Region
    }),
  )
  const trunk = rect(x, y + s * 0.02, s * 0.16, s * 0.12)
  const starAt = y + s * 0.92
  const star: Region = [Array.from({ length: 10 }, (_, k) => {
    const a = Math.PI / 2 + (k * Math.PI) / 5
    const rr = k % 2 ? s * 0.05 : s * 0.12
    return [x + Math.cos(a) * rr, starAt + Math.sin(a) * rr] as [number, number]
  })]
  return { green: diff(union(tiers, trunk), offset(star, 0.6)), red: star }
}

/** A snowman, `s` mm tall: two snowballs, a top hat, coal eyes and buttons. */
function snowman(s: number, x: number, y: number) {
  const body = union(circle(x, y + s * 0.24, s * 0.24, 48), circle(x, y + s * 0.6, s * 0.17, 40))
  const hat = union(rect(x, y + s * 0.78, s * 0.34, s * 0.04), rect(x, y + s * 0.88, s * 0.2, s * 0.18))
  const eyes = union(circle(x - s * 0.06, y + s * 0.63, s * 0.025, 16), circle(x + s * 0.06, y + s * 0.63, s * 0.025, 16))
  const buttons = union(...[0.3, 0.2, 0.1].map((k) => circle(x, y + s * k, s * 0.03, 16)))
  return { white: diff(body, union(eyes, buttons, offset(hat, 0.6))), dark: union(hat, eyes, buttons) }
}

/**
 * Christmas family LED sign: the year above the family name on a red band,
 * a tree and a snowman either side, built as a lit box. The face is printed
 * flat on the bed (the picture inlaid flush in it), the walls rise behind it
 * for the LED strip, and a back cover with a keyhole closes it.
 */
function christmasLed(ctx: GiftContext, v: GiftValues) {
  if (missing(ctx, v, ['main', 'year'])) return { layers: [], warning: NO_GLYPH }
  const D = num(v, 'depth')
  const face = 1.6
  const inlay = 0.8
  const wall = 2.4
  const mainH = num(v, 'mainH')
  const yearH = num(v, 'yearH')
  const main = text(ctx, v, 'main', mainH * 10, mainH)
  const year = text(ctx, v, 'year', yearH * 6, yearH)
  if (!main.length && !year.length) return { layers: [] }
  const mb = main.length ? bounds(main) : { w: 0, h: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, cx: 0, cy: 0 }
  const mainAt = main.length ? centreAt(main, 0, 0) : []
  const band = main.length ? roundRect(0, 0, mb.w + mainH * 0.8, mb.h + mainH * 0.6, mainH * 0.3) : []
  const bandTop = band.length ? bounds(band).maxY : 0
  const yearAt = year.length ? centreAt(year, 0, bandTop + bounds(year).h / 2 + 3) : []
  const left = (band.length ? bounds(band).minX : -20) - 4
  const right = (band.length ? bounds(band).maxX : 20) + 4
  const t = tree(num(v, 'tree'), left - num(v, 'tree') * 0.32, (band.length ? bounds(band).minY : 0))
  const sm = snowman(num(v, 'snowman'), right + num(v, 'snowman') * 0.2, (band.length ? bounds(band).minY : 0))
  const art = union(band, yearAt, t.green, t.red, sm.white, sm.dark)
  const outline = silhouette(art, 4)
  const shape = offset(outline, wall)
  // Drawn face up as it is seen; turning it over in the slicer keeps it reading right.
  const flip = (region: Region): Region => region
  const z0 = D + face
  const layers: GiftLayer[] = [
    // The face lies on top here and prints first, face down: picture flush in its outer surface.
    { colour: 'white', region: shape, z: D, h: face },
    { colour: 'red', region: diff(flip(band), flip(mainAt)), z: z0 - inlay, h: inlay },
    { colour: 'white', region: flip(mainAt), z: z0 - inlay, h: inlay },
    { colour: 'red', region: union(flip(yearAt), flip(t.red)), z: z0 - inlay, h: inlay },
    { colour: 'green', region: flip(t.green), z: z0 - inlay, h: inlay },
    { colour: 'grey', region: flip(sm.dark), z: z0 - inlay, h: inlay },
    // The walls carry the box behind the face.
    { colour: 'red', region: diff(shape, offset(shape, -wall)), z: 0, h: D },
  ]
  // A back cover below it, printed flat, with a keyhole and a wire hole.
  const sb = bounds(shape)
  const coverShape = translate(offset(shape, -wall - 0.3), 0, -(sb.h + 12))
  // The keyhole goes high and the wire hole low, both where the cover is at
  // least 6 mm wide all round them (searched on a 2 mm grid near the middle).
  const cb = bounds(coverShape)
  const room = offset(coverShape, -6)
  const rb = room.length ? bounds(room) : null
  const fits = (shape: Region) => regionArea(diff(shape, room)) < 0.01
  const find = (make: (x: number, y: number) => Region, fromTop: boolean) => {
    if (!rb) return null
    // Candidates scored by distance from the centre line and from the wanted edge.
    // Only points with 4 mm of room round them are worth trying (a cheap scanline test).
    const core = offset(room, -4)
    const spots: [number, number, number][] = []
    for (let y = rb.minY; y <= rb.maxY; y += 3) {
      const runs = spans(core, y)
      for (let x = rb.minX; x <= rb.maxX; x += 3) {
        // A keyhole off-centre or below the middle would hang the sign crooked or tipping.
        if (fromTop && (Math.abs(x - cb.cx) > cb.w * 0.12 || y < cb.cy)) continue
        if (runs.some(([p, q]) => x > p && x < q)) spots.push([x, y, Math.abs(x - rb.cx) * 2 + (fromTop ? rb.maxY - y : y - rb.minY)])
      }
    }
    spots.sort((p, q) => p[2] - q[2])
    for (const [x, y] of spots.slice(0, 300)) {
      const shape = make(x, y)
      if (fits(shape)) return shape
    }
    return null
  }
  const key = find((x, y) => keyhole(x, y - 10, 4), true)
  // The wire hole keeps 3 mm from the keyhole.
  const wireHole = find((x, y) => {
    const c = circle(x, y, 3.5, 32)
    return key && regionArea(intersect(offset(key, 3), c)) > 0 ? translate(c, 1e6, 0) : c
  }, false)
  const usable = [key, wireHole].filter((h): h is Region => Boolean(h))
  layers.push({ colour: 'grey', region: diff(coverShape, union(...usable)), z: z0 - 2, h: 2 })
  const warning = usable.length < 2 ? 'ฝาหลังเล็กเกินจะเจาะรูแขวนและรูสายไฟครบ เพิ่มขนาดตัวอักษร หรือเจาะเองหลังพิมพ์' : undefined
  return { layers, warning }
}

/**
 * LED initial: a deep letter lit from inside, its face a lattice over white,
 * with the name in script across it on a white outline. Printed face down.
 */
function ledInitial(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name').trim()
  const ch = str(v, 'letter').trim() || name.slice(0, 1).toUpperCase() || 'A'
  if (missingGlyphs(fontOf(ctx, v, 'letter'), ch) || missingGlyphs(fontOf(ctx, v, 'name'), name)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const D = num(v, 'depth')
  const face = 1.6
  const inlay = 0.8
  const wall = num(v, 'wall')
  const art = textArt(fontOf(ctx, v, 'letter'), [ch], 100)
  if (!art.length) return { layers: [] }
  const letter = connectedLetter(sized(art, H))
  const lb = bounds(letter)
  const fit = fitText(fontOf(ctx, v, 'name'), name, lb.w * 1.2, H * 0.3, H * 0.24, false)
  const script = fit.art.length ? centreAt(puffUp(fit.art, 0.4), (lb.minX + lb.maxX) / 2, (lb.minY + lb.maxY) / 2 - H * 0.06) : []
  const plate = silhouette(script, 2.4)
  const shape = union(letter, plate)
  const window = offset(letter, -wall)
  const flip = (region: Region): Region => region
  const z0 = D + face
  const lattice = intersect(patternWeb(str(v, 'pattern') as PatternKind, window, num(v, 'cell')), window)
  const layers: GiftLayer[] = [
    { colour: 'white', region: shape, z: D, h: face },
    // The rim and the lattice as one inlay: drawn apart they only touch along edges.
    { colour: 'frame', region: flip(diff(union(diff(letter, window), offset(lattice, 0.01)), plate)), z: z0 - inlay, h: inlay },
    { colour: 'name', region: flip(script), z: z0 - inlay, h: inlay },
    { colour: 'frame', region: diff(letter, window), z: 0, h: D },
  ]
  return { layers }
}

/**
 * Birth photo frame: a portrait frame with a lattice border, the birth date and
 * time on little tags with icons, and the name across the bottom.
 */
function birthFrame(ctx: GiftContext, v: GiftValues) {
  if (missing(ctx, v, ['name', 'date', 'time'])) return { layers: [], warning: NO_GLYPH }
  const pw = num(v, 'photoW')
  const ph = num(v, 'photoH')
  const side = num(v, 'border')
  const bar = Math.max(26, pw * 0.34)
  const W = pw + 2 * side
  const H = ph + side + bar
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const outer = roundRect(0, 0, W, H, 8)
  const winY = H / 2 - side - ph / 2
  const window = rect(0, winY, pw, ph)
  const lip = rect(0, winY, pw - 6, ph - 6)
  const band = diff(offset(outer, -2.4), offset(window, 2.4))
  const name = text(ctx, v, 'name', W * 0.8, bar * 0.5)
  const nameAt = name.length ? centreAt(name, 0, -H / 2 + bar * 0.42) : []
  // Two tags on the border: the date with a calendar, the time with a clock.
  const tagW = Math.min(side * 0.9, 22)
  const tag = (i: number, key: string, icon: number) => {
    const x = (i ? 1 : -1) * (W / 2 - side / 2)
    const y = winY + (i ? -ph * 0.25 : ph * 0.25)
    const label = text(ctx, v, key, tagW * 0.9, tagW * 0.28)
    const card = roundRect(x, y, tagW, tagW * 1.15, 2.5)
    const pieces = union(factIcon(icon, tagW * 0.42, x, y + tagW * 0.22), label.length ? centreAt(label, x, y - tagW * 0.26) : [])
    return { card, pieces }
  }
  const tags = [tag(0, 'date', 0), tag(1, 'time', 1)]
  const solid = union(silhouette(nameAt, 2.2), ...tags.map((g) => offset(g.card, 0.8)))
  return {
    layers: [
      { colour: 'frame', region: diff(outer, lip), z: 0, h: 2 },
      { colour: 'window', region: lip, z: 0, h: 0.6 },
      { colour: 'lattice', region: diff(patternWeb(str(v, 'pattern') as PatternKind, band, 8, 1.4), solid), z: 2, h: t - 2.8 },
      { colour: 'frame', region: diff(diff(outer, offset(window, 0)), diff(band, solid)), z: 2, h: t - 2 },
      { colour: 'tag', region: union(...tags.map((g) => g.card)), z: t, h: 0.8 },
      { colour: 'text', region: union(...tags.map((g) => g.pieces)), z: t + 0.8, h: r },
      { colour: 'outline', region: silhouette(nameAt, 2.2), z: t, h: 0.8 },
      { colour: 'name', region: nameAt, z: t + 0.8, h: r },
    ],
  }
}

const FLIPPED = 'พิมพ์คว่ำ: ในโปรแกรมพิมพ์ให้พลิกชิ้นให้หน้าป้ายติดฐานพิมพ์ (ลายฝังเรียบในหน้า ไม่ต้องใช้ซัพพอร์ต) ฝาหลังพิมพ์แยก'

export const SEASONAL: GiftDesign[] = [
  {
    id: 'home-santa-ornament', name: 'ป้ายชื่อหมวกซานต้า', group: 'home', blurb: 'ชื่อตัวเอียงลายลูกกวาด ขอบเขียว หมวกซานต้าบนตัวแรก มีห่วงแขวนต้นคริสต์มาส',
    params: [
      { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Sophia', maxChars: 12, font: 'lilita' },
      { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 40, min: 20, max: 80, step: 1, unit: 'มม.' },
      { key: 'hat', label: 'ขนาดหมวก', kind: 'number', default: 35, min: 15, max: 70, step: 1, unit: 'มม.' },
      { key: 'hatX', label: 'เลื่อนหมวกซ้าย-ขวา', kind: 'number', default: 5, min: -30, max: 30, step: 1, unit: 'มม.' },
      { key: 'hatY', label: 'เลื่อนหมวกขึ้น-ลง', kind: 'number', default: 5, min: -30, max: 30, step: 1, unit: 'มม.' },
      { key: 'hatTurn', label: 'เอียงหมวก', kind: 'number', default: 20, min: -45, max: 45, step: 1, unit: 'องศา' },
      { key: 'pattern', label: 'ลายในตัวอักษร', kind: 'choice', default: 'dots', options: PATTERNS },
      { key: 'cell', label: 'ขนาดลาย', kind: 'number', default: 6, min: 3, max: 14, step: 0.5, unit: 'มม.' },
      { key: 'margin', label: 'ขอบพื้นหลัง', kind: 'number', default: 3, min: 1.5, max: 8, step: 0.5, unit: 'มม.' },
      { key: 'base', label: 'ความหนาพื้นหลัง', kind: 'number', default: 2, min: 1.2, max: 6, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.2, min: 0.6, max: 4, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'backing', label: 'พื้นหลัง', default: '#f0e4c5' },
      { key: 'outline', label: 'ขอบตัวอักษร', default: '#177955' },
      { key: 'letters', label: 'ตัวอักษร', default: '#e90527' },
      { key: 'candy', label: 'ลายและขนหมวก', default: '#ffffff' },
      { key: 'hat', label: 'หมวก', default: '#e90527' },
    ],
    howTo: ['พิมพ์ด้านหลังติดแผ่นพิมพ์ ร้อยด้ายหรือริบบิ้นที่รูบนหมวกแล้วแขวนต้นคริสต์มาส'],
    build: santaOrnament,
  },
  {
    id: 'home-christmas-led', name: 'ป้ายไฟคริสต์มาสชื่อครอบครัว', group: 'home', blurb: 'กล่องไฟลึก ปีอยู่บน ชื่อครอบครัวบนแถบแดง ต้นคริสต์มาสกับตุ๊กตาหิมะสองข้าง',
    params: [
      { key: 'main', label: 'ชื่อครอบครัว', kind: 'text', default: 'THE MILLERS', maxChars: 16, font: 'lilita' },
      { key: 'mainH', label: 'ความสูงชื่อ', kind: 'number', default: 25, min: 12, max: 50, step: 1, unit: 'มม.' },
      { key: 'year', label: 'ปี', kind: 'text', default: '2026', maxChars: 6, font: 'lilita' },
      { key: 'yearH', label: 'ความสูงปี', kind: 'number', default: 27, min: 12, max: 50, step: 1, unit: 'มม.' },
      { key: 'tree', label: 'ขนาดต้นคริสต์มาส', kind: 'number', default: 45, min: 20, max: 90, step: 1, unit: 'มม.' },
      { key: 'snowman', label: 'ขนาดตุ๊กตาหิมะ', kind: 'number', default: 50, min: 20, max: 90, step: 1, unit: 'มม.' },
      { key: 'depth', label: 'ความลึกกล่องไฟ', kind: 'number', default: 22, min: 14, max: 40, step: 1, unit: 'มม.', hint: 'ช่องว่างสำหรับไฟเส้น LED' },
    ],
    colours: [
      { key: 'white', label: 'หน้าป้าย (ขาวให้แสงผ่าน)', default: '#ffffff' },
      { key: 'red', label: 'แดง', default: '#df0d2d' },
      { key: 'green', label: 'ต้นคริสต์มาส', default: '#0b9663' },
      { key: 'grey', label: 'ฝาหลังและตา', default: '#6b7280' },
    ],
    howTo: [FLIPPED, 'ติดไฟเส้น LED รอบผนังด้านใน ร้อยสายออกทางรูฝาหลัง แล้วแขวนด้วยรูกุญแจ'],
    printFlipped: true,
    build: christmasLed,
  },
  {
    id: 'initial-led-lattice', name: 'ตัวอักษรไฟ LED ลายตาข่าย', group: 'initial', blurb: 'ตัวอักษรลึกมีไฟด้านใน หน้าลายตาข่าย ชื่อตัวเขียนคาดกลางบนขอบขาว',
    params: [
      { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Angelina', maxChars: 14, font: 'pacifico' },
      { key: 'letter', label: 'ตัวอักษรใหญ่', kind: 'text', default: '', maxChars: 1, hint: 'เว้นว่าง ใช้ตัวแรกของชื่อ', font: 'lilita' },
      { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 160, min: 80, max: 250, step: 1, unit: 'มม.' },
      { key: 'depth', label: 'ความลึก', kind: 'number', default: 30, min: 14, max: 60, step: 1, unit: 'มม.', hint: 'ช่องว่างสำหรับไฟเส้น LED' },
      { key: 'wall', label: 'ขอบตัวอักษร', kind: 'number', default: 5, min: 2.4, max: 10, step: 0.2, unit: 'มม.' },
      { key: 'pattern', label: 'ลายหน้า', kind: 'choice', default: 'lattice', options: PATTERNS },
      { key: 'cell', label: 'ขนาดช่องลาย', kind: 'number', default: 8, min: 4, max: 16, step: 0.5, unit: 'มม.' },
    ],
    colours: [
      { key: 'white', label: 'หน้าขาวให้แสงผ่าน', default: '#ffffff' },
      { key: 'frame', label: 'ตัวอักษรและลาย', default: '#f6c62f' },
      { key: 'name', label: 'ชื่อ', default: '#1f2937' },
    ],
    howTo: [FLIPPED.replace(' ฝาหลังพิมพ์แยก', ''), 'ติดไฟเส้น LED ด้านในผนัง ปิดหลังด้วยแผ่นพลาสวูดหรืออะคริลิกตัดตามรูป'],
    printFlipped: true,
    build: ledInitial,
  },
  {
    id: 'birth-photo-frame', name: 'กรอบรูปวันเกิดลายตาข่าย', group: 'birth', blurb: 'กรอบรูปแนวตั้งขอบลายตาข่าย ป้ายวันที่และเวลาเกิดสองข้าง ชื่อคาดล่าง',
    params: [
      { key: 'name', label: 'ชื่อ', kind: 'text', default: 'Rosalie', maxChars: 12, font: 'cherry-bomb' },
      { key: 'date', label: 'วันเกิด', kind: 'text', default: '27 OCT', maxChars: 10, font: 'lilita' },
      { key: 'time', label: 'เวลาเกิด', kind: 'text', default: '10:05', maxChars: 8, font: 'lilita' },
      { key: 'photoW', label: 'ความกว้างรูป', kind: 'number', default: 89, min: 50, max: 150, step: 1, unit: 'มม.' },
      { key: 'photoH', label: 'ความสูงรูป', kind: 'number', default: 127, min: 50, max: 200, step: 1, unit: 'มม.' },
      { key: 'border', label: 'ขอบกรอบ', kind: 'number', default: 26, min: 16, max: 40, step: 1, unit: 'มม.' },
      { key: 'pattern', label: 'ลายขอบ', kind: 'choice', default: 'lattice', options: PATTERNS },
      { key: 'base', label: 'ความหนา', kind: 'number', default: 5, min: 2.8, max: 12, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.2, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'frame', label: 'กรอบ', default: '#f4b183' },
      { key: 'window', label: 'พื้นหลังรูป', default: '#fbd5bd' },
      { key: 'lattice', label: 'ลายขอบ', default: '#5b7bd6' },
      { key: 'tag', label: 'ป้ายวันเวลา', default: '#ffffff' },
      { key: 'text', label: 'ตัวอักษรบนป้าย', default: '#3b5bc4' },
      { key: 'outline', label: 'ขอบชื่อ', default: '#ffffff' },
      { key: 'name', label: 'ชื่อ', default: '#f6c62f' },
    ],
    howTo: ['ใส่รูปจากด้านหน้า ติดเทปกาวสองหน้าที่มุมรูป ขอบในเล็กกว่ารูป 3 มม. รองรูปไว้'],
    build: birthFrame,
  },
]



