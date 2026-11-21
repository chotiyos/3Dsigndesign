import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extrude } from '../solid'
import { analyse } from '../solid'
import { fontFromArrayBuffer } from '../hb'
import { bounds, diff, islands, offset, rect, regionArea, union } from '../geo2d'
import { cleanText, cleanValues, connectedLetter, defaults, GIFT_GROUPS, GIFTS, parseGiftStorage, resolve, standingFoot, toModel, topView } from './index'
import { solidCount } from './connect'
import { GIFT_FONTS } from '../fonts'

function font(file: string) {
  const bytes = readFileSync(`public/fonts/${file}`)
  return fontFromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const kanit = font('Kanit-Bold.ttf')
// Every gift font, as the page loads them, so designs are tested in the fonts they really use.
const allFonts = Object.fromEntries(GIFT_FONTS.map((f) => [f.id, font(f.url.replace('/fonts/', ''))]))
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
    it(`${g.id}: handles range extremes, long stacked Thai and empty text`, () => {
      for (const mode of ['min', 'max', 'wide', 'empty'] as const) {
        const raw = Object.fromEntries(g.params.map((p) => [p.key,
          p.kind === 'number' ? ((mode === 'max' || (mode === 'wide' && ['width', 'length', 'photoH', 'rim', 'border', 'magnet'].includes(p.key))) ? p.max : p.min) ?? p.default :
          p.kind === 'text' ? (mode === 'empty' ? '' : 'กิ่'.repeat(p.maxChars ?? 24)) :
          p.kind === 'toggle' ? mode !== 'min' :
          p.kind === 'choice' && mode === 'min' ? p.options?.[0]?.id ?? p.default :
          p.kind === 'choice' && mode === 'max' ? p.options?.at(-1)?.id ?? p.default : p.default]))
        const result = g.build({ font: mitr }, cleanValues(g, raw))
        if (!result.layers.length) {
          expect(Boolean(result.warning) || mode === 'empty', `${g.id} ${mode}: empty without explanation`).toBe(true)
          continue
        }
        let layers = resolve(result.layers)
        // Designs printed face down are checked the way up they print.
        if (g.printFlipped) {
          const top = Math.max(...layers.map((l) => l.z + l.h))
          layers = layers.map((l) => ({ ...l, z: top - l.z - l.h }))
        }
        for (const l of layers) {
          const geo = extrude(l.region, l.h, l.z)
          expect(analyse(geo).watertight, `${g.id} ${mode} ${l.colour}`).toBe(true)
          geo.dispose()
          expect([bounds(l.region).w, bounds(l.region).h, l.z, l.h].every(Number.isFinite)).toBe(true)
          if (['text', 'name', 'motif', 'line'].includes(l.colour) && l.z > 0 && l.wrap === undefined) {
            const below = layers.filter((b) => (b.stand ?? null) === (l.stand ?? null) && b.z < l.z && b.z + b.h >= l.z - 1e-5)
            expect(regionArea(diff(l.region, offset(union(...below.map((b) => b.region)), 0.08))), `${g.id} ${mode} ${l.colour} support`).toBeLessThan(0.2)
          }
        }
      }
    }, 60_000)

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

  it('keeps the non-overlapping heights of earlier layers', () => {
    const layers = resolve([
      { colour: 'base', region: rect(0, 0, 20, 20), z: 0, h: 5 },
      { colour: 'art', region: rect(0, 0, 10, 10), z: 2, h: 1 },
    ])
    expect(layers.filter((l) => l.colour === 'base').reduce((v, l) => v + regionArea(l.region) * l.h, 0)).toBeCloseTo(1900, 0)
  })

  it('centres standing feet in depth and embeds them by 2 mm', () => {
    const foot = standingFoot(rect(0, 0, 100, 120), 'base', 4)
    expect(foot.h).toBeGreaterThanOrEqual(24)
    expect(foot.z + foot.h / 2).toBe(2)
    expect(bounds(foot.region).maxY).toBeCloseTo(-58)
  })

  it('snaps numbers relative to their minimum without escaping the range', () => {
    const g = { ...GIFTS[0], params: [{ key: 'n', label: '', kind: 'number' as const, default: 1.1, min: 1.1, max: 2, step: 0.4 }] }
    expect(cleanValues(g, { n: 1.1 }).n).toBe(1.1)
    expect(cleanValues(g, { n: 99 }).n).toBeLessThanOrEqual(2)
    expect(cleanValues(g, { n: NaN }).n).toBe(1.1)
  })

  it('restores valid entries while ignoring malformed storage and entries', () => {
    for (const raw of ['{', 'null', '[]', 'true', '3']) expect(parseGiftStorage(raw)).toEqual({})
    expect(parseGiftStorage('{"bad":null,"alsoBad":[],"good":{"values":{"name":"Mali"}}}')).toEqual({ good: { values: { name: 'Mali' } } })
  })

  it('limits whole graphemes without splitting stacked Thai marks', () => {
    expect(cleanText('กิ่กิ่กิ่', 2)).toBe('กิ่กิ่')
  })

  it('joins structural marks while keeping letter counters', () => {
    const ring = diff(rect(0, 0, 20, 20), rect(0, 0, 10, 10))
    const connected = connectedLetter(union(ring, rect(0, 16, 3, 3)))
    expect(islands(connected)).toHaveLength(1)
    expect(regionArea(diff(rect(0, 0, 8, 8), connected))).toBeCloseTo(64)
  })

  it('keeps wide shallow bowl slopes within 45 degrees', () => {
    for (const id of ['home-bowl-cone', 'home-bowl-curved']) {
      const g = GIFTS.find((d) => d.id === id)!
      const layers = g.build({ font: kanit }, cleanValues(g, { ...defaults(g), width: 220, height: 30 })).layers.filter((l) => l.colour === 'cup')
      for (let i = 2; i < layers.length; i++) {
        const dr = (bounds(layers[i].region).w - bounds(layers[i - 1].region).w) / 2
        expect(dr).toBeLessThanOrEqual(layers[i].z - layers[i - 1].z + 0.002)
      }
    }
  })

  it('rejects magnet pockets that would break through the side wall', () => {
    const g = GIFTS.find((d) => d.id === 'home-magnet')!
    const result = g.build({ font: kanit }, cleanValues(g, { ...defaults(g), size: 40, magnet: 20 }))
    expect(result.layers).toHaveLength(0)
    expect(result.warning).toBeTruthy()
    const valid = g.build({ font: kanit }, cleanValues(g, { ...defaults(g), base: 1.6 }))
    expect(valid.layers.find((l) => l.colour === 'rim' && l.z === 2.2)!.h).toBeGreaterThanOrEqual(1.19)
  })

  it('supports every raised layer at defaults', () => {
    const failures: string[] = []
    for (const g of GIFTS.filter((d) => !d.needsSupport)) {
      let layers = resolve(g.build({ font: kanit, fonts: allFonts }, defaults(g)).layers)
      // Designs printed face down are checked the way up they print.
      if (g.printFlipped) {
        const top = Math.max(...layers.map((l) => l.z + l.h))
        layers = layers.map((l) => ({ ...l, z: top - l.z - l.h }))
      }
      for (const l of layers) {
        // Wrapped lettering sits on a curved wall, which this flat check cannot see.
        // The magnet's dog bridges the round magnet pocket, which prints as a bridge.
        if (l.z < 1e-6 || l.wrap !== undefined || (g.id === 'home-magnet' && l.colour === 'dog')) continue
        const below = layers.filter((b) => (b.stand ?? null) === (l.stand ?? null) && b.z < l.z && b.z + b.h >= l.z - 1e-5)
        // A slope up to 45 degrees prints without support: allow the layer's own height.
        const unsupported = diff(l.region, offset(union(...below.map((b) => b.region)), Math.max(0.06, l.h)))
        if (regionArea(unsupported) > 0.2) failures.push(`${g.id} ${l.colour}: ${regionArea(unsupported).toFixed(1)} mm2`)
      }
    }
    expect(failures).toEqual([])
  }, 60_000)

  it('builds every design as one solid, with no loose or floating pieces', () => {
    // Bookends come as a pair; the LED sign's back cover prints beside it.
    const expected: Record<string, number> = { 'desk-bookends': 2, 'home-christmas-led': 2 }
    const failures: string[] = []
    for (const g of GIFTS) {
      for (const f of [kanit, mitr]) {
        const { count, loose } = solidCount(g.build({ font: f, fonts: f === kanit ? allFonts : undefined }, defaults(g)).layers)
        if (count !== (expected[g.id] ?? 1)) failures.push(`${g.id}: ${count} :: ${loose.slice(0, 3).join(' | ')}`)
      }
    }
    expect(failures).toEqual([])
  }, 300_000)

  it('profiles default drawing and model generation', () => {
    const timings: { id: string; draw: number; model: number }[] = []
    for (const g of GIFTS) {
      const start = performance.now()
      const result = g.build({ font: kanit }, defaults(g))
      const drawn = performance.now()
      const model = toModel(g, result, {})
      expect(model.parts.length, g.id).toBeGreaterThan(0)
      timings.push({ id: g.id, draw: Math.round(drawn - start), model: Math.round(performance.now() - drawn) })
      model.parts.forEach((p) => p.geometry.dispose())
    }
    if (process.env.GIFT_PROFILE) console.table(timings)
  }, 60_000)

  it('cleans values to each parameter range', () => {
    const g = GIFTS[0]
    const v = cleanValues(g, { size: 9999, name: 'x'.repeat(50), stand: 'yes' })
    expect(v.size).toBe(g.params.find((p) => p.key === 'size')!.max)
    expect(String(v.name)).toHaveLength(g.params.find((p) => p.key === 'name')!.maxChars!)
    expect(v.stand).toBe(g.params.find((p) => p.key === 'stand')!.default)
  })
})
