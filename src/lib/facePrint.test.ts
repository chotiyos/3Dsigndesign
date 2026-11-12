import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { faceReadme, withDpi } from './facePrint'
import { rect } from './geo2d'
import { buildLightbox, DEFAULT_LIGHTBOX, faceDecal } from './lightbox'

const q = { width: 100, height: 60 }
const colours = [rect(50, -30, 100, 60), rect(30, -30, 20, 20)]
const layers = [{ on: false, colour: '#ffffff', thick: 0.6 }, { on: true, colour: '#ff0000', thick: 0.6 }]

describe('printed face (UV / sticker)', () => {
  it('drops the colour layers but keeps the box, and places the picture over the window', () => {
    const layered = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX)
    const uv = buildLightbox(q, colours, layers, { ...DEFAULT_LIGHTBOX, face: 'uv' })
    expect(layered.parts.some((p) => p.label.startsWith('สี '))).toBe(true)
    expect(uv.parts.some((p) => p.label.startsWith('สี '))).toBe(false)
    expect(uv.parts.length).toBe(layered.parts.length - 1)
    const art = uv.art!
    // 160 mm box, 4 mm margin + 2.4 mm wall each side: the picture spans the window's width.
    expect(art.rect.w).toBeCloseTo(160 - 2 * (2.4 + 4), 3)
    expect(art.rect.h / art.rect.w).toBeCloseTo(60 / 100, 3)
  })

  it('the preview decal maps the picture corners to texture corners', () => {
    const { art } = buildLightbox(q, colours, layers, { ...DEFAULT_LIGHTBOX, face: 'sticker' })
    const decal = faceDecal(art!, 'x.png')
    const uv = decal.geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-0.001)
      expect(uv.getX(i)).toBeLessThanOrEqual(1.001)
    }
    decal.geometry.computeBoundingBox()
    expect(decal.geometry.boundingBox!.min.z).toBeGreaterThan(art!.top)
  })

  it('writes a valid pHYs chunk for 300 dpi', () => {
    // The smallest PNG header: signature + IHDR (13 data bytes) + IEND.
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
    const out = withDpi(png, 300)
    const view = new DataView(out.buffer)
    expect(String.fromCharCode(...out.subarray(37, 41))).toBe('pHYs')
    expect(view.getUint32(41)).toBe(11811) // 300 dpi in pixels per metre
    expect(out[49]).toBe(1)
    // CRC over type + data, checked against zlib.
    expect(view.getUint32(50)).toBe(crc32(out.subarray(37, 50)))
  })

  it('readme warns about a low-resolution picture and explains each method', () => {
    const { art } = buildLightbox(q, colours, layers, { ...DEFAULT_LIGHTBOX, face: 'uv' })
    expect(faceReadme('uv', art!, 400).join('\n')).toMatch(/dpi ที่ขนาดนี้/)
    expect(faceReadme('uv', art!, 4000).join('\n')).not.toMatch(/dpi ที่ขนาดนี้/)
    expect(faceReadme('uv', art!, 4000).join('\n')).toContain('กลับด้าน')
    expect(faceReadme('sticker', art!, 4000).join('\n')).toContain('ไดคัท')
  })
})
