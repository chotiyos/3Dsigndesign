import { describe, expect, it } from 'vitest'
import { bridgeArt, closestPoints, floatingCount } from './bridges'
import { circle, islands, rect, union } from './geo2d'

// Two tall letter bodies, a tone mark above the first and a dot above the mark.
const letters = union(rect(0, 0, 20, 60), rect(40, 0, 20, 60))
const mark = rect(2, 42, 8, 8)
const dot = circle(2, 56, 2, 24)
const art = union(letters, mark, dot)

describe('bridgeArt', () => {
  it('counts floating marks apart from letter bodies', () => {
    expect(floatingCount(art)).toEqual({ marks: 2, pieces: 4 })
  })

  it('finds the closest points between two outlines', () => {
    const { d, from, to } = closestPoints(rect(0, 0, 10, 10)[0], rect(30, 0, 10, 10)[0])
    expect(d).toBeCloseTo(20, 5)
    expect(from[0]).toBeCloseTo(5, 5)
    expect(to[0]).toBeCloseTo(25, 5)
  })

  it('ties marks on to a letter but leaves letters apart in marks mode', () => {
    const { region, bars } = bridgeArt(art, 1, 2)
    expect(bars).toBe(2)
    expect(islands(region)).toHaveLength(2)
  })

  it('joins everything into one piece in all mode', () => {
    const { region, bars } = bridgeArt(art, 2, 2)
    expect(bars).toBe(3)
    expect(islands(region)).toHaveLength(1)
  })

  it('changes nothing when off or when nothing floats', () => {
    expect(bridgeArt(art, 0, 2).region).toBe(art)
    expect(bridgeArt(letters, 1, 2)).toEqual({ region: letters, bars: 0 })
  })
})

it('bridges sub-centimetre gaps instead of only marking them connected', () => {
  const result = bridgeArt(union(rect(0, 0, 10, 30), rect(10.005, 0, 10, 30)), 2, 1)
  expect(result.bars).toBe(1)
  expect(islands(result.region)).toHaveLength(1)
})

it('connects many separated clusters without an exhaustive outline search', () => {
  const clustered = union(...Array.from({ length: 140 }, (_, i) => circle(Math.floor(i / 7) * 200 + (i % 7) * 12, 0, 4, 64)))
  const start = performance.now()
  const result = bridgeArt(clustered, 2, 1)
  expect(islands(result.region)).toHaveLength(1)
  expect(result.bars).toBe(139)
  expect(performance.now() - start).toBeLessThan(5000)
}, 10000)
