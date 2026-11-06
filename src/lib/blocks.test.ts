import { describe, expect, it } from 'vitest'
import { belowOffset, cleanBlocks, MAX_BLOCKS, placeBlock, snapBlock } from './blocks'
import { bounds, rect } from './geo2d'

const fonts = ['kanit-bold', 'itim']
const main = bounds(rect(0, 0, 400, 100))

describe('text blocks', () => {
  it('cleans stored blocks: fonts, ranges, ids and the block limit', () => {
    const blocks = cleanBlocks([
      { id: 'a1', text: 'สโลแกน', fontId: 'itim', heightMM: 99999, x: 5, y: -80 },
      { id: 'a1', text: 7, fontId: 'nope', heightMM: 'x' },
      'junk', null, {}, {}, {}, {},
    ], fonts)
    expect(blocks).toHaveLength(MAX_BLOCKS)
    expect(blocks[0]).toEqual({ id: 'a1', text: 'สโลแกน', fontId: 'itim', heightMM: 1500, spacingMM: 0, x: 5, y: -80 })
    expect(blocks[1]).toMatchObject({ text: '', fontId: 'kanit-bold', heightMM: 60 })
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length)
    expect(cleanBlocks('x', fonts)).toEqual([])
  })

  it('places a block by its centre relative to the main artwork', () => {
    const placed = bounds(placeBlock(rect(1000, 1000, 100, 20), { x: 50, y: -90 }, main))
    expect(placed.cx).toBeCloseTo(50, 5)
    expect(placed.cy).toBeCloseTo(-90, 5)
  })

  it('starts a new block under everything already placed', () => {
    const { x, y } = belowOffset(main, main, 40)
    expect(x).toBe(0)
    expect(main.cy + y + 20).toBeLessThan(main.minY)
  })

  it('snaps to the centre line and edges within reach, and leaves it alone outside', () => {
    const size = { w: 100, h: 20 }
    const centre = snapBlock(3, -80, size, main, 5)
    expect(centre.x).toBe(0)
    expect(centre.guides.v).toEqual([0])
    const leftEdge = snapBlock(-148, -80, size, main, 5)
    expect(leftEdge.x).toBe(-150)
    expect(leftEdge.guides.v).toEqual([-200])
    const under = snapBlock(60, -50 - 5 - 10 + 2, size, main, 5)
    expect(under.y).toBeCloseTo(-65, 5)
    expect(under.guides.h).toHaveLength(1)
    const free = snapBlock(77, -120, size, main, 5)
    expect(free).toEqual({ x: 77, y: -120, guides: { v: [], h: [] } })
  })
})

it('repairs saturated duplicate ids without looping and remains stable on a second import', () => {
  const result = cleanBlocks([{ id: 'xxxxxxxxxxxx' }, { id: 'xxxxxxxxxxxx' }, { id: 'b2x1' }, { id: 'xxxxxxxxxxxx' }], fonts)
  expect(new Set(result.map(b => b.id)).size).toBe(4)
  expect(cleanBlocks(JSON.parse(JSON.stringify(result)), fonts)).toEqual(result)
})
