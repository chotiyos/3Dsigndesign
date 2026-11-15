import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extrude } from '../solid'
import { analyse } from '../solid'
import { fontFromArrayBuffer } from '../hb'
import { regionArea } from '../geo2d'
import { cleanValues, defaults, GIFT_GROUPS, GIFTS, resolve, toModel, topView } from './index'

function font(file: string) {
  const bytes = readFileSync(`public/fonts/${file}`)
  return fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const kanit = font('Kanit-Bold.ttf')
const mitr = font('Mitr-SemiBold.ttf')

describe('gift catalogue', () => {
  it('has unique ids, a known group and at least one colour each', () => {
    expect(new Set(GIFTS.map((g) => g.id)).size).toBe(GIFTS.length)
    for (const g of GIFTS) {
      expect(GIFT_GROUPS.some((x) => x.id === g.group), g.id).toBe(true)
      expect(g.colours.length, g.id).toBeGreaterThan(0)
    }
  })

  for (const g of GIFTS) {
    it(`${g.id}: builds with defaults and a Thai name, every layer printable`, () => {
      for (const [f, extra] of [[kanit, {}], [mitr, { name: 'มะลิ', line1: 'น้องปิ่น', line2: 'สุขสันต์วันเกิด', name2: 'ต้น' }]] as const) {
        const v = cleanValues(g, { ...defaults(g), ...extra })
        const result = g.build({ font: f }, v)
        expect(result.warning, g.id).toBeUndefined()
        const layers = resolve(result.layers)
        expect(layers.length, g.id).toBeGreaterThan(1)
        for (const l of layers) {
          expect(regionArea(l.region), `${g.id} ${l.colour}`).toBeGreaterThan(0)
          const geo = extrude(l.region, l.h, l.z)
          expect(analyse(geo).watertight, `${g.id} ${l.colour}`).toBe(true)
          geo.dispose()
        }
        const model = toModel(g, result, {})
        expect(model.parts.length, g.id).toBeGreaterThan(1)
        expect(Math.max(model.width, model.height), g.id).toBeGreaterThan(15)
        expect(topView(model.layers, {})?.paths.length, g.id).toBeGreaterThan(0)
        model.parts.forEach((p) => p.geometry.dispose())
      }
    }, 60_000)
  }

  it('cleans values to each parameter range', () => {
    const g = GIFTS[0]
    const v = cleanValues(g, { size: 9999, name: 'x'.repeat(50), stand: 'yes' })
    expect(v.size).toBe(220)
    expect(String(v.name)).toHaveLength(16)
    expect(v.stand).toBe(true)
  })
})
