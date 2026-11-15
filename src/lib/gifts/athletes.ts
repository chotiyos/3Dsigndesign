import { bounds, circle, diff, intersect, rect, rotate, scale, stroke, translate, union, type Region } from '../geo2d'

/**
 * Athlete silhouettes drawn from joint positions (thick rounded limbs and a
 * round head), and sports props. Unit figures are about 1 tall; `pose`
 * scales them to `h` mm and centres them on the origin.
 */
type P = [number, number]

interface Pose {
  head: P
  neck: P
  hip: P
  arms: [P, P, P][]
  legs: [P, P, P][]
  ball?: { at: P; r: number }
}

const POSES = {
  dunk: {
    head: [0.06, 0.87], neck: [0.03, 0.77], hip: [-0.05, 0.43],
    arms: [[[0.04, 0.75], [0.15, 0.9], [0.22, 1.04]], [[0.02, 0.74], [-0.12, 0.65], [-0.21, 0.55]]],
    legs: [[[-0.05, 0.43], [0.12, 0.31], [0.05, 0.12]], [[-0.05, 0.43], [-0.15, 0.27], [-0.3, 0.12]]],
    ball: { at: [0.27, 1.11], r: 0.085 },
  },
  kick: {
    head: [-0.07, 0.88], neck: [-0.05, 0.78], hip: [-0.02, 0.45],
    arms: [[[-0.05, 0.76], [-0.22, 0.7], [-0.35, 0.79]], [[-0.04, 0.75], [0.1, 0.66], [0.2, 0.6]]],
    legs: [[[-0.02, 0.45], [-0.06, 0.24], [-0.1, 0.03]], [[-0.02, 0.45], [0.17, 0.37], [0.37, 0.44]]],
  },
  punt: {
    head: [-0.1, 0.88], neck: [-0.08, 0.78], hip: [-0.04, 0.46],
    arms: [[[-0.08, 0.76], [-0.26, 0.82], [-0.4, 0.9]], [[-0.07, 0.75], [0.08, 0.7], [0.2, 0.74]]],
    legs: [[[-0.04, 0.46], [-0.08, 0.25], [-0.12, 0.03]], [[-0.04, 0.46], [0.15, 0.55], [0.34, 0.68]]],
  },
} satisfies Record<string, Pose>

export type PoseId = keyof typeof POSES

/** The athlete as one solid silhouette, `h` mm tall, centred. */
export function athlete(id: PoseId, h: number, flip = false): Region {
  const pose: Pose = POSES[id]
  const parts: Region[] = [
    circle(pose.head[0], pose.head[1], 0.085, 32),
    stroke([pose.neck, pose.hip], 0.15),
    ...pose.arms.map(([a, b, c]) => union(stroke([a, b], 0.075), stroke([b, c], 0.065), circle(c[0], c[1], 0.042, 16))),
    ...pose.legs.map(([a, b, c]) => union(stroke([a, b], 0.095), stroke([b, c], 0.075), translate(rotate(scale(circle(0, 0, 1, 20), 0.065, 0.035), 0), c[0] + 0.03, c[1]))),
  ]
  if (pose.ball) parts.push(circle(pose.ball.at[0], pose.ball.at[1], pose.ball.r, 32))
  let art = union(...parts)
  if (flip) art = scale(art, -1, 1)
  const b = bounds(art)
  const k = h / b.h
  return translate(scale(art, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}

/** An American football with a flame trail behind it, as coloured pieces, `w` mm wide. */
export function flamingBall(w: number): { ball: Region; laces: Region; flame: Region; core: Region } {
  const r = w * 0.3
  const lens = rotate(intersect(circle(0, -r * 0.55, r, 48), circle(0, r * 0.55, r, 48)), Math.PI / 2 + 0.5)
  const ball = translate(rotate(lens, Math.PI / 2), w * 0.28, w * 0.12)
  const bb = bounds(ball)
  const cx = (bb.minX + bb.maxX) / 2
  const cy = (bb.minY + bb.maxY) / 2
  const laces = translate(rotate(union(rect(0, 0, r * 0.9, r * 0.09), ...[-0.3, -0.1, 0.1, 0.3].map((x) => rect(x * r, 0, r * 0.07, r * 0.28))), 0.5), cx, cy)
  // A flame: three tongues trailing down-left from the ball.
  const tongue = (len: number, width: number, a: number): Region => translate(rotate([[[0, -width], [-len, 0], [0, width]]], a), cx - r * 0.2, cy - r * 0.1)
  const flame = union(tongue(w * 0.75, r * 0.55, 0.45), tongue(w * 0.6, r * 0.4, 0.2), tongue(w * 0.55, r * 0.4, 0.7), circle(cx - r * 0.25, cy - r * 0.1, r * 0.55, 32))
  const core = union(tongue(w * 0.45, r * 0.28, 0.45), circle(cx - r * 0.25, cy - r * 0.1, r * 0.32, 24))
  return { ball: diff(ball, laces), laces, flame: diff(flame, ball), core: diff(core, ball) }
}

/** A round football seen face on: white panels and dark patches. */
export function footballRing(R: number, band: number): { ring: Region; patches: Region } {
  const outer = circle(0, 0, R, 128)
  const inner = circle(0, 0, R - band, 128)
  const ring = diff(outer, inner)
  const patches: Region[] = []
  const n = 10
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n
    const pr = band * 0.36
    const hex: [number, number][] = Array.from({ length: 6 }, (_, k) => {
      const t = a + (k * Math.PI) / 3
      return [Math.cos(a) * (R - band / 2) + Math.cos(t) * pr, Math.sin(a) * (R - band / 2) + Math.sin(t) * pr]
    })
    if (i % 2 === 0) patches.push([hex])
  }
  return { ring: diff(ring, union(...patches)), patches: intersect(union(...patches), ring) }
}
