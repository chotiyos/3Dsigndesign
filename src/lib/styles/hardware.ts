import * as THREE from 'three'
import { circle, diff, rect, ring, roundRect, stroke, union, type Poly, type Region } from '../geo2d'
import { extrude, hexRadius, merge, radial, revolve, threaded, threadRadius, tube } from '../solid'
import { p, Parts } from './kit'
import type { StyleDef } from './types'

const rotX = (g: THREE.BufferGeometry, a: number) => g.applyMatrix4(new THREE.Matrix4().makeRotationX(a))
const rotY = (g: THREE.BufferGeometry, a: number) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(a))

/** A spur gear outline with trapezoid teeth, close enough to involute for printed parts. */
function gearOutline(teeth: number, module: number, bore: number): Region {
  const pitchR = (teeth * module) / 2
  const outerR = pitchR + module
  const rootR = pitchR - 1.25 * module
  const pts: Poly = []
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const t = (Math.PI * 2) / teeth
    const at = (r: number, f: number): [number, number] => [Math.cos(a + f * t) * r, Math.sin(a + f * t) * r]
    pts.push(at(rootR, 0), at(rootR, 0.12), at(outerR, 0.3), at(outerR, 0.48), at(rootR, 0.66), at(rootR, 0.9))
  }
  return diff([pts], circle(0, 0, bore / 2, 40))
}

/** Stadium-shaped closed curve in the XY plane, used for chain links. */
class Stadium extends THREE.Curve<THREE.Vector3> {
  private len: number
  private r: number
  constructor(len: number, r: number) {
    super()
    this.len = len
    this.r = r
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const straight = this.len - this.r * 2
    const perim = straight * 2 + Math.PI * 2 * this.r
    let d = t * perim
    if (d < straight) return target.set(-straight / 2 + d, -this.r, 0)
    d -= straight
    if (d < Math.PI * this.r) {
      const a = -Math.PI / 2 + d / this.r
      return target.set(straight / 2 + Math.cos(a) * this.r, Math.sin(a) * this.r, 0)
    }
    d -= Math.PI * this.r
    if (d < straight) return target.set(straight / 2 - d, this.r, 0)
    d -= straight
    const a = Math.PI / 2 + d / this.r
    return target.set(-straight / 2 + Math.cos(a) * this.r, Math.sin(a) * this.r, 0)
  }
}

export const HARDWARE_STYLES: StyleDef[] = [
  {
    id: 'bolt-nut',
    code: 'G01',
    group: 'hardware',
    name: 'น็อตและสกรูเกลียว',
    blurb: 'สกรูหัวหกเหลี่ยมกับตัวเมียที่ขันเข้ากันได้ ปรับขนาดเกลียว ระยะเกลียว และความยาว',
    make: 'print',
    usesArt: false,
    params: [p('dia', 'ขนาดเกลียว', 10, 4, 30, 0.5), p('pitch', 'ระยะเกลียว', 2, 0.8, 5, 0.1), p('length', 'ความยาวสกรู', 30, 8, 120, 1), p('fit', 'ระยะเผื่อเกลียว', 0.3, 0.1, 0.8, 0.05)],
    build: ({ v }) => {
      const R = v.dia / 2
      const depth = v.pitch * 0.6
      const flats = v.dia * 1.6
      const head = radial(v.dia * 0.65, 1, 6, () => flats / Math.sqrt(3))
      const bolt = merge([head, threaded(R, R - depth, v.pitch, v.length, v.dia * 0.65)])
      rotX(bolt, -Math.PI / 2)
      bolt.translate(-v.dia * 1.4, -v.length / 2, 0)
      const nut = radial(
        v.dia * 0.8,
        Math.ceil(((v.dia * 0.8) / v.pitch) * 16),
        48,
        (theta) => hexRadius(flats)(theta),
        (theta, z) => threadRadius(R + v.fit, R - depth + v.fit, v.pitch)(theta, z),
      )
      nut.translate(v.dia * 1.6, 0, 0)
      return new Parts().solid('สกรูหัวหกเหลี่ยม', 'print', bolt).solid('น็อตตัวเมีย', 'accent', nut, 0.6).done()
    },
  },
  {
    id: 'spur-gear',
    code: 'G02',
    group: 'hardware',
    name: 'เฟืองตรง',
    blurb: 'เฟืองฟันตรงกำหนดจำนวนฟันและโมดูลได้ มีรูแกนพร้อมร่องลิ่ม ใช้ทดแทนเฟืองของเล่นหรือเครื่องมือ',
    make: 'print',
    usesArt: false,
    params: [p('teeth', 'จำนวนฟัน', 24, 8, 120, 1, 'ฟัน'), p('module', 'โมดูล', 2, 0.5, 6, 0.1), p('thick', 'ความหนาเฟือง', 8, 2, 40), p('bore', 'รูแกน', 8, 2, 40)],
    build: ({ v }) => {
      const outline = diff(gearOutline(Math.round(v.teeth), v.module, v.bore), rect(v.bore / 2, 0, 3, 3))
      return new Parts().slab('เฟือง', 'accent', outline, v.thick, 0).done()
    },
  },
  {
    id: 'screw-jar',
    code: 'G03',
    group: 'hardware',
    name: 'กระปุกฝาเกลียว',
    blurb: 'กระปุกทรงกระบอกมีคอเกลียว และฝาเกลียวในที่ขันปิดได้จริง ใส่ของเล็กหรือเป็นกล่องของขวัญ',
    make: 'print',
    usesArt: false,
    params: [p('dia', 'เส้นผ่านศูนย์กลาง', 60, 25, 160, 1), p('height', 'ความสูงตัวกระปุก', 70, 20, 200, 1), p('wall', 'ความหนาผนัง', 2, 1, 5, 0.1), p('pitch', 'ระยะเกลียว', 3, 1.5, 6, 0.1)],
    build: ({ v }) => {
      const R = v.dia / 2
      const neckR = R - v.wall - 1.5
      const neckH = 12
      const body = revolve([[0, 0], [R, 0], [R, v.height], [neckR - v.wall, v.height], [neckR - v.wall, v.wall], [0, v.wall]], 72)
      const neck = radial(neckH, Math.ceil((neckH / v.pitch) * 16), 72, threadRadius(neckR + 1.2, neckR, v.pitch), () => neckR - v.wall, v.height)
      const capR = neckR + 1.2 + 0.4
      const cap = merge([
        radial(neckH + 2, Math.ceil((neckH / v.pitch) * 16), 72, () => capR + v.wall + 1.6, threadRadius(capR, capR - 1.2, v.pitch)),
        revolve([[0, 0], [capR + v.wall + 1.6, 0], [capR + v.wall + 1.6, 2.4], [0, 2.4]], 72).translate(0, 0, neckH + 2),
      ])
      cap.translate(0, 0, v.height + 4)
      const jar = merge([body, neck])
      rotX(jar, -Math.PI / 2)
      rotX(cap, -Math.PI / 2)
      jar.translate(0, -v.height / 2, 0)
      cap.translate(0, -v.height / 2, 0)
      return new Parts().solid('ตัวกระปุก', 'print', jar).solid('ฝาเกลียว', 'accent', cap, 0.8).done()
    },
  },
  {
    id: 'chain',
    code: 'G04',
    group: 'hardware',
    name: 'โซ่ข้อต่อ',
    blurb: 'โซ่ข้อคล้องกันพิมพ์ทีเดียวทั้งเส้น ไม่ต้องประกอบ ใช้แขวนป้ายเล็กหรือตกแต่ง',
    make: 'print',
    usesArt: false,
    params: [p('links', 'จำนวนข้อ', 8, 2, 40, 1, 'ข้อ'), p('length', 'ความยาวแต่ละข้อ', 26, 10, 80, 1), p('width', 'ความกว้างข้อ', 14, 6, 40, 1), p('wire', 'ขนาดเส้นลวด', 3.2, 1.2, 8, 0.1)],
    build: ({ v }) => {
      const n = Math.round(v.links)
      const pitch = v.length - v.wire * 2.2
      const links: THREE.BufferGeometry[] = []
      for (let i = 0; i < n; i++) {
        const g = tube(new Stadium(v.length - v.wire, (v.width - v.wire) / 2), v.wire / 2)
        if (i % 2) rotX(g, Math.PI / 2)
        g.translate((i - (n - 1) / 2) * pitch, 0, 0)
        links.push(g)
      }
      return new Parts().solid('โซ่', 'metal', merge(links)).done()
    },
  },
  {
    id: 'sign-bracket',
    code: 'G05',
    group: 'hardware',
    name: 'ขาแขวนป้ายยื่น',
    blurb: 'แผ่นยึดผนังกับแขนยื่น มีหูแขวนสองจุดสำหรับป้ายแขวน รูสกรูยึดผนังสี่รู',
    make: 'print',
    usesArt: false,
    params: [p('arm', 'ความยาวแขน', 200, 60, 600, 5), p('plate', 'ขนาดแผ่นยึด', 80, 40, 200, 1), p('thick', 'ความหนา', 6, 3, 15), p('hole', 'รูสกรู', 5, 3, 10)],
    build: ({ v }) => {
      const s = v.plate
      const holes = union(...[-1, 1].flatMap((a) => [-1, 1].map((b) => circle((a * s) / 3, (b * s) / 3, v.hole / 2, 20))))
      const plate = extrude(diff(roundRect(0, 0, s, s, 6), holes), v.thick, 0)
      const armPath: Poly = [[0, 0], [v.arm, 0]]
      const brace: Poly = [[0, -s / 2 + 8], [v.arm * 0.55, 0]]
      const arm = extrude(union(stroke(armPath, 16, false, true), stroke(brace, 10, false, true)), v.thick * 1.5, 0)
      const eyes = extrude(union(ring(circle(v.arm * 0.35, -14, 8, 32), 3.5), ring(circle(v.arm * 0.9, -14, 8, 32), 3.5), rect(v.arm * 0.35, -6, 6, 8), rect(v.arm * 0.9, -6, 6, 8)), v.thick, 0)
      const side = merge([arm, eyes])
      rotY(side, -Math.PI / 2)
      side.translate(0, 0, v.thick)
      rotY(plate, 0)
      const g = merge([plate, side])
      rotY(g, Math.PI / 2)
      g.translate(-v.arm / 2, 0, 0)
      return new Parts().solid('ขาแขวน', 'metal', g).done()
    },
  },
  {
    id: 'hook',
    code: 'G06',
    group: 'hardware',
    name: 'ตะขอแขวน',
    blurb: 'ตะขอรูปตัวเจมีรูยึดสกรูด้านบน แขวนป้าย หมวก กระเป๋า หรือกุญแจ',
    make: 'print',
    usesArt: false,
    params: [p('height', 'ความสูงตะขอ', 80, 30, 250, 1), p('reach', 'ความกว้างช่องแขวน', 30, 10, 100, 1), p('bar', 'ความหนาเส้นตะขอ', 8, 3, 20, 0.5), p('thick', 'ความหนาชิ้นงาน', 10, 4, 30)],
    build: ({ v }) => {
      const r = v.reach / 2 + v.bar / 2
      const path: Poly = [[0, v.height / 2]]
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI + (i / 20) * Math.PI
        path.push([r + Math.cos(a) * r, -v.height / 2 + r + Math.sin(a) * r])
      }
      path.push([v.reach + v.bar, -v.height / 2 + r + v.reach * 0.6])
      const body = union(stroke(path, v.bar), circle(0, v.height / 2 - 6, v.bar * 0.9, 32))
      const g = diff(body, circle(0, v.height / 2 - 6, 2.2, 20))
      return new Parts().slab('ตะขอ', 'accent', g, v.thick, 0).done()
    },
  },
  {
    id: 'tube-cap',
    code: 'G07',
    group: 'hardware',
    name: 'จุกปิดปลายท่อเหล็ก',
    blurb: 'จุกอุดปลายท่อเหล็กกลมหรือเหลี่ยม มีครีบกันหลุด ใส่ขนาดภายนอกและความหนาท่อ',
    make: 'print',
    usesArt: false,
    params: [p('size', 'ขนาดท่อภายนอก', 25.4, 10, 100, 0.1), p('tubeWall', 'ความหนาท่อ', 1.2, 0.5, 4, 0.1), p('square', 'ท่อเหลี่ยม (1) หรือกลม (0)', 1, 0, 1, 1, ''), p('plug', 'ความลึกส่วนเสียบ', 12, 4, 40)],
    build: ({ v }) => {
      const sq = v.square >= 0.5
      const outer = sq ? roundRect(0, 0, v.size, v.size, 1.5) : circle(0, 0, v.size / 2, 64)
      const inS = v.size - v.tubeWall * 2
      const plug = sq ? roundRect(0, 0, inS - 0.2, inS - 0.2, 1) : circle(0, 0, inS / 2 - 0.1, 64)
      const fin = sq ? roundRect(0, 0, inS + 0.6, inS + 0.6, 1) : circle(0, 0, inS / 2 + 0.3, 64)
      const parts: THREE.BufferGeometry[] = [extrude(outer, 3, 0), extrude(ring(plug, 1.6), v.plug, -v.plug)]
      for (let z = -4; z > -v.plug; z -= 4) parts.push(extrude(ring(fin, 1.2), 0.8, z))
      return new Parts().solid('จุกปิดท่อ', 'rubber', merge(parts)).done()
    },
  },
  {
    id: 'leveling-foot',
    code: 'G08',
    group: 'hardware',
    name: 'ขาปรับระดับ',
    blurb: 'ขาปรับระดับพร้อมแกนเกลียวและฐานกันลื่น ใช้รองตู้ไฟ ชั้นวาง หรือแท่นป้ายตั้งพื้น',
    make: 'print',
    usesArt: false,
    params: [p('base', 'ขนาดฐาน', 40, 15, 100, 1), p('dia', 'ขนาดแกนเกลียว', 10, 5, 20, 0.5), p('rod', 'ความยาวแกน', 30, 10, 100, 1), p('pitch', 'ระยะเกลียว', 1.5, 0.8, 3, 0.1)],
    build: ({ v }) => {
      const R = v.base / 2
      const foot = revolve([[0, 0], [R, 0], [R, 4], [R * 0.7, 10], [v.dia * 0.8, 12], [0, 12]], 64)
      const rod = threaded(v.dia / 2, v.dia / 2 - v.pitch * 0.6, v.pitch, v.rod, 12)
      const nut = radial(v.dia * 0.6, 1, 6, () => (v.dia * 1.7) / Math.sqrt(3), () => v.dia / 2 + 0.3, 12 + v.rod * 0.4)
      const g = merge([foot, rod])
      rotX(g, -Math.PI / 2)
      rotX(nut, -Math.PI / 2)
      const shift = -(12 + v.rod) / 2
      g.translate(0, shift, 0)
      nut.translate(0, shift, 0)
      return new Parts().solid('ฐานและแกนเกลียว', 'print', g).solid('น็อตล็อก', 'metal', nut, 0.5).done()
    },
  },
  {
    id: 'c-clamp',
    code: 'G09',
    group: 'hardware',
    name: 'แคลมป์ตัวซี',
    blurb: 'แคลมป์ตัวซีพร้อมสกรูอัด ใช้หนีบแผ่นป้ายกับโต๊ะหรือจับชิ้นงานตอนติดกาว',
    make: 'print',
    usesArt: false,
    params: [p('open', 'ช่องเปิดหนีบ', 40, 10, 150, 1), p('throat', 'ความลึกคอ', 35, 15, 120, 1), p('bar', 'ความหนาโครง', 12, 6, 25, 0.5), p('thick', 'ความหนาชิ้นงาน', 12, 6, 30, 0.5)],
    build: ({ v }) => {
      const h = v.open + v.bar * 2
      const frame = union(
        rect(-v.throat / 2, h / 2 - v.bar / 2, v.throat + v.bar, v.bar),
        rect(-v.throat / 2, -h / 2 + v.bar / 2, v.throat + v.bar, v.bar),
        rect(-v.throat - v.bar / 2 + v.bar, 0, v.bar, h),
      )
      const holeR = 4.4
      const body = diff(frame, rect(0, h / 2 - v.bar / 2, holeR * 2, v.bar + 1))
      const screw = threaded(4, 3.2, 1.6, v.open + v.bar + 10, 0)
      const handle = radial(8, 1, 32, () => 9, undefined, v.open + v.bar + 10)
      const s = merge([screw, handle])
      rotX(s, Math.PI / 2)
      s.translate(0, h / 2 + 12, v.thick / 2)
      return new Parts()
        .slab('โครงตัวซี', 'accent', body, v.thick, 0)
        .solid('สกรูอัด', 'metal', s, 0.6)
        .done()
    },
  },
  {
    id: 'battery-holder',
    code: 'G10',
    group: 'hardware',
    name: 'รางใส่ถ่าน',
    blurb: 'รางใส่ถ่าน AA หรือ AAA เรียงหลายก้อน มีช่องเสียบแผ่นขั้วและรูร้อยสายไฟ',
    make: 'print',
    usesArt: false,
    params: [p('cells', 'จำนวนก้อน', 4, 1, 8, 1, 'ก้อน'), p('aaa', 'AAA (1) หรือ AA (0)', 0, 0, 1, 1, ''), p('wall', 'ความหนาผนัง', 1.6, 1, 3, 0.1)],
    build: ({ v }) => {
      const aaa = v.aaa >= 0.5
      const d = aaa ? 10.5 : 14.5
      const len = aaa ? 44.5 : 50.5
      const n = Math.round(v.cells)
      const innerW = n * d + (n - 1) * 0.8
      const outer = roundRect(0, 0, innerW + v.wall * 2, len + 6 + v.wall * 2, 2)
      const cells = union(...Array.from({ length: n }, (_, i) => rect(-innerW / 2 + d / 2 + i * (d + 0.8), 0, d, len + 6)))
      const slots = union(rect(0, len / 2 + 3.6, innerW, 0.8), rect(0, -len / 2 - 3.6, innerW, 0.8))
      return new Parts()
        .slab('พื้นราง', 'print', diff(outer, circle(0, -len / 2 - 6, 1.5, 16)), 1.6, 0, -0.5)
        .slab('ผนังและช่องถ่าน', 'print', diff(outer, union(cells, slots)), d * 0.6, 1.6, 0.4)
        .done()
    },
  },
  {
    id: 'pvc-fitting',
    code: 'G11',
    group: 'hardware',
    name: 'ข้อต่อท่อพีวีซี',
    blurb: 'ข้อต่อตรงหรือสามทางสำหรับท่อพีวีซีหรือท่อเหล็กกลม ทำโครงป้ายตั้งพื้นและซุ้มงานอีเวนต์',
    make: 'print',
    usesArt: false,
    params: [p('pipe', 'ขนาดท่อภายนอก', 21.5, 10, 60, 0.1), p('socket', 'ความลึกปากสวม', 20, 8, 50, 1), p('wall', 'ความหนาผนัง', 2.4, 1.2, 6, 0.1), p('tee', 'สามทาง (1) หรือตรง (0)', 1, 0, 1, 1, '')],
    build: ({ v }) => {
      const ri = v.pipe / 2 + 0.2
      const ro = ri + v.wall
      const len = v.socket * 2 + 4
      const straight = radial(len, 1, 64, () => ro, () => ri)
      straight.translate(0, 0, -len / 2)
      rotY(straight, Math.PI / 2)
      const stop = radial(4, 1, 64, () => ro, () => ri - 1.6, -2)
      rotY(stop, Math.PI / 2)
      const parts = [straight, stop]
      if (v.tee >= 0.5) {
        const branch = radial(v.socket, 1, 64, () => ro, () => ri, ro)
        rotX(branch, -Math.PI / 2)
        parts.push(branch)
      }
      return new Parts().solid('ข้อต่อท่อ', 'print', merge(parts)).done()
    },
  },
  {
    id: 'print-hinge',
    code: 'G12',
    group: 'hardware',
    name: 'บานพับพิมพ์ในตัว',
    blurb: 'บานพับสองใบพร้อมสลักกลาง ปรับจำนวนข้อหมุน ใช้ทำฝากล่องไฟหรือประตูตู้เล็ก',
    make: 'print',
    usesArt: false,
    params: [p('length', 'ความยาวบานพับ', 60, 20, 200, 1), p('leaf', 'ความกว้างแต่ละใบ', 20, 8, 60, 1), p('thick', 'ความหนาใบ', 3, 1.6, 6, 0.1), p('knuckles', 'จำนวนข้อหมุน', 5, 3, 11, 2, 'ข้อ')],
    build: ({ v }) => {
      const n = Math.round(v.knuckles) | 1
      const seg = v.length / n
      const kr = v.thick
      const leafA = extrude(rect(-v.leaf / 2 - kr, 0, v.leaf, v.length), v.thick, 0)
      const leafB = extrude(rect(v.leaf / 2 + kr, 0, v.leaf, v.length), v.thick, 0)
      const knA: THREE.BufferGeometry[] = []
      const knB: THREE.BufferGeometry[] = []
      for (let i = 0; i < n; i++) {
        const g = radial(seg - 0.4, 1, 32, () => kr, () => kr * 0.45, -v.length / 2 + i * seg + 0.2)
        rotX(g, Math.PI / 2)
        g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI))
        g.translate(0, 0, kr)
        ;(i % 2 ? knB : knA).push(g)
      }
      const pin = radial(v.length, 1, 24, () => kr * 0.45 - 0.25, undefined, -v.length / 2)
      rotX(pin, Math.PI / 2)
      pin.translate(0, 0, kr)
      return new Parts()
        .solid('ใบบานพับ ก', 'print', merge([leafA, ...knA]), -0.5)
        .solid('ใบบานพับ ข', 'accent', merge([leafB, ...knB]), 0.5)
        .solid('สลักกลาง', 'metal', pin, 1)
        .done()
    },
  },
]
