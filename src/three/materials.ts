import * as THREE from 'three'
import type { MaterialId } from '../lib/styles'

export const MATERIAL_COLORS: Record<MaterialId, string> = {
  print: '#3d5a99',
  opal: '#f6f8fc',
  acrylic: '#bcd5ff',
  accent: '#f2a20c',
  metal: '#a3adbb',
  plaswood: '#e9e7dc',
  led: '#ffe3a1',
  mirror: '#c9d4e2',
  rubber: '#2a2f38',
}

export const MATERIAL_NAMES: Record<MaterialId, string> = {
  print: 'พลาสติกพิมพ์',
  opal: 'ขาวขุ่นโปร่งแสง',
  acrylic: 'อะคริลิกใส',
  accent: 'สีหลัก',
  metal: 'โลหะ',
  plaswood: 'พลาสวูด',
  led: 'ไฟ LED',
  mirror: 'กระจกเงา',
  rubber: 'ยาง',
}

/** Scene material for a part. At night, light-carrying parts glow. */
export function makeMaterial(material: MaterialId, color: string, night: boolean): THREE.Material {
  const c = new THREE.Color(color)
  switch (material) {
    case 'opal':
      return new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.35,
        transparent: true,
        opacity: night ? 0.95 : 0.88,
        emissive: night ? new THREE.Color('#fff1d2') : new THREE.Color(0),
        emissiveIntensity: night ? 0.95 : 0,
      })
    case 'acrylic':
      return new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.38,
        emissive: night ? c : new THREE.Color(0),
        emissiveIntensity: night ? 0.25 : 0,
        depthWrite: false,
      })
    case 'led':
      return new THREE.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: night ? 2.2 : 0.35,
        roughness: 0.4,
      })
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.32 })
    case 'mirror':
      return new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: 0.05 })
    case 'rubber':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })
    case 'accent':
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.05 })
    default:
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.02 })
  }
}

/** Soft studio environment so metal and acrylic have something to reflect. */
export function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const scene = new THREE.Scene()
  const geo = new THREE.SphereGeometry(1, 32, 16)
  const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })
  const colors: number[] = []
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const t = (y + 1) / 2
    const c = new THREE.Color('#1b2b52').lerp(new THREE.Color('#f4f7ff'), t)
    colors.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  scene.add(new THREE.Mesh(geo, mat))
  const env = pmrem.fromScene(scene, 0.02).texture
  geo.dispose()
  mat.dispose()
  pmrem.dispose()
  return env
}
