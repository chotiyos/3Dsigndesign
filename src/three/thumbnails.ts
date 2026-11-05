import * as THREE from 'three'
import type { SignPart } from '../lib/styles'
import { MATERIAL_COLORS, makeMaterial, studioEnvironment } from './materials'

/**
 * One shared off-screen renderer draws catalogue thumbnails one at a time, so
 * a page of fifty cards never opens fifty WebGL contexts.
 */
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
const cache = new Map<string, Promise<string>>()
let queue: Promise<unknown> = Promise.resolve()

function setup(width: number, height: number) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    scene = new THREE.Scene()
    scene.environment = studioEnvironment(renderer)
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a4a70', 1.2))
    const key = new THREE.DirectionalLight('#ffffff', 2.4)
    key.position.set(0.6, 0.9, 1)
    scene.add(key)
    camera = new THREE.PerspectiveCamera(30, 1, 1, 50000)
  }
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  camera!.aspect = width / height
  camera!.updateProjectionMatrix()
}

export function thumbnail(key: string, make: () => SignPart[], width = 480, height = 360): Promise<string> {
  const hit = cache.get(key)
  if (hit) return hit
  const job = queue.then(
    () =>
      new Promise<string>((resolve) => {
        // Yield to the browser between thumbnails so scrolling stays smooth.
        const run = () => {
          try {
            resolve(draw(make(), width, height))
          } catch {
            resolve('')
          }
        }
        if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 400 })
        else setTimeout(run, 16)
      }),
  )
  queue = job
  cache.set(key, job)
  return job
}

function draw(parts: SignPart[], width: number, height: number): string {
  setup(width, height)
  const group = new THREE.Group()
  const materials: THREE.Material[] = []
  for (const part of parts) {
    const material = makeMaterial(part.material, MATERIAL_COLORS[part.material], false)
    materials.push(material)
    group.add(new THREE.Mesh(part.geometry, material))
  }
  scene!.add(group)
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  group.position.sub(centre)
  const fov = (camera!.fov * Math.PI) / 180
  const fit = Math.max(size.y / 2 / Math.tan(fov / 2), size.x / 2 / (Math.tan(fov / 2) * camera!.aspect))
  const dist = fit * 1.25 + size.z
  camera!.position.set(dist * 0.42, dist * 0.3, dist)
  camera!.lookAt(0, 0, 0)
  camera!.near = dist / 100
  camera!.far = dist * 10
  camera!.updateProjectionMatrix()
  renderer!.render(scene!, camera!)
  const url = renderer!.domElement.toDataURL('image/png')
  scene!.remove(group)
  materials.forEach((m) => m.dispose())
  return url
}
