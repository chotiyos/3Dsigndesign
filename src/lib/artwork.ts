import { regionFromShapes, translate, union, bounds, type Region } from './geo2d'
import type { LoadedFont } from './hb'
import { parseSvgToShapes } from './svgToShapes'
import { shapeTextToShapes } from './textToShapes'

/**
 * Lays out multi-line text. `heightMM` is the em height, the same convention the
 * reference tools use, so a 200 mm setting gives roughly 200 mm tall capitals.
 */
export function textToRegion(
  font: LoadedFont,
  text: string,
  heightMM: number,
  spacingMM: number,
  lineGap = 1.15,
  align: 'left' | 'center' | 'right' = 'center',
): Region {
  const unit = heightMM / font.upem
  const lines = text.replace(/\r/g, '').split('\n')
  const rows: Region[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      rows.push([])
      continue
    }
    const { shapes } = shapeTextToShapes(font, line, spacingMM / unit)
    rows.push(regionFromShapes(shapes, unit))
  }
  const widths = rows.map((r) => (r.length ? bounds(r).w : 0))
  const widest = Math.max(0, ...widths)
  const placed: Region[] = []
  rows.forEach((row, i) => {
    if (row.length === 0) return
    const b = bounds(row)
    const x =
      align === 'left' ? -b.minX : align === 'right' ? widest - b.maxX : (widest - b.w) / 2 - b.minX
    placed.push(translate(row, x, -i * heightMM * lineGap))
  })
  return union(...placed)
}

/** An SVG scaled so its height matches `heightMM`. */
export function svgToRegion(svgText: string, heightMM: number): Region {
  const { shapes, upem } = parseSvgToShapes(svgText)
  return regionFromShapes(shapes, heightMM / upem)
}

/**
 * Traces dark pixels of an image into an outline region (marching squares with
 * straight segments), scaled so the traced height equals `heightMM`.
 */
export function imageToRegion(
  image: ImageData,
  heightMM: number,
  threshold = 128,
  invert = false,
): Region {
  const { width, height, data } = image
  const ink = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false
    const i = (y * width + x) * 4
    const alpha = data[i + 3] / 255
    if (alpha === 0) return false
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * alpha + 255 * (1 - alpha)
    return invert ? lum >= threshold : lum < threshold
  }
  const smoothed = traceMask(width, height, ink)
  if (smoothed.length === 0) return []
  const b = bounds(smoothed)
  const s = heightMM / b.h
  return smoothed.map((poly) => poly.map(([x, y]) => [x * s, y * s] as [number, number]))
}

/**
 * Outlines the pixels where `on(x, y)` is true, in pixel units: x right,
 * y down as negative values (row 0 spans y 0 to -1). Stair-steps are smoothed.
 */
export function traceMask(width: number, height: number, on: (x: number, y: number) => boolean): Region {
  // Every set pixel becomes a unit square; merging them gives exact outlines.
  // Rows of consecutive pixels are merged first to keep the polygon count low.
  const squares: Region = []
  for (let y = 0; y < height; y++) {
    let start = -1
    for (let x = 0; x <= width; x++) {
      const set = x < width && on(x, y)
      if (set && start < 0) start = x
      if (!set && start >= 0) {
        squares.push([[start, -y], [x, -y], [x, -y - 1], [start, -y - 1]].reverse() as Region[number])
        start = -1
      }
    }
  }
  if (squares.length === 0) return []
  return union(squares).map(smooth)
}

/** Removes the stair-steps of a pixel outline by averaging neighbours, keeping the winding. */
function smooth(poly: Region[number]): Region[number] {
  if (poly.length < 8) return poly
  return poly.map((_, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length]
    const b = poly[i]
    const c = poly[(i + 1) % poly.length]
    return [(a[0] + b[0] * 2 + c[0]) / 4, (a[1] + b[1] * 2 + c[1]) / 4] as [number, number]
  })
}

/** Reads an image file into pixels, shrinking it to keep tracing fast. */
export async function readImage(file: File, maxSide = 360): Promise<ImageData> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * k))
    canvas.height = Math.max(1, Math.round(img.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('เบราว์เซอร์นี้อ่านรูปภาพไม่ได้')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } finally {
    URL.revokeObjectURL(url)
  }
}
