import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { artMeasures, cleanRates, costSheet, sheetKey } from './estimate'
import type { PartStat } from './exportModel'
import { rect } from './geo2d'
import { jobSheetHtml } from './jobSheet'
import type { SignPart } from './styles'

const part = (code: string, material: SignPart['material'], extra: Partial<SignPart> = {}): SignPart => ({
  id: code, code, label: code, material, geometry: new THREE.BufferGeometry(), explode: 0, ...extra,
})
const stat = (p: SignPart, grams: number): PartStat => ({ part: p, volumeCm3: 0, grams, watertight: true, size: new THREE.Vector3(10, 10, 3) })

describe('estimate', () => {
  it('measures outline length and face area', () => {
    const m = artMeasures(rect(0, 0, 100, 50))
    expect(m.perimeter).toBeCloseTo(300, 5)
    expect(m.faceArea).toBeCloseTo(5000, 5)
  })

  it('prices printed parts by weight, sheet by cut rectangle, and LEDs by count', () => {
    const face = rect(0, 0, 500, 200)
    const stats = [
      stat(part('A', 'print'), 800),
      stat(part('B', 'accent'), 200),
      stat(part('C', 'acrylic', { cut: face, profile: { region: face, depth: 3 } }), 0),
      stat(part('D', 'led'), 0),
    ]
    const rates = cleanRates({ filament: 500, sheet: { [sheetKey('acrylic', 3)]: 1000 }, led: 10, psu: 300, labour: 200, margin: 20 })
    const cost = costSheet(stats, { modules: 12, supplies: 1 }, rates)
    const by = Object.fromEntries(cost.lines.map((l) => [l.key, l]))
    expect(by.filament.qty).toBeCloseTo(1, 5)
    expect(by.filament.amount).toBeCloseTo(500, 5)
    expect(by['sheet:acrylic@3'].qty).toBeCloseTo(0.1, 5)
    expect(by['sheet:acrylic@3'].amount).toBeCloseTo(100, 5)
    expect(by.led.amount).toBe(120)
    expect(by.psu.amount).toBe(300)
    expect(cost.subtotal).toBeCloseTo(1220, 5)
    expect(cost.total).toBeCloseTo(1464, 5)
    expect(cost.unpriced).toEqual([])
  })

  it('cleans saved rates and lists the ones still unpriced', () => {
    const rates = cleanRates({ filament: -5, led: 'x', sheet: { 'acrylic@3': 50, 'bad key': 9, 'nothing@2': 4 }, margin: 9999, shop: 7 })
    expect(rates).toEqual({ shop: '', filament: 0, sheet: { 'acrylic@3': 50 }, led: 0, psu: 0, labour: 0, margin: 500 })
    expect(cleanRates(null).filament).toBe(450)
    expect(costSheet([], null, cleanRates(null)).unpriced).toEqual(['ค่าแรงและค่าเครื่อง'])
  })
})

describe('jobSheetHtml', () => {
  it('escapes what the customer typed and leaves prices out when asked', () => {
    const html = jobSheetHtml({
      shop: 'ร้าน <b>', customer: 'คุณ "เอ"', job: 'J-1', notes: '<script>x</script>', date: new Date(2026, 10, 6), image: null,
      style: 'A01 ตัวอักษรไฟ', text: 'ร้าน\nกาแฟ', size: { w: 500, h: 200, d: 40 },
      parts: [{ code: 'A', label: 'หน้า', material: 'อะคริลิก', method: 'ตัดแผ่น', size: '1×1×1', grams: '5' }],
      figures: [['ความยาวขอบตัวอักษร', '3 ม.']], cost: null,
    })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('ร้าน &lt;b&gt;')
    expect(html).toContain('ร้าน<br>กาแฟ')
    expect(html).not.toContain('<h2>ราคา</h2>')
    expect(html).toContain('ลูกค้าอนุมัติแบบ')
  })
})
