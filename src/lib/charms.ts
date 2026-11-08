import { bounds, circle, diff, rect, regionArea, rotate, roundRect, scale, stroke, translate, union, type Region } from './geo2d'

/**
 * Small cute motifs to print beside a name. Each is our own drawing: a solid
 * silhouette with its details cut out, so it prints as one raised colour on
 * the base. Drawn on a grid of about ±1 (scaled by U to mm so small details
 * survive clipping), then normalised to 1 mm tall by `charmArt`.
 */
export type CharmGroup = 'animal' | 'nature' | 'cute'

export interface Charm {
  id: string
  name: string
  group: CharmGroup
  draw: () => Region
}

export const CHARM_GROUPS: { id: CharmGroup; name: string }[] = [
  { id: 'animal', name: 'สัตว์' },
  { id: 'nature', name: 'ธรรมชาติ' },
  { id: 'cute', name: 'ของน่ารัก' },
]

const U = 10
const c = (x: number, y: number, r: number): Region => circle(x * U, y * U, r * U, 48)
const el = (x: number, y: number, rx: number, ry: number, turn = 0): Region =>
  translate(rotate(scale(circle(0, 0, U, 56), rx, ry), turn), x * U, y * U)
const poly = (...pts: [number, number][]): Region => {
  const region: Region = [pts.map(([x, y]) => [x * U, y * U])]
  return regionArea(region) < 0 ? [region[0].reverse()] : region
}
const line = (w: number, ...pts: [number, number][]): Region => stroke(pts.map(([x, y]) => [x * U, y * U] as [number, number]), w * U)
const box = (x: number, y: number, w: number, h: number, r = 0): Region => (r ? roundRect(x * U, y * U, w * U, h * U, r * U) : rect(x * U, y * U, w * U, h * U))
const mirror = (r: Region): Region => union(r, scale(r, -1, 1))
const arc = (cx: number, cy: number, r: number, from: number, to: number, steps = 24): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  })
const eyes = (x: number, y: number, r: number) => mirror(c(x, y, r))

export const CHARMS: Charm[] = [
  {
    id: 'cat', name: 'แมว', group: 'animal',
    draw: () => diff(
      union(el(0, -0.1, 1, 0.82), mirror(poly([-0.95, 0.25], [-0.78, 1.05], [-0.25, 0.68]))),
      union(eyes(0.38, 0, 0.12), poly([-0.12, -0.2], [0.12, -0.2], [0, -0.36]), mirror(line(0.12, [0.55, -0.28], [0.95, -0.2]))),
    ),
  },
  {
    id: 'bear', name: 'หมี', group: 'animal',
    draw: () => diff(
      union(c(0, -0.12, 0.85), mirror(c(0.62, 0.58, 0.32))),
      union(mirror(c(0.62, 0.58, 0.14)), eyes(0.3, 0.02, 0.1), el(0, -0.34, 0.15, 0.11)),
    ),
  },
  {
    id: 'bunny', name: 'กระต่าย', group: 'animal',
    draw: () => diff(
      union(el(0, -0.42, 0.78, 0.6), mirror(el(0.3, 0.42, 0.2, 0.58, -0.12))),
      union(mirror(el(0.31, 0.46, 0.08, 0.38, -0.12)), eyes(0.3, -0.36, 0.09), c(0, -0.54, 0.07)),
    ),
  },
  {
    id: 'panda', name: 'แพนด้า', group: 'animal',
    draw: () => union(
      diff(union(c(0, -0.1, 0.85), mirror(c(0.66, 0.6, 0.28))), union(mirror(el(0.32, 0.02, 0.17, 0.23, 0.5)), el(0, -0.34, 0.12, 0.08))),
      eyes(0.32, 0.05, 0.07),
    ),
  },
  {
    id: 'pig', name: 'หมู', group: 'animal',
    draw: () => union(
      diff(
        union(c(0, -0.08, 0.88), mirror(poly([-0.85, 0.35], [-0.78, 0.98], [-0.3, 0.75]))),
        union(eyes(0.36, 0.14, 0.1), diff(el(0, -0.3, 0.38, 0.28), el(0, -0.3, 0.28, 0.18))),
      ),
      diff(el(0, -0.3, 0.28, 0.18), mirror(c(0.11, -0.3, 0.06))),
    ),
  },
  {
    id: 'chick', name: 'ลูกเจี๊ยบ', group: 'animal',
    draw: () => diff(
      union(c(0, -0.15, 0.85), c(-0.12, 0.72, 0.14), c(0.06, 0.78, 0.16), c(0.22, 0.7, 0.12)),
      union(eyes(0.32, 0, 0.1), poly([-0.16, -0.18], [0.16, -0.18], [0, -0.4])),
    ),
  },
  {
    id: 'fish', name: 'ปลา', group: 'animal',
    draw: () => diff(
      union(el(-0.15, 0, 0.78, 0.52), poly([0.5, 0], [1.05, 0.48], [1.05, -0.48])),
      union(c(-0.52, 0.1, 0.1), line(0.12, ...arc(-0.62, 0, 0.42, -0.9, 0.9, 10))),
    ),
  },
  {
    id: 'paw', name: 'รอยเท้า', group: 'animal',
    draw: () => union(el(0, -0.38, 0.52, 0.42), c(-0.66, 0.12, 0.2), c(-0.25, 0.48, 0.21), c(0.25, 0.48, 0.21), c(0.66, 0.12, 0.2)),
  },
  {
    id: 'dog', name: 'หมา', group: 'animal',
    draw: () => diff(
      union(el(0, -0.06, 0.68, 0.8), mirror(el(0.72, 0.12, 0.24, 0.55, 0.35))),
      union(eyes(0.28, 0.1, 0.1), el(0, -0.32, 0.17, 0.12), line(0.12, [0, -0.44], [0, -0.58])),
    ),
  },
  {
    id: 'frog', name: 'กบ', group: 'animal',
    draw: () => union(
      diff(union(el(0, -0.22, 1, 0.62), mirror(c(0.5, 0.42, 0.34))), union(mirror(c(0.5, 0.42, 0.2)), line(0.12, ...arc(0, -0.15, 0.45, -2.5, -0.64, 14)))),
      mirror(c(0.5, 0.42, 0.1)),
    ),
  },
  {
    id: 'mouse', name: 'หนู', group: 'animal',
    draw: () => diff(
      union(c(0, -0.28, 0.66), mirror(c(0.6, 0.45, 0.42))),
      union(mirror(c(0.6, 0.45, 0.24)), eyes(0.24, -0.2, 0.09), c(0, -0.44, 0.08)),
    ),
  },
  {
    id: 'owl', name: 'นกฮูก', group: 'animal',
    draw: () => union(
      diff(
        union(el(0, -0.12, 0.76, 0.88), mirror(poly([-0.72, 0.4], [-0.62, 1.02], [-0.25, 0.68]))),
        union(mirror(c(0.3, 0.2, 0.24)), poly([-0.1, -0.08], [0.1, -0.08], [0, -0.28]), line(0.12, ...arc(0, -0.95, 0.55, 1.1, 2.05, 10))),
      ),
      eyes(0.3, 0.2, 0.12),
    ),
  },
  {
    id: 'flower', name: 'ดอกไม้', group: 'nature',
    draw: () => {
      const petals = Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3 + Math.PI / 2
        return c(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.42)
      })
      return union(diff(union(...petals), c(0, 0, 0.3)), c(0, 0, 0.19))
    },
  },
  {
    id: 'tulip', name: 'ทิวลิป', group: 'nature',
    draw: () => diff(
      union(
        el(0, 0.3, 0.48, 0.42), poly([-0.48, 0.32], [-0.42, 0.95], [-0.15, 0.6], [0, 0.98], [0.15, 0.6], [0.42, 0.95], [0.48, 0.32]),
        line(0.16, [0, 0.1], [0, -1]), el(0.22, -0.55, 0.14, 0.34, -0.7),
      ),
      box(0, 0.35, 0.12, 0.38, 0.06),
    ),
  },
  {
    id: 'leaf', name: 'ใบไม้', group: 'nature',
    draw: () => diff(union(el(0, 0.1, 0.48, 0.92, -0.6), line(0.1, [-0.35, -0.6], [-0.6, -0.95])), line(0.12, [-0.4, -0.55], [0.4, 0.75])),
  },
  {
    id: 'sun', name: 'พระอาทิตย์', group: 'nature',
    draw: () => {
      const rays = Array.from({ length: 8 }, (_, i) => rotate(box(0, 0.82, 0.16, 0.32, 0.08), (i * Math.PI) / 4))
      return union(diff(c(0, 0, 0.55), union(eyes(0.2, 0.1, 0.07), line(0.12, ...arc(0, 0.05, 0.28, -2.5, -0.64, 10)))), ...rays)
    },
  },
  { id: 'moon', name: 'พระจันทร์', group: 'nature', draw: () => diff(c(0, 0, 0.92), c(0.42, 0.28, 0.78)) },
  {
    id: 'star', name: 'ดาว', group: 'nature',
    draw: () => {
      const pts: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? 0.44 : 1
        pts.push([Math.cos(a) * r, Math.sin(a) * r])
      }
      return poly(...pts)
    },
  },
  { id: 'cloud', name: 'ก้อนเมฆ', group: 'nature', draw: () => union(c(-0.55, -0.12, 0.38), c(-0.05, 0.18, 0.52), c(0.5, -0.06, 0.42), box(0, -0.3, 1.5, 0.5, 0.25)) },
  {
    id: 'rainbow', name: 'สายรุ้ง', group: 'nature',
    draw: () => union(
      line(0.18, ...arc(0, -0.45, 0.88, 0, Math.PI, 30)),
      line(0.18, ...arc(0, -0.45, 0.6, 0, Math.PI, 26)),
      c(-0.85, -0.55, 0.24), c(-0.6, -0.6, 0.2), c(0.85, -0.55, 0.24), c(0.6, -0.6, 0.2),
    ),
  },
  {
    id: 'mushroom', name: 'เห็ด', group: 'nature',
    draw: () => diff(
      union(diff(el(0, 0.0, 1, 0.78), box(0, -0.6, 2.2, 1.2)), box(0, -0.4, 0.55, 0.85, 0.16)),
      union(c(-0.45, 0.32, 0.15), c(0.12, 0.52, 0.13), c(0.55, 0.2, 0.12)),
    ),
  },
  {
    id: 'cherry', name: 'เชอร์รี่', group: 'nature',
    draw: () => union(
      diff(c(-0.42, -0.5, 0.36), c(-0.52, -0.38, 0.08)), diff(c(0.4, -0.6, 0.36), c(0.3, -0.48, 0.08)),
      line(0.12, [-0.4, -0.2], [0.12, 0.72]), line(0.12, [0.4, -0.3], [0.12, 0.72]), el(0.42, 0.75, 0.3, 0.14, 0.4),
    ),
  },
  {
    id: 'heart', name: 'หัวใจ', group: 'cute',
    draw: () => union(c(-0.46, 0.3, 0.52), c(0.46, 0.3, 0.52), poly([-0.96, 0.12], [0, -0.98], [0.96, 0.12], [0, 0.4])),
  },
  {
    id: 'bow', name: 'โบว์', group: 'cute',
    draw: () => diff(
      union(mirror(poly([-0.08, 0], [-1, 0.6], [-1, -0.6])), c(0, 0, 0.22), mirror(poly([-0.1, -0.1], [-0.4, -0.85], [-0.15, -0.75]))),
      mirror(poly([-0.35, 0.05], [-0.82, 0.32], [-0.82, -0.22])),
    ),
  },
  {
    id: 'crown', name: 'มงกุฎ', group: 'cute',
    draw: () => diff(
      union(poly([-0.9, -0.6], [0.9, -0.6], [1, 0.45], [0.48, 0], [0, 0.6], [-0.48, 0], [-1, 0.45]), c(-1, 0.5, 0.12), c(0, 0.68, 0.13), c(1, 0.5, 0.12)),
      union(c(0, -0.22, 0.12), mirror(c(0.5, -0.28, 0.09))),
    ),
  },
  {
    id: 'note', name: 'โน้ตดนตรี', group: 'cute',
    draw: () => union(el(-0.35, -0.68, 0.32, 0.24, 0.4), el(0.48, -0.5, 0.32, 0.24, 0.4), box(-0.08, 0, 0.12, 1.36), box(0.75, 0.18, 0.12, 1.36), poly([-0.14, 0.7], [0.81, 0.88], [0.81, 0.62], [-0.14, 0.44])),
  },
  {
    id: 'icecream', name: 'ไอศกรีม', group: 'cute',
    draw: () => diff(
      union(poly([-0.45, 0.05], [0.45, 0.05], [0, -1]), c(0, 0.4, 0.55), c(-0.35, 0.12, 0.2), c(0.35, 0.12, 0.2)),
      union(mirror(line(0.12, [0.2, -0.08], [0.06, -0.5]))),
    ),
  },
  {
    id: 'balloon', name: 'ลูกโป่ง', group: 'cute',
    draw: () => union(
      diff(el(0, 0.3, 0.6, 0.72), el(-0.25, 0.55, 0.08, 0.16, 0.5)),
      poly([-0.12, -0.5], [0.12, -0.5], [0, -0.38]),
      line(0.12, [0, -0.5], [0.12, -0.7], [-0.08, -0.85], [0.06, -1]),
    ),
  },
]

const cache = new Map<string, Region>()

/** The motif at 1 mm tall, centred on the origin, or nothing for an unknown id. */
export function charmArt(id: string): Region {
  const hit = cache.get(id)
  if (hit) return hit
  const charm = CHARMS.find((ch) => ch.id === id)
  if (!charm) return []
  const art = union(charm.draw())
  const b = bounds(art)
  const out = translate(scale(art, 1 / b.h), -(b.minX + b.maxX) / 2 / b.h, -(b.minY + b.maxY) / 2 / b.h)
  cache.set(id, out)
  return out
}

/** SVG path data for a 1 mm motif, y flipped for screen use. */
export function charmPath(id: string) {
  return charmArt(id).map((poly) => 'M' + poly.map(([x, y]) => `${x.toFixed(3)} ${(-y).toFixed(3)}`).join('L') + 'Z').join('')
}

/** An SVG viewBox that fits the motif with a small margin. */
export function charmViewBox(id: string) {
  const b = bounds(charmArt(id))
  const m = 0.06
  return `${(b.minX - m).toFixed(3)} ${(-b.maxY - m).toFixed(3)} ${(b.w + 2 * m).toFixed(3)} ${(b.h + 2 * m).toFixed(3)}`
}
