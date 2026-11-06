import * as THREE from 'three'
import { deflateSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { rect } from './geo2d'
import { printGuide, printTip } from './printTips'
import { decodeShare, encodeShare } from './share'
import type { SignPart } from './styles'

describe('share links', () => {
  it('round-trips a design through a URL-safe code', () => {
    const design = { text: 'ป้ายร้านนี้\nCOFFEE', styleId: 'desk-block', values: { 'desk-block': { depth: 12 } }, bridge: 1 }
    const code = encodeShare(design)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeShare(`#d=${code}`)).toEqual(design)
  })

  it('rejects damaged, foreign or missing codes', () => {
    const code = encodeShare({ text: 'x' })
    expect(decodeShare(`#d=${code.slice(0, -6)}`)).toBeNull()
    expect(decodeShare('#d=@@@')).toBeNull()
    expect(decodeShare('#other')).toBeNull()
    expect(decodeShare('')).toBeNull()
  })
})

const part = (material: SignPart['material'], label: string, depth: number, cut = false): SignPart => {
  const region = rect(0, 0, 10, 10)
  return { id: label, code: 'A', label, material, geometry: new THREE.BufferGeometry(), explode: 0, profile: { region, depth }, cut: cut ? region : undefined }
}
const size = new THREE.Vector3(10, 10, 3)

describe('print tips', () => {
  it('suits each part to how it is made', () => {
    expect(printTip({ part: part('acrylic', 'หน้า', 3, true), size })).toContain('หนา 3.0 มม.')
    expect(printTip({ part: part('led', 'ไฟ', 2), size })).toContain('ไม่ต้องพิมพ์')
    expect(printTip({ part: part('opalprint', 'แผ่นกระจายแสง', 0.8), size })).toContain('100%')
    expect(printTip({ part: part('accent', 'สี 1', 0.6), size })).toContain('หลายสี')
    expect(printTip({ part: part('rubber', 'ยาง', 2), size })).toContain('TPU')
    expect(printTip({ part: part('print', 'ผนังตัวอักษร', 50), size })).toContain('ตั้งด้านหลังติดฐาน')
    expect(printTip({ part: part('acrylic', 'บล็อก', 20), size })).toContain('ซ้อนแผ่น')
  })

  it('lists every part in the guide', () => {
    const guide = printGuide([{ part: part('print', 'ฐาน', 5), size }, { part: part('led', 'ไฟ', 2), size }])
    expect(guide.split('\n')).toHaveLength(4)
  })
})

 it('rejects highly compressed designs above the expanded size limit', () => {
   const bytes = deflateSync(strToU8(JSON.stringify({ app: 'jjdesign', v: 1, d: { text: 'x'.repeat(1_000_001) } })))
   const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
   expect(code.length).toBeLessThan(30_000)
   expect(decodeShare('#d=' + code)).toBeNull()
 })

it('does not offer designs above the expanded byte limit even when they compress well', () => {
  expect(encodeShare({ svgText: 'ก'.repeat(400_000) })).toBe('')
})
