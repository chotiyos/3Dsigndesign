import { unzipSync } from 'fflate'
import { analyse } from './solid'
import { describe, expect, it } from 'vitest'
import { buildZip } from './exportModel'
import { bounds, diff, offset, rect, regionArea } from './geo2d'
import { borderColour, buildLightbox, DEFAULT_LIGHTBOX, quantize, stripLength, toHex, traceColours, type LightboxShape } from './lightbox'

/** 60×40 navy picture with a large green field and a small yellow square, plus a few anti-aliased edge pixels. */
function picture() {
  const width = 60
  const height = 40
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let c = [29, 47, 111]
      if (y >= 25) c = [47, 143, 91]
      if (x >= 40 && x < 50 && y >= 5 && y < 15) c = [246, 201, 69]
      if (y === 24 && x % 7 === 0) c = [140, 140, 160]
      data.set([...c, 255], i)
    }
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

describe('quantize', () => {
  it('keeps foreground colours when transparency dominates the image border', () => {
    const q = quantize(picture(), 3)
    for (let x = 0; x < q.width; x++) {
      q.labels[x] = 255
      q.labels[(q.height - 1) * q.width + x] = 255
    }
    expect(borderColour(q)).toBe(-1)
  })
  it('finds the real colours rather than rare edge shades, the same way every time', () => {
    const q = quantize(picture(), 3)
    // Each real colour has a palette entry within a few levels (edge shades pull a little).
    for (const real of [[29, 47, 111], [47, 143, 91], [246, 201, 69]]) {
      expect(Math.min(...q.palette.map((c) => Math.hypot(c[0] - real[0], c[1] - real[1], c[2] - real[2])))).toBeLessThan(6)
    }
    expect(quantize(picture(), 3).palette).toEqual(q.palette)
    expect(q.counts.reduce((a, b) => a + b, 0)).toBe(60 * 40)
  })

  it('treats the colour around the border as the background', () => {
    const q = quantize(picture(), 3)
    expect(toHex(q.palette[borderColour(q)])).toBe('#1d2f6f')
  })

  it('leaves transparent pixels out of every colour', () => {
    const image = picture()
    for (let i = 0; i < 60 * 10; i++) image.data[i * 4 + 3] = 0
    const q = quantize(image, 3)
    expect(q.labels[0]).toBe(255)
    expect(q.counts.reduce((a, b) => a + b, 0)).toBe(60 * 30)
  })
})

describe('buildLightbox', () => {
  it('joins the diffuser plug to the face as a manifold surface without internal caps', () => {
    const { parts } = buildLightbox({ width: 60, height: 40 }, [], [], DEFAULT_LIGHTBOX)
    try {
      const face = parts.find(p => p.material === 'opalprint')!.geometry
      expect(analyse(face).watertight).toBe(true)
      const p = face.getAttribute('position')
      const n = face.getAttribute('normal')
      const seam = DEFAULT_LIGHTBOX.back + DEFAULT_LIGHTBOX.depth
      // At the join there is only the exposed underside, never an upward cap.
      for (let i = 0; i < p.count; i += 3) {
        if (Math.abs(p.getZ(i) - seam) < 0.001) expect(n.getZ(i)).toBeLessThanOrEqual(0)
      }
    } finally { parts.forEach(p => p.geometry.dispose()) }
  })
  for (const shape of ['circle', 'hex'] as const) {
    it(`keeps artwork upright in a small ${shape} box with maximum margin`, () => {
      const { parts } = buildLightbox(
        { width: 10, height: 10 }, [rect(7, -5, 10, 10)],
        [{ on: true, colour: '#123456', thick: 0.6 }],
        { ...DEFAULT_LIGHTBOX, shape, width: 60, margin: 30 },
      )
      try {
        const art = parts.find(p => p.material === 'accent')
        expect(art).toBeDefined()
        expect(bounds(art!.profile!.region).cx).toBeGreaterThan(0)
      } finally { parts.forEach(p => p.geometry.dispose()) }
    })
  }
  const q = quantize(picture(), 3)
  const colours = traceColours(q)
  const background = borderColour(q)
  const layers = q.palette.map((c, j) => ({ on: j !== background, colour: toHex(c), thick: 0.6 }))
  const area = (r: Parameters<typeof regionArea>[0]) => Math.abs(regionArea(r))

  for (const shape of ['rect', 'circle', 'hex', 'contour'] as LightboxShape[]) {
    it(`builds a ${shape} box with a colour part per printed colour inside the window`, () => {
      const { parts, colours: tints, width } = buildLightbox(q, colours, layers, { ...DEFAULT_LIGHTBOX, shape })
      try {
        const labels = parts.map((p) => p.label)
        expect(labels).toEqual(expect.arrayContaining(['ฝาหลังสวมใน', 'กรอบข้าง', 'แผ่นกระจายแสง', 'ไฟเส้น LED']))
        const printed = parts.filter((p) => p.material === 'accent')
        expect(analyse(parts.find(p => p.material === 'opalprint')!.geometry).watertight).toBe(true)
        expect(printed).toHaveLength(2)
        expect(Object.values(tints).sort()).toEqual(layers.filter((l) => l.on).map((l) => l.colour).sort())
        expect(width).toBeCloseTo(shape === 'contour' ? width : 160, 0)
        // Colours stay inside the frame's window: nothing on top of the wall.
        const wall = parts.find((p) => p.label === 'กรอบข้าง')!.profile!.region
        const window = offset(wall.filter((poly) => regionArea([poly]) < 0).map((poly) => [...poly].reverse()), 0.05)
        for (const part of printed) expect(area(diff(part.profile!.region, window))).toBeLessThan(0.5)
        // Rear defaults: a wire hole and keyholes in the back.
        const back = parts.find((p) => p.rear)!
        expect(back.profile!.region.some((poly) => regionArea([poly]) < 0)).toBe(true)
      } finally {
        parts.forEach((p) => p.geometry.dispose())
      }
    })
  }

  it('joins separate pieces of a picture into one contour box, with backlit colour layers', () => {
    const { parts } = buildLightbox(q, colours, layers, { ...DEFAULT_LIGHTBOX, shape: 'contour' })
    const wall = parts.find((p) => p.label === 'กรอบข้าง')!.profile!.region
    expect(wall.filter((poly) => regionArea([poly]) > 0)).toHaveLength(1)
    const printed = parts.filter((p) => p.material === 'accent')
    expect(printed.every((p) => p.backlit! > 0 && p.backlit! <= 1)).toBe(true)
    parts.forEach((p) => p.geometry.dispose())
  })

  it('exports one STL per part and per colour in the ZIP', () => {
    const { parts } = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX)
    const names = Object.keys(unzipSync(buildZip({ baseName: 'box', parts, readme: 'x' })))
    expect(names.filter((n) => n.startsWith('พลาสติกสีหลัก/') && n.endsWith('.stl'))).toHaveLength(2)
    expect(names).toEqual(expect.arrayContaining(['box-ทั้งหมด.stl', 'รายการชิ้นส่วน.txt']))
    expect(names.some((n) => n.includes('แผ่นกระจายแสง'))).toBe(true)
    parts.forEach((p) => p.geometry.dispose())
  })

  it('sizes a rectangle from the width and the picture aspect', () => {
    const { parts, height } = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX)
    const rim = (DEFAULT_LIGHTBOX.wall + DEFAULT_LIGHTBOX.margin) * 2
    expect(height).toBeCloseTo((160 - rim) * (40 / 60) + rim, 0)
    expect(stripLength(parts)).toBeGreaterThan(400)
    parts.forEach((p) => p.geometry.dispose())
  })

  it('makes nothing for a contour box with every colour switched off', () => {
    const off = layers.map((l) => ({ ...l, on: false }))
    expect(buildLightbox(q, colours, off, { ...DEFAULT_LIGHTBOX, shape: 'contour' }).parts).toEqual([])
    const { parts } = buildLightbox(q, colours, off, DEFAULT_LIGHTBOX)
    expect(parts.some((p) => p.material === 'accent')).toBe(false)
    expect(bounds(parts.find((p) => p.label === 'กรอบข้าง')!.profile!.region).w).toBeCloseTo(160, 0)
    parts.forEach((p) => p.geometry.dispose())
  })
})

it('keeps the LED strip clear of the diffuser plug at minimum depth', () => {
  const { parts } = buildLightbox({ width: 60, height: 40 }, [], [], { ...DEFAULT_LIGHTBOX, depth: 12 })
  try {
    const led = parts.find(p => p.material === 'led')!.geometry
    const face = parts.find(p => p.material === 'opalprint')!.geometry
    led.computeBoundingBox()
    face.computeBoundingBox()
    expect(led.boundingBox!.max.z).toBeLessThanOrEqual(face.boundingBox!.min.z)
  } finally { parts.forEach(p => p.geometry.dispose()) }
})
