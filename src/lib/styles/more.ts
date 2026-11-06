import * as THREE from 'three'
import {
  band,
  circle,
  diff,
  intersect,
  mirrorX,
  offset,
  rect,
  ring,
  roundRect,
  stroke,
  union,
  type Poly,
  type Region,
} from '../geo2d'
import { bend, chamfer, extrude, merge, revolve, slats } from '../solid'
import { holeGrid } from './lit'
import { common, p, Parts } from './kit'
import type { StyleDef } from './types'

/** Extrudes the two halves of a region (split at x = 0) separately so each can be reshaped. */
function halves(region: Region, depth: number, z: number) {
  const left = intersect(region, rect(-50000, 0, 100000, 100000))
  const right = intersect(region, rect(50000, 0, 100000, 100000))
  return { left: extrude(left, depth, z), right: extrude(right, depth, z) }
}

/** Shifts every vertex on the back face (z ≈ zBack) by `shift(x)`. */
function reshapeBack(geometry: THREE.BufferGeometry, zBack: number, shift: (x: number) => number) {
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i) - zBack) < 1e-4) pos.setZ(i, zBack + shift(pos.getX(i)))
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/** Bottle silhouette, used by the bottle light box. */
function bottleOutline(w: number, h: number): Region {
  const neckW = w * 0.34
  const shoulder = h * 0.62
  const pts: Poly = [
    [-w / 2, -h / 2 + 8],
    [-w / 2 + 8, -h / 2],
    [w / 2 - 8, -h / 2],
    [w / 2, -h / 2 + 8],
    [w / 2, -h / 2 + shoulder],
  ]
  for (let i = 1; i <= 8; i++) {
    const t = i / 8
    pts.push([w / 2 - (w / 2 - neckW / 2) * Math.sin((t * Math.PI) / 2), -h / 2 + shoulder + t * h * 0.18])
  }
  pts.push([neckW / 2, h / 2], [-neckW / 2, h / 2])
  for (let i = 8; i >= 1; i--) {
    const t = i / 8
    pts.push([-(w / 2 - (w / 2 - neckW / 2) * Math.sin((t * Math.PI) / 2)), -h / 2 + shoulder + t * h * 0.18])
  }
  pts.push([-w / 2, -h / 2 + shoulder])
  return [pts]
}

export const MINI_STYLES: StyleDef[] = [
  {
    id: 'mini-cup',
    code: 'B01',
    group: 'mini',
    name: 'อักษรไฟจิ๋ว ถ้วยพิมพ์ชิ้นเดียว',
    blurb: 'ผนังกับหลังพิมพ์เป็นถ้วยชิ้นเดียว ฝาหน้าโปร่งแสงกดสวม เหมาะกับป้ายเล็กติดในร้าน',
    make: 'print',
    usesArt: true,
    params: [common.depth(20), common.wall(1.6), common.front(1.6), common.back(1.6), common.gap(0.15), common.seatLip(), common.lipWidth(1.5), common.lipThick(1)],
    build: ({ art, v }) =>
      new Parts()
        .solid('ถ้วยตัวอักษร', 'print', merge([extrude(art, v.back, 0), extrude(ring(art, v.wall), v.depth, v.back)]), -0.6)
        .slab('ฝาหน้าโปร่งแสง', 'opalprint', offset(art, -v.wall - v.gap), v.front, v.back + v.depth - v.front, 1)
        .slab('ไฟเส้นจิ๋ว', 'led', band(art, v.wall + 1.5, 3), 1.5, v.back, -0.2)
        .seat(v.seatLip, 'บ่ารับฝาหน้า', art, v.wall, v.lip, v.lipT, v.back + v.depth - v.front, v.back + 1.5)
        .done(),
  },
  {
    id: 'mini-solid-two-colour',
    code: 'B02',
    group: 'mini',
    name: 'อักษรจิ๋วพิมพ์ทั้งตัวสองสี',
    blurb: 'ตัวอักษรทึบ หน้าบนเปลี่ยนเส้นใยเป็นสีโปร่งแสงตอนพิมพ์ ไม่ต้องประกอบ',
    make: 'print',
    usesArt: true,
    params: [common.depth(15), p('face', 'ความหนาชั้นหน้า', 1.2, 0.4, 5, 0.2)],
    build: ({ art, v }) =>
      new Parts()
        .slab('ตัวอักษร', 'print', art, v.depth - v.face, 0)
        .slab('ชั้นหน้าสีโปร่งแสง', 'opalprint', art, v.face, v.depth - v.face, 0.6)
        .done(),
  },
  {
    id: 'classic-solid',
    code: 'B03',
    group: 'mini',
    name: 'อักษรตันคลาสสิก',
    blurb: 'ตัวอักษรตันเรียบพิมพ์ 3D ใช้ติดผนังหรือตั้งโชว์',
    make: 'print',
    usesArt: true,
    params: [common.depth(20)],
    build: ({ art, v }) => new Parts().slab('ตัวอักษรตัน', 'accent', art, v.depth, 0).done(),
  },
]

export const DESK_STYLES: StyleDef[] = [
  {
    id: 'desk-block',
    code: 'C01',
    group: 'desk',
    name: 'ป้ายชื่อตั้งโต๊ะบนแท่น',
    blurb: 'ตัวอักษรตั้งบนแท่นสี่เหลี่ยมขอบมน พิมพ์ชิ้นเดียว วางหน้าเคาน์เตอร์หรือโต๊ะทำงาน',
    make: 'print',
    usesArt: true,
    params: [common.depth(8), p('baseH', 'ความสูงแท่น', 14, 4, 60), p('baseD', 'ความลึกแท่น', 40, 10, 120), p('margin', 'แท่นยื่นพ้นตัวอักษร', 10, 0, 60)],
    build: ({ art, box, v }) => {
      const base = roundRect(0, box.minY - v.baseH / 2 + 1, box.w + v.margin * 2, v.baseH, 3)
      return new Parts()
        .slab('แท่นฐาน', 'print', base, v.baseD, -v.baseD / 2 + v.depth / 2, -0.3)
        .slab('ตัวอักษร', 'accent', art, v.depth, 0, 0.3)
        .done()
    },
  },
  {
    id: 'desk-curl',
    code: 'C02',
    group: 'desk',
    name: 'ป้ายแผ่นม้วนโค้งตั้งโต๊ะ',
    blurb: 'แผ่นป้ายโค้งไปด้านหลังเป็นขาตั้งในตัว ตัวอักษรนูนบนแผ่น พิมพ์นอนแล้วตั้งได้ทันที',
    make: 'print',
    usesArt: true,
    params: [p('sheet', 'ความหนาแผ่น', 3, 1.2, 8, 0.2), p('raise', 'ตัวอักษรนูน', 3, 0.6, 15), p('radius', 'รัศมีความโค้ง', 120, 40, 600, 5), p('margin', 'ขอบแผ่น', 12, 2, 50)],
    build: ({ art, box, v }) => {
      const plate = roundRect(0, 0, box.w + v.margin * 2, box.h + v.margin * 2, 8)
      const step = Math.max(2, (box.h + v.margin * 2) / 60)
      const sheet = bend(slats(plate, v.sheet, 0, 'y', step), -v.radius, 'y')
      const letters = bend(slats(art, v.raise, v.sheet, 'y', step), -v.radius, 'y')
      return new Parts().solid('แผ่นโค้ง', 'print', sheet, -0.3).solid('ตัวอักษรนูน', 'accent', letters, 0.5).done()
    },
  },
  {
    id: 'desk-curl-wide',
    code: 'C03',
    group: 'desk',
    name: 'ป้ายแผ่นโค้งรอบตัวตั้งโต๊ะ',
    blurb: 'แผ่นป้ายโค้งไปทางด้านข้างจนตั้งได้เอง เห็นข้อความรอบมุมกว้าง เหมาะกับป้ายต้อนรับ',
    make: 'print',
    usesArt: true,
    params: [p('sheet', 'ความหนาแผ่น', 3, 1.2, 8, 0.2), p('raise', 'ตัวอักษรนูน', 3, 0.6, 15), p('radius', 'รัศมีความโค้ง', 260, 60, 1200, 5), p('margin', 'ขอบแผ่น', 12, 2, 50)],
    build: ({ art, box, v }) => {
      const plate = roundRect(0, 0, box.w + v.margin * 2, box.h + v.margin * 2, 8)
      const step = Math.max(2, (box.w + v.margin * 2) / 80)
      const sheet = bend(slats(plate, v.sheet, 0, 'x', step), -v.radius, 'x')
      const letters = bend(slats(art, v.raise, v.sheet, 'x', step), -v.radius, 'x')
      return new Parts().solid('แผ่นโค้ง', 'print', sheet, -0.3).solid('ตัวอักษรนูน', 'accent', letters, 0.5).done()
    },
  },
]

export const BOX_STYLES: StyleDef[] = [
  {
    id: 'die-cut-box',
    code: 'D01',
    group: 'box',
    name: 'ตู้ไฟตัดตามรูปทรง',
    blurb: 'กล่องไฟที่ขอบตามรูปข้อความหรือโลโก้ หน้าโปร่งแสง ตัวอักษรนูนสีเข้มติดบนหน้า',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(60), p('margin', 'ขอบเผื่อรอบรูป', 15, 4, 80), common.wall(2), common.front(3), common.back(3), p('raise', 'ตัวอักษรนูนบนหน้า', 2, 0.6, 10), common.seatLip(), common.lipWidth(4), common.lipThick(), ...common.rear()],
    build: ({ art, v }) => {
      const shape = offset(union(art, offset(art, v.margin)), 0)
      const z = v.back + v.depth
      return new Parts()
        .back('แผ่นหลัง', 'plaswood', shape, v.back, 0, -1, offset(shape, -v.wall))
        .slab('ผนังกล่อง', 'print', ring(shape, v.wall), v.depth, v.back)
        .slab('หน้าโปร่งแสง', 'opal', offset(shape, -v.wall - 0.2), v.front, z - v.front, 0.6)
        .slab('ตัวอักษรบนหน้า', 'accent', art, v.raise, z, 1.2)
        .slab('แผงไฟ LED', 'led', band(shape, v.wall + 6, 6), 2, v.back, -0.4)
        .seat(v.seatLip, 'บ่ารับหน้า', shape, v.wall, v.lip, v.lipT, z - v.front, v.back)
        .done()
    },
  },
  {
    id: 'inlay-colour-box',
    code: 'D02',
    group: 'box',
    name: 'กล่องไฟหน้าฝังสี',
    blurb: 'กล่องไฟสี่เหลี่ยม หน้าพิมพ์สองสีเป็นแผ่นเดียว ตัวอักษรฝังเรียบเสมอหน้า ไม่มีรอยต่อ',
    make: 'print',
    usesArt: true,
    params: [common.depth(50), p('margin', 'ขอบรอบข้อความ', 25, 5, 120), p('radius', 'มุมโค้ง', 10, 0, 60), common.wall(2), common.front(2.4), common.seatLip(), common.lipWidth(4), common.lipThick(), ...common.rear()],
    build: ({ art, box, v }) => {
      const outline = roundRect(0, 0, box.w + v.margin * 2, box.h + v.margin * 2, v.radius)
      const face = offset(outline, -v.wall - 0.2)
      const z = 3 + v.depth
      return new Parts()
        .back('แผ่นหลัง', 'print', outline, 3, 0, -1, offset(outline, -v.wall))
        .slab('ผนังกล่อง', 'print', ring(outline, v.wall), v.depth, 3)
        .slab('หน้าพื้น', 'opalprint', diff(face, art), v.front, z - v.front, 0.8)
        .slab('ตัวอักษรฝังหน้า', 'accent', intersect(art, face), v.front, z - v.front, 1.2)
        .slab('แผงไฟ LED', 'led', band(outline, v.wall + 8, 8), 2, 3, -0.4)
        .seat(v.seatLip, 'บ่ารับหน้า', outline, v.wall, v.lip, v.lipT, z - v.front, 3)
        .done()
    },
  },
  {
    id: 'double-sided-box',
    code: 'D03',
    group: 'box',
    name: 'กล่องไฟสองหน้าแขวนยื่น',
    blurb: 'กล่องไฟอ่านได้ทั้งสองด้าน ติดแขนยื่นออกจากผนังให้เห็นจากทางเดินทั้งสองทิศ',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(80), p('margin', 'ขอบรอบข้อความ', 25, 5, 120), common.wall(2), common.front(3), p('raise', 'ตัวอักษรนูน', 2, 0.6, 10), common.seatLip(), common.lipWidth(4), common.lipThick()],
    build: ({ art, box, v }) => {
      const w = box.w + v.margin * 2
      const h = box.h + v.margin * 2
      const outline = roundRect(0, 0, w, h, 12)
      const face = offset(outline, -v.wall - 0.2)
      const hooks = union(ring(circle(-w / 4, h / 2 + 7, 9, 24), 4), ring(circle(w / 4, h / 2 + 7, 9, 24), 4))
      return new Parts()
        .slab('หน้าหลังโปร่งแสง', 'opal', face, v.front, 0, -1)
        .slab('ตัวอักษรด้านหลัง', 'accent', mirrorX(art), v.raise, -v.raise, -1.4)
        .slab('ผนังกล่อง', 'print', ring(outline, v.wall), v.depth, 0)
        .slab('หูแขวน', 'metal', hooks, 6, v.depth / 2 - 3)
        .slab('หน้าหน้าโปร่งแสง', 'opal', face, v.front, v.depth - v.front, 1)
        .slab('ตัวอักษรด้านหน้า', 'accent', art, v.raise, v.depth, 1.4)
        .slab('แผงไฟกลาง', 'led', band(outline, v.wall + 10, 6), 4, v.depth / 2 - 2, 0)
        .seat(v.seatLip, 'บ่ารับหน้าหน้า', outline, v.wall, v.lip, v.lipT, v.depth - v.front, v.depth / 2 + 3)
        // The back face is mirrored: its ledge sits just inside it, from v.front up.
        .seat(v.seatLip, 'บ่ารับหน้าหลัง', outline, v.wall, v.lip, v.lipT, v.front + v.lipT, v.front)
        .done()
    },
  },
  {
    id: 'letter-tray',
    code: 'D04',
    group: 'box',
    name: 'ถาดช่องรูปตัวอักษร',
    blurb: 'ถาดที่มีหลุมเป็นรูปตัวอักษร ใช้ใส่ของจุกจิก เป็นแม่พิมพ์ช็อกโกแลตหรือสบู่ หรือจัดวางของโชว์',
    make: 'print',
    usesArt: true,
    params: [p('floor', 'ความหนาพื้น', 2, 0.8, 10, 0.2), p('pocket', 'ความลึกหลุม', 15, 2, 80), p('margin', 'ขอบถาด', 10, 3, 60), p('radius', 'มุมโค้ง', 8, 0, 40)],
    build: ({ art, box, v }) => {
      const outline = roundRect(0, 0, box.w + v.margin * 2, box.h + v.margin * 2, v.radius)
      return new Parts()
        .slab('พื้นถาด', 'print', outline, v.floor, 0, -0.5)
        .slab('ขอบและผนังหลุม', 'print', diff(outline, art), v.pocket, v.floor, 0.4)
        .done()
    },
  },
  {
    id: 'bottle-box',
    code: 'D05',
    group: 'box',
    name: 'กล่องไฟรูปขวด',
    blurb: 'กล่องไฟทรงขวด ข้อความอยู่ตรงฉลาก ใช้กับร้านเครื่องดื่ม คาเฟ่ หรือร้านคราฟต์เบียร์',
    make: 'mixed',
    usesArt: true,
    params: [p('bottleW', 'ความกว้างขวด', 240, 80, 900, 5), common.depth(50), common.wall(2), common.front(3), p('raise', 'ตัวอักษรนูน', 2, 0.6, 10), common.seatLip(), common.lipWidth(4), common.lipThick(), ...common.rear()],
    build: ({ art, box, v }) => {
      const h = v.bottleW * 2.6
      const outline = bottleOutline(v.bottleW, h)
      const fit = Math.min(1, (v.bottleW * 0.78) / Math.max(box.w, 1), (h * 0.3) / Math.max(box.h, 1))
      const label = art.map((poly) => poly.map(([x, y]) => [x * fit, y * fit - h * 0.12] as [number, number]))
      const z = 3 + v.depth
      return new Parts()
        .back('แผ่นหลัง', 'plaswood', outline, 3, 0, -1, offset(outline, -v.wall))
        .slab('ผนังทรงขวด', 'print', ring(outline, v.wall), v.depth, 3)
        .slab('หน้าโปร่งแสง', 'opal', offset(outline, -v.wall - 0.2), v.front, z - v.front, 0.6)
        .slab('ข้อความบนฉลาก', 'accent', label, v.raise, z, 1.2)
        .slab('แผงไฟ LED', 'led', band(outline, v.wall + 10, 6), 2, 3, -0.4)
        .seat(v.seatLip, 'บ่ารับหน้า', outline, v.wall, v.lip, v.lipT, z - v.front, 3)
        .done()
    },
  },
]

export const DECO_STYLES: StyleDef[] = [
  {
    id: 'layered-relief',
    code: 'E01',
    group: 'deco',
    name: 'ภาพนูนหลายชั้นหลายสี',
    blurb: 'แผ่นพื้น เส้นขอบ และตัวอักษรนูนซ้อนกันสามชั้น แต่ละชั้นสีต่างกัน งานแขวนผนังตกแต่ง',
    make: 'print',
    usesArt: true,
    params: [p('base', 'ความหนาพื้น', 3, 1, 10), p('outline', 'ความกว้างเส้นขอบ', 5, 1, 30), p('step', 'ความสูงแต่ละชั้น', 2, 0.6, 10), p('margin', 'ขอบแผ่นพื้น', 15, 0, 80)],
    build: ({ art, box, v }) => {
      const plate = roundRect(0, 0, box.w + v.margin * 2 + v.outline * 2, box.h + v.margin * 2 + v.outline * 2, 10)
      return new Parts()
        .slab('แผ่นพื้น', 'print', plate, v.base, 0, -0.6)
        .slab('ชั้นเส้นขอบ', 'opalprint', offset(art, v.outline), v.step, v.base, 0)
        .slab('ชั้นตัวอักษร', 'accent', art, v.step, v.base + v.step, 0.8)
        .done()
    },
  },
  {
    id: 'lattice-letter',
    code: 'E02',
    group: 'deco',
    name: 'อักษรฉลุลาย',
    blurb: 'ตัวอักษรตันที่ฉลุลายข้าวหลามตัดข้างใน เหลือขอบรอบตัว แสงลอดเป็นลายสวยเมื่อมีไฟหลัง',
    make: 'print',
    usesArt: true,
    params: [common.depth(10), p('border', 'ความกว้างขอบ', 4, 1.5, 20), p('cell', 'ขนาดช่องลาย', 12, 4, 60), p('bar', 'ความหนาเส้นลาย', 2.4, 0.8, 10, 0.2)],
    build: ({ art, box, v }) => {
      const cells: Region = []
      // Increase pitch on large signs rather than generating millions of cells.
      const s = Math.max(v.cell, Math.sqrt(box.w * box.h / 1200))
      for (let y = box.minY - s; y < box.maxY + s; y += s) {
        for (let x = box.minX - s; x < box.maxX + s; x += s) {
          const r = s / 2 - v.bar / 1.414
          if (r <= 0.3) continue
          cells.push([[x, y - r], [x + r, y], [x, y + r], [x - r, y]])
        }
      }
      const pattern = intersect(offset(art, -v.border), cells)
      return new Parts().slab('อักษรฉลุ', 'accent', diff(art, pattern), v.depth, 0).done()
    },
  },
  {
    id: 'curved-surface',
    code: 'E03',
    group: 'deco',
    name: 'อักษรโค้งตามเสา',
    blurb: 'หลังตัวอักษรโค้งรับผิวเสากลมหรือผนังโค้ง ติดแนบสนิทไม่มีช่องว่าง ข้อความพันรอบเสาได้ไม่เกินสามในสี่รอบ',
    make: 'print',
    usesArt: true,
    params: [common.depth(15), p('radius', 'รัศมีเสา', 150, 30, 2000, 5)],
    build: ({ art, box, v }) => {
      // Text longer than the column's circumference would wrap onto itself.
      // Cap the wrap at three quarters of a turn by widening the radius.
      const minRadius = box.w / (1.5 * Math.PI)
      const radius = Math.max(v.radius, minRadius)
      const g = bend(slats(art, v.depth, 0, 'x', Math.max(2, box.w / 120)), radius, 'x')
      const parts = new Parts().solid('อักษรโค้ง', 'accent', g).done()
      if (radius > v.radius) {
        parts[0].warning = `ข้อความยาวเกินกว่าจะพันรอบเสารัศมี ${v.radius} มม. ระบบใช้รัศมี ${Math.ceil(radius)} มม. แทน ลดความสูงตัวอักษรหรือเพิ่มรัศมีเสา`
      }
      return parts
    },
  },
  {
    id: 'inside-corner',
    code: 'E04',
    group: 'deco',
    name: 'อักษรหลังเข้ามุมใน',
    blurb: 'หลังตัวอักษรเป็นรูปตัววีรับมุมผนังด้านใน หน้าตัวอักษรเรียบเป็นแนวเดียว',
    make: 'print',
    usesArt: true,
    params: [common.depth(20), p('angle', 'มุมผนังเอียงเข้า', 45, 5, 80, 1, 'องศา')],
    build: ({ art, box, v }) => {
      const t = Math.tan((v.angle * Math.PI) / 180)
      const half = Math.max(box.maxX, -box.minX)
      const { left, right } = halves(art, v.depth, 0)
      const shift = (x: number) => -(half - Math.abs(x)) * t
      return new Parts()
        .solid('อักษรหลังวี', 'accent', merge([reshapeBack(left, 0, shift), reshapeBack(right, 0, shift)]))
        .done()
    },
  },
  {
    id: 'outside-corner',
    code: 'E05',
    group: 'deco',
    name: 'อักษรพับรอบมุมนอก',
    blurb: 'ข้อความพับรอบมุมเสาหรือมุมตึก อ่านได้จากสองด้าน ครึ่งขวาหักตามมุมที่ตั้งไว้',
    make: 'print',
    usesArt: true,
    params: [common.depth(15), p('angle', 'มุมพับ', 90, 10, 150, 1, 'องศา'), p('shift', 'ตำแหน่งมุมพับ', 0, -500, 500, 1)],
    build: ({ art, v }) => {
      const moved = art.map((poly) => poly.map(([x, y]) => [x - v.shift, y] as [number, number]))
      const { left, right } = halves(moved, v.depth, 0)
      right.applyMatrix4(new THREE.Matrix4().makeRotationY((-v.angle * Math.PI) / 180))
      const g = merge([left, right])
      g.translate(v.shift, 0, 0)
      return new Parts().solid('อักษรพับมุม', 'accent', g).done()
    },
  },
  {
    id: 'standoff-letters',
    code: 'E06',
    group: 'deco',
    name: 'อักษรลอยติดหมุด',
    blurb: 'ตัวอักษรตันลอยห่างจากผนัง มีหมุดเกลียวด้านหลังตามจุดที่เหมาะกับแต่ละตัว',
    make: 'print',
    usesArt: true,
    params: [common.depth(10), p('stand', 'ระยะลอย', 15, 3, 60), p('pin', 'ขนาดหมุด', 6, 3, 14), p('pitch', 'ระยะห่างหมุด', 90, 30, 300, 5)],
    build: ({ art, v }) => {
      const pins = holeGrid(art, v.pitch, v.pin / 2 + 2, 40)
      const pinGeo = merge(pins.map(([x, y]) => extrude(circle(x, y, v.pin / 2, 20), v.stand + 2, -v.stand)))
      return new Parts().slab('ตัวอักษร', 'accent', art, v.depth, 0, 0.5).solid('หมุดลอย', 'metal', pinGeo, -0.6).done()
    },
  },
]

export const GIFT_STYLES: StyleDef[] = [
  {
    id: 'keychain-outline',
    code: 'F01',
    group: 'gift',
    name: 'พวงกุญแจตัวอักษรมีขอบ',
    blurb: 'ตัวอักษรนูนบนพื้นที่ขยายตามรูปข้อความ มีห่วงร้อยกุญแจ พิมพ์สองสีชิ้นเดียว',
    make: 'print',
    usesArt: true,
    params: [p('base', 'ความหนาพื้น', 2.4, 1, 6, 0.2), p('raise', 'ตัวอักษรนูน', 1.6, 0.4, 6, 0.2), p('outline', 'ขอบรอบตัวอักษร', 3, 1, 12), p('hole', 'ขนาดรูห่วง', 4, 2, 10)],
    build: ({ art, box, v }) => {
      const loopX = box.minX - v.outline - v.hole / 2 - 1
      const loop = circle(loopX, box.cy, v.hole / 2 + 2.6, 32)
      const base = diff(union(offset(art, v.outline), loop), circle(loopX, box.cy, v.hole / 2, 24))
      return new Parts().slab('พื้นพวงกุญแจ', 'print', base, v.base, 0, -0.4).slab('ตัวอักษรนูน', 'accent', art, v.raise, v.base, 0.6).done()
    },
  },
  {
    id: 'keychain-stencil',
    code: 'F02',
    group: 'gift',
    name: 'พวงกุญแจป้ายฉลุชื่อ',
    blurb: 'ป้ายสี่เหลี่ยมขอบมนฉลุตัวอักษรทะลุ ใส่สีพื้นหลังด้วยการพิมพ์ชั้นล่างอีกสี',
    make: 'print',
    usesArt: true,
    params: [p('thick', 'ความหนาป้าย', 3, 1.2, 8, 0.2), p('backing', 'ชั้นรองสี', 0.8, 0, 3, 0.2), p('margin', 'ขอบรอบข้อความ', 5, 2, 20), p('hole', 'ขนาดรูห่วง', 4, 2, 10)],
    build: ({ art, box, v }) => {
      const w = box.w + v.margin * 2 + v.hole + 6
      const tag = roundRect(-(v.hole + 6) / 2, 0, w, box.h + v.margin * 2, 6)
      const holeAt = box.minX - v.margin - v.hole / 2 - 2
      const plate = diff(tag, circle(holeAt, 0, v.hole / 2, 24))
      const parts = new Parts()
      parts.slab('ชั้นรองสี', 'accent', plate, v.backing, 0, -0.6)
      return parts.slab('ป้ายฉลุ', 'print', diff(plate, art), v.thick, v.backing, 0.4).done()
    },
  },
  {
    id: 'keycap',
    code: 'F03',
    group: 'gift',
    name: 'ปุ่มคีย์บอร์ดตัวอักษร',
    blurb: 'ปุ่มคีย์แคปสวมแกนสวิตช์มาตรฐานรูปกากบาท ตัวอักษรนูนบนหน้าปุ่ม',
    make: 'print',
    usesArt: true,
    params: [p('size', 'ขนาดปุ่ม', 18, 14, 40, 0.5), p('height', 'ความสูงปุ่ม', 9, 5, 16), p('raise', 'ตัวอักษรนูน', 0.8, 0.2, 3, 0.1)],
    build: ({ art, box, v }) => {
      const k = (v.size * 0.6) / Math.max(box.w, box.h, 1)
      const glyph = art.map((poly) => poly.map(([x, y]) => [x * k, y * k] as [number, number]))
      const cap = roundRect(0, 0, v.size, v.size, 2)
      const shell = merge([
        chamfer(cap, v.height - 1.2, 2.6, 0, 14),
        extrude(offset(cap, -2.6), 1.2, v.height - 1.2),
      ])
      const stem = diff(circle(0, 0, 2.75, 32), union(rect(0, 0, 4.1, 1.35), rect(0, 0, 1.25, 4.1)))
      return new Parts()
        .solid('ตัวปุ่ม', 'print', shell)
        .slab('แกนสวมสวิตช์', 'print', stem, 4, -4, -1)
        .slab('ตัวอักษรบนปุ่ม', 'accent', glyph, v.raise, v.height, 1)
        .done()
    },
  },
  {
    id: 'photo-frame',
    code: 'F04',
    group: 'gift',
    name: 'กรอบรูปมีชื่อ',
    blurb: 'กรอบรูปตั้งโต๊ะ ชื่อนูนอยู่ขอบล่าง มีร่องเสียบรูปและขาตั้งด้านหลัง',
    make: 'print',
    usesArt: true,
    params: [p('photoW', 'ความกว้างรูป', 102, 50, 300, 1), p('photoH', 'ความสูงรูป', 152, 50, 300, 1), p('border', 'ความกว้างกรอบ', 14, 6, 60), p('thick', 'ความหนากรอบ', 6, 3, 15)],
    build: ({ art, box, v }) => {
      const textH = Math.max(box.h * Math.min(1, (v.photoW + v.border) / Math.max(box.w, 1)), 0) + 6
      const w = v.photoW + v.border * 2
      const h = v.photoH + v.border * 2 + textH
      const outer = roundRect(0, 0, w, h, 6)
      const window = rect(0, textH / 2, v.photoW - 6, v.photoH - 6)
      const k = Math.min(1, (v.photoW + v.border) / Math.max(box.w, 1))
      const name = art.map((poly) => poly.map(([x, y]) => [x * k, y * k - h / 2 + v.border / 2 + textH / 2] as [number, number]))
      const footY = h * 0.15 - (h * 0.65) / Math.cos(Math.PI / 6)
      const leg = stroke([[0, footY], [0, h * 0.15]], 10, false, true)
      const stand = extrude(leg, 3, -3)
      stand.translate(0, -h * 0.15, 0)
      stand.rotateX(Math.PI / 6)
      stand.translate(0, h * 0.15, 0)
      return new Parts()
        .slab('แผ่นหลังมีร่อง', 'opalprint',diff(outer, rect(0, h / 2 - 2, v.photoW + 1, 6)), 2, 0, -0.8)
        .slab('กรอบหน้า', 'print', diff(outer, window), v.thick, 2, 0)
        .slab('ชื่อนูน', 'accent', name, 2, 2 + v.thick, 0.8)
        .solid('ขาตั้ง', 'print', stand, -1.6)
        .done()
    },
  },
  {
    id: 'stamp-handle',
    code: 'F05',
    group: 'gift',
    name: 'ตรายางพร้อมด้ามจับ',
    blurb: 'ด้ามตรายางกลึงกลม แผ่นฐาน และหน้ายางตัวอักษรกลับซ้ายขวาพร้อมปั๊ม',
    make: 'print',
    usesArt: true,
    params: [p('margin', 'ขอบแผ่นฐาน', 4, 1, 20), p('rubber', 'ความสูงหน้ายาง', 2, 0.8, 5, 0.2), p('handle', 'ความสูงด้าม', 60, 30, 120, 1)],
    build: ({ art, box, v }) => {
      const plate = roundRect(0, 0, box.w + v.margin * 2, box.h + v.margin * 2, 3)
      const r = Math.min(14, Math.min(box.w, box.h) / 2 + v.margin)
      const profile: [number, number][] = [
        [0, 0],
        [r, 0],
        [r * 0.55, v.handle * 0.35],
        [r * 0.5, v.handle * 0.6],
        [r * 0.95, v.handle * 0.85],
        [r * 0.8, v.handle],
        [0, v.handle],
      ]
      const handle = revolve(profile, 48)
      handle.translate(0, 0, 8)
      return new Parts()
        .slab('หน้ายางกลับด้าน', 'rubber', mirrorX(art), v.rubber, -v.rubber, -1)
        .slab('แผ่นฐานตรา', 'print', plate, 8, 0)
        .solid('ด้ามจับ', 'accent', handle, 0.8)
        .done()
    },
  },
  {
    id: 'emboss-pair',
    code: 'F06',
    group: 'gift',
    name: 'แม่พิมพ์ปั๊มนูนกระดาษ',
    blurb: 'แม่พิมพ์ตัวผู้และตัวเมียคู่กัน หนีบกระดาษแล้วกดให้ข้อความนูนบนการ์ดหรือซองจดหมาย',
    make: 'print',
    usesArt: true,
    params: [p('plate', 'ความหนาแผ่น', 4, 2, 10), p('relief', 'ความสูงลาย', 1, 0.4, 3, 0.1), p('paper', 'เผื่อความหนากระดาษ', 0.3, 0.1, 1, 0.05), p('margin', 'ขอบแผ่น', 6, 2, 30)],
    build: ({ art, box, v }) => {
      const plate = roundRect(0, 0, box.w + v.margin * 2, box.h + v.margin * 2, 4)
      return new Parts()
        .slab('แผ่นตัวเมีย (ล่าง)', 'print', plate, v.plate, -v.plate - v.relief - 1, -1.4)
        .slab('ร่องตัวเมีย', 'print', diff(plate, offset(art, v.paper)), v.relief, -v.relief - 1, -1.4)
        .slab('ลายตัวผู้', 'accent', art, v.relief, 1, 1)
        .slab('แผ่นตัวผู้ (บน)', 'print', plate, v.plate, 1 + v.relief, 1)
        .done()
    },
  },
]
