import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }))
// SVGLoader.parse needs a DOM parser, which Vitest's node environment lacks.
vi.mock('three/examples/jsm/loaders/SVGLoader.js', () => ({ SVGLoader: class { parse = parse } }))
import { parseSvgToShapes } from './svgToShapes'

const triangle = () => [new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.2, 0.1)])]

describe('SVG fill handling', () => {
  it('converts filled paths with ShapePath.toShapes and ignores unfilled ones', () => {
    const filled = { userData: { style: { fill: '#000' } }, toShapes: vi.fn(triangle) }
    const unfilled = { userData: { style: { fill: 'none' } }, toShapes: vi.fn(triangle) }
    const invisible = { userData: { style: { opacity: 0 } }, toShapes: vi.fn(triangle) }
    parse.mockReturnValue({ paths: [filled, unfilled, invisible] })
    const result = parseSvgToShapes('<svg/>')
    expect(filled.toShapes).toHaveBeenCalledOnce()
    expect(unfilled.toShapes).not.toHaveBeenCalled()
    expect(invisible.toShapes).not.toHaveBeenCalled()
    expect(result.upem).toBeCloseTo(0.1)
  })

  it('reports a Thai error when nothing is fillable', () => {
    parse.mockReturnValue({ paths: [{ userData: { style: { fill: 'none' } }, toShapes: vi.fn(triangle) }] })
    expect(() => parseSvgToShapes('<svg/>')).toThrow(/SVG/)
  })
})
