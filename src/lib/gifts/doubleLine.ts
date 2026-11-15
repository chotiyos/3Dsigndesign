import { puffUp } from '../bubbleKeychain'
import { bounds, offset, translate, union } from '../geo2d'
import { silhouette } from '../styles/kit'
import { fitText, fontOf, missingGlyphs, num, str, standingFoot, type GiftContext, type GiftDesign, type GiftLayer, type GiftParam, type GiftValues } from './core'
import { KAWAII, type KawaiiId } from './kawaii'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์หรือลบอักขระที่ไม่รองรับ (ฟอนต์อังกฤษตัวอ้วนใช้กับภาษาไทยไม่ได้)'

/**
 * Two lines of chunky lettering on a deep body that follows them, with a cute
 * motif tucked against the end of the lower line.
 */
const PARAMS: GiftParam[] = [
  { key: 'top', label: 'ข้อความบรรทัดบน', kind: 'text', default: 'CHLOE', maxChars: 14, font: 'coiny' },
  { key: 'bottom', label: 'ข้อความบรรทัดล่าง', kind: 'text', default: 'FULLER', maxChars: 14, font: 'cherry-bomb' },
  { key: 'topH', label: 'ความสูงตัวอักษรบรรทัดบน', kind: 'number', default: 27, min: 12, max: 60, step: 1, unit: 'มม.' },
  { key: 'bottomH', label: 'ความสูงตัวอักษรบรรทัดล่าง', kind: 'number', default: 28, min: 12, max: 60, step: 1, unit: 'มม.' },
  { key: 'shape', label: 'ขนาดลาย', kind: 'number', default: 54, min: 25, max: 100, step: 1, unit: 'มม.' },
  { key: 'margin', label: 'ขอบตัวป้าย', kind: 'number', default: 5, min: 2, max: 12, step: 0.5, unit: 'มม.' },
  { key: 'base', label: 'ความหนาตัวป้าย', kind: 'number', default: 20, min: 4, max: 30, step: 0.2, unit: 'มม.' },
  { key: 'raise', label: 'ตัวอักษรและลายนูน', kind: 'number', default: 2.6, min: 0.6, max: 6, step: 0.2, unit: 'มม.' },
  { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: false, hint: 'ตัวป้ายหนาตั้งได้เอง เปิดเมื่อทำบางกว่า 10 มม.' },
]

/** Text of `key` at `height` per em, left edge at x = 0 and top at y = 0. */
function line(ctx: GiftContext, v: GiftValues, key: string, height: number) {
  const fit = fitText(fontOf(ctx, v, key), str(v, key), 10_000, height * 3, height, false)
  if (!fit.art.length) return []
  const art = puffUp(fit.art, Math.min(0.6, fit.height * 0.03))
  const b = bounds(art)
  return translate(art, -b.minX, -b.maxY)
}

function doubleLine(ctx: GiftContext, v: GiftValues, motif: KawaiiId) {
  for (const key of ['top', 'bottom']) if (missingGlyphs(fontOf(ctx, v, key), str(v, key))) return { layers: [], warning: NO_GLYPH }
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const top = line(ctx, v, 'top', num(v, 'topH'))
  let bottom = line(ctx, v, 'bottom', num(v, 'bottomH'))
  const tb = top.length ? bounds(top) : { minY: 0, h: 0 }
  // The lower line sits snugly under the upper one, indented a little.
  if (bottom.length) bottom = translate(bottom, num(v, 'topH') * 0.18, tb.minY - num(v, 'bottomH') * 0.08)
  const text = union(top, bottom)
  if (!text.length) return { layers: [] }
  const anchor = bottom.length ? bounds(bottom) : bounds(top)
  // The motif overlaps the end of the lower line slightly.
  const m = KAWAII[motif](num(v, 'shape'))
  const mb = bounds(m.outline)
  const dx = anchor.maxX + mb.w * 0.38
  const dy = (anchor.minY + anchor.maxY) / 2 + mb.h * 0.12
  const pieces = m.pieces.map((p) => ({ ...p, region: translate(p.region, dx, dy) }))
  const outline = translate(m.outline, dx, dy)
  const body = silhouette(union(text, offset(outline, 0.01)), num(v, 'margin'))
  const role = { main: 'motif', second: 'motif2', third: 'accent', mark: 'mark' } as const
  const layers: GiftLayer[] = [
    { colour: 'base', region: body, z: 0, h: t },
    // The motif covers the letters it overlaps.
    { colour: 'text', region: text, z: t, h: r },
    ...pieces.filter((p) => p.role !== 'mark').map((p) => ({ colour: role[p.role], region: p.region, z: t, h: r })),
    ...pieces.filter((p) => p.role === 'mark').map((p) => ({ colour: 'mark', region: p.region, z: t, h: r + 0.6 })),
  ]
  if (v.stand) layers.unshift(standingFoot(body, 'base', t))
  return { layers }
}

type Look = { id: string; name: string; blurb: string; motif: KawaiiId; top: string; bottom: string; colours: [string, string, string, string, string, string] }

const LOOKS: Look[] = [
  { id: 'sign-flower', name: 'ป้ายชื่อ 2 บรรทัด ดอกทานตะวัน', blurb: 'ตัวอักษรอ้วนสองบรรทัดบนตัวป้ายหนา ดอกทานตะวันหน้ายิ้มที่มุม', motif: 'sunflower', top: 'CHLOE', bottom: 'FULLER', colours: ['#ea9e5f', '#374151', '#facc15', '#ffffff', '#f9a8d4', '#374151'] },
  { id: 'sign-rocket', name: 'ป้ายชื่อ 2 บรรทัด จรวด', blurb: 'ตัวอักษรดำบนตัวป้ายเหลือง จรวดหน้ายิ้มที่มุม', motif: 'rocket', top: 'ARTHUR', bottom: 'BROWN', colours: ['#facc15', '#1f2937', '#ffffff', '#60a5fa', '#f97316', '#1f2937'] },
  { id: 'sign-bunny', name: 'ป้ายชื่อ 2 บรรทัด กระต่าย', blurb: 'ตัวอักษรขาวและเหลืองบนตัวป้ายม่วง กระต่ายหน้ายิ้มที่มุม', motif: 'bunny', top: 'EMILY', bottom: 'WHITE', colours: ['#c084fc', '#ffffff', '#ffffff', '#ffffff', '#f9a8d4', '#4b5563'] },
  { id: 'sign-planet', name: 'ป้ายชื่อ 2 บรรทัด ดาวเคราะห์', blurb: 'ตัวอักษรขาวบนตัวป้ายดำ ดาวเคราะห์สีม่วงหน้ายิ้มที่มุม', motif: 'planet', top: 'JAMES', bottom: 'HUNT', colours: ['#1f2937', '#ffffff', '#a78bfa', '#facc15', '#f9a8d4', '#1f2937'] },
]

export const DOUBLE_LINE: GiftDesign[] = LOOKS.map((look) => ({
  id: look.id,
  name: look.name,
  group: 'namesign',
  blurb: look.blurb,
  params: PARAMS.map((p) => (p.key === 'top' ? { ...p, default: look.top } : p.key === 'bottom' ? { ...p, default: look.bottom } : p)),
  colours: [
    { key: 'base', label: 'ตัวป้าย', default: look.colours[0] },
    { key: 'text', label: 'ตัวอักษร', default: look.colours[1] },
    { key: 'motif', label: 'ลายสีหลัก', default: look.colours[2] },
    { key: 'motif2', label: 'ลายสีรอง', default: look.colours[3] },
    { key: 'accent', label: 'แก้มและลายเล็ก', default: look.colours[4] },
    { key: 'mark', label: 'หน้าและเส้น', default: look.colours[5] },
  ],
  howTo: ['ตัวป้ายหนา พิมพ์คว่ำหน้าไม่ได้ ให้วางด้านหลังติดแผ่นพิมพ์ เติมไส้ 10–15% พอ'],
  build: (ctx, v) => doubleLine(ctx, v, look.motif),
}))
