import { bounds, circle, diff, intersect, offset, rect, rotate, scale, stroke, translate, union, type Region } from '../geo2d'

/**
 * Cute multi-colour motifs with faces, drawn here. Each is a set of coloured
 * pieces: `fill` is the body (one or more colours) and `marks` the face and
 * small details raised on top. Sizes are in mm, centred on the origin.
 */
export interface MotifPiece {
  region: Region
  /** Colour role: the design maps roles to its own colour keys. */
  role: 'main' | 'second' | 'third' | 'mark'
}

export interface Motif {
  pieces: MotifPiece[]
  /** Everything filled in, for the backing. */
  outline: Region
}

const ell = (x: number, y: number, rx: number, ry: number, turn = 0): Region => translate(rotate(scale(circle(0, 0, 1, 48), rx, ry), turn), x, y)
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 14): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  })

/** A sleepy happy face: closed eyes, a small smile, rosy cheeks. */
export function face(cx: number, cy: number, r: number, cheeks = true): { marks: Region; cheeks: Region } {
  const w = Math.max(0.9, r * 0.075)
  const eyes = union(
    stroke(arc(cx - r * 0.38, cy + r * 0.12, r * 0.16, Math.PI * 1.1, Math.PI * 1.9), w),
    stroke(arc(cx + r * 0.38, cy + r * 0.12, r * 0.16, Math.PI * 1.1, Math.PI * 1.9), w),
  )
  const mouth = stroke(arc(cx, cy - r * 0.08, r * 0.13, Math.PI * 1.15, Math.PI * 1.85), w)
  const blush = cheeks ? union(ell(cx - r * 0.58, cy - r * 0.12, r * 0.15, r * 0.09), ell(cx + r * 0.58, cy - r * 0.12, r * 0.15, r * 0.09)) : []
  return { marks: union(eyes, mouth), cheeks: blush }
}

function finish(pieces: MotifPiece[]): Motif {
  const outline = union(...pieces.map((p) => p.region))
  const b = bounds(outline)
  const dx = -(b.minX + b.maxX) / 2
  const dy = -(b.minY + b.maxY) / 2
  const moved = pieces.map((p) => ({ ...p, region: translate(p.region, dx, dy) }))
  return { pieces: moved, outline: translate(outline, dx, dy) }
}

/** Petals round a white face. */
export function sunflower(s: number): Motif {
  const R = s / 2
  const petals: Region[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6
    petals.push(ell(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, R * 0.34, R * 0.2, a))
  }
  const centre = circle(0, 0, R * 0.52, 64)
  const f = face(0, 0, R * 0.52)
  // A small leaf at the bottom.
  const leaf = ell(R * 0.3, -R * 0.92, R * 0.17, R * 0.08, 0.5)
  return finish([
    { region: diff(union(...petals), centre), role: 'main' },
    { region: diff(centre, union(f.marks, f.cheeks)), role: 'second' },
    { region: leaf, role: 'mark' },
    { region: f.marks, role: 'mark' },
    { region: f.cheeks, role: 'third' },
  ])
}

/** A chubby rocket with a face in its window. */
export function rocket(s: number): Motif {
  const h = s
  const w = s * 0.5
  const body = union(ell(0, 0, w * 0.5, h * 0.42), [[[-w * 0.3, h * 0.28], [0, h * 0.5], [w * 0.3, h * 0.28]]])
  const fins = union([[[-w * 0.42, -h * 0.12], [-w * 0.75, -h * 0.4], [-w * 0.3, -h * 0.34]]], [[[w * 0.42, -h * 0.12], [w * 0.75, -h * 0.4], [w * 0.3, -h * 0.34]]])
  const flame = union(ell(0, -h * 0.45, w * 0.18, h * 0.12), ell(0, -h * 0.4, w * 0.12, h * 0.06))
  const window = circle(0, h * 0.06, w * 0.3, 48)
  const f = face(0, h * 0.06, w * 0.3, false)
  return finish([
    { region: diff(body, offset(window, 0.8)), role: 'main' },
    { region: diff(fins, body), role: 'second' },
    { region: diff(flame, body), role: 'third' },
    { region: diff(window, f.marks), role: 'second' },
    { region: f.marks, role: 'mark' },
  ])
}

/** A round bunny head with long ears. */
export function bunny(s: number): Motif {
  const R = s * 0.3
  const head = ell(0, -s * 0.18, R * 1.12, R)
  const ears = union(ell(-R * 0.48, s * 0.2, R * 0.32, s * 0.27, 0.12), ell(R * 0.48, s * 0.2, R * 0.32, s * 0.27, -0.12))
  const inner = union(ell(-R * 0.48, s * 0.22, R * 0.15, s * 0.18, 0.12), ell(R * 0.48, s * 0.22, R * 0.15, s * 0.18, -0.12))
  const f = face(0, -s * 0.2, R)
  return finish([
    { region: diff(union(head, ears), union(inner, f.marks, f.cheeks)), role: 'main' },
    { region: inner, role: 'third' },
    { region: f.cheeks, role: 'third' },
    { region: f.marks, role: 'mark' },
  ])
}

/** A planet with a face and a tilted ring. */
export function planet(s: number): Motif {
  const R = s * 0.33
  const ball = circle(0, 0, R, 64)
  const ring = rotate(diff(ell(0, 0, s * 0.5, s * 0.15), ell(0, 0, s * 0.4, s * 0.08)), 0.25)
  // The ring passes in front of the planet's lower half only.
  const front = diff(ring, rotate(rect(0, s * 0.4, s * 2, s * 0.8), 0.25))
  const f = face(0, R * 0.12, R)
  return finish([
    { region: diff(ball, union(offset(front, 0.8), f.marks, f.cheeks)), role: 'main' },
    { region: union(diff(ring, ball), front), role: 'second' },
    { region: f.cheeks, role: 'third' },
    { region: intersect(f.marks, ball), role: 'mark' },
  ])
}

export const KAWAII = { sunflower, rocket, bunny, planet } as const
export type KawaiiId = keyof typeof KAWAII
