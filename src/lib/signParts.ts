import type * as THREE from 'three'
import { differencePolygons, offsetPolygons, polygonsToShapes, shapeToPolygons } from './polygonOps'

export interface SignPartsParams {
  /** Thickness of the letter wall, in mm. */
  wallThicknessMM: number
  /** Depth of the wall (the "can"), in mm. */
  bodyDepthMM: number
  /** Thickness of the front acrylic cap, in mm. */
  frontThicknessMM: number
  /** Thickness of the back plate, in mm. */
  backThicknessMM: number
}

export type SignPartId = 'front' | 'wall' | 'back'

export interface SignPart {
  id: SignPartId
  label: string
  shapes: THREE.Shape[]
  /** Extrusion depth, in font design units (same space as `shapes`). */
  depthFontUnits: number
  /** Z position of this part's back face, in mm. */
  zOffsetMM: number
  color: number
}

/**
 * "Front-lit with shoulder" style, simplified to a straight-walled can:
 * a thin hollow wall following the letter outline, capped by a flat
 * front acrylic sheet and a flat back plate — the same three-layer
 * construction real channel letters use.
 */
export function buildFrontLitParts(
  shapes: THREE.Shape[],
  upem: number,
  heightMM: number,
  params: SignPartsParams,
): SignPart[] {
  const scale = heightMM / upem
  const wallDeltaFontUnits = -params.wallThicknessMM / scale

  const wallShapes = shapes.flatMap((shape) => {
    const outer = shapeToPolygons(shape)
    const shrunk = offsetPolygons(outer, wallDeltaFontUnits)
    const ring = differencePolygons(outer, shrunk)
    return polygonsToShapes(ring)
  })

  return [
    {
      id: 'back',
      label: 'แผ่นหลัง',
      shapes,
      depthFontUnits: params.backThicknessMM / scale,
      zOffsetMM: 0,
      color: 0x3a3d46,
    },
    {
      id: 'wall',
      label: 'ผนังตัวอักษร',
      shapes: wallShapes,
      depthFontUnits: params.bodyDepthMM / scale,
      zOffsetMM: params.backThicknessMM,
      color: 0xc9cdd6,
    },
    {
      id: 'front',
      label: 'อะคริลิกหน้า',
      shapes,
      depthFontUnits: params.frontThicknessMM / scale,
      zOffsetMM: params.backThicknessMM + params.bodyDepthMM,
      color: 0xf3f4ee,
    },
  ]
}
