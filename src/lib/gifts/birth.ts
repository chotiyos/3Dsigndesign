import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, circle, diff, offset, rect, rotate, roundRect, scale, stroke, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import { filled, fitText, fontOf, missingGlyphs, num, standingFoot, str, type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues } from './core'
import { bunny, face, rocket, type Motif } from './kawaii'
import { daisy } from './patterns'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์ (ฟอนต์อังกฤษใช้กับภาษาไทยไม่ได้)'

const centreAt = (region: Region, x: number, y: number): Region => {
  const b = bounds(region)
  return translate(region, x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2)
}
const ell = (x: number, y: number, rx: number, ry: number, turn = 0): Region => translate(rotate(scale(circle(0, 0, 1, 40), rx, ry), turn), x, y)

/** Small icons for the facts bar, `s` mm tall, centred on (x, y). */
function factIcon(kind: number, s: number, x: number, y: number): Region {
  const h = s / 2
  if (kind === 0) {
    // Calendar: a page with two rings and a grid of days cut out.
    const page = roundRect(x, y - h * 0.08, s * 0.92, s * 0.84, s * 0.12)
    const days = union(...[-1, 0, 1].flatMap((i) => [-0.1, -0.42].map((j) => rect(x + i * s * 0.26, y + j * s, s * 0.14, s * 0.13))))
    return union(diff(page, union(days, rect(x, y + h * 0.42, s * 0.7, s * 0.05))), rect(x - s * 0.25, y + h * 0.88, s * 0.1, s * 0.2), rect(x + s * 0.25, y + h * 0.88, s * 0.1, s * 0.2))
  }
  if (kind === 1) {
    // Clock: a disc with the hands cut out.
    const hands = union(stroke([[x, y], [x, y + h * 0.6]], s * 0.1), stroke([[x, y], [x + h * 0.45, y]], s * 0.1))
    return diff(circle(x, y, h, 32), hands)
  }
  if (kind === 2) {
    // Weight: a kettlebell.
    return union(diff(circle(x, y - h * 0.15, h * 0.75, 32), circle(x, y - h * 0.15, h * 0.22, 16)), diff(circle(x, y + h * 0.5, h * 0.42, 24), circle(x, y + h * 0.5, h * 0.22, 16)))
  }
  // Length: a ruler on a slant.
  const ruler = rotate(diff(rect(0, 0, s * 1.05, s * 0.36), union(...[-0.3, -0.1, 0.1, 0.3].map((t) => rect(t * s, s * 0.12, s * 0.06, s * 0.16)))), 0.7)
  return translate(ruler, x, y)
}

/** A smiling strawberry with a leafy crown. */
function strawberry(s: number): Motif {
  const berry = union(ell(0, -s * 0.02, s * 0.42, s * 0.36), [[[-s * 0.4, -s * 0.12], [0, -s * 0.5], [s * 0.4, -s * 0.12]]])
  const crown = union(...[-0.24, -0.08, 0.08, 0.24].map((x) => ell(x * s, s * 0.34, s * 0.13, s * 0.07, x * 2.4)), rect(0, s * 0.42, s * 0.06, s * 0.14))
  const seeds = union(...[[-0.22, -0.1], [0.22, -0.1], [0, -0.32], [-0.12, -0.24], [0.12, -0.24]].map(([x, y]) => ell(x * s, y * s, s * 0.025, s * 0.04)))
  const f = face(0, s * 0.06, s * 0.26)
  const all = union(berry, crown)
  return {
    pieces: [
      { region: diff(berry, union(offset(crown, 0.6), f.marks, f.cheeks, seeds)), role: 'main' },
      { region: crown, role: 'second' },
      { region: union(f.marks, seeds), role: 'mark' },
      { region: f.cheeks, role: 'third' },
    ],
    outline: all,
  }
}

type Theme = 'rocket' | 'strawberry' | 'bunny'

/** The main motif plus its companions (planet and star, a daisy, clouds). */
function art(theme: Theme, S: number): { pieces: { region: Region; colour: string }[]; outline: Region } {
  const role = { main: 'motifMain', second: 'motifSecond', third: 'cheek', mark: 'mark' } as const
  const out: { region: Region; colour: string }[] = []
  const add = (m: Motif, dx: number, dy: number) => {
    for (const p of m.pieces) out.push({ region: translate(p.region, dx, dy), colour: role[p.role] })
    return translate(m.outline, dx, dy)
  }
  const outlines: Region[] = []
  if (theme === 'rocket') {
    outlines.push(add(rocket(S), 0, 0))
    const planet = circle(-S * 0.45, -S * 0.12, S * 0.14, 48)
    const ring = rotate(diff(ell(0, 0, S * 0.22, S * 0.06), ell(0, 0, S * 0.17, S * 0.03)), 0.3)
    out.push({ region: planet, colour: 'accent' }, { region: diff(translate(ring, -S * 0.45, -S * 0.12), planet), colour: 'motifSecond' })
    const star = translate(scale(filled(charmArt('star')), S * 0.025), S * 0.45, S * 0.05)
    out.push({ region: centreAt(star, S * 0.45, -S * 0.05), colour: 'accent2' })
    outlines.push(planet, translate(ring, -S * 0.45, -S * 0.12), centreAt(star, S * 0.45, -S * 0.05))
  } else if (theme === 'strawberry') {
    outlines.push(add(strawberry(S * 0.8), -S * 0.12, 0))
    outlines.push(add(strawberry(S * 0.55), -S * 0.6, -S * 0.08))
    const d = daisy(S * 0.42, -S * 0.12, S * 0.22)
    out.push({ region: d.petals, colour: 'accent2' }, { region: d.centre, colour: 'accent' })
    outlines.push(d.petals, d.centre)
  } else {
    outlines.push(add(bunny(S), 0, 0))
    // Puffy clouds either side of the bunny's chin.
    for (const sx of [-1, 1]) {
      const cloud = union(circle(sx * S * 0.34, -S * 0.32, S * 0.12, 32), circle(sx * S * 0.46, -S * 0.3, S * 0.1, 32), circle(sx * S * 0.24, -S * 0.36, S * 0.09, 32))
      out.push({ region: cloud, colour: 'accent' })
      outlines.push(cloud)
    }
  }
  return { pieces: out, outline: union(...outlines) }
}

function birth(ctx: GiftContext, v: GiftValues, theme: Theme) {
  const keys = ['name', 'date', 'time', 'weight', 'length']
  for (const k of keys) if (missingGlyphs(fontOf(ctx, v, k), str(v, k))) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const layers: GiftLayer[] = []
  const top = t + 1
  const motif = art(theme, W * 0.55)
  const mb = bounds(motif.outline)
  const shift = (reg: Region) => translate(reg, -(mb.minX + mb.maxX) / 2, W * 0.32 - (mb.minY + mb.maxY) / 2)
  const motifOutline = shift(motif.outline)
  for (const p of motif.pieces) layers.push({ colour: p.colour, region: shift(p.region), z: top, h: p.colour === 'mark' ? r + 0.6 : r })
  let y = bounds(motifOutline).minY + W * 0.02
  // The name in a pill.
  const fit = fitText(fontOf(ctx, v, 'name'), str(v, 'name'), W * 0.8, W * 0.22, W * 0.18, false)
  const pieces: Region[] = [motifOutline]
  if (fit.art.length) {
    const nf = puffUp(fit.art, 0.5)
    const nb = bounds(nf)
    const ph = nb.h + W * 0.07
    const pill = roundRect(0, y - ph / 2, Math.max(nb.w + ph * 0.8, W * 0.55), ph, ph / 2)
    const nameFace = centreAt(nf, 0, y - ph / 2)
    layers.push({ colour: 'pill', region: pill, z: top, h: 1.2 })
    layers.push({ colour: 'pillOutline', region: diff(silhouette(nameFace, 1.4), nameFace), z: top + 1.2, h: r })
    layers.push({ colour: 'nameText', region: nameFace, z: top + 1.2, h: r })
    pieces.push(pill)
    y -= ph + W * 0.015
  }
  // The facts bar: four icons with their text.
  const facts = ['date', 'time', 'weight', 'length'].map((k) => str(v, k).trim())
  const barH = W * 0.085
  const cellW = (W * 0.98) / 4
  const bar = roundRect(0, y - barH / 2, W * 0.98, barH, barH / 2)
  layers.push({ colour: 'bar', region: bar, z: top, h: 1 })
  pieces.push(bar)
  facts.forEach((text, i) => {
    const cx = -W * 0.49 + cellW * (i + 0.5)
    const icon = factIcon(i, barH * 0.6, cx - cellW * 0.32, y - barH / 2)
    const tf = fitText(fontOf(ctx, v, keys[i + 1]), text, cellW * 0.62, barH * 0.6, barH * 0.55, false)
    const chip = roundRect(cx, y - barH / 2, cellW * 0.94, barH * 0.8, barH * 0.4)
    layers.push({ colour: 'chip', region: chip, z: top + 1, h: 0.6 })
    layers.push({ colour: 'statText', region: icon, z: top + 1.6, h: 0.8 })
    if (tf.art.length) layers.push({ colour: 'statText', region: centreAt(puffUp(tf.art, 0.25), cx + cellW * 0.12, y - barH / 2), z: top + 1.6, h: 0.8 })
  })
  // White outer backing and a coloured border inside it.
  const all = union(...pieces)
  // One silhouette, grown for the white backing, so the border can never reach past it.
  const border = silhouette(all, num(v, 'margin'))
  const outer = offset(border, 2.4)
  layers.unshift({ colour: 'border', region: border, z: t, h: 1 })
  layers.unshift({ colour: 'outer', region: outer, z: 0, h: t })
  if (v.stand) layers.unshift(standingFoot(outer, 'outer', t))
  return { layers }
}

const PARAMS: GiftParam[] = [
  { key: 'name', label: 'ชื่อลูก', kind: 'text', default: 'SOPHIA', maxChars: 12, font: 'fredoka' },
  { key: 'date', label: 'วันเกิด', kind: 'text', default: '13.02.2026', maxChars: 12, font: 'fredoka' },
  { key: 'time', label: 'เวลาเกิด', kind: 'text', default: '10.05', maxChars: 8, font: 'fredoka' },
  { key: 'weight', label: 'น้ำหนัก', kind: 'text', default: '2950g', maxChars: 9, font: 'fredoka' },
  { key: 'length', label: 'ความยาว', kind: 'text', default: '48cm', maxChars: 8, font: 'fredoka' },
  { key: 'size', label: 'ความกว้างป้าย', kind: 'number', default: 180, min: 110, max: 280, step: 5, unit: 'มม.' },
  { key: 'margin', label: 'ขอบสี', kind: 'number', default: 3, min: 1.6, max: 8, step: 0.2, unit: 'มม.' },
  { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: false, hint: 'ตัวป้ายหนาตั้งได้เอง' },
  { key: 'base', label: 'ความหนาฐานขาว', kind: 'number', default: 12, min: 3, max: 24, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ลายและตัวอักษรนูน', kind: 'number', default: 2, min: 0.6, max: 5, step: 0.2, unit: 'มม.' },
]

const LOOKS: { id: string; name: string; blurb: string; theme: Theme; person: string; colours: Record<string, string> }[] = [
  { id: 'birth-rocket', name: 'ป้ายวันเกิดลายจรวด', blurb: 'จรวดหน้ายิ้มกับดาวเคราะห์และดาว ชื่อในป้ายส้ม แถบข้อมูลวันเกิดสีฟ้า', theme: 'rocket', person: 'STEVE',
    colours: { outer: '#ffffff', border: '#1d4ed8', motifMain: '#93c5fd', motifSecond: '#ffffff', accent: '#fb923c', accent2: '#facc15', cheek: '#f9a8d4', mark: '#1e3a8a', pill: '#fb923c', pillOutline: '#c2410c', nameText: '#ffffff', bar: '#1d4ed8', chip: '#3b82f6', statText: '#ffffff' } },
  { id: 'birth-strawberry', name: 'ป้ายวันเกิดลายสตรอว์เบอร์รี่', blurb: 'สตรอว์เบอร์รี่หน้ายิ้มสองลูกกับดอกเดซี่ ชื่อในป้ายชมพู แถบข้อมูลสีเขียว', theme: 'strawberry', person: 'SCARLET',
    colours: { outer: '#ffffff', border: '#15803d', motifMain: '#ef4444', motifSecond: '#22c55e', accent: '#facc15', accent2: '#ffffff', cheek: '#fda4af', mark: '#7f1d1d', pill: '#f472b6', pillOutline: '#be185d', nameText: '#ffffff', bar: '#15803d', chip: '#22c55e', statText: '#ffffff' } },
  { id: 'birth-bunny', name: 'ป้ายวันเกิดลายกระต่าย', blurb: 'กระต่ายหน้ายิ้มบนก้อนเมฆสีชมพู ชื่อในป้ายฟ้า แถบข้อมูลสีม่วง', theme: 'bunny', person: 'SOPHIA',
    colours: { outer: '#ffffff', border: '#a855f7', motifMain: '#ffffff', motifSecond: '#ffffff', accent: '#f9a8d4', accent2: '#ffffff', cheek: '#f9a8d4', mark: '#4b5563', pill: '#22d3ee', pillOutline: '#0e7490', nameText: '#ffffff', bar: '#a855f7', chip: '#c084fc', statText: '#ffffff' } },
]

const LABELS: Record<string, string> = {
  outer: 'ฐานขาว', border: 'ขอบสี', motifMain: 'ลายหลัก', motifSecond: 'ลายรอง', accent: 'ลายเสริม 1', accent2: 'ลายเสริม 2', cheek: 'แก้ม', mark: 'หน้าและเส้น',
  pill: 'ป้ายชื่อ', pillOutline: 'ขอบชื่อ', nameText: 'ชื่อ', bar: 'แถบข้อมูล', chip: 'ช่องข้อมูล', statText: 'ข้อมูลและไอคอน',
}

export const BIRTH: GiftDesign[] = LOOKS.map((look) => ({
  id: look.id, name: look.name, blurb: look.blurb, group: 'birth',
  params: PARAMS.map((p) => (p.key === 'name' ? { ...p, default: look.person } : p)),
  colours: Object.entries(look.colours).map(([key, c]) => ({ key, label: LABELS[key], default: c })),
  howTo: ['วางด้านหลังติดแผ่นพิมพ์ ชั้นสีบางด้านบนเปลี่ยนสีตามความสูง ใช้เครื่องพิมพ์หลายสีหรือหยุดเปลี่ยนสีตามแถบชั้น'],
  build: (ctx, v) => birth(ctx, v, look.theme),
}))
