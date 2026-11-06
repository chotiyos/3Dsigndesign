import { band, bounds, circle, diff, offset, ring, union, type Region } from '../geo2d'
import { chamfer, extrude, merge, revolve } from '../solid'
import { common, p, Parts } from './kit'
import type { StyleDef } from './types'

/** Centres of a hexagonal grid of circles that fit fully inside `region`. */
export function holeGrid(region: Region, pitch: number, radius: number, limit = 600) {
  const safe = offset(region, -radius - 0.6)
  const b = bounds(safe)
  const contours = safe.map((poly) => ({ poly, box: bounds([poly]) }))
  const contains = (x: number, y: number) => {
    let inside = false
    for (const { poly, box } of contours) {
      if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]
        const [xj, yj] = poly[j]
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      }
    }
    return inside
  }
  const centres: [number, number][] = []
  // Bound candidate probes too: sparse artwork may never fill the output limit.
  pitch = Math.max(pitch, 0.1, b.w / 4000, b.h / 4000, Math.sqrt(Math.max(0, b.w * b.h) / 4000))
  const rowH = pitch * 0.866
  for (let row = 0, y = b.minY; y <= b.maxY && centres.length < limit; row++, y += rowH) {
    for (let x = b.minX + (row % 2 ? pitch / 2 : 0); x <= b.maxX && centres.length < limit; x += pitch) {
      if (contains(x, y)) centres.push([x, y])
    }
  }
  return centres
}

const top = (v: Record<string, number>) => v.back + v.depth

export const LIT_STYLES: StyleDef[] = [
  {
    id: 'front-lit-lip',
    code: 'A01',
    group: 'lit',
    name: 'ไฟหน้า มีบ่ารับอะคริลิก',
    blurb: 'ผนังพิมพ์ 3D มีบ่าด้านในรับแผ่นอะคริลิกหน้า หลังปิดด้วยแผ่นเรียบ งานป้ายหน้าร้านแบบมาตรฐาน',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(), common.wall(), common.seatLip(1), common.lip(), common.lipThick(), common.front(), common.back(), common.gap()],
    build: ({ art, v }) => {
      const z = top(v)
      return new Parts()
        .slab('แผ่นหลัง', 'plaswood', art, v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), v.depth, v.back)
        .seat(v.seatLip, 'บ่ารับอะคริลิก', art, v.wall, v.lip, v.lipT, z - v.front, v.back)
        .slab('อะคริลิกหน้า', 'opal', offset(art, -v.wall - v.gap), v.front, z - v.front, 1)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + v.lip + 1, 5), 2, v.back, -0.4)
        .done()
    },
  },
  {
    id: 'full-print-caps',
    code: 'A02',
    group: 'lit',
    name: 'พิมพ์ทั้งตัว ฝาหน้า-หลังสวมใน',
    blurb: 'ทุกชิ้นพิมพ์ 3D ฝาหน้าโปร่งแสงและฝาหลังสวมเข้าด้านในผนังพอดี ไม่ต้องตัดอะคริลิก',
    make: 'print',
    usesArt: true,
    params: [common.depth(), common.wall(), common.front(2), common.back(2), common.gap(), common.seatLip(), common.lipWidth(), common.lipThick()],
    build: ({ art, v }) => {
      const inner = offset(art, -v.wall - v.gap)
      return new Parts()
        .slab('ฝาหลังสวมใน', 'print', inner, v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), v.depth + v.back, 0)
        .slab('ฝาหน้าโปร่งแสง', 'opalprint', inner, v.front, top(v) - v.front, 1)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + 2, 5), 2, v.back, -0.4)
        .seat(v.seatLip, 'บ่ารับฝาหน้า', art, v.wall, v.lip, v.lipT, top(v) - v.front, v.back)
        .done()
    },
  },
  {
    id: 'rimless-face-pad',
    code: 'A03',
    group: 'lit',
    name: 'หน้าอะคริลิกไร้ขอบ มีแผ่นรองหลัง',
    blurb: 'อะคริลิกหน้าเต็มตัวอักษร วางบนผนังที่หดเข้า 1 มม. มองจากหน้าไม่เห็นขอบ หลังมีแผ่นรองเผื่อขอบ',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(), common.wall(), common.front(5), common.back(), p('pad', 'แผ่นรองล้นขอบ', 6, 0, 30)],
    build: ({ art, v }) => {
      const z = top(v)
      return new Parts()
        .slab('แผ่นรองหลัง', 'plaswood', offset(art, v.pad), v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(offset(art, -1), v.wall), v.depth - v.front, v.back)
        .slab('อะคริลิกหน้าไร้ขอบ', 'opal', art, v.front, z - v.front, 1)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + 3, 5), 2, v.back, -0.4)
        .done()
    },
  },
  {
    id: 'thin-rim-plaswood',
    code: 'A04',
    group: 'lit',
    name: 'หน้าอะคริลิกขอบบาง หลังพลาสวูด',
    blurb: 'ขอบผนังยื่นเลยหน้าอะคริลิกเล็กน้อยเป็นเส้นบาง หลังเป็นพลาสวูดตัดด้วยเครื่อง CNC',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(), p('rim', 'ความหนาขอบ', 1.2, 0.8, 4, 0.1), p('rise', 'ขอบยื่นเลยหน้า', 1.5, 0, 6), common.seatLip(1), common.lipWidth(3), common.lipThick(1.5), common.front(), common.back(5), common.gap()],
    build: ({ art, v }) => {
      const z = top(v)
      return new Parts()
        .slab('หลังพลาสวูด', 'plaswood', art, v.back, 0, -1)
        .slab('ผนังขอบบาง', 'print', ring(art, v.rim), v.depth + v.rise, v.back)
        .seat(v.seatLip, 'บ่ารับอะคริลิก', art, v.rim, v.lip, v.lipT, z - v.front, v.back)
        .slab('อะคริลิกหน้า', 'opal', offset(art, -v.rim - v.gap), v.front, z - v.front, 1)
        .slab('แถบไฟ LED', 'led', band(art, v.rim + 4, 5), 2, v.back, -0.4)
        .done()
    },
  },
  {
    id: 'two-tier-light',
    code: 'A05',
    group: 'lit',
    name: 'ไฟสองชั้น หน้าและรอบข้าง',
    blurb: 'ไฟออกทั้งหน้าและแถบรอบตัวอักษร ผนังกลางเป็นวัสดุโปร่งแสงคั่นระหว่างผนังทึบบนล่าง',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(60), common.wall(), p('glow', 'ความสูงแถบไฟรอบ', 15, 4, 60), common.seatLip(1), common.lipWidth(3), common.lipThick(), common.front(), common.back(), common.gap()],
    build: ({ art, v }) => {
      const z = top(v)
      const glow = Math.min(v.glow, v.depth)
      const lower = (v.depth - glow) / 2
      const wall = ring(art, v.wall)
      return new Parts()
        .slab('แผ่นหลัง', 'print', art, v.back, 0, -1)
        .slab('ผนังล่าง', 'print', wall, lower, v.back)
        .slab('แถบไฟรอบตัว', 'opalprint', wall, glow, v.back + lower, 0.3)
        .slab('ผนังบน', 'print', wall, v.depth - lower - glow, v.back + lower + glow, 0.6)
        .seat(v.seatLip, 'บ่ารับอะคริลิก', art, v.wall, v.lip, v.lipT, z - v.front, v.back, 0.6)
        .slab('อะคริลิกหน้า', 'opal', offset(art, -v.wall - v.gap), v.front, z - v.front, 1.2)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + 4, 5), 2, v.back, -0.4)
        .done()
    },
  },
  {
    id: 'two-tier-full-colour',
    code: 'A06',
    group: 'lit',
    name: 'ไฟสองชั้น หน้าสองสี',
    blurb: 'เหมือนไฟสองชั้น แต่หน้าตัวอักษรแบ่งเป็นขอบสีกับไส้สีอ่อน พิมพ์สองสีเป็นแผ่นเดียว',
    make: 'print',
    usesArt: true,
    params: [common.depth(60), common.wall(), p('glow', 'ความสูงแถบไฟรอบ', 15, 4, 60), p('edge', 'ความกว้างขอบสี', 4, 1, 20), common.seatLip(1), common.lipWidth(3), common.lipThick(), common.front(), common.back(), common.gap()],
    build: ({ art, v }) => {
      const z = top(v)
      const glow = Math.min(v.glow, v.depth)
      const lower = (v.depth - glow) / 2
      const wall = ring(art, v.wall)
      const face = offset(art, -v.wall - v.gap)
      return new Parts()
        .slab('แผ่นหลัง', 'print', art, v.back, 0, -1)
        .slab('ผนังล่าง', 'print', wall, lower, v.back)
        .slab('แถบไฟรอบตัว', 'opalprint', wall, glow, v.back + lower, 0.3)
        .slab('ผนังบน', 'print', wall, v.depth - lower - glow, v.back + lower + glow, 0.6)
        .seat(v.seatLip, 'บ่ารับหน้า', art, v.wall, v.lip, v.lipT, z - v.front, v.back, 0.6)
        .slab('หน้าส่วนขอบสี', 'accent', ring(face, v.edge), v.front, z - v.front, 1.2)
        .slab('หน้าส่วนไส้', 'opalprint', offset(face, -v.edge), v.front, z - v.front, 1.2)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + 4, 5), 2, v.back, -0.4)
        .done()
    },
  },
  {
    id: 'front-back-lips',
    code: 'A07',
    group: 'lit',
    name: 'บ่าหน้าและบ่าหลัง',
    blurb: 'ผนังมีบ่าทั้งสองด้าน หน้าใส่อะคริลิก หลังใส่แผ่นพลาสวูดสวมใน ถอดเปลี่ยนไฟได้ง่าย',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(), common.wall(), common.lip(), common.seatLip(1), common.lipThick(), common.front(), common.back(), common.gap()],
    build: ({ art, v }) => {
      const z = v.depth
      const inner = offset(art, -v.wall - v.gap)
      return new Parts()
        .slab('หลังพลาสวูดสวมใน', 'plaswood', inner, v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), v.depth, 0)
        .slab('บ่าหลัง', 'print', band(art, v.wall - 0.01, v.lip), 2, v.back)
        .seat(v.seatLip, 'บ่าหน้า', art, v.wall, v.lip, v.lipT, z - v.front, v.back + 2)
        .slab('อะคริลิกหน้า', 'opal', inner, v.front, z - v.front, 1)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + v.lip + 1, 5), 2, v.back + 2, -0.2)
        .done()
    },
  },
  {
    id: 'infinity-mirror',
    code: 'A08',
    group: 'lit',
    name: 'อักษรไฟอุโมงค์กระจก',
    blurb: 'กระจกเงาด้านหลังและกระจกสะท้อนแสงด้านหน้าส่องไฟกลับไปมา เห็นเป็นอุโมงค์ไฟลึกเข้าไปในตัวอักษร',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(30), common.wall(2.4), common.lip(5), common.seatLip(1), common.lipThick(), common.front(3), common.back(3), common.gap()],
    build: ({ art, v }) => {
      const z = 2 + v.back + v.depth
      const inner = offset(art, -v.wall - v.gap)
      const lip = band(art, v.wall - 0.01, v.lip)
      return new Parts()
        .slab('แผ่นหลัง', 'print', art, 2, 0, -1.2)
        .slab('กระจกเงาหลัง', 'mirror', inner, v.back, 2, -0.8)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), z, 0)
        .slab('บ่าหลัง', 'print', lip, 2, 2 + v.back)
        .slab('บ่าล็อกไฟ', 'print', lip, 2, 2 + v.back + v.depth / 2)
        .seat(v.seatLip, 'บ่าหน้า', art, v.wall, v.lip, v.lipT, z - v.front, 2 + v.back + v.depth / 2 + 2)
        .slab('กระจกสะท้อนหน้า', 'acrylic', inner, v.front, z - v.front, 1)
        .slab('ไฟ LED รอบใน', 'led', band(art, v.wall + 0.2, 2), 4, 2 + v.back + v.depth / 2 + 2, 0.3)
        .done()
    },
  },
  {
    id: 'back-cover',
    code: 'A09',
    group: 'lit',
    name: 'ฝาหลังสำหรับงานเดิม',
    blurb: 'สร้างเฉพาะฝาหลังให้ตัวอักษรที่มีผนังอยู่แล้ว มีขอบสวมในและรูยึดสกรู',
    make: 'print',
    usesArt: true,
    params: [common.wall(), common.back(2.5), p('plug', 'ความลึกขอบสวม', 5, 2, 20), p('hole', 'ขนาดรูสกรู', 4, 2, 8), common.gap()],
    build: ({ art, v }) => {
      const inner = offset(art, -v.wall - v.gap)
      const holes = union(...holeGrid(inner, 120, v.hole / 2 + 3, 60).map(([x, y]) => circle(x, y, v.hole / 2, 24)))
      return new Parts()
        .slab('ฝาหลัง', 'print', diff(art, holes), v.back, 0)
        .slab('ขอบสวมใน', 'print', ring(inner, 1.6), v.plug, v.back, 0.6)
        .done()
    },
  },
  {
    id: 'neon-channel',
    code: 'A10',
    group: 'lit',
    name: 'รางไฟนีออนในตัวอักษร',
    blurb: 'ตัวอักษรเป็นรางเปิดหน้า วางไฟเส้นนีออนดัดได้ลงในราง เหมาะกับฟอนต์เส้นโค้งมน',
    make: 'print',
    usesArt: true,
    params: [p('depth', 'ความลึกราง', 18, 6, 60, 1), common.wall(1.6), common.back(3), p('tube', 'ความกว้างไฟเส้น', 8, 3, 20)],
    build: ({ art, v }) => {
      return new Parts()
        .slab('พื้นราง', 'print', art, v.back, 0, -0.6)
        .slab('ผนังราง', 'print', ring(art, v.wall), v.depth, v.back)
        .slab('ไฟเส้นนีออน', 'led', band(art, v.wall + 0.6, v.tube), v.tube, v.back, 0.8)
        .done()
    },
  },
  {
    id: 'faceted-5d',
    code: 'A11',
    group: 'lit',
    name: 'อักษรไฟหน้านูนเหลี่ยม',
    blurb: 'หน้าตัวอักษรนูนขึ้นเป็นสันเหลี่ยมรับแสงหลายมุม พิมพ์ด้วยเส้นใยโปร่งแสงทั้งหน้า',
    make: 'print',
    usesArt: true,
    params: [common.depth(40), common.wall(), p('crown', 'ความสูงสันหน้า', 12, 2, 40), p('slope', 'ระยะลาดเข้าใน', 8, 1, 30), common.back(), common.gap(), common.seatLip(), common.lipWidth(), common.lipThick()],
    build: ({ art, v }) => {
      const z = top(v)
      const face = offset(art, -v.wall - v.gap)
      return new Parts()
        .slab('แผ่นหลัง', 'print', art, v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), v.depth, v.back)
        .solid('หน้านูนเหลี่ยม', 'opalprint', chamfer(face, v.crown, v.slope, z - 2, 8), 1)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + 4, 5), 2, v.back, -0.4)
        .seat(v.seatLip, 'บ่ารับหน้านูน', art, v.wall, v.lip, v.lipT, z - 2, v.back)
        .done()
    },
  },
  {
    id: 'front-brow',
    code: 'A12',
    group: 'lit',
    name: 'อักษรมีคิ้วหน้า',
    blurb: 'หน้าตัวอักษรมีปีกยื่นออกนอกผนังเป็นคิ้วรอบตัว ให้เงาและเส้นขอบคมเวลามองเฉียง',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(), common.wall(), p('brow', 'คิ้วยื่นออก', 4, 1, 20), p('browT', 'ความหนาคิ้ว', 3, 1, 10), common.front(), common.back(), common.seatLip(), common.lipWidth(5), common.lipThick()],
    build: ({ art, v }) => {
      const z = top(v)
      return new Parts()
        .slab('แผ่นหลัง', 'print', art, v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), v.depth - v.browT, v.back)
        .slab('คิ้วหน้า', 'accent', ring(offset(art, v.brow), v.brow + v.wall + 3), v.browT, z - v.browT, 0.5)
        .slab('อะคริลิกหน้า', 'opal', offset(art, -v.wall - 3.2), v.front, z - v.front, 1)
        .slab('แถบไฟ LED', 'led', band(art, v.wall + 4, 5), 2, v.back, -0.4)
        // The face sits 3.2 mm inside the wall, so the ledge must reach past it.
        .seat(v.seatLip, 'บ่ารับอะคริลิก', art, v.wall, Math.max(v.lip, 4.2), v.lipT, Math.min(z - v.front, z - v.browT), v.back)
        .done()
    },
  },
  {
    id: 'flex-twin-rail',
    code: 'A13',
    group: 'lit',
    name: 'รางไฟเส้นคู่รอบตัวอักษร',
    blurb: 'ตัวอักษรทึบ ล้อมด้วยรางสองช่องสำหรับไฟเส้นนีออนวิ่งรอบตัว ใช้ทำป้ายไฟวิ่งโชว์',
    make: 'print',
    usesArt: true,
    params: [common.depth(30), p('gap2', 'ระยะห่างจากตัวอักษร', 4, 0, 20), p('rail', 'ความกว้างแต่ละราง', 7, 3, 16), p('railH', 'ความลึกราง', 10, 4, 30), common.wall(1.4)],
    build: ({ art, v }) => {
      const r1 = band(offset(art, v.gap2 + v.rail * 2 + v.wall * 3), 0, v.rail * 2 + v.wall * 3)
      const walls = union(
        band(offset(art, v.gap2 + v.rail * 2 + v.wall * 3), 0, v.wall),
        band(offset(art, v.gap2 + v.rail + v.wall * 2), 0, v.wall),
        band(offset(art, v.gap2 + v.wall), 0, v.wall),
      )
      return new Parts()
        .slab('ตัวอักษรทึบ', 'accent', art, v.depth, 0, 0.6)
        .slab('พื้นราง', 'print', r1, 2, 0, -0.6)
        .slab('ผนังราง', 'print', walls, v.railH, 2, -0.6)
        .slab('ไฟเส้นวงนอก', 'led', band(offset(art, v.gap2 + v.rail * 2 + v.wall * 2), 0.5, v.rail - 1), v.railH - 2, 2, 0)
        .slab('ไฟเส้นวงใน', 'led', band(offset(art, v.gap2 + v.rail + v.wall), 0.5, v.rail - 1), v.railH - 2, 2, 0)
        .done()
    },
  },
  {
    id: 'halo-back-lit',
    code: 'A14',
    group: 'lit',
    name: 'ไฟออกหลัง อักษรโลหะ',
    blurb: 'หน้าและผนังทึบ ไฟส่องย้อนออกด้านหลังให้เป็นวงแสงบนผนังร้าน ติดตั้งลอยด้วยหมุด',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(40), common.wall(2), common.front(3), p('stand', 'ระยะลอยจากผนัง', 25, 5, 80, 1)],
    build: ({ art, v }) => {
      const z = v.stand + v.depth
      const pins = holeGrid(offset(art, -v.wall - 4), 140, 4, 12)
      const pinGeo = merge(pins.map(([x, y]) => extrude(circle(x, y, 3, 20), z - v.front + 2, 0)))
      return new Parts()
        .solid('หมุดยึดผนัง', 'metal', pinGeo, -1)
        .slab('ผนังโลหะ', 'metal', ring(art, v.wall), v.depth - v.front, v.stand)
        .slab('หน้าโลหะทึบ', 'metal', art, v.front, z - v.front, 0.6)
        .slab('แถบไฟ LED ส่องหลัง', 'led', band(art, v.wall + 2, 5), 2, z - v.front - 2, 0.2)
        .done()
    },
  },
  {
    id: 'ping-pong-bulbs',
    code: 'A15',
    group: 'lit',
    name: 'ไฟหลอดกลมเรียงตามตัวอักษร',
    blurb: 'หน้าตัวอักษรเจาะรูเรียงเป็นตาราง ใส่ครอบไฟทรงลูกปิงปอง ได้ป้ายแบบโรงละครย้อนยุค',
    make: 'print',
    usesArt: true,
    params: [common.depth(40), common.wall(), p('bulb', 'ขนาดหลอด', 20, 8, 40, 1), p('pitch', 'ระยะห่างหลอด', 32, 12, 80, 1), common.front(3), common.back(), common.seatLip(), common.lipWidth(), common.lipThick()],
    build: ({ art, v }) => {
      const z = top(v)
      const centres = holeGrid(offset(art, -v.wall), v.pitch, v.bulb / 2, 300)
      const holes = union(...centres.map(([x, y]) => circle(x, y, v.bulb / 2 - 1, 32)))
      const r = v.bulb / 2
      const dome: [number, number][] = [[0, 0]]
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * (Math.PI / 2)
        dome.push([Math.cos(a) * r, Math.sin(a) * r])
      }
      const bulbs = merge(
        centres.map(([x, y]) => {
          const g = revolve(dome, 24)
          g.translate(x, y, z)
          return g
        }),
      )
      return new Parts()
        .slab('แผ่นหลัง', 'print', art, v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), v.depth, v.back)
        .slab('หน้าเจาะรู', 'accent', diff(offset(art, -v.wall - 0.2), holes), v.front, z - v.front, 0.6)
        .solid('ครอบไฟกลม', 'opalprint', bulbs, 1.2)
        .seat(v.seatLip, 'บ่ารับหน้า', art, v.wall, v.lip, v.lipT, z - v.front, v.back)
        .done()
    },
  },
  {
    id: 'perforated-face',
    code: 'A16',
    group: 'lit',
    name: 'อักษรหน้าเจาะรู',
    blurb: 'หน้าทึบเจาะรูเล็กเรียงเป็นลาย แสงลอดออกเป็นจุด ด้านหลังมีแผ่นโปร่งแสงกระจายไฟ',
    make: 'mixed',
    usesArt: true,
    params: [common.depth(), common.wall(), p('dot', 'ขนาดรู', 4, 1.5, 15), p('pitch', 'ระยะห่างรู', 8, 3, 40), common.front(2), common.back(), common.seatLip(), common.lipWidth(), common.lipThick()],
    build: ({ art, v }) => {
      const z = top(v)
      const centres = holeGrid(offset(art, -v.wall), v.pitch, v.dot / 2, 600)
      const holes = union(...centres.map(([x, y]) => circle(x, y, v.dot / 2, 12)))
      return new Parts()
        .slab('แผ่นหลัง', 'print', art, v.back, 0, -1)
        .slab('ผนังตัวอักษร', 'print', ring(art, v.wall), v.depth, v.back)
        .slab('แผ่นกระจายแสง', 'opal', offset(art, -v.wall - 0.2), 1.5, z - v.front - 1.5, 0.5)
        .slab('หน้าเจาะรู', 'accent', diff(offset(art, -v.wall - 0.2), holes), v.front, z - v.front, 1)
        .seat(v.seatLip, 'บ่ารับแผ่นกระจายแสง', art, v.wall, v.lip, v.lipT, z - v.front - 1.5, v.back)
        .done()
    },
  },
]
