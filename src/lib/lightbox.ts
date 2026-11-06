import { traceMask } from './artwork'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { band, bounds, diff, hull, intersect, islands, ngon, offset, regionArea, ring, roundRect, union, type Region } from './geo2d'
import { extrude, merge } from './solid'
import { Parts } from './styles/kit'
import { applyRear } from './styles/rear'
import type { SignPart } from './styles/types'

/** A photo or drawing reduced to a few flat colours. */
export interface Quantized {
  width: number
  height: number
  /** Index into `palette` per pixel; 255 for transparent pixels. */
  labels: Uint8Array
  palette: [number, number, number][]
  /** Pixels per palette colour. */
  counts: number[]
}

export const TRANSPARENT = 255

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')
export const toHex = ([r, g, b]: [number, number, number]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

/**
 * Reduces an image to `k` colours with k-means, seeded deterministically so
 * the result is the same every time. A 3×3 majority pass then removes
 * single stray pixels, which would otherwise print as specks.
 */
export function quantize(image: ImageData, k: number, iterations = 10): Quantized {
  const { width, height, data } = image
  const n = width * height
  const opaque: number[] = []
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] >= 128) opaque.push(i)
  const px = (i: number): [number, number, number] => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
  const dist = (a: [number, number, number], b: [number, number, number]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

  // Fit on a 16-level-per-channel colour histogram: fast, and each bin is
  // weighted by how much of the picture it covers.
  const bins = new Map<number, number[]>()
  for (const i of opaque) {
    const key = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4)
    const bin = bins.get(key)
    if (bin) {
      bin[0] += data[i * 4]
      bin[1] += data[i * 4 + 1]
      bin[2] += data[i * 4 + 2]
      bin[3]++
    } else bins.set(key, [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], 1])
  }
  const sample = [...bins.values()].map(([r, g, b, m]) => ({ c: [r / m, g / m, b / m] as [number, number, number], m }))
  const palette: [number, number, number][] = []
  if (sample.length) {
    // Seeds: the most common colour first, then whichever colour is both
    // common and far from every seed so far. Anti-aliased edge colours are
    // far but rare, so a large area of a real colour wins over them.
    palette.push(sample.reduce((best, s) => (s.m > best.m ? s : best)).c)
    while (palette.length < k) {
      let best = sample[0]
      let bestScore = 0
      for (const s of sample) {
        const score = s.m * Math.min(...palette.map((p) => dist(s.c, p)))
        if (score > bestScore) {
          bestScore = score
          best = s
        }
      }
      if (bestScore <= 0) break
      palette.push([...best.c])
    }
    for (let it = 0; it < iterations; it++) {
      const sums = palette.map(() => [0, 0, 0, 0])
      for (const { c, m } of sample) {
        const j = nearest(palette, c, dist)
        sums[j][0] += c[0] * m
        sums[j][1] += c[1] * m
        sums[j][2] += c[2] * m
        sums[j][3] += m
      }
      sums.forEach(([r, g, b, m], j) => {
        if (m) palette[j] = [r / m, g / m, b / m]
      })
    }
  }

  let labels = new Uint8Array(n).fill(TRANSPARENT)
  for (const i of opaque) labels[i] = nearest(palette, px(i), dist)
  labels = majority(labels, width, height, palette.length)
  const counts = palette.map(() => 0)
  for (const label of labels) if (label !== TRANSPARENT) counts[label]++
  return { width, height, labels, palette: palette.map(([r, g, b]) => [Math.round(r), Math.round(g), Math.round(b)]), counts }
}

function nearest<T>(palette: T[], c: T, dist: (a: T, b: T) => number) {
  let best = 0
  let bestD = Infinity
  palette.forEach((p, j) => {
    const d = dist(c, p)
    if (d < bestD) {
      bestD = d
      best = j
    }
  })
  return best
}

/** Each pixel takes the most common label around it when that label holds 5 of the 9. */
function majority(labels: Uint8Array, width: number, height: number, k: number) {
  const out = new Uint8Array(labels)
  const tally = new Uint8Array(256)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      tally.fill(0, 0, k)
      tally[TRANSPARENT] = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tally[labels[(y + dy) * width + x + dx]]++
      let best = labels[y * width + x]
      for (let j = 0; j < k; j++) if (tally[j] >= 5) best = j
      if (tally[TRANSPARENT] >= 5) best = TRANSPARENT
      out[y * width + x] = best
    }
  }
  return out
}

/** The colour that covers most of the image's border: usually the background. */
export function borderColour(q: Quantized) {
  const tally = q.palette.map(() => 0)
  let transparent = 0
  const add = (x: number, y: number) => {
    const label = q.labels[y * q.width + x]
    if (label !== TRANSPARENT) tally[label]++
    else transparent++
  }
  for (let x = 0; x < q.width; x++) {
    add(x, 0)
    add(x, q.height - 1)
  }
  for (let y = 0; y < q.height; y++) {
    add(0, y)
    add(q.width - 1, y)
  }
  const most = Math.max(...tally)
  return most > transparent ? tally.indexOf(most) : -1
}

/** One outline per palette colour, in pixel units (see traceMask). */
export function traceColours(q: Quantized): Region[] {
  return q.palette.map((_, j) =>
    traceMask(q.width, q.height, (x, y) => q.labels[y * q.width + x] === j),
  )
}

export type LightboxShape = 'rect' | 'circle' | 'hex' | 'contour'

export interface LayerSetting {
  /** Printed or left open, so the white diffuser shows through. */
  on: boolean
  /** Filament colour, for the preview and the file names. */
  colour: string
  /** Layer height above the diffuser in mm. */
  thick: number
}

export interface LightboxOptions {
  shape: LightboxShape
  /** Overall width in mm (diameter for circle and hexagon). */
  width: number
  radius: number
  margin: number
  depth: number
  wall: number
  back: number
  diffuser: number
  gap: number
  /** Rear add-ons, as in common.rear(): wire, wireD, mount, screwD, deskBase, baseH, baseOver. */
  rear: Record<string, number>
}

export const DEFAULT_LIGHTBOX: LightboxOptions = {
  shape: 'rect',
  width: 160,
  radius: 8,
  margin: 4,
  depth: 30,
  wall: 2.4,
  back: 2,
  diffuser: 0.8,
  gap: 0.2,
  rear: { wire: 1, wireD: 6, mount: 2, screwD: 4, deskBase: 0, baseH: 15, baseOver: 25 },
}

/** Removes slivers thinner than `size` mm, which will not print. */
const opening = (region: Region, size: number) => offset(offset(region, -size / 2), size / 2)

/** Join the face and its plug without the two buried, touching cap surfaces. */
function diffuserSolid(shape: Region, plugRing: Region, thick: number, plug: number, z: number) {
  const surface = (region: Region, depth: number, bottom: number, keep: (nz: number) => boolean) => {
    const solid = extrude(region, depth, bottom)
    const p = solid.getAttribute('position')
    const n = solid.getAttribute('normal')
    const positions: number[] = []
    const normals: number[] = []
    for (let i = 0; p && i < p.count; i += 3) {
      if (!keep(n.getZ(i))) continue
      for (let j = i; j < i + 3; j++) {
        positions.push(p.getX(j), p.getY(j), p.getZ(j))
        normals.push(n.getX(j), n.getY(j), n.getZ(j))
      }
    }
    solid.dispose()
    return new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(positions, 3))
      .setAttribute('normal', new Float32BufferAttribute(normals, 3))
  }
  const surfaces = [
    surface(shape, thick, z, nz => nz >= 0),
    surface(plugRing, plug, z - plug, nz => nz <= 0),
    surface(diff(shape, plugRing), thick, z, nz => nz < 0),
  ]
  const result = merge(surfaces)
  surfaces.forEach(g => g.dispose())
  return result
}

/**
 * Builds a lightbox from traced colours: a printed frame, a press-fit back
 * with wire and wall fixings, a white diffuser face that plugs into the frame,
 * and one part per printed colour on top of the diffuser.
 */
export function buildLightbox(q: Pick<Quantized, 'width' | 'height'>, colours: Region[], layers: LayerSetting[], o: LightboxOptions) {
  // Keep a positive image span when the requested margin fills a small box.
  const rim = Math.min(o.wall + o.margin, (o.width - 1) / 2)
  const printed = colours.map((region, j) => (layers[j]?.on ? region : []))
  const content = union(...printed)
  let scale: number
  let shape: Region
  if (o.shape === 'circle' || o.shape === 'hex') {
    // The picture fills the window: its short side spans the inner diameter.
    const inner = o.width / 2 - rim
    scale = (inner * 2) / Math.max(1, Math.min(q.width, q.height))
    shape = o.shape === 'circle' ? ngon(0, 0, o.width / 2, 96) : ngon(0, 0, o.width / 2, 6)
  } else if (o.shape === 'contour') {
    const b = content.length ? bounds(content) : { w: q.width, h: q.height }
    scale = Math.max(1, o.width - rim * 2) / Math.max(1, b.w)
    shape = []
  } else {
    scale = Math.max(1, o.width - rim * 2) / q.width
    shape = roundRect(0, 0, o.width, q.height * scale + rim * 2, Math.min(o.radius, o.width / 2 - 0.5))
  }
  // Pixel units to mm, centred on the image.
  const place = (region: Region): Region =>
    region.map((poly) => poly.map(([x, y]) => [(x - q.width / 2) * scale, (y + q.height / 2) * scale] as [number, number]))
  let placed = printed.map((region) => (region.length ? opening(place(region), 0.6) : []))
  if (o.shape === 'contour') {
    const all = union(...placed)
    if (all.length === 0) return { parts: [] as SignPart[], colours: {} as Record<string, string>, width: 0, height: 0 }
    // Close gaps so the frame follows the picture's silhouette, not every
    // notch, and widen the closing until separate pieces (a moon above hills)
    // join into one box. Pictures that still fall apart get their outer hull.
    let solid: Region[] = []
    for (const close of [6, 12, 20, 30, 45]) {
      solid = islands(offset(offset(all, rim + close), -close))
      if (solid.length === 1) break
    }
    // Holes inside the silhouette stay part of the window.
    shape = solid.length === 1 ? [solid[0][0]] : offset(hull(all), rim)
  }
  const window = offset(shape, -o.wall)
  placed = placed.map((region) => (region.length ? intersect(region, window) : []))

  const z = o.back + o.depth
  const inner = offset(shape, -o.wall - o.gap)
  const plug = Math.min(3, o.depth - 2)
  const diffuser = diffuserSolid(shape, ring(inner, 1.6), o.diffuser, plug, z)
  const parts = new Parts()
    .back('ฝาหลังสวมใน', 'print', inner, o.back, 0, -1, offset(shape, -o.wall - 1))
    .slab('กรอบข้าง', 'print', ring(shape, o.wall), z, 0)
    .solid('แผ่นกระจายแสง', 'opalprint', diffuser, 1)
    // Reference only: a strip stuck around the inside of the frame, facing in.
    .slab('ไฟเส้น LED', 'led', band(shape, o.wall + 0.2, 2), Math.min(10, o.depth - 2 - plug), o.back + 2, -0.4)
  const order: number[] = []
  placed.forEach((region, j) => {
    if (region.length) order.push(j)
    if (region.length) parts.slab(`สี ${j + 1} ${layers[j].colour}`, 'accent', region, layers[j].thick, z + o.diffuser, 1.5 + j * 0.15)
  })
  const built = applyRear(parts.done(), { ...o.rear })
  // Preview colour per part letter, for the viewer.
  const tints: Record<string, string> = {}
  built.filter((part) => part.material === 'accent').forEach((part, i) => {
    const { colour, thick } = layers[order[i]]
    tints[part.code] = colour
    // Thin layers pass more light; at 0.4 mm about full strength.
    part.backlit = Math.min(1, Math.max(0.15, Math.exp(-(thick - 0.4) / 1.2)))
  })
  const b = bounds(shape)
  return { parts: built, colours: tints, width: b.w, height: b.h }
}

/** Approximate LED strip length: once around the inside of the frame, in mm. */
export function stripLength(parts: SignPart[]) {
  const strip = parts.find((part) => part.material === 'led')
  if (!strip?.profile) return 0
  const outer = strip.profile.region.filter((poly) => regionArea([poly]) > 0)
  let length = 0
  for (const poly of outer) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      length += Math.hypot(x2 - x1, y2 - y1)
    }
  }
  return length
}
