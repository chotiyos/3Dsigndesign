import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { strFromU8, unzipSync } from 'fflate'
import { rect } from './geo2d'
import { buildZip, partFolder, partStats, partsToStl, safeName } from './exportModel'
import { buildDxf } from './exportDxf'
import { buildStyle, defaultValues, findStyle, withMaterial, type SignPart } from './styles'

function checkStl(bytes: Uint8Array, parts: SignPart[]) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const triangles = parts.reduce((n, p) => n + (p.geometry.index?.count ?? p.geometry.getAttribute('position').count) / 3, 0)
  expect(view.getUint32(80, true)).toBe(triangles)
  expect(bytes.length).toBe(84 + 50 * triangles)
  const actual = new Box3()
  for (let t = 0; t < triangles; t++) {
    for (let v = 0; v < 3; v++) {
      const offset = 84 + t * 50 + 12 + v * 12
      const xyz = [0, 4, 8].map((i) => view.getFloat32(offset + i, true))
      expect(xyz.every(Number.isFinite)).toBe(true)
      actual.expandByPoint(new Vector3(...xyz))
    }
  }
  const expected = new Box3()
  for (const part of parts) {
    part.geometry.computeBoundingBox()
    expected.union(part.geometry.boundingBox!)
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(actual.min[axis]).toBeCloseTo(expected.min[axis], 3)
    expect(actual.max[axis]).toBeCloseTo(expected.max[axis], 3)
  }
}

function checkDxf(dxf: string) {
  const lines = dxf.trim().split('\n')
  const entities = lines.filter((_, i) => i % 2 === 1)
  expect(entities.filter((s) => s === 'POLYLINE').length).toBeGreaterThan(0)
  expect(entities.filter((s) => s === 'POLYLINE').length).toBe(entities.filter((s) => s === 'SEQEND').length)
  let open = false
  for (const entity of entities) {
    if (entity === 'POLYLINE') { expect(open).toBe(false); open = true }
    if (entity === 'SEQEND') { expect(open).toBe(true); open = false }
  }
  expect(open).toBe(false)
  expect(lines.slice(-2)).toEqual(['0', 'EOF'])
}

for (const id of ['front-lit-lip', 'bolt-nut', 'desk-curl']) {
  describe(id + ' exports', () => {
    it('preserves millimetre coordinates, triangle counts and ZIP contents', () => {
      const style = findStyle(id)
      expect(style.id).toBe(id)
      const parts = buildStyle(style, rect(0, 0, 120, 80), defaultValues(style))
      try {
        checkStl(partsToStl(parts), parts)
        const files = unzipSync(buildZip({ baseName: 'sample', parts, readme: 'parts list' }))
        const expected = ['sample-ทั้งหมด.stl', 'รายการชิ้นส่วน.txt']
        for (const part of parts) {
          const stem = `${partFolder(part)}/${part.code}-${safeName(part.label)}`
          expected.push(`${stem}.stl`)
          checkStl(files[`${stem}.stl`], [part])
          if (part.cut) {
            expected.push(`${stem}.dxf`)
            checkDxf(strFromU8(files[`${stem}.dxf`]))
          }
        }
        expect(Object.keys(files).sort()).toEqual(expected.sort())
        checkStl(files['sample-ทั้งหมด.stl'], parts)
        expect(strFromU8(files['รายการชิ้นส่วน.txt'])).toBe('parts list')
      } finally {
        parts.forEach((p) => p.geometry.dispose())
      }
    })
  })
}

describe('changing a part material', () => {
  const parts = buildStyle(findStyle('front-lit-lip'), rect(0, 0, 120, 80), defaultValues(findStyle('front-lit-lip')))
  const face = parts.find((p) => p.material === 'opal' && p.cut)!
  const wall = buildStyle(findStyle('bolt-nut'), rect(0, 0, 120, 80), defaultValues(findStyle('bolt-nut'))).find((p) => !p.profile)!

  it('moves a flat sheet part between DXF and STL with its material', () => {
    const printed = withMaterial(face, 'print')
    expect(printed.material).toBe('print')
    // A 3 mm face printed in plastic is still thin enough to cut, so it keeps its outline...
    expect(Boolean(printed.cut)).toBe(face.profile!.depth <= 6)
    const plaswood = withMaterial(face, 'plaswood')
    expect(plaswood.cut).toBe(face.profile!.region)
    const files = unzipSync(buildZip({ baseName: 's', parts: [plaswood], readme: '' }))
    expect(Object.keys(files)).toContain(`พลาสวูด/${face.code}-${safeName(face.label)}.dxf`)
    expect(strFromU8(files[`พลาสวูด/${face.code}-${safeName(face.label)}.dxf`])).toContain(`${face.code}_plaswood`)
  })

  it('keeps shaped parts printable only, and re-weighs them', () => {
    const metal = withMaterial(wall, 'metal')
    expect(metal.cut).toBeUndefined()
    const [before, after] = partStats([wall, metal])
    expect(after.grams / before.grams).toBeCloseTo(2.7 / 1.27, 2)
    expect(metal.geometry).toBe(wall.geometry)
  })

  it('never turns a light into another material or back', () => {
    const led = parts.find((p) => p.material === 'led')
    if (led) expect(withMaterial(led, 'print')).toBe(led)
    expect(withMaterial(face, 'led')).toBe(face)
  })
})

it('balances DXF polylines across layers and holes', () => {
  checkDxf(buildDxf([{ layer: 'A', region: [...rect(0, 0, 40, 40), ...rect(0, 0, 10, 10)] }, { layer: 'B', region: rect(50, 0, 10, 10) }]))
})
