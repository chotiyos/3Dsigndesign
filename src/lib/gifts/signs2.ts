import { initialOf, puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { bounds, diff, intersect, offset, regionArea, roundRect, rotate, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import {
  connectedLetter, filled, fitText, fontOf, missingGlyphs, num, str, textArt,
  type GiftContext, type GiftDesign, type GiftLayer, type GiftValues,
} from './core'
import { spans } from './ambigram'
import { patternWeb, PATTERNS, type PatternKind } from './patterns'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์ (ฟอนต์อังกฤษใช้กับภาษาไทยไม่ได้)'

const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}
const centreAt = (region: Region, x: number, y: number): Region => {
  const b = bounds(region)
  return translate(region, x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2)
}

/** A big letter leaning on a flat slab: frame, lattice panel, the name across it. */
function leaning(ctx: GiftContext, v: GiftValues) {
  const name = str(v, 'name')
  const ch = str(v, 'letter').trim() || initialOf(name).toUpperCase() || 'W'
  if (missingGlyphs(fontOf(ctx, v, 'letter'), ch) || missingGlyphs(fontOf(ctx, v, 'name'), name)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const tilt = (num(v, 'tilt') * Math.PI) / 180
  const art = textArt(fontOf(ctx, v, 'letter'), [ch], 100)
  if (!art.length) return { layers: [] }
  const letter = rotate(connectedLetter(sized(art, H)), tilt)
  const inner = offset(letter, -num(v, 'rim'))
  const b = bounds(letter)
  const slab = roundRect((b.minX + b.maxX) / 2, b.minY + 3, b.w * 1.2, 10, 3)
  const layers: GiftLayer[] = [
    { colour: 'panel', region: letter, z: 0, h: 1.6 },
    { colour: 'pattern', region: patternWeb(str(v, 'pattern') as PatternKind, inner, Math.max(num(v, 'cell'), H / 30)), z: 1.6, h: t - 3 },
    { colour: 'frame', region: diff(letter, inner), z: 0, h: t },
    { colour: 'slab', region: diff(slab, letter), z: 0, h: t },
  ]
  // The name goes where it can be biggest while its plate stays on the letter:
  // along the letter's longest stroke, reading downwards where the letter
  // allows (a W's first stroke, an I's stem), or level across it. Each candidate
  // band is checked at a dozen rows across its height, not just its edges.
  const room = offset(letter, -1)
  const probe = fitText(fontOf(ctx, v, 'name'), name, 1e5, 100, 100, false)
  const pb = probe.art.length ? bounds(probe.art) : { w: 1, h: 1 }
  const aspect = pb.w / Math.max(pb.h, 1e-6)
  let best = { size: 0, length: 0, band: 0, angle: 0, at: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] as [number, number] }
  for (const band of [0.22, 0.17, 0.13, 0.1].map((k) => H * k)) {
    const rowsAcross = Array.from({ length: 12 }, (_, i) => -band / 2 + (band * i) / 11)
    for (const deg of [-90, -85, -80, -75, -70, -65, -60, -55, -50, -45, 0]) {
      const a = (deg * Math.PI) / 180
      // Turn the letter so this direction lies along x.
      const turned = rotate(room, -a)
      const tb = bounds(turned)
      for (let y = tb.minY + band / 2; y <= tb.maxY - band / 2; y += 3) {
        for (const [x1, x2] of spans(turned, y)) {
          let lo = x1
          let hi = x2
          for (const dy of rowsAcross) {
            const hit = spans(turned, y + dy).find(([p, q]) => p < (lo + hi) / 2 && q > (lo + hi) / 2)
            if (!hit) { hi = lo; break }
            lo = Math.max(lo, hit[0])
            hi = Math.min(hi, hit[1])
          }
          // Text height this run allows (its plate adds about 2 mm all round);
          // a diagonal stroke is the look, so a level run must be clearly better.
          const size = Math.min(band - 5, (hi - lo - 8) / aspect) * (deg === 0 ? 0.85 : 1)
          if (size > best.size) {
            const mx = (lo + hi) / 2
            best = { size, length: hi - lo, band, angle: a, at: [mx * Math.cos(a) - y * Math.sin(a), mx * Math.sin(a) + y * Math.cos(a)] }
          }
        }
      }
    }
  }
  if (best.size <= 0) return { layers, warning: 'ตัวอักษรนี้แคบเกินจะวางชื่อ ลองตัวอักษรอื่นหรือฟอนต์ที่หนากว่า' }
  const textH = best.size / (best.angle === 0 ? 0.85 : 1)
  // maxH limits the drawn height (stacked Thai marks can stand taller than an em).
  const fit = fitText(fontOf(ctx, v, 'name'), name, best.length - 8, textH, textH * 2, false)
  if (fit.art.length) {
    // Centre first, then turn: the box of turned text is not centred on the text.
    const face = translate(rotate(centreAt(puffUp(fit.art, 0.4), 0, 0), best.angle), best.at[0], best.at[1])
    layers.push({ colour: 'plate', region: silhouette(face, 2), z: 0, h: t + 0.8 })
    layers.push({ colour: 'name', region: face, z: t + 0.8, h: r })
  }
  const warning = textH < 5 ? 'ชื่อยาวจนตัวอักษรเล็กกว่า 5 มม. ลดจำนวนตัวอักษรหรือเพิ่มขนาดป้าย' : undefined
  return { layers, warning }
}

/** A deep red heart with "Love" written on it, and a banner with the name below. */
function loveBanner(ctx: GiftContext, v: GiftValues) {
  const word = str(v, 'word')
  const name = str(v, 'name')
  if (missingGlyphs(fontOf(ctx, v, 'word'), word) || missingGlyphs(fontOf(ctx, v, 'name'), name)) return { layers: [], warning: NO_GLYPH }
  const S = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const heart = sized(filled(charmArt('heart')), S)
  const inner = offset(heart, -num(v, 'rim'))
  const layers: GiftLayer[] = [
    { colour: 'frame', region: heart, z: 0, h: t },
    { colour: 'panel', region: inner, z: t, h: 0.8 },
  ]
  const hb = bounds(heart)
  const wf = fitText(fontOf(ctx, v, 'word'), word, hb.w * 0.64, S * 0.4, S * 0.3, false)
  // The word stands on the inner panel only (past its edge it would hang over
  // the rim): shrink it until it fits, keeping its centre.
  if (wf.art.length) {
    let word = centreAt(rotate(puffUp(wf.art, 0.4), 0.12), 0, hb.maxY - S * 0.42)
    const room = offset(inner, -0.3)
    for (let i = 0; i < 24 && regionArea(diff(word, room)) > 0.05; i++) {
      const wb = bounds(word)
      word = translate(scale(translate(word, -wb.cx, -wb.cy), 0.95), wb.cx, wb.cy - wb.h * 0.01)
    }
    layers.push({ colour: 'word', region: intersect(word, room), z: t + 0.8, h: r })
  }
  // The banner: a ribbon with folded tails, a white label and the name.
  const nf = fitText(fontOf(ctx, v, 'name'), name, S * 0.85, S * 0.26, S * 0.2, false)
  const bw = Math.max(S * 0.7, (nf.art.length ? bounds(nf.art).w : 0) + S * 0.2)
  const bh = S * 0.3
  const by = hb.minY + S * 0.12
  const ribbon = union(roundRect(0, by, bw, bh, 4), ...[-1, 1].map((sx) => [[
    [sx * bw * 0.42, by - bh * 0.35], [sx * (bw / 2 + bh * 0.55), by - bh * 0.35], [sx * (bw / 2 + bh * 0.3), by - bh * 0.05], [sx * (bw / 2 + bh * 0.55), by + bh * 0.25], [sx * bw * 0.42, by + bh * 0.25],
  ] as [number, number][]].map((p) => (sx < 0 ? p.slice().reverse() : p))))
  const label = roundRect(0, by, bw - 8, bh - 8, 3)
  layers.push({ colour: 'frame', region: ribbon, z: 0, h: t + 1.6 })
  layers.push({ colour: 'panel', region: label, z: t + 1.6, h: 0.8 })
  if (nf.art.length) {
    const face = centreAt(puffUp(nf.art, 0.4), 0, by)
    layers.push({ colour: 'nameOutline', region: diff(silhouette(face, 1.2), face), z: t + 2.4, h: r })
    layers.push({ colour: 'name', region: face, z: t + 2.4, h: r })
  }
  return { layers }
}

/** Big letters, each a thick rim round a recessed pattern. */
function patternLetters(ctx: GiftContext, v: GiftValues) {
  const text = str(v, 'text')
  if (missingGlyphs(fontOf(ctx, v, 'text'), text)) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const fit = fitText(fontOf(ctx, v, 'text'), text, H * 4, H * 1.2, H, false)
  if (!fit.art.length) return { layers: [] }
  const face = connectedLetter(fit.art)
  const inner = offset(face, -num(v, 'rim'))
  return {
    layers: [
      { colour: 'panel', region: face, z: 0, h: 1.6 },
      { colour: 'pattern', region: patternWeb(str(v, 'pattern') as PatternKind, inner, num(v, 'cell')), z: 1.6, h: t - 3 },
      { colour: 'frame', region: diff(face, inner), z: 0, h: t },
    ],
  }
}

export const SIGNS2: GiftDesign[] = [
  {
    id: 'sign-pattern', name: 'ป้ายตัวอักษรเอียงลายตาข่าย', group: 'namesign', blurb: 'ตัวอักษรใหญ่เอียงบนแท่นแบน ไส้ลายตาข่าย ชื่อเล็กพาดกลาง',
    params: [
      { key: 'name', label: 'ชื่อ', kind: 'text', default: 'SARA', maxChars: 12, font: 'lilita' },
      { key: 'letter', label: 'ตัวอักษรใหญ่', kind: 'text', default: 'W', maxChars: 1, font: 'lilita', hint: 'เว้นว่าง ใช้ตัวแรกของชื่อ' },
      { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 150, min: 70, max: 260, step: 1, unit: 'มม.' },
      { key: 'tilt', label: 'เอียง', kind: 'number', default: -10, min: -25, max: 25, step: 1, unit: 'องศา' },
      { key: 'rim', label: 'ขอบตัวอักษร', kind: 'number', default: 5, min: 2.4, max: 10, step: 0.2, unit: 'มม.' },
      { key: 'cell', label: 'ขนาดช่องลาย', kind: 'number', default: 7, min: 4, max: 16, step: 0.5, unit: 'มม.' },
      { key: 'pattern', label: 'ลายด้านใน', kind: 'choice', default: 'lattice', options: PATTERNS },
      { key: 'base', label: 'ความหนา', kind: 'number', default: 12, min: 4, max: 24, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ชื่อนูน', kind: 'number', default: 1.4, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'frame', label: 'ขอบตัวอักษร', default: '#f472b6' },
      { key: 'panel', label: 'แผ่นหลัง', default: '#fde68a' },
      { key: 'pattern', label: 'ลายด้านใน', default: '#a78bfa' },
      { key: 'slab', label: 'แท่นวาง', default: '#f9a8d4' },
      { key: 'plate', label: 'ขอบรอบชื่อ', default: '#7c3aed' },
      { key: 'name', label: 'ชื่อ', default: '#ffffff' },
    ],
    build: leaning,
  },
  {
    id: 'sign-banner', name: 'ป้ายหัวใจ Love กับริบบิ้นชื่อ', group: 'namesign', blurb: 'หัวใจแดงหนา คำว่า Love ตัวเขียน ริบบิ้นชื่อด้านล่าง',
    params: [
      { key: 'word', label: 'คำบนหัวใจ', kind: 'text', default: 'Love', maxChars: 10, font: 'pacifico' },
      { key: 'name', label: 'ชื่อบนริบบิ้น', kind: 'text', default: 'KATE', maxChars: 12, font: 'lilita' },
      { key: 'size', label: 'ขนาดหัวใจ', kind: 'number', default: 140, min: 70, max: 240, step: 1, unit: 'มม.' },
      { key: 'rim', label: 'ขอบหัวใจ', kind: 'number', default: 6, min: 3, max: 14, step: 0.2, unit: 'มม.' },
      { key: 'base', label: 'ความหนาหัวใจ', kind: 'number', default: 14, min: 4, max: 26, step: 0.2, unit: 'มม.' },
      { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.6, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'frame', label: 'หัวใจและริบบิ้น', default: '#dc2626' },
      { key: 'panel', label: 'พื้นขาว', default: '#ffffff' },
      { key: 'word', label: 'คำบนหัวใจ', default: '#111827' },
      { key: 'nameOutline', label: 'ขอบชื่อ', default: '#111827' },
      { key: 'name', label: 'ชื่อ', default: '#facc15' },
    ],
    build: loveBanner,
  },
  {
    id: 'pattern-text', name: 'ตัวอักษรไส้ลาย', group: 'namesign', blurb: 'ตัวอักษรหนาขอบดำ ไส้ลายฉลุสีเหลืองยุบลงจากขอบ',
    params: [
      { key: 'text', label: 'ตัวอักษรหรือคำสั้น', kind: 'text', default: 'E', maxChars: 6, font: 'lilita' },
      { key: 'size', label: 'ความสูงตัวอักษร', kind: 'number', default: 140, min: 50, max: 260, step: 1, unit: 'มม.' },
      { key: 'rim', label: 'ขอบตัวอักษร', kind: 'number', default: 6, min: 2.4, max: 12, step: 0.2, unit: 'มม.' },
      { key: 'cell', label: 'ขนาดช่องลาย', kind: 'number', default: 9, min: 4, max: 18, step: 0.5, unit: 'มม.' },
      { key: 'pattern', label: 'ลายด้านใน', kind: 'choice', default: 'daisy', options: PATTERNS },
      { key: 'base', label: 'ความหนา', kind: 'number', default: 16, min: 4, max: 30, step: 0.2, unit: 'มม.' },
    ],
    colours: [
      { key: 'frame', label: 'ขอบตัวอักษร', default: '#111827' },
      { key: 'panel', label: 'แผ่นหลัง', default: '#fef3c7' },
      { key: 'pattern', label: 'ลายด้านใน', default: '#facc15' },
    ],
    build: patternLetters,
  },
]
