import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
const { parse, createShapes } = vi.hoisted(() => ({ parse: vi.fn(), createShapes: vi.fn() }))
vi.mock('three/examples/jsm/loaders/SVGLoader.js', () => ({ SVGLoader: class { parse = parse; static createShapes = createShapes } }))
import { parseSvgToShapes } from './svgToShapes'

describe('SVG fill handling', () => {
  it('uses the SVG fill-rule converter and ignores unfilled paths', () => {
    const filled = { userData: { style: { fill: '#000' } } }
    parse.mockReturnValue({ paths: [filled, { userData: { style: { fill: 'none' } } }, { userData: { style: { opacity: 0 } } }] })
    createShapes.mockReturnValue([new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.2, 0.1)])])
    const result = parseSvgToShapes('<svg/>')
    expect(createShapes).toHaveBeenCalledExactlyOnceWith(filled)
    expect(result.upem).toBeCloseTo(0.1)
  })
})
