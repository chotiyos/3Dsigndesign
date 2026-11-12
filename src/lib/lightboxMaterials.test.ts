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
