import { strFromU8, unzipSync } from 'fflate'
import { BoxGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { build3mf } from './export3mf'
import { merge } from './solid'
import type { SignPart } from './styles'

const part = (code: string, label: string, material: SignPart['material'], x: number): SignPart => ({
  id: `${code}-0`, code, label, material, explode: 0, geometry: new BoxGeometry(10, 10, 2).translate(x, 0, 1),
})
const all = (xml: string, re: RegExp) => [...xml.matchAll(re)]

describe('3MF export', () => {
  it('writes each printed part as its own coloured body inside one object, in millimetres', () => {
    const parts = [part('A', 'ฐาน', 'print', 0), part('B', 'ตัวอักษร <1>', 'accent', 20), part('C', 'ไฟเส้น', 'led', 40)]
    const files = unzipSync(build3mf(parts, { A: '#ff8800', B: '#123abc' }, 'ชื่อ & ทดสอบ'))
    expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels'])
    const xml = strFromU8(files['3D/3dmodel.model'])
    expect(xml).toContain('unit="millimeter"')
    // Names are escaped, so the XML stays well formed.
    expect(xml).toContain('ชื่อ &amp; ทดสอบ')
    expect(xml).toContain('B ตัวอักษร &lt;1&gt;')
    expect(all(xml, /displaycolor="([^"]+)"/g).map((m) => m[1])).toEqual(['#FF8800FF', '#123ABCFF'])
    // Two bodies (the LED is a bought part, left out) and the group holding them.
    const objects = all(xml, /<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)
    expect(objects).toHaveLength(3)
    expect(all(objects[2][2], /<component objectid=/g)).toHaveLength(2)
    expect(xml).toContain(`<item objectid="${objects[2][1]}"/>`)
    // A box: 8 shared corners and 12 triangles, at its real height.
    const body = objects[0][2]
    expect(all(body, /<vertex /g)).toHaveLength(8)
    expect(all(body, /<triangle /g)).toHaveLength(12)
    const zs = all(body, / z="([-\d.]+)"/g).map((m) => Number(m[1]))
    expect(Math.min(...zs)).toBeCloseTo(0, 4)
    expect(Math.max(...zs)).toBeCloseTo(2, 4)
    parts.forEach((p) => p.geometry.dispose())
  })

  it('refuses a model with nothing to print', () => {
    expect(() => build3mf([part('A', 'ไฟ', 'led', 0)], {}, 'x')).toThrow()
  })

  it('keeps touching solids of one colour as separate closed shells (3MF needs every edge in exactly two triangles)', () => {
    // Two boxes stacked face to face, merged into one colour part.
    const stacked = merge([new BoxGeometry(10, 10, 2).translate(0, 0, 1), new BoxGeometry(10, 10, 2).translate(0, 0, 3)])
    const files = unzipSync(build3mf([{ id: 'A-0', code: 'A', label: 'ฐาน', material: 'print', explode: 0, geometry: stacked }], { A: '#ffffff' }, 'x'))
    const xml = strFromU8(files['3D/3dmodel.model'])
    const bodies = all(xml, /<object id="\d+" type="model" name="A ฐาน" pid="1" pindex="0">([\s\S]*?)<\/object>/g)
    expect(bodies).toHaveLength(2)
    for (const [, mesh] of bodies) {
      const edges = new Map<string, number>()
      for (const [, a, b, c] of all(mesh, /v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
        for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.set(`${u}>${v}`, (edges.get(`${u}>${v}`) ?? 0) + 1)
      }
      // Every directed edge once, and its reverse once: closed and consistently wound.
      for (const [key, n] of edges) {
        const [u, v] = key.split('>')
        expect(n).toBe(1)
        expect(edges.get(`${v}>${u}`)).toBe(1)
      }
    }
    stacked.dispose()
  })
})
