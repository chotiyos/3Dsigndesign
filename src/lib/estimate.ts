import { MATERIAL_NAMES } from '../three/materials'
import { MATERIAL_INFO, type PartStat } from './exportModel'
import { bounds, regionArea, type Region } from './geo2d'
import type { MaterialId } from './styles'

/** Outline length and face area of the artwork, the figures sign shops quote from. */
export function artMeasures(art: Region) {
  let perimeter = 0
  for (const poly of art) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      perimeter += Math.hypot(x2 - x1, y2 - y1)
    }
  }
  return { perimeter, faceArea: Math.abs(regionArea(art)) }
}

/** The shop's own prices. Only the filament rate has a starting value; the rest start at 0 until the shop types them in. */
export interface Rates {
  shop: string
  /** Baht per kg of printed parts. */
  filament: number
  /** Baht per square metre of sheet, keyed by material and thickness (see sheetKey). */
  sheet: Record<string, number>
  /** Baht per LED module. */
  led: number
  /** Baht per power supply. */
  psu: number
  /** Flat labour and machine time for the job, in baht. */
  labour: number
  /** Mark-up on the total, in percent. */
  margin: number
}

export const DEFAULT_RATES: Rates = { shop: '', filament: 450, sheet: {}, led: 0, psu: 0, labour: 0, margin: 0 }

const num = (value: unknown, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0)

/** Sheet stock is bought by material and thickness: "acrylic@3". */
export const sheetKey = (material: MaterialId, depth: number) => `${material}@${Math.round(depth * 10) / 10}`

export function cleanRates(input: unknown): Rates {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ...DEFAULT_RATES, sheet: {} }
  const raw = input as Partial<Rates>
  const sheet: Record<string, number> = {}
  if (raw.sheet && typeof raw.sheet === 'object' && !Array.isArray(raw.sheet)) {
    for (const [key, v] of Object.entries(raw.sheet)) {
      if (/^[a-z]+@\d+(\.\d)?$/.test(key) && key.split('@')[0] in MATERIAL_INFO && num(v, 1e6) > 0) sheet[key] = num(v, 1e6)
    }
  }
  return {
    shop: typeof raw.shop === 'string' ? raw.shop.slice(0, 80) : '',
    filament: typeof raw.filament === 'number' ? num(raw.filament, 1e5) : DEFAULT_RATES.filament,
    sheet,
    led: num(raw.led, 1e4),
    psu: num(raw.psu, 1e5),
    labour: num(raw.labour, 1e7),
    margin: num(raw.margin, 500),
  }
}

export interface CostLine {
  label: string
  qty: number
  unit: string
  rate: number
  amount: number
  /** Which rate sets this line: 'filament', 'led', 'psu', 'labour' or 'sheet:<sheetKey>'. */
  key: string
}

/**
 * Material cost lines from the visible parts. Printed parts go by weight;
 * sheet parts by the rectangle each is cut from (what gets bought), per
 * material and thickness.
 */
export function costSheet(stats: PartStat[], led: { modules: number; supplies: number } | null, rates: Rates) {
  const lines: CostLine[] = []
  let grams = 0
  const sheets = new Map<string, number>()
  for (const s of stats) {
    if (s.part.material === 'led') continue
    if (s.part.cut) {
      const b = bounds(s.part.cut)
      const key = sheetKey(s.part.material, s.part.profile?.depth ?? s.size.z)
      sheets.set(key, (sheets.get(key) ?? 0) + (b.w * b.h) / 1e6)
    } else grams += s.grams
  }
  if (grams > 0) lines.push({ key: 'filament', label: 'เส้นพลาสติกพิมพ์ 3D', qty: grams / 1000, unit: 'กก.', rate: rates.filament, amount: (grams / 1000) * rates.filament })
  for (const [key, area] of sheets) {
    const [m, t] = key.split('@')
    const rate = rates.sheet[key] ?? 0
    lines.push({ key: `sheet:${key}`, label: `แผ่น${MATERIAL_NAMES[m as MaterialId]} หนา ${t} มม.`, qty: area, unit: 'ตร.ม.', rate, amount: area * rate })
  }
  if (led && led.modules > 0) {
    lines.push({ key: 'led', label: 'โมดูล LED', qty: led.modules, unit: 'ดวง', rate: rates.led, amount: led.modules * rates.led })
    lines.push({ key: 'psu', label: 'หม้อแปลง 12 V', qty: led.supplies, unit: 'ตัว', rate: rates.psu, amount: led.supplies * rates.psu })
  }
  lines.push({ key: 'labour', label: 'ค่าแรงและค่าเครื่อง', qty: 1, unit: 'งาน', rate: rates.labour, amount: rates.labour })
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0)
  const markup = (subtotal * rates.margin) / 100
  return { lines, subtotal, markup, total: subtotal + markup, unpriced: lines.filter((line) => line.rate === 0).map((line) => line.label) }
}

export const baht = (n: number) => Math.round(n).toLocaleString('th-TH')
