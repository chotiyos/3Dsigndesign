import { expect, it } from 'vitest'
import { diff, offset, rect } from '../geo2d'
import { buildStyle, defaultValues, findStyle, type SignPart } from './index'

const art = rect(0, 0, 120, 100)
function build(id: string) {
  const style = findStyle(id)
  return buildStyle(style, art, defaultValues(style))
}
function box(part: SignPart) {
  part.geometry.computeBoundingBox()
  return part.geometry.boundingBox!
}
function check(id: string, verify: (parts: SignPart[]) => void) {
  const parts = build(id)
  try { verify(parts) } finally { parts.forEach((p) => p.geometry.dispose()) }
}

it('infinity mirror front rests on its lip and stays within the wall depth', () => {
  check('infinity-mirror', (parts) => {
    const wall = parts.find((p) => p.label === 'ผนังตัวอักษร')!
    const lip = parts.find((p) => p.label === 'บ่าหน้า')!
    const front = parts.find((p) => p.material === 'acrylic')!
    expect(box(front).min.z).toBeCloseTo(box(lip).max.z)
    expect(box(front).max.z).toBeCloseTo(box(wall).max.z)
  })
})

it('halo mounting pins reach the closed front', () => {
  check('halo-back-lit', (parts) => {
    expect(box(parts[0]).max.z).toBeGreaterThan(box(parts[2]).min.z)
  })
})

for (const id of ['ping-pong-bulbs', 'perforated-face', 'front-brow']) {
  it(id + ' face fits inside the wall opening', () => {
    check(id, (parts) => {
      const face = parts.find((p) => p.material === (id === 'front-brow' ? 'opal' : 'accent'))!
      expect(diff(face.cut!, offset(art, id === 'front-brow' ? -5 : -2)).length).toBe(0)
    })
  })
}

it('double-sided box hooks intersect the top wall', () => {
  check('double-sided-box', (parts) => {
    const wall = parts.find((p) => p.material === 'print')!
    const hooks = parts.find((p) => p.material === 'metal')!
    expect(box(hooks).min.y).toBeLessThan(box(wall).max.y)
  })
})

it('desk block base overlaps the bottom of the letters', () => {
  check('desk-block', (parts) => {
    expect(box(parts[0]).max.y).toBeGreaterThan(box(parts[1]).min.y)
    expect(box(parts[0]).min.z).toBeLessThanOrEqual(box(parts[1]).min.z)
    expect(box(parts[0]).max.z).toBeGreaterThanOrEqual(box(parts[1]).max.z)
  })
})

it('photo frame stand slopes backwards and reaches the back plate', () => {
  check('photo-frame', (parts) => {
    const stand = box(parts[3])
    expect(stand.min.z).toBeLessThan(-10)
    expect(stand.max.z).toBeGreaterThanOrEqual(box(parts[0]).min.z)
    expect(stand.min.y).toBeCloseTo(box(parts[0]).min.y, 2)
  })
})

it('clamp handle sits outside the top jaw and screw crosses it', () => {
  check('c-clamp', (parts) => {
    expect(box(parts[1]).max.y).toBeGreaterThan(box(parts[0]).max.y)
    expect(box(parts[1]).min.y).toBeLessThan(box(parts[0]).max.y)
  })
})

it('hinge leaves have clearance from the opposite knuckles and bridges to their own', () => {
  check('print-hinge', (parts) => {
    // At the shared knuckle axis, the broad leaf must stop outside radius 3.
    for (const part of parts.slice(0, 2)) {
      const pos = part.geometry.getAttribute('position')
      const atEnds = Array.from({ length: pos.count }, (_, i) => i).filter((i) => Math.abs(pos.getY(i)) > 29.9)
      expect(atEnds.every((i) => Math.abs(pos.getX(i)) > 3)).toBe(true)
      // A bridge enters the barrel radius away from the ends.
      expect(Array.from({ length: pos.count }, (_, i) => Math.abs(pos.getX(i))).some((x) => Math.abs(x - 1.5) < 1e-4)).toBe(true)
    }
  })
})
