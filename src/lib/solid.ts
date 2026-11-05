import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bounds, intersect, offset, rect, regionToShapes, type Region } from './geo2d'

/** Extrudes a region upward from `z` by `depth`. Non-indexed, position and normal only. */
export function extrude(region: Region, depth: number, z = 0): THREE.BufferGeometry {
  const shapes = regionToShapes(region)
  if (shapes.length === 0 || !Number.isFinite(depth) || !Number.isFinite(z) || depth <= 0) return new THREE.BufferGeometry()
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 1 })
  geometry.deleteAttribute('uv')
  geometry.translate(0, 0, z)
  return geometry
}

/** Merges solids into one geometry, skipping any that came out empty. */
export function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const usable = geometries
    .filter((g) => g.getAttribute('position')?.count > 0)
    .map((g) => {
      const flat = g.index ? g.toNonIndexed() : g
      for (const name of Object.keys(flat.attributes)) {
        if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
      }
      if (!flat.getAttribute('normal')) flat.computeVertexNormals()
      return flat
    })
  if (usable.length === 0) return new THREE.BufferGeometry()
  return mergeGeometries(usable, false) ?? new THREE.BufferGeometry()
}

/** A stack of shrinking layers, which prints as a chamfer or rounded shoulder. */
export function chamfer(region: Region, depth: number, inset: number, z = 0, layers = 8): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const step = depth / layers
  for (let i = 0; i < layers; i++) {
    const t = (i + 0.5) / layers
    parts.push(extrude(offset(region, -inset * t), step, z + i * step))
  }
  return merge(parts)
}

/** Closed solid of revolution around Z. `profile` is [radius, z], axis to axis, bottom first. */
export function revolve(profile: [number, number][], segments = 64): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  profile.forEach(([r, z]) => {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2
      positions.push(Math.cos(a) * r, Math.sin(a) * r, z)
    }
  })
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j
      const b = i * segments + ((j + 1) % segments)
      const c = (i + 1) * segments + j
      const d = (i + 1) * segments + ((j + 1) % segments)
      if (profile[i][0] > 0) indices.push(a, b, d)
      if (profile[i + 1][0] > 0) indices.push(a, d, c)
    }
  }
  return finish(positions, indices)
}

/**
 * Solid swept around Z with a radius that depends on angle and height, which
 * is how threads, knurls, and hexagonal nuts are made. `inner` makes it a tube.
 */
export function radial(
  height: number,
  rows: number,
  segments: number,
  outer: (theta: number, z: number) => number,
  inner?: (theta: number, z: number) => number,
  z0 = 0,
): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  const pushGrid = (fn: (theta: number, z: number) => number) => {
    const start = positions.length / 3
    for (let i = 0; i <= rows; i++) {
      const z = (i / rows) * height
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * Math.PI * 2
        const r = fn(a, z)
        positions.push(Math.cos(a) * r, Math.sin(a) * r, z + z0)
      }
    }
    return start
  }
  const outerStart = pushGrid(outer)
  const at = (start: number, i: number, j: number) => start + i * segments + ((j + segments) % segments)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segments; j++) {
      const a = at(outerStart, i, j)
      const b = at(outerStart, i, j + 1)
      const c = at(outerStart, i + 1, j)
      const d = at(outerStart, i + 1, j + 1)
      indices.push(a, b, d, a, d, c)
    }
  }
  if (inner) {
    const innerStart = pushGrid(inner)
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < segments; j++) {
        const a = at(innerStart, i, j)
        const b = at(innerStart, i, j + 1)
        const c = at(innerStart, i + 1, j)
        const d = at(innerStart, i + 1, j + 1)
        indices.push(a, d, b, a, c, d)
      }
    }
    for (let j = 0; j < segments; j++) {
      const oTop = at(outerStart, rows, j)
      const oTop2 = at(outerStart, rows, j + 1)
      const iTop = at(innerStart, rows, j)
      const iTop2 = at(innerStart, rows, j + 1)
      indices.push(oTop, oTop2, iTop2, oTop, iTop2, iTop)
      const oBot = at(outerStart, 0, j)
      const oBot2 = at(outerStart, 0, j + 1)
      const iBot = at(innerStart, 0, j)
      const iBot2 = at(innerStart, 0, j + 1)
      indices.push(oBot, iBot2, oBot2, oBot, iBot, iBot2)
    }
  } else {
    const bottom = positions.length / 3
    positions.push(0, 0, z0, 0, 0, z0 + height)
    for (let j = 0; j < segments; j++) {
      indices.push(bottom, at(outerStart, 0, j + 1), at(outerStart, 0, j))
      indices.push(bottom + 1, at(outerStart, rows, j), at(outerStart, rows, j + 1))
    }
  }
  return finish(positions, indices)
}

/** The radius of an ISO-like thread at a given angle and height. */
export function threadRadius(major: number, minor: number, pitch: number) {
  return (theta: number, z: number) => {
    const phase = (z / pitch - theta / (Math.PI * 2)) % 1
    const t = phase < 0 ? phase + 1 : phase
    const tri = t < 0.5 ? t * 2 : (1 - t) * 2
    return minor + (major - minor) * tri
  }
}

export function threaded(major: number, minor: number, pitch: number, length: number, z0 = 0) {
  const rows = Math.max(8, Math.ceil((length / pitch) * 16))
  return radial(length, rows, 48, threadRadius(major, minor, pitch), undefined, z0)
}

/** The distance from the centre to the edge of a regular hexagon at `theta`. */
export function hexRadius(flatToFlat: number) {
  const apothem = flatToFlat / 2
  return (theta: number) => {
    const sector = Math.PI / 3
    const t = ((theta % sector) + sector) % sector
    return apothem / Math.cos(t - sector / 2)
  }
}

function finish(positions: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Closed tube following a closed curve. Used for chain links. */
export function tube(curve: THREE.Curve<THREE.Vector3>, radius: number, segments = 72): THREE.BufferGeometry {
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 16, true)
  geometry.deleteAttribute('uv')
  return geometry
}

/**
 * Extrudes in thin slats across one axis so the solid has enough vertices to
 * bend. Each slat is its own closed solid, so a bend never tears a surface.
 */
export function slats(region: Region, depth: number, z: number, axis: 'x' | 'y', step: number) {
  const b = bounds(region)
  const span = axis === 'x' ? b.w : b.h
  const start = axis === 'x' ? b.minX : b.minY
  const count = Math.min(240, Math.max(1, Math.ceil(span / step)))
  const size = span / count
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const mid = start + (i + 0.5) * size
    const window =
      axis === 'x' ? rect(mid, b.cy, size, b.h + 2) : rect(b.cx, mid, b.w + 2, size)
    parts.push(extrude(intersect(region, window), depth, z))
  }
  return merge(parts)
}

/** Wraps a flat solid around a cylinder, keeping true length along the surface. */
export function bend(geometry: THREE.BufferGeometry, radius: number, axis: 'x' | 'y') {
  const pos = geometry.getAttribute('position')
  if (!pos || radius === 0) return geometry
  for (let i = 0; i < pos.count; i++) {
    const s = axis === 'x' ? pos.getX(i) : pos.getY(i)
    const z = pos.getZ(i)
    const a = s / radius
    const along = (radius + z) * Math.sin(a)
    const up = (radius + z) * Math.cos(a) - radius
    if (axis === 'x') pos.setX(i, along)
    else pos.setY(i, along)
    pos.setZ(i, up)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/** Signed volume in mm³ and whether every edge is shared by exactly two faces. */
export function analyse(geometry: THREE.BufferGeometry): { volume: number; watertight: boolean } {
  const pos = geometry.getAttribute('position')
  if (!pos || pos.count === 0) return { volume: 0, watertight: false }
  const bare = new THREE.BufferGeometry()
  bare.setAttribute('position', pos)
  if (geometry.index) bare.setIndex(geometry.index)
  const welded = mergeVertices(bare, 1e-3)
  const p = welded.getAttribute('position')
  const index = welded.index
  if (!index) return { volume: 0, watertight: false }
  let volume = 0
  const edges = new Map<string, number>()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i)
    const ib = index.getX(i + 1)
    const ic = index.getX(i + 2)
    if (ia === ib || ib === ic || ia === ic) continue
    a.fromBufferAttribute(p, ia)
    b.fromBufferAttribute(p, ib)
    c.fromBufferAttribute(p, ic)
    volume += a.dot(b.clone().cross(c)) / 6
    for (const [u, v] of [[ia, ib], [ib, ic], [ic, ia]]) {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  }
  let watertight = edges.size > 0
  for (const count of edges.values()) {
    if (count !== 2) {
      watertight = false
      break
    }
  }
  welded.dispose()
  bare.dispose()
  return { volume, watertight }
}
