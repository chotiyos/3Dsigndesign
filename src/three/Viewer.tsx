import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { SignPart } from '../lib/styles'
import { MATERIAL_COLORS, makeMaterial, studioEnvironment } from './materials'

export interface Callout {
  code: string
  x: number
  y: number
  visible: boolean
}

export interface ViewerProps {
  parts: SignPart[]
  explodeMM: number
  hidden?: ReadonlySet<string>
  colors?: Readonly<Record<string, string>>
  night?: boolean
  grid?: boolean
  edges?: boolean
  /** Re-frames the camera whenever this changes. Parameter edits keep the view. */
  frameKey?: string
  autoRotate?: boolean
  /** Photo shown behind the model, for placing a sign on a real storefront. */
  backdrop?: string | null
  /** Set to a function that renders one frame and returns it as a PNG data URL. */
  captureRef?: { current: (() => string | null) | null }
  /** Called every frame with each part's anchor projected to canvas pixels. */
  onCallouts?: (callouts: Callout[]) => void
  className?: string
  label?: string
}

const DAY_BG = new THREE.Color('#e8edf6')
const NIGHT_BG = new THREE.Color('#071027')

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  composer: EffectComposer
  bloom: UnrealBloomPass
  model: THREE.Group
  grid: THREE.GridHelper
  meshes: { part: SignPart; mesh: THREE.Mesh; edges?: THREE.LineSegments }[]
  hemi: THREE.HemisphereLight
  key: THREE.DirectionalLight
  backdrop: THREE.Texture | null
  framedKey?: string
}

export function Viewer(props: ViewerProps) {
  const { parts, explodeMM, hidden, colors, night = false, grid = true, edges = false, frameKey, autoRotate = false, backdrop, captureRef, className, label } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SceneState | null>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false })
    } catch {
      host.dataset.failed = 'true'
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('role', 'img')

    const scene = new THREE.Scene()
    scene.environment = studioEnvironment(renderer)
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000)
    camera.position.set(0, 120, 600)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.autoRotateSpeed = 0.6

    const hemi = new THREE.HemisphereLight('#ffffff', '#3a4a70', 1.1)
    scene.add(hemi)
    const key = new THREE.DirectionalLight('#ffffff', 2.2)
    key.position.set(0.6, 0.9, 1)
    scene.add(key)
    const rim = new THREE.DirectionalLight('#9fb8ff', 0.8)
    rim.position.set(-1, -0.3, -0.8)
    scene.add(rim)

    const gridHelper = new THREE.GridHelper(1, 20, '#7c8db5', '#b7c3db')
    ;(gridHelper.material as THREE.Material).transparent = true
    ;(gridHelper.material as THREE.Material).opacity = 0.55
    scene.add(gridHelper)

    const model = new THREE.Group()
    scene.add(model)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    // Bloom only picks up what is brighter than the threshold, so at night the
    // glowing faces and LED strips halo while the dark body stays crisp.
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 0.85)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const state: SceneState = { renderer, scene, camera, controls, composer, bloom, model, grid: gridHelper, meshes: [], hemi, key, backdrop: null }
    stateRef.current = state

    const resize = () => {
      const w = Math.max(1, host.clientWidth)
      const h = Math.max(1, host.clientHeight)
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      bloom.resolution.set(w / 2, h / 2)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const v = new THREE.Vector3()
    const box = new THREE.Box3()
    let frame = 0
    let visible = true
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    io.observe(host)

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!visible) return
      controls.update()
      if (latest.current.night) composer.render()
      else renderer.render(scene, camera)
      const onCallouts = latest.current.onCallouts
      if (onCallouts) {
        const w = host.clientWidth
        const h = host.clientHeight
        const n = state.meshes.length
        onCallouts(
          state.meshes.map(({ part, mesh }, i) => {
            // Anchor each callout at a different point along the part's top edge
            // so leader lines fan out instead of meeting at one corner.
            box.setFromObject(mesh)
            const t = 0.55 + (0.4 * (i + 0.5)) / Math.max(n, 1)
            v.set(box.min.x + (box.max.x - box.min.x) * t, box.max.y - (box.max.y - box.min.y) * 0.08, box.max.z)
            v.project(camera)
            return { code: part.code, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: mesh.visible && v.z < 1 }
          }),
        )
      }
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      io.disconnect()
      controls.dispose()
      for (const { mesh, edges } of state.meshes) {
        ;(mesh.material as THREE.Material).dispose()
        edges?.geometry.dispose()
        if (edges) (edges.material as THREE.Material).dispose()
      }
      scene.environment?.dispose()
      state.backdrop?.dispose()
      gridHelper.geometry.dispose()
      ;(gridHelper.material as THREE.Material).dispose()
      composer.passes.forEach((pass) => pass.dispose())
      composer.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      stateRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = stateRef.current?.renderer.domElement
    const name = hostRef.current?.getAttribute('aria-label')
    if (canvas && name) canvas.setAttribute('aria-label', name)
  }, [label])

  // Rebuild meshes when the parts change.
  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    for (const { mesh, edges } of state.meshes) {
      state.model.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()
      edges?.geometry.dispose()
      if (edges) (edges.material as THREE.Material).dispose()
    }
    state.meshes = []
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry, makeMaterial(part.material, MATERIAL_COLORS[part.material], false))
      mesh.renderOrder = part.material === 'acrylic' || part.material === 'opal' || part.material === 'opalprint' ? 2 : 1
      state.model.add(mesh)
      state.meshes.push({ part, mesh })
    }

    state.model.position.set(0, 0, 0)
    state.model.updateMatrixWorld(true)
    const box = new THREE.Box3()
    for (const { mesh } of state.meshes) box.expandByObject(mesh)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    state.model.position.set(-centre.x, -centre.y, -centre.z)

    const span = Math.max(size.x, size.y, 20)
    state.grid.scale.setScalar(span * 1.6)
    state.grid.position.y = -size.y / 2 - Math.max(2, span * 0.01)

    // The framed key lives on the scene, so a rebuilt scene (remount, or React
    // StrictMode's double effect run) always frames its own fresh camera.
    if (state.framedKey !== frameKey) {
      state.framedKey = frameKey
      const { camera, controls } = state
      const fov = (camera.fov * Math.PI) / 180
      const fitH = size.y / 2 / Math.tan(fov / 2)
      const fitW = size.x / 2 / (Math.tan(fov / 2) * Math.max(camera.aspect, 0.5))
      const dist = Math.max(fitH, fitW, size.z) * 1.28 + size.z * 0.5
      camera.position.set(dist * 0.18, dist * 0.16, dist)
      camera.near = dist / 200
      camera.far = dist * 20
      camera.updateProjectionMatrix()
      controls.target.set(0, 0, 0)
      controls.minDistance = dist * 0.15
      controls.maxDistance = dist * 6
      controls.update()
    }
  }, [parts, frameKey])

  // Cheap updates: explode, visibility, colour, night, grid, edges.
  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    for (const entry of state.meshes) {
      const { part, mesh } = entry
      mesh.visible = !hidden?.has(part.code)
      mesh.position.z = part.explode * explodeMM
      const color = colors?.[part.code] ?? MATERIAL_COLORS[part.material]
      ;(mesh.material as THREE.Material).dispose()
      mesh.material = makeMaterial(part.material, color, night, part.backlit)
      if (edges && !entry.edges) {
        entry.edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(part.geometry, 35),
          new THREE.LineBasicMaterial({ color: '#0d2147', transparent: true, opacity: 0.55 }),
        )
        mesh.add(entry.edges)
      }
      if (entry.edges) entry.edges.visible = edges
    }
    state.grid.visible = grid && !backdrop
    state.scene.background = state.backdrop ?? (night ? NIGHT_BG : DAY_BG)
    state.hemi.intensity = night ? 0.12 : 1.1
    state.scene.environmentIntensity = night ? 0.06 : 1
    state.key.intensity = night ? 0.25 : 2.2
    state.renderer.toneMappingExposure = night ? 0.9 : 1
    state.controls.autoRotate = autoRotate
  }, [parts, explodeMM, hidden, colors, night, grid, edges, autoRotate, backdrop])

  // Snapshot for the job sheet: render now, read back before the buffer clears.
  useEffect(() => {
    if (!captureRef) return
    captureRef.current = () => {
      const state = stateRef.current
      if (!state) return null
      // No floor grid in the picture, and cropped to the sign with a margin.
      const gridWas = state.grid.visible
      state.grid.visible = false
      if (latest.current.night) state.composer.render()
      else state.renderer.render(state.scene, state.camera)
      state.grid.visible = gridWas
      const canvas = state.renderer.domElement
      const box = new THREE.Box3()
      for (const { mesh } of state.meshes) if (mesh.visible) box.expandByObject(mesh)
      if (box.isEmpty()) return canvas.toDataURL('image/png')
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const v = new THREE.Vector3()
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(state.camera)
        const x = ((v.x + 1) / 2) * canvas.width
        const y = ((1 - v.y) / 2) * canvas.height
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      const pad = Math.max(maxX - minX, maxY - minY) * 0.06
      const x0 = Math.max(0, Math.floor(minX - pad))
      const y0 = Math.max(0, Math.floor(minY - pad))
      const w = Math.min(canvas.width, Math.ceil(maxX + pad)) - x0
      const h = Math.min(canvas.height, Math.ceil(maxY + pad)) - y0
      if (w < 8 || h < 8) return canvas.toDataURL('image/png')
      const out = document.createElement('canvas')
      out.width = w
      out.height = h
      out.getContext('2d')?.drawImage(canvas, x0, y0, w, h, 0, 0, w, h)
      return out.toDataURL('image/png')
    }
    return () => {
      captureRef.current = null
    }
  }, [captureRef])

  // Optional photo behind the sign.
  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    state.backdrop?.dispose()
    state.backdrop = null
    state.scene.background = latest.current.night ? NIGHT_BG : DAY_BG
    if (!backdrop) return
    let cancelled = false
    new THREE.TextureLoader().load(backdrop, (texture) => {
      if (cancelled || !stateRef.current) return texture.dispose()
      texture.colorSpace = THREE.SRGBColorSpace
      stateRef.current.backdrop = texture
      stateRef.current.scene.background = texture
    })
    return () => {
      cancelled = true
    }
  }, [backdrop])

  return (
    <div ref={hostRef} className={className ?? 'viewer'} aria-label={label ?? 'มุมมองโมเดล 3 มิติ ลากเพื่อหมุน เลื่อนล้อเพื่อซูม'}>
      <noscript>ต้องเปิด JavaScript เพื่อดูโมเดล 3 มิติ</noscript>
    </div>
  )
}
