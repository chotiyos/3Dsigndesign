import { bounds, islands, regionArea, stroke, union, type Point, type Poly, type Region } from './geo2d'

/** 1: tie each floating mark (Thai vowels, tone marks, dots) to a letter. 2: join everything into one piece. */
export type BridgeMode = 0 | 1 | 2

interface Piece {
  outer: Poly
  b: ReturnType<typeof bounds>
  /** A main letter body, which floating marks are tied to. */
  anchor: boolean
}

/** Nearest point to `p` on segment a–b. */
function onSegment(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = dx * dx + dy * dy
  const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0
  return [a[0] + dx * t, a[1] + dy * t]
}

/** The closest pair of points between two outlines, and how far apart they are. */
export function closestPoints(a: Poly, b: Poly): { from: Point; to: Point; d: number } {
  let best = { from: a[0], to: b[0], d: Infinity }
  const scan = (p: Poly, q: Poly, flip: boolean) => {
    for (const v of p) {
      for (let i = 0; i < q.length; i++) {
        const w = onSegment(v, q[i], q[(i + 1) % q.length])
        const d = Math.hypot(w[0] - v[0], w[1] - v[1])
        if (d < best.d) best = flip ? { from: w, to: v, d } : { from: v, to: w, d }
      }
    }
  }
  scan(a, b, false)
  scan(b, a, true)
  return best
}

/** Gap between two bounding boxes (0 when they overlap): a lower bound on the outline distance. */
const boxGap = (p: Piece, q: Piece) =>
  Math.hypot(Math.max(0, p.b.minX - q.b.maxX, q.b.minX - p.b.maxX), Math.max(0, p.b.minY - q.b.maxY, q.b.minY - p.b.maxY))

function pieces(art: Region): Piece[] {
  const found = islands(art)
    .filter((island) => Math.abs(regionArea(island)) > 0.01)
    .map((island) => ({ outer: island[0], b: bounds([island[0]]), anchor: false }))
  // Letter bodies are tall; vowels above or below the line, tone marks and dots are short.
  const tallest = Math.max(0, ...found.map((p) => p.b.h))
  for (const p of found) p.anchor = p.b.h >= tallest * 0.45
  return found
}

/** How many pieces a bridge would tie on: the marks that float apart from any letter body. */
export function floatingCount(art: Region) {
  const found = pieces(art)
  return { marks: found.filter((p) => !p.anchor).length, pieces: found.length }
}

/**
 * Adds straight bars of `width` mm between separate pieces of the artwork so
 * they print and mount as one part. Each bar runs between the closest points
 * of the two outlines and reaches a little into both. Mode 1 ties only the
 * floating marks (each to its nearest neighbour, until every mark reaches a
 * letter body); mode 2 joins every piece with the shortest set of bars.
 */
export function bridgeArt(art: Region, mode: BridgeMode, width: number): { region: Region; bars: number } {
  if (!mode) return { region: art, bars: 0 }
  const found = pieces(art)
  if (found.length < 2 || (mode === 1 && found.every((p) => p.anchor))) return { region: art, bars: 0 }

  // Union-find over pieces; a group is anchored once it holds a letter body.
  const parent = found.map((_, i) => i)
  const anchored = found.map((p) => p.anchor)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])))
  const wanted = (i: number, j: number) => {
    const a = root(i)
    const c = root(j)
    return a !== c && (mode === 2 || !anchored[a] || !anchored[c])
  }
  const done = () => {
    const roots = new Set(found.map((_, i) => root(i)))
    return mode === 2 ? roots.size === 1 : [...roots].every((r) => anchored[r])
  }

  // Exact distances only for each piece's nearest few neighbours by box gap;
  // the rest are filled in only if those were not enough to connect.
  const cache = new Map<string, ReturnType<typeof closestPoints>>()
  const pair = (i: number, j: number) => {
    const key = i < j ? `${i},${j}` : `${j},${i}`
    let hit = cache.get(key)
    if (!hit) cache.set(key, (hit = closestPoints(found[Math.min(i, j)].outer, found[Math.max(i, j)].outer)))
    return hit
  }
  const bars: Region[] = []
  const join = (candidates: [number, number][]) => {
    const edges = candidates.filter(([i, j]) => wanted(i, j)).map(([i, j]) => ({ i, j, ...pair(i, j) })).sort((a, c) => a.d - c.d)
    for (const e of edges) {
      if (!wanted(e.i, e.j)) continue
      const a = root(e.i)
      const c = root(e.j)
      parent[a] = c
      anchored[c] = anchored[c] || anchored[a]
      if (e.d === 0) continue
      const dx = (e.to[0] - e.from[0]) / e.d
      const dy = (e.to[1] - e.from[1]) / e.d
      const reach = Math.min(width * 0.5, 1)
      bars.push(stroke([[e.from[0] - dx * reach, e.from[1] - dy * reach], [e.to[0] + dx * reach, e.to[1] + dy * reach]], width, false, true))
    }
  }
  const near: [number, number][] = []
  found.forEach((p, i) => {
    found
      .map((q, j) => ({ j, gap: boxGap(p, q) }))
      .filter(({ j }) => j !== i)
      .sort((a, c) => a.gap - c.gap)
      .slice(0, 6)
      .forEach(({ j }) => near.push([i, j]))
  })
  join(near)
  while (!done()) {
    // Connect each remaining group by its nearest eligible edge. Box gaps
    // bound exact outline distances, so distant pairs need no vertex search.
    const best = new Map<number, { i: number; j: number; d: number }>()
    for (let i = 0; i < found.length; i++) {
      for (let j = i + 1; j < found.length; j++) {
        if (!wanted(i, j)) continue
        const a = root(i)
        const c = root(j)
        const gap = boxGap(found[i], found[j])
        if (gap >= (best.get(a)?.d ?? Infinity) && gap >= (best.get(c)?.d ?? Infinity)) continue
        const { d } = pair(i, j)
        if (d < (best.get(a)?.d ?? Infinity)) best.set(a, { i, j, d })
        if (d < (best.get(c)?.d ?? Infinity)) best.set(c, { i, j, d })
      }
    }
    if (!best.size) break
    join([...best.values()].map(({ i, j }) => [i, j]))
  }
  return bars.length ? { region: union(art, ...bars), bars: bars.length } : { region: art, bars: 0 }
}
