import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SignPart, SignPartId } from '../lib/signParts'

export interface ViewerProps {
  parts: SignPart[]
  /** Font design units per em. */
  upem: number
  /** Desired letter (cap) height in millimetres. */
  heightMM: number
  /** How far apart (mm) to pull the layers apart along the depth axis. */
  explodeMM: number
  /** Which part ids are currently shown. */
  visibility: Record<SignPartId, boolean>
}

/** -1 pulls a layer back, 0 keeps it put, +1 pulls it forward. */
const EXPLODE_DIRECTION: Record<SignPartId, number> = { back: -1, wall: 0, front: 1 }

export function Viewer({ parts, upem, heightMM, explodeMM, visibility }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneState = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    group: THREE.Group
    meshes: Map<SignPartId, THREE.Mesh>
  } | null>(null)

  // Mirrors the latest props so the (expensive) geometry-rebuild effect can
  // apply the current explode/visibility state to freshly created meshes
  // without depending on — and re-running for — every explode/visibility tick.
  const latest = useRef({ explodeMM, visibility })
  latest.current = { explodeMM, visibility }

  const applyExplodeAndVisibility = () => {
    const state = sceneState.current
    if (!state) return
    const { explodeMM, visibility } = latest.current
    for (const [id, mesh] of state.meshes) {
      mesh.visible = visibility[id]
      const baseZ = mesh.userData.baseZ as number
      mesh.position.z = baseZ + EXPLODE_DIRECTION[id] * explodeMM
    }
  }

  // One-time scene setup.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111318)

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      1,
      10000,
    )
    camera.position.set(0, 150, 400)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(200, 300, 400)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x88aaff, 0.5)
    rim.position.set(-300, -100, -200)
    scene.add(rim)

    scene.add(new THREE.GridHelper(400, 20, 0x444455, 0x2a2c35))

    const group = new THREE.Group()
    scene.add(group)

    sceneState.current = { scene, camera, renderer, controls, group, meshes: new Map() }

    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneState.current = null
    }
  }, [])

  // Rebuild geometry whenever the parts/params change (expensive: re-extrudes).
  useEffect(() => {
    const state = sceneState.current
    if (!state) return
    const { group, camera, controls, meshes } = state

    while (group.children.length > 0) {
      const child = group.children[0]
      group.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    meshes.clear()

    if (parts.length === 0 || upem === 0) return

    const scale = heightMM / upem

    // Shared X/Y footprint (font units) — parts share the same origin, so
    // any non-empty part's shapes give the same bounding footprint.
    const footprint = new THREE.Box2()
    for (const part of parts) {
      for (const shape of part.shapes) {
        for (const p of shape.getPoints(4)) footprint.expandByPoint(p)
      }
    }
    const footprintCenter = new THREE.Vector2()
    footprint.getCenter(footprintCenter)

    const minZ = 0
    const maxZ = Math.max(...parts.map((p) => p.zOffsetMM + p.depthFontUnits * scale))
    const centerZ = (minZ + maxZ) / 2

    for (const part of parts) {
      if (part.shapes.length === 0) continue
      const geometry = new THREE.ExtrudeGeometry(part.shapes, {
        depth: part.depthFontUnits,
        bevelEnabled: false,
        curveSegments: 16,
      })
      const isFront = part.id === 'front'
      const material = new THREE.MeshPhysicalMaterial({
        color: part.color,
        metalness: isFront ? 0 : 0.15,
        roughness: isFront ? 0.15 : 0.45,
        transmission: isFront ? 0.55 : 0,
        transparent: isFront,
        opacity: isFront ? 0.9 : 1,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = part.id
      mesh.userData.baseZ = part.zOffsetMM - centerZ
      mesh.scale.setScalar(scale)
      mesh.position.set(-footprintCenter.x * scale, -footprintCenter.y * scale, mesh.userData.baseZ)
      group.add(mesh)
      meshes.set(part.id, mesh)
    }

    // Frame the camera on the new content.
    const size = new THREE.Vector3(
      footprint.max.x - footprint.min.x,
      footprint.max.y - footprint.min.y,
      maxZ - minZ,
    ).multiplyScalar(scale)
    size.z = maxZ - minZ
    const maxDim = Math.max(size.x, size.y, size.z, 1)
    const dist = maxDim * 2.4
    camera.position.set(0, maxDim * 0.3, dist)
    camera.near = dist / 100
    camera.far = dist * 20
    camera.updateProjectionMatrix()
    controls.target.set(0, 0, 0)
    controls.update()

    applyExplodeAndVisibility()
  }, [parts, upem, heightMM])

  // Cheap update: explode offset + layer visibility, no geometry rebuild
  // so dragging the explode slider (or toggling a layer) stays smooth.
  useEffect(() => {
    applyExplodeAndVisibility()
  }, [explodeMM, visibility])

  return <div ref={containerRef} className="h-full w-full" />
}
