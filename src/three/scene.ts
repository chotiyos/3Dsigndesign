import * as THREE from 'three'
import { bounds, islands, regionArea, regionToShapes, type Region, type Point } from '../lib/geo2d'
import type { SignPart } from '../lib/styles'

/** How the sign is shown in place. Preview only: nothing here is exported. */
export type MountKind = 'none' | 'wall' | 'standoff' | 'arm' | 'desk'

export interface SceneOptions {
  mount: MountKind
  /** A 1.70 m person beside the sign, for scale. */
  person: boolean
  /** Floor to the bottom edge of the sign, in mm. */
  heightMM: number
}

export const MOUNTS: { id: MountKind; label: string }[] = [
  { id: 'none', label: 'ไม่มีฉาก' },
  { id: 'wall', label: 'ติดผนัง' },
  { id: 'standoff', label: 'ขาลอย' },
  { id: 'arm', label: 'แขนยื่น' },
  { id: 'desk', label: 'บนโต๊ะ' },
]

/** Usual floor-to-sign heights per mount, in mm. */
export const MOUNT_HEIGHT: Record<MountKind, number> = { none: 0, wall: 2400, standoff: 2400, arm: 2600, desk: 750 }

/** Gap between the sign's back and the wall. */
export const STANDOFF_GAP = 25

export const sceneActive = (o: SceneOptions | null | undefined): o is SceneOptions => Boolean(o && (o.mount !== 'none' || o.person))

/** Prefer the centre, falling back to solid material for hollow/concave letters. */
function solidPoint(region: Region): Point {
  const b = bounds(region)
  const centre = new THREE.Vector3(b.cx, b.cy, 0)
  let best = centre
  let area = -1
  for (const shape of regionToShapes(region)) {
    const { shape: contour, holes } = shape.extractPoints(12)
    const points = [...contour, ...holes.flat()].map(p => new THREE.Vector3(p.x, p.y, 0))
    for (const indices of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      const triangle = new THREE.Triangle(...indices.map(i => points[i]) as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
      if (triangle.containsPoint(centre)) return [b.cx, b.cy]
      if (triangle.getArea() > area) {
        area = triangle.getArea()
        best = triangle.getMidpoint(new THREE.Vector3())
      }
    }
  }
  return [best.x, best.y]
}

/**
 * Where standoff pins go: the centre of each sizeable piece of the rearmost
 * flat part (each letter of a lit sign), or the four corners when there is none.
 */
export function standoffPoints(parts: SignPart[], box: THREE.Box3): Point[] {
  let back: SignPart | undefined
  let backZ = Infinity
  for (const part of parts) {
    if (!part.profile || part.material === 'led') continue
    part.geometry.computeBoundingBox()
    const z = part.geometry.boundingBox?.min.z ?? Infinity
    if (z < backZ - 0.01) {
      backZ = z
      back = part
    }
  }
  const pieces = back ? islands(back.profile!.region) : []
  const biggest = Math.max(0, ...pieces.map((p) => Math.abs(regionArea(p))))
  const points = pieces
    .filter((p) => Math.abs(regionArea(p)) >= biggest * 0.2)
    .map(solidPoint)
    .slice(0, 40)
  if (points.length) return points
  const ix = (box.max.x - box.min.x) * 0.15
  const iy = (box.max.y - box.min.y) * 0.15
  return [
    [box.min.x + ix, box.min.y + iy],
    [box.max.x - ix, box.min.y + iy],
    [box.min.x + ix, box.max.y - iy],
    [box.max.x - ix, box.max.y - iy],
  ]
}

const mat = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness })

function boxAt(material: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, x1 - x0), Math.max(0.1, y1 - y0), Math.max(0.1, z1 - z0)), material)
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  return mesh
}

function rod(material: THREE.Material, radius: number, from: THREE.Vector3, to: THREE.Vector3) {
  const length = from.distanceTo(to)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), material)
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
  return mesh
}

/** A plain 1.70 m figure standing at (x, floor, z). */
function person(material: THREE.Material, x: number, floor: number, z: number) {
  const group = new THREE.Group()
  const capsule = (r: number, length: number, px: number, py: number, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, length, 6, 16), material)
    mesh.position.set(px, py, 0)
    mesh.rotation.z = rz
    group.add(mesh)
  }
  capsule(62, 760, -95, 442)
  capsule(62, 760, 95, 442)
  capsule(165, 380, 0, 1140)
  capsule(44, 540, -230, 1050, 0.08)
  capsule(44, 540, 230, 1050, -0.08)
  const head = new THREE.Mesh(new THREE.SphereGeometry(108, 24, 16), material)
  head.position.set(0, 1592, 0)
  group.add(head)
  group.position.set(x, floor, z)
  return group
}

/**
 * The surroundings for a sign whose parts fill `box` (in sign mm, back at
 * z = 0): a floor, a wall with a door for scale, mounting hardware, a desk,
 * and an optional person. Everything is new geometry and material; call
 * disposeScene when done.
 */
export function buildScene(parts: SignPart[], box: THREE.Box3, o: SceneOptions): THREE.Group {
  const group = new THREE.Group()
  group.name = 'scene'
  if (box.isEmpty()) return group
  const w = box.max.x - box.min.x
  const d = box.max.z - box.min.z
  const height = o.mount === 'none' ? 0 : Math.max(0, o.heightMM)
  const floor = box.min.y - height
  // What the camera frames: the sign, the floor under it and the person, not the whole wall.
  const focus = box.clone().expandByPoint(new THREE.Vector3(box.min.x, floor, box.max.z))
  const materials: THREE.Material[] = []
  const ownedMat = (...args: Parameters<typeof mat>) => {
    const material = mat(...args)
    materials.push(material)
    return material
  }
  group.userData.materials = materials
  const wallMat = ownedMat('#d8dde6', 0.95)
  const floorMat = ownedMat('#aeb6c4', 0.9)
  const metal = ownedMat('#9aa4b2', 0.35, 0.85)
  const span = Math.max(w + 3200, 4200)
  const left = box.min.x - (span - w) / 2
  const right = box.max.x + (span - w) / 2
  const top = Math.max(box.max.y + 700, floor + 3000)

  // Floor, reaching out in front of whatever the sign stands against.
  const back = o.mount === 'wall' ? box.min.z - 0.5 : o.mount === 'standoff' ? box.min.z - STANDOFF_GAP : box.min.z - 600
  group.add(boxAt(floorMat, left, right, floor - 20, floor, back - 20, box.max.z + 2600))

  if (o.mount === 'wall' || o.mount === 'standoff') {
    group.add(boxAt(wallMat, left, right, floor, top, back - 60, back))
    // A shop door beside the sign, 0.9 x 2.1 m.
    const dx = box.max.x + 450
    const frame = ownedMat('#5b6577', 0.6)
    group.add(boxAt(frame, dx, dx + 1000, floor, floor + 2200, back, back + 15))
    group.add(boxAt(ownedMat('#8fa3bf', 0.15, 0.1), dx + 50, dx + 950, floor, floor + 2150, back + 15, back + 20))
    if (o.mount === 'standoff') {
      for (const [x, y] of standoffPoints(parts, box)) {
        group.add(rod(metal, 6, new THREE.Vector3(x, y, back), new THREE.Vector3(x, y, box.min.z)))
        group.add(rod(metal, 9, new THREE.Vector3(x, y, back), new THREE.Vector3(x, y, back + 6)))
      }
    }
  } else if (o.mount === 'arm') {
    // A wall to the left, the sign hanging out from it on a bracket.
    const wx = box.min.x - 180
    const zc = (box.min.z + box.max.z) / 2
    group.add(boxAt(wallMat, wx - 60, wx, floor, top, box.min.z - 2000, box.max.z + 900))
    const by = box.max.y + 90
    focus.expandByPoint(new THREE.Vector3(wx - 60, by + 40, zc))
    group.add(boxAt(metal, wx, box.max.x + 30, by - 12, by + 12, zc - 12, zc + 12))
    group.add(boxAt(metal, wx, wx + 8, by - 120, by + 40, zc - 60, zc + 60))
    for (const t of [0.15, 0.85]) {
      const x = box.min.x + w * t
      group.add(rod(metal, 3, new THREE.Vector3(x, by - 12, zc), new THREE.Vector3(x, box.max.y, zc)))
    }
  } else if (o.mount === 'desk') {
    const wood = ownedMat('#b08a63', 0.7)
    const tx0 = box.min.x - 250
    const tx1 = box.max.x + 250
    const tz0 = box.min.z - 250
    const tz1 = box.max.z + Math.max(350, d)
    group.add(boxAt(wood, tx0, tx1, box.min.y - 30, box.min.y, tz0, tz1))
    for (const [x, z] of [[tx0 + 40, tz0 + 40], [tx1 - 40, tz0 + 40], [tx0 + 40, tz1 - 40], [tx1 - 40, tz1 - 40]]) {
      group.add(boxAt(wood, x - 25, x + 25, floor, box.min.y - 30, z - 25, z + 25))
    }
  }

  if (o.person) {
    const px = o.mount === 'arm' ? box.max.x + 550 : o.mount === 'wall' || o.mount === 'standoff' ? box.min.x - 550 : box.max.x + 650
    // Level with the sign, so perspective does not make the figure look bigger than it is.
    const pz = o.mount === 'wall' || o.mount === 'standoff' ? box.max.z + 250 : (box.min.z + box.max.z) / 2
    const figure = person(ownedMat('#76839c', 0.8), px, floor, pz)
    group.add(figure)
    focus.expandByObject(figure)
  }
  group.userData.focus = focus
  return group
}

export function disposeScene(group: THREE.Object3D) {
  const materials = new Set<THREE.Material>(group.userData.materials ?? [])
  const geometries = new Set<THREE.BufferGeometry>()
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      geometries.add(child.geometry)
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material)
    }
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  group.removeFromParent()
}
