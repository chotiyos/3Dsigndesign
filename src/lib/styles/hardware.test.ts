import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildStyle, findStyle } from './index'

it('keeps coarse threads on small bolts outside the axis with outward faces', () => {
  const parts = buildStyle(findStyle('bolt-nut'), [], { dia: 4, pitch: 5, length: 8 })
  try {
    expect(parts[0].warning).toContain('เกลียว')
    const positions = parts[0].geometry.getAttribute('position')
    const a = new Vector3(), b = new Vector3(), c = new Vector3()
    const start = 4 * 0.65 - 8 / 2
    let checked = 0
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i)
      b.fromBufferAttribute(positions, i + 1)
      c.fromBufferAttribute(positions, i + 2)
      // Ignore the head and the flat end caps; the shaft runs along Y.
      if (Math.min(a.y, b.y, c.y) < start - 1e-5 || Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) < 1e-5) continue
      const radial = a.clone().add(b).add(c).multiplyScalar(1 / 3)
      radial.x += 4 * 1.4
      radial.y = 0
      const normal = b.clone().sub(a).cross(c.clone().sub(a))
      expect(normal.dot(radial)).toBeGreaterThan(-1e-5)
      const ra = new Vector3(a.x + 4 * 1.4, 0, a.z)
      const rb = new Vector3(b.x + 4 * 1.4, 0, b.z)
      const rc = new Vector3(c.x + 4 * 1.4, 0, c.z)
      expect(Math.min(ra.dot(rb), rb.dot(rc), rc.dot(ra))).toBeGreaterThan(0)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  } finally { parts.forEach(p => p.geometry.dispose()) }
})
