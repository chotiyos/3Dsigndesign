import { traceMask } from './artwork'
import { BufferGeometry, Float32BufferAttribute, ShapeGeometry } from 'three'
import { band, bounds, circle, diff, hull, intersect, islands, ngon, offset, rect, regionArea, regionToShapes, ring, roundRect, union, type Region } from './geo2d'
import { extrude, merge } from './solid'
import { applyMaterials, codeAt, isCuttable, Parts } from './styles/kit'
import { applyRear } from './styles/rear'
import type { MaterialId, SignPart } from './styles/types'

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

/**
 * How the picture goes on the face: printed colour layers, printed straight
 * onto the panel with a digital UV printer, or a printed sticker stuck on.
 */
export type LightboxFace = 'layers' | 'uv' | 'sticker'

export interface LightboxOptions {
  shape: LightboxShape
  face: LightboxFace
  /** Overall width in mm (diameter for circle and hexagon). */
  width: number
  radius: number
  margin: number
  depth: number
  wall: number
  back: number
  diffuser: number
  gap: number
  /**
   * 1: lit on the front only, closed by a back plate. 2: lit front and back,
   * two trays glued back to back whose floors make an opaque middle divider,
   * a lit chamber and LED strip on each side.
   */
  sides: 1 | 2
  /** Rear add-ons, as in common.rear(): wire, wireD, mount, screwD, deskBase, baseH, baseOver. */
  rear: Record<string, number>
}

export const DEFAULT_LIGHTBOX: LightboxOptions = {
  shape: 'rect',
  face: 'layers',
  width: 160,
  radius: 8,
  margin: 4,
  depth: 30,
  wall: 2.4,
  back: 2,
  diffuser: 0.8,
  gap: 0.2,
  sides: 1,
  rear: { wire: 1, wireD: 6, mount: 2, screwD: 4, deskBase: 0, baseH: 15, baseOver: 25 },
}

/** Removes slivers thinner than `size` mm, which will not print. */
const opening = (region: Region, size: number) => offset(offset(region, -size / 2), size / 2)

/** Mirrored left to right, with each outline still wound the same way. */
const mirrorX = (region: Region): Region => region.map((poly) => poly.map(([x, y]) => [-x, y] as [number, number]).reverse())

/** Turned over through z = 0, keeping triangles facing outwards. */
function mirrorZ(g: BufferGeometry): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g
  if (out !== g) g.dispose()
  out.scale(1, 1, -1)
  for (const name of ['position', 'normal']) {
    const a = out.getAttribute(name)
    if (!a) continue
    for (let i = 0; i + 2 < a.count; i += 3) {
      const x = a.getX(i + 1), y = a.getY(i + 1), zz = a.getZ(i + 1)
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2))
      a.setXYZ(i + 2, x, y, zz)
    }
    a.needsUpdate = true
  }
  return out
}

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
/** Part letter of the diffuser face: back, frame, then the diffuser. */
export const DIFFUSER_CODE = codeAt(2)

export function buildLightbox(
  q: Pick<Quantized, 'width' | 'height'>, colours: Region[], layers: LayerSetting[], o: LightboxOptions,
  /** How each part is made, by part letter. Unpicked parts keep the printed defaults. */
  picks: Record<string, MaterialId> = {},
  /** A sheet face that also gets an STL keeps its printed shape (with the plug ring); the DXF is its flat outline. */
  faceKeepsPlug = false,
) {
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

  const double = o.sides === 2
  // Double-sided: back chamber 0..depth, the divider, then the front chamber.
  const z = double ? o.depth * 2 + o.back * 2 : o.back + o.depth
  const inner = offset(shape, -o.wall - o.gap)
  const plug = Math.min(3, o.depth - 2)
  const stripH = Math.min(10, o.depth - 2 - plug)
  const parts = new Parts()
  if (double) {
    const frame = ring(shape, o.wall)
    const sb = bounds(shape)
    const wireD = o.rear.wireD ?? 6
    // The wire enters through a notch in the bottom wall beside the divider,
    // and reaches the front chamber through a hole in the divider.
    const wire = o.rear.wire > 0
    const hole = wire ? circle(0, sb.minY + o.wall + wireD / 2 + 3, wireD / 2, 32) : []
    const floor = diff(shape, hole)
    const notchH = wire ? Math.min(wireD, o.depth - plug - 1) : 0
    const notch = rect(0, sb.minY + o.wall / 2, wireD, o.wall * 4)
    // One piece: the side frame with the divider across its middle. It prints
    // standing on its bottom edge, so the divider is a wall, not a bridge.
    const body = merge([
      extrude(frame, o.depth - notchH, 0),
      ...(notchH > 0 ? [extrude(diff(frame, notch), notchH, o.depth - notchH)] : []),
      extrude(floor, o.back * 2, o.depth),
      extrude(frame, o.depth, o.depth + o.back * 2),
    ])
    parts
      .solid('กรอบพร้อมแผ่นกั้นกลาง', 'print', body, 0)
      // Keeps letter B free, so the diffuser stays C as in a one-sided box.
      .solid('', 'print', new BufferGeometry(), 0)
  } else {
    parts
      .back('ฝาหลังสวมใน', 'print', inner, o.back, 0, -1, offset(shape, -o.wall - 1))
      .slab('กรอบข้าง', 'print', ring(shape, o.wall), z, 0)
  }
  // A cut sheet (opal acrylic) is a flat panel laid on the frame's front edge;
  // a printed face carries a plug ring that pushes into the frame.
  const face = picks[DIFFUSER_CODE]
  const addFace = (label: string, at: number, back: boolean) => {
    const explode = back ? -1.5 : 1
    // The back face is the front face turned over, its plug pointing into the back tray.
    const turn = (g: BufferGeometry) => (back ? mirrorZ(g) : g)
    if (face && isCuttable(face, o.diffuser) && faceKeepsPlug) parts.solid(label, face, turn(diffuserSolid(shape, ring(inner, 1.6), o.diffuser, plug, at)), explode, shape)
    else if (face && isCuttable(face, o.diffuser)) parts.slab(label, face, shape, o.diffuser, back ? -o.diffuser : at, explode)
    else parts.solid(label, 'opalprint', turn(diffuserSolid(shape, ring(inner, 1.6), o.diffuser, plug, at)), explode)
  }
  addFace(double ? 'แผ่นกระจายแสงหน้า' : 'แผ่นกระจายแสง', z, false)
  if (double) addFace('แผ่นกระจายแสงหลัง', 0, true)
  // Reference only: a strip stuck around the inside of the frame, facing in.
  const strip = band(shape, o.wall + 0.2, 2)
  if (double) {
    // One strip per chamber, along the divider.
    parts
      .slab('ไฟเส้น LED หน้า', 'led', strip, stripH, o.depth + o.back * 2, -0.4)
      .slab('ไฟเส้น LED หลัง', 'led', strip, stripH, o.depth - stripH, -0.4)
  } else parts.slab('ไฟเส้น LED', 'led', strip, stripH, o.back + 2, -0.4)
  const order: number[] = []
  // Printed artwork (UV or sticker) replaces the colour layers.
  if (o.face === 'layers') {
    placed.forEach((region, j) => {
      if (!region.length) return
      order.push(j)
      parts.slab('สี ' + (j + 1) + ' ' + layers[j].colour + (double ? ' หน้า' : ''), 'accent', region, layers[j].thick, z + o.diffuser, 1.5 + j * 0.15)
    })
    // The back reads the right way round from behind: the picture mirrored left to right.
    // A contour box is not symmetric, so there the back keeps the outline and shows the picture reversed.
    if (double) placed.forEach((region, j) => {
      if (!region.length) return
      order.push(j)
      parts.slab('สี ' + (j + 1) + ' ' + layers[j].colour + ' หลัง', 'accent', o.shape === 'contour' ? region : mirrorX(region), layers[j].thick, -o.diffuser - layers[j].thick, -2 - j * 0.15)
    })
  }
  // Wire and wall fixings belong to a back plate; a double-sided box has none.
  const built = applyRear(parts.done(), double ? { ...o.rear, wire: 0, mount: 0 } : { ...o.rear })
  // Preview colour per part letter, for the viewer.
  const tints: Record<string, string> = {}
  built.filter((part) => part.material === 'accent').forEach((part, i) => {
    const { colour, thick } = layers[order[i]]
    tints[part.code] = colour
    // Thin layers pass more light; at 0.4 mm about full strength.
    part.backlit = Math.min(1, Math.max(0.15, Math.exp(-(thick - 0.4) / 1.2)))
  })
  const b = bounds(shape)
  // Where the whole picture sits on the face, in mm, for print files and the preview.
  const art: FaceArt = {
    rect: { x: (-q.width / 2) * scale, y: (-q.height / 2) * scale, w: q.width * scale, h: q.height * scale },
    window,
    face: shape,
    top: z + o.diffuser,
    back: double ? { at: -o.diffuser, mirror: o.shape !== 'contour' } : undefined,
  }
  return { parts: applyMaterials(built, picks), colours: tints, width: b.w, height: b.h, art }
}

export interface FaceArt {
  /** The full picture's rectangle on the face, mm. */
  rect: { x: number; y: number; w: number; h: number }
  /** The lit window inside the frame: the printed area. */
  window: Region
  /** The whole front panel outline. */
  face: Region
  /** Height of the face's front surface. */
  top: number
  /** Double-sided: the back face's outer surface, and whether its picture is mirrored to read right from behind. */
  back?: { at: number; mirror: boolean }
}

/**
 * A paper-thin preview of the printed picture on the face, with texture
 * coordinates that map `rect` onto the image. Preview only, never exported.
 */
export function faceDecal(art: FaceArt, image: string, side: 'front' | 'back' = 'front'): SignPart {
  // Only where the picture is: the margin round it shows the plain panel.
  const { x, y, w, h } = art.rect
  const shown = intersect(art.window, [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]])
  const geometry = new ShapeGeometry(regionToShapes(shown), 1)
  const pos = geometry.getAttribute('position')
  const uv: number[] = []
  for (let i = 0; i < pos.count; i++) uv.push((pos.getX(i) - art.rect.x) / art.rect.w, (pos.getY(i) - art.rect.y) / art.rect.h)
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  if (side === 'back' && art.back) {
    // Facing backwards: mirrored left to right (which also turns the triangles to face -z),
    // so the picture reads the right way round from behind.
    const nrm = geometry.getAttribute('normal')
    for (let i = 0; i < pos.count; i++) {
      if (art.back.mirror) pos.setX(i, -pos.getX(i))
      nrm.setXYZ(i, 0, 0, -1)
    }
    if (!art.back.mirror) geometry.setIndex(geometry.getIndex() ? Array.from(geometry.getIndex()!.array).map((_, k, a) => a[k - (k % 3) + [0, 2, 1][k % 3]]) : null)
    geometry.translate(0, 0, art.back.at - 0.05)
    return { id: 'face-art-back', code: 'ลาย', label: 'ลายพิมพ์บนแผ่นหลัง', material: 'opal', geometry, explode: -1.5, image }
  }
  geometry.translate(0, 0, art.top + 0.05)
  return { id: 'face-art', code: 'ลาย', label: 'ลายพิมพ์บนหน้าแผ่น', material: 'opal', geometry, explode: 1, image }
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
