import { beforeEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { rect } from '../lib/geo2d'
import { extrude } from '../lib/solid'
import { disposeScene } from './scene'
const h = vi.hoisted(() => ({ effects: [] as (() => any)[], refs: [] as any[], index: 0 }))
vi.mock('react', async () => ({
  ...await vi.importActual('react'),
  useEffect: (fn: () => any) => h.effects.push(fn),
  useRef: (initial: unknown) => h.refs[h.index++] ?? { current: initial },
}))
import { Viewer } from './Viewer'
const part = { id: 'a', code: 'A', label: 'ป้าย', material: 'print' as const, geometry: extrude(rect(0, 0, 400, 100), 10), explode: 1 }
function state() {
  const canvas = { toDataURL: vi.fn(() => 'data:image/png;base64,scene'), width: 800, height: 600 }
  const camera = new THREE.PerspectiveCamera(35, 4 / 3, 1, 20000)
  return { model: new THREE.Group(), meshes: [], surroundings: null, camera,
    controls: { target: new THREE.Vector3(), update: vi.fn() },
    grid: new THREE.GridHelper(), scene: new THREE.Scene(), hemi: new THREE.HemisphereLight(), key: new THREE.DirectionalLight(),
    renderer: { domElement: canvas, render: vi.fn() }, composer: { render: vi.fn() }, backdrop: null,
  } as any
}
function render(s: any, surround?: any, captureRef?: any) {
  h.effects = []; h.index = 0; h.refs = [{ current: null }, { current: s }]
  Viewer({ parts: [part], explodeMM: 30, scene: surround, captureRef })
  h.effects[2]()
  h.effects[3]()
}
function cleanup(s: any) {
  if (s.surroundings) disposeScene(s.surroundings)
  s.meshes.forEach((e: any) => e.mesh.material.dispose())
  s.grid.geometry.dispose(); s.grid.material.dispose()
}
beforeEach(() => { h.effects = []; h.refs = []; h.index = 0 })
it('frames initially without a frameKey, and reframes when scene height changes or the scene is removed', () => {
  const s = state()
  render(s)
  expect(s.controls.update).toHaveBeenCalledOnce()
  render(s, { mount: 'wall', person: false, heightMM: 2400 })
  const first = s.camera.position.length()
  render(s, { mount: 'wall', person: false, heightMM: 5000 })
  expect(s.camera.position.length()).toBeGreaterThan(first)
  render(s)
  expect(s.camera.position.length()).toBeLessThan(first)
  expect(s.controls.update).toHaveBeenCalledTimes(4)
  cleanup(s)
})
it('reapplies explode and grid visibility after scene rebuilds and captures the complete scale scene', () => {
  const s = state(), capture = { current: null as any }
  render(s, { mount: 'desk', person: true, heightMM: 750 }, capture)
  expect(s.meshes[0].mesh.position.z).toBe(30)
  expect(s.grid.visible).toBe(false)
  h.effects[4]()
  expect(capture.current()).toBe('data:image/png;base64,scene')
  expect(s.renderer.render).toHaveBeenCalledOnce()
  cleanup(s)
})
