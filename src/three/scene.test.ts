import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { rect, union, diff, intersect, circle, regionArea } from '../lib/geo2d'
import { extrude } from '../lib/solid'
import type { SignPart } from '../lib/styles'
import { buildScene, disposeScene, sceneActive, standoffPoints, STANDOFF_GAP } from './scene'

const letters = union(rect(-200, 0, 100, 150), rect(0, 0, 100, 150), rect(200, 0, 100, 150), rect(300, 60, 10, 10))
const back: SignPart = { id: 'A-0', code: 'A', label: 'แผ่นหลัง', material: 'print', geometry: extrude(letters, 3), profile: { region: letters, depth: 3 }, explode: 0 }
const face: SignPart = { id: 'B-1', code: 'B', label: 'หน้า', material: 'acrylic', geometry: extrude(letters, 3, 40), profile: { region: letters, depth: 3 }, explode: 0 }
const parts = [face, back]
const box = new THREE.Box3()
for (const p of parts) {
  p.geometry.computeBoundingBox()
  box.union(p.geometry.boundingBox!)
}

describe('scene', () => {
  it('is off until a mount or a person is chosen', () => {
    expect(sceneActive({ mount: 'none', person: false, heightMM: 2400 })).toBe(false)
    expect(sceneActive({ mount: 'none', person: true, heightMM: 2400 })).toBe(true)
    expect(sceneActive(null)).toBe(false)
  })

  it('puts a standoff behind each letter of the rearmost plate, skipping specks', () => {
    const points = standoffPoints(parts, box)
    expect(points).toHaveLength(3)
    expect(points.map(([x]) => x).sort((a, b) => a - b)).toEqual([-200, 0, 200])
  })

  it('places the floor below the sign by the mount height and frames sign, floor and person', () => {
    const group = buildScene(parts, box, { mount: 'standoff', person: true, heightMM: 2400 })
    const focus = group.userData.focus as THREE.Box3
    expect(focus.min.y).toBeCloseTo(box.min.y - 2400, 0)
    // The person stands on that floor and is 1.70 m tall.
    const all = new THREE.Box3().setFromObject(group)
    expect(all.min.y).toBeLessThanOrEqual(box.min.y - 2400)
    expect(focus.max.y - focus.min.y).toBeGreaterThan(1700)
    // Standoff rods reach from the wall to the back of the sign.
    const rods = group.children.filter((c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.CylinderGeometry)
    expect(rods.length).toBe(6)
    const rodBox = new THREE.Box3().setFromObject(rods[0])
    expect(rodBox.max.z).toBeCloseTo(box.min.z, 0)
    expect(rodBox.min.z).toBeCloseTo(box.min.z - STANDOFF_GAP, 0)
    disposeScene(group)
  })

  it('hangs a projecting sign from a bracket above it, wall to one side', () => {
    const group = buildScene(parts, box, { mount: 'arm', person: false, heightMM: 2600 })
    const focus = group.userData.focus as THREE.Box3
    expect(focus.max.y).toBeGreaterThan(box.max.y + 50)
    expect(focus.min.x).toBeLessThan(box.min.x - 150)
    disposeScene(group)
  })

  it('sets a desk under a desk sign', () => {
    const group = buildScene(parts, box, { mount: 'desk', person: false, heightMM: 750 })
    const all = new THREE.Box3().setFromObject(group)
    expect(all.max.y).toBeCloseTo(box.min.y, 0)
    expect(all.min.y).toBeCloseTo(box.min.y - 750 - 20, 0)
    disposeScene(group)
  })
})

it('disposes every owned material exactly once, including materials unused by a mount', () => {
  for (const mount of ['none', 'wall', 'standoff', 'arm', 'desk'] as const) {
    const group = buildScene(parts, box, { mount, person: true, heightMM: 750 })
    const materials = group.userData.materials as THREE.Material[]
    const calls = new Map<THREE.Material, number>()
    materials.forEach(m => m.addEventListener('dispose', () => calls.set(m, (calls.get(m) ?? 0) + 1)))
    const geometries: THREE.BufferGeometry[] = []
    group.traverse(c => { if (c instanceof THREE.Mesh) geometries.push(c.geometry) })
    let disposed = 0
    geometries.forEach(g => g.addEventListener('dispose', () => disposed++))
    disposeScene(group)
    expect(materials.length).toBeGreaterThan(0)
    expect(materials.every(m => calls.get(m) === 1)).toBe(true)
    expect(disposed).toBe(geometries.length)
  }
})

it('places standoff anchors on solid material rather than in hollow letter centres', () => {
  const ring = diff(rect(0, 0, 100, 100), rect(0, 0, 60, 60))
  const letter = { ...back, geometry: extrude(ring, 3), profile: { region: ring, depth: 3 } }
  const points = standoffPoints([letter], new THREE.Box3().setFromBufferAttribute(letter.geometry.getAttribute('position') as THREE.BufferAttribute))
  expect(points).toHaveLength(1)
  const [x, y] = points[0]
  expect(regionArea(intersect(ring, circle(x, y, 0.1)))).toBeGreaterThan(0.02)
  letter.geometry.dispose()
})

it('places the 1.70 m figure directly on the floor and clear of the desk', () => {
  const group = buildScene(parts, box, { mount: 'desk', person: true, heightMM: 750 })
  const figure = group.children.find(c => c instanceof THREE.Group)!
  const figureBox = new THREE.Box3().setFromObject(figure)
  expect(figureBox.min.y).toBeCloseTo(box.min.y - 750)
  expect(figureBox.max.y - figureBox.min.y).toBeCloseTo(1700)
  expect(figureBox.min.x).toBeGreaterThan(box.max.x + 250)
  disposeScene(group)
})
