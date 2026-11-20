import { unzipSync } from 'fflate'
import { analyse } from './solid'
import { describe, expect, it } from 'vitest'
import { buildZip } from './exportModel'
import { bounds, diff, offset, rect, regionArea } from './geo2d'
import { lightboxReadme } from './lightboxReadme'
import { borderColour, buildLightbox, DEFAULT_LIGHTBOX, faceDecal, quantize, stripLength, toHex, traceColours, type LightboxShape } from './lightbox'

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

describe('double-sided lightbox', () => {
  const q = quantize(picture(), 3)
  const colours = traceColours(q)
  const background = borderColour(q)
  const layers = q.palette.map((c, j) => ({ on: j !== background, colour: toHex(c), thick: 0.6 }))
  const o = { ...DEFAULT_LIGHTBOX, sides: 2 as const }
  const box = (p: { geometry: import('three').BufferGeometry }) => {
    p.geometry.computeBoundingBox()
    return p.geometry.boundingBox!
  }

  it('lights both faces, with one frame whose middle divider splits the two chambers', () => {
    const { parts } = buildLightbox(q, colours, layers, o)
    try {
      const labels = parts.map((p) => p.label)
      expect(labels).not.toContain('ฝาหลังสวมใน')
      expect(labels).toEqual(expect.arrayContaining(['กรอบพร้อมแผ่นกั้นกลาง', 'แผ่นกระจายแสงหน้า', 'แผ่นกระจายแสงหลัง', 'ไฟเส้น LED หน้า', 'ไฟเส้น LED หลัง']))
      // The faces are single closed solids; the frame is its walls and divider stacked as touching solids.
      for (const label of ['แผ่นกระจายแสงหน้า', 'แผ่นกระจายแสงหลัง']) expect(analyse(parts.find((p) => p.label === label)!.geometry).watertight, label).toBe(true)
      const frame = parts.find((p) => p.label === 'กรอบพร้อมแผ่นกั้นกลาง')!
      expect(frame.code).toBe('A')
      expect(analyse(frame.geometry).volume).toBeGreaterThan(0)
      // Exploding the view keeps the frame and divider together, in one piece.
      expect(frame.explode).toBe(0)
      // Both diffusers are the same solid turned over: equal and positive volume.
      const front = parts.find((p) => p.label === 'แผ่นกระจายแสงหน้า')!
      const back = parts.find((p) => p.label === 'แผ่นกระจายแสงหลัง')!
      const vf = analyse(front.geometry).volume
      expect(front.code).toBe('C')
      expect(vf).toBeGreaterThan(0)
      expect(analyse(back.geometry).volume).toBeCloseTo(vf, 0)
      // The back face sits at the bottom with its plug inside the frame; the front on top.
      const fb = box(frame)
      expect(box(back).min.z).toBeCloseTo(-o.diffuser, 3)
      expect(fb.min.z).toBeCloseTo(0, 3)
      expect(fb.max.z).toBeCloseTo(o.depth * 2 + o.back * 2, 3)
      expect(box(front).min.z).toBeLessThan(fb.max.z)
      // Each side has its own colour layers; the back ones are mirrored and behind the back face.
      const printed = parts.filter((p) => p.material === 'accent')
      const fronts = printed.filter((p) => p.label.endsWith('หน้า'))
      const backs = printed.filter((p) => p.label.endsWith('หลัง'))
      expect(fronts).toHaveLength(2)
      expect(backs).toHaveLength(2)
      fronts.forEach((f, i) => {
        const a = box(f), b = box(backs[i])
        expect(b.max.z).toBeLessThanOrEqual(-o.diffuser + 1e-6)
        expect(b.min.x).toBeCloseTo(-a.max.x, 3)
        expect(b.max.x).toBeCloseTo(-a.min.x, 3)
      })
    } finally {
      parts.forEach((p) => p.geometry.dispose())
    }
  })

  it('makes the back face from the same sheet as the front, and keeps the LED strips in their chambers', () => {
    const { parts } = buildLightbox(q, colours, layers, o, { C: 'opal' }, false)
    try {
      const back = parts.find((p) => p.label === 'แผ่นกระจายแสงหลัง')!
      expect(back.material).toBe('opal')
      expect(back.cut).toBeTruthy()
      const [ledF, ledB] = ['ไฟเส้น LED หน้า', 'ไฟเส้น LED หลัง'].map((l) => box(parts.find((p) => p.label === l)!))
      expect(ledB.max.z).toBeLessThanOrEqual(o.depth + 1e-6)
      expect(ledF.min.z).toBeGreaterThanOrEqual(o.depth + o.back * 2 - 1e-6)
    } finally {
      parts.forEach((p) => p.geometry.dispose())
    }
  })

  it('shows a printed (UV or sticker) picture on the back too, facing backwards', () => {
    const { parts, art } = buildLightbox(q, colours, layers, { ...o, face: 'uv' })
    try {
      expect(parts.filter((p) => p.material === 'accent')).toHaveLength(0)
      expect(art!.back).toEqual({ at: -o.diffuser, mirror: true })
      const front = faceDecal(art!, 'x.png')
      const back = faceDecal(art!, 'x.png', 'back')
      const [fb, bb] = [box(front), box(back)]
      expect(bb.max.z).toBeLessThan(-o.diffuser)
      expect(bb.min.x).toBeCloseTo(-fb.max.x, 3)
      expect(back.geometry.getAttribute('normal').getZ(0)).toBe(-1)
      // Same texture place for the mirrored point, so the picture reads right from behind.
      const pf = front.geometry.getAttribute('position'), uf = front.geometry.getAttribute('uv')
      const pb = back.geometry.getAttribute('position'), ub = back.geometry.getAttribute('uv')
      expect(pb.getX(0)).toBeCloseTo(-pf.getX(0), 6)
      expect(ub.getX(0)).toBeCloseTo(uf.getX(0), 6)
      front.geometry.dispose(); back.geometry.dispose()
    } finally {
      parts.forEach((p) => p.geometry.dispose())
    }
  })
})

describe('lightbox fixes from the audit', () => {
  const q = quantize(picture(), 3)
  const colours = traceColours(q)
  const background = borderColour(q)
  const layers = q.palette.map((c, j) => ({ on: j !== background, colour: toHex(c), thick: 0.6 }))
  const dispose = (parts: { geometry: { dispose(): void } }[]) => parts.forEach((p) => p.geometry.dispose())

  it('keeps every colour on its own letter when another colour is switched off', () => {
    const on = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX)
    const lit = layers.map((l, j) => ({ j, l })).filter(({ l }) => l.on)
    const off = layers.map((l, j) => (j === lit[0].j ? { ...l, on: false } : l))
    const less = buildLightbox(q, colours, off, DEFAULT_LIGHTBOX)
    try {
      const codeOf = (parts: typeof on.parts, j: number) => parts.find((p) => p.label.startsWith(`สี ${j + 1} `))?.code
      const kept = lit[1].j
      expect(codeOf(less.parts, kept)).toBe(codeOf(on.parts, kept))
      expect(less.colours[codeOf(less.parts, kept)!]).toBe(layers[kept].colour)
    } finally { dispose(on.parts); dispose(less.parts) }
  })

  it('lists a sheet face kept with its plug at the sheet thickness', () => {
    const { parts } = buildLightbox(q, colours, layers, DEFAULT_LIGHTBOX, { C: 'opal' }, true)
    try {
      const face = parts.find((p) => p.code === 'C')!
      expect(face.cut).toBeTruthy()
      expect(face.profile!.depth).toBeCloseTo(DEFAULT_LIGHTBOX.diffuser, 6)
      expect(lightboxReadme(parts, DEFAULT_LIGHTBOX)).toContain(`หนา ${DEFAULT_LIGHTBOX.diffuser.toFixed(1)} มม.`)
    } finally { dispose(parts) }
  })

  it('finds a wire path for a double-sided contour box, and moves it to the side over a desk base', () => {
    const arch = { width: 200, height: 80 }
    const shape = [rect(15, -40, 30, 80), rect(185, -40, 30, 80), rect(100, -15, 200, 30)].flat()
    const lit = [{ on: true, colour: '#ff0000', thick: 0.6 }]
    const contour = buildLightbox(arch, [shape], lit, { ...DEFAULT_LIGHTBOX, shape: 'contour', sides: 2 })
    const side = buildLightbox(q, colours, layers, { ...DEFAULT_LIGHTBOX, sides: 2, rear: { ...DEFAULT_LIGHTBOX.rear, deskBase: 1 } })
    try {
      for (const model of [contour, side]) {
        const frame = model.parts.find((p) => p.label === 'กรอบพร้อมแผ่นกั้นกลาง')!
        expect(frame.warning ?? '').not.toContain('สายไฟ')
        // The divider has a hole: its cross-section at the divider is smaller than the full outline.
        frame.geometry.computeBoundingBox()
      }
      expect(lightboxReadme(contour.parts, { ...DEFAULT_LIGHTBOX, shape: 'contour', sides: 2 })).toContain('กลับด้าน')
    } finally { dispose(contour.parts); dispose(side.parts) }
  })

  it('writes a double-sided UV readme without colour-layer or wire steps that do not apply', () => {
    const o = { ...DEFAULT_LIGHTBOX, sides: 2 as const, face: 'uv' as const, rear: { ...DEFAULT_LIGHTBOX.rear, wire: 0 } }
    const { parts } = buildLightbox(q, colours, layers, o)
    try {
      const text = lightboxReadme(parts, o)
      expect(text).not.toContain('ไฟล์สีทุกสี')
      expect(text).not.toContain('รูแผ่นกั้น')
      expect(text).not.toContain('ชั้นสีด้านหลัง')
      expect(text).toContain('ลายพิมพ์ทำ 2 ชุด')
      expect(text).toContain('ตั้งบนขอบล่าง')
      expect(text).not.toContain('ตั้งด้านหลังติดฐานพิมพ์')
    } finally { dispose(parts) }
  })

  it('warns when the margin leaves no room for the picture', () => {
    const { parts } = buildLightbox(q, colours, layers, { ...DEFAULT_LIGHTBOX, width: 60, margin: 30, wall: 6 })
    try {
      expect(parts.some((p) => (p.warning ?? '').includes('ขอบรอบรูปกว้าง'))).toBe(true)
    } finally { dispose(parts) }
  })
})
