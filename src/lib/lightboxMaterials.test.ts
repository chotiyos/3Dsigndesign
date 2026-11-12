import { describe, expect, it } from 'vitest'
import { buildZip } from './exportModel'
import { buildLightbox, DEFAULT_LIGHTBOX, DIFFUSER_CODE } from './lightbox'
import { lightboxReadme } from './lightboxReadme'
import { rect } from './geo2d'
import { analyse } from './solid'
import { unzipSync, strFromU8 } from 'fflate'

const q = { width: 100, height: 60 }
const colours = [rect(50, -30, 100, 60), rect(30, -30, 20, 20)]
const layers = [{ on: false, colour: '#ffffff', thick: 0.6 }, { on: true, colour: '#ff0000', thick: 0.6 }]

describe('lightbox part materials', () => {
  it('prints everything by default', () => {
    const model = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX)
    expect(model.parts.filter((p) => p.cut)).toHaveLength(0)
  })

  it('an opal acrylic face becomes a flat cut sheet with a DXF', () => {
    const model = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX, { [DIFFUSER_CODE]: 'opal' })
    const face = model.parts.find((p) => p.code === DIFFUSER_CODE)!
    expect(face.material).toBe('opal')
    expect(face.cut).toBeDefined()
    expect(analyse(face.geometry).watertight).toBe(true)
    const zip = unzipSync(buildZip({ baseName: 't', parts: model.parts, readme: lightboxReadme(model.parts) }))
    const names = Object.keys(zip)
    expect(names.some((n) => n.endsWith('.dxf') && n.includes(DIFFUSER_CODE))).toBe(true)
    expect(strFromU8(zip[names.find((n) => n.endsWith('.txt'))!])).toContain('แผ่นตัด')
  })

  it('the back and colour layers can be cut; the deep frame stays printed', () => {
    const plain = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX)
    const colour = plain.parts.find((p) => p.label.startsWith('สี '))!
    const model = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX, { A: 'acrylic', B: 'acrylic', [colour.code]: 'acrylic' })
    expect(model.parts.find((p) => p.code === 'A')!.cut).toBeDefined()
    expect(model.parts.find((p) => p.code === 'B')!.cut).toBeUndefined()
    expect(model.parts.find((p) => p.code === colour.code)!.cut).toBeDefined()
  })
})

describe('zip file choice per part', () => {
  const model = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX, { A: 'acrylic', [DIFFUSER_CODE]: 'opal' })
  const files = (output?: (p: { code: string }) => 'stl' | 'dxf' | 'both') =>
    Object.keys(unzipSync(buildZip({ baseName: 't', parts: model.parts, readme: '', output })))
  const has = (names: string[], code: string, ext: string) => names.some((n) => n.includes(`/${code}-`) && n.endsWith(ext))

  it('cut parts get both files by default, printed parts STL only', () => {
    const names = files()
    expect(has(names, 'A', '.dxf') && has(names, 'A', '.stl')).toBe(true)
    expect(has(names, 'B', '.stl')).toBe(true)
    expect(has(names, 'B', '.dxf')).toBe(false)
  })

  it('DXF only drops the STL; STL only drops the DXF; printed parts ignore the choice', () => {
    const names = files((p) => (p.code === 'A' ? 'dxf' : p.code === DIFFUSER_CODE ? 'stl' : 'dxf'))
    expect(has(names, 'A', '.dxf')).toBe(true)
    expect(has(names, 'A', '.stl')).toBe(false)
    expect(has(names, DIFFUSER_CODE, '.stl')).toBe(true)
    expect(has(names, DIFFUSER_CODE, '.dxf')).toBe(false)
    expect(has(names, 'B', '.stl')).toBe(true)
  })
})

describe('sheet face with both files', () => {
  it('keeps the plug ring in the STL and gives a flat DXF outline; DXF only stays flat', () => {
    const depthOf = (m: ReturnType<typeof buildLightbox>) => {
      const face = m.parts.find((p) => p.code === DIFFUSER_CODE)!
      face.geometry.computeBoundingBox()
      const box = face.geometry.boundingBox!
      return { span: box.max.z - box.min.z, cut: Boolean(face.cut), watertight: analyse(face.geometry).watertight }
    }
    const flat = depthOf(buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX, { [DIFFUSER_CODE]: 'opal' }, false))
    const both = depthOf(buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX, { [DIFFUSER_CODE]: 'opal' }, true))
    expect(flat.span).toBeCloseTo(DEFAULT_LIGHTBOX.diffuser, 3)
    expect(both.span).toBeGreaterThan(DEFAULT_LIGHTBOX.diffuser + 1)
    expect(flat.cut && both.cut).toBe(true)
    expect(both.watertight).toBe(true)
  })
})
