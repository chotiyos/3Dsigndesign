import { bounds, intersect, islands, offset, rect, regionArea, type Region } from '../geo2d'
import { resolve, type GiftLayer } from './core'

/** One solid lump: an island of one layer, after later layers have won. */
interface Piece {
  layer: GiftLayer
  region: Region
}

const EPS = 0.01
/** Two pieces touch when they share at least this much area (mm²). */
const MIN_CONTACT = 0.5

const touchZ = (a: GiftLayer, b: GiftLayer) => a.z <= b.z + b.h + EPS && b.z <= a.z + a.h + EPS

/**
 * Where a standing piece meets the flat plane: its slice between heights
 * lo and hi, laid flat as the footprint it covers (x by depth).
 */
function standFootprint(p: Piece, lo: number, hi: number): Region {
  const b = bounds(p.region)
  const slice = intersect(p.region, rect((b.minX + b.maxX) / 2, (lo + hi) / 2, b.maxX - b.minX + 2, Math.max(hi - lo, EPS)))
  if (!slice.length) return []
  const s = bounds(slice)
  const back = p.layer.stand! - p.layer.z
  return rect((s.minX + s.maxX) / 2, back - p.layer.h / 2, Math.max(s.maxX - s.minX, EPS), p.layer.h)
}

function touching(a: Piece, b: Piece): boolean {
  const sa = a.layer.stand
  const sb = b.layer.stand
  if (a.layer.wrap !== undefined || b.layer.wrap !== undefined) {
    // Wrapped lettering is pressed into the wall it sits on; it counts as touching any ring at its height.
    const w = a.layer.wrap !== undefined ? a : b
    const o = w === a ? b : a
    if (o.layer.wrap !== undefined || o.layer.stand !== undefined) return false
    const wb = bounds(w.region)
    const ob = bounds(o.region)
    const reach = w.layer.wrap! + 0.5
    return w.layer.z + wb.minY <= o.layer.z + o.layer.h + EPS && o.layer.z <= w.layer.z + wb.maxY + EPS && Math.max(ob.maxX, -ob.minX) >= reach - 1
  }
  if ((sa ?? null) === (sb ?? null)) {
    if (!touchZ(a.layer, b.layer)) return false
    // Side by side at the same height: sharing an edge joins them.
    const sideBySide = Math.min(a.layer.z + a.layer.h, b.layer.z + b.layer.h) - Math.max(a.layer.z, b.layer.z) > EPS
    if (sideBySide) return regionArea(intersect(offset(a.region, 0.05), b.region)) > 0.02
    // Stacked: a small piece only needs half its own area to rest on the one below.
    const need = Math.min(MIN_CONTACT, 0.5 * Math.min(regionArea(a.region), regionArea(b.region)))
    return regionArea(intersect(a.region, b.region)) > need
  }
  if (sa !== undefined && sb !== undefined) {
    // Two upright planes: compare their front faces as flat footprints over the whole height.
    const fa = standFootprint(a, -1e6, 1e6)
    const fb = standFootprint(b, -1e6, 1e6)
    return regionArea(intersect(offset(fa, EPS), fb)) > 0 && regionArea(intersect(a.region, b.region)) > MIN_CONTACT
  }
  // One upright, one flat: the upright's slice within the flat layer's height must sit on it.
  const up = sa !== undefined ? a : b
  const flat = up === a ? b : a
  // They must overlap, not just meet face to face, so the slicer fuses them.
  const foot = standFootprint(up, flat.layer.z - EPS, flat.layer.z + flat.layer.h + EPS)
  return regionArea(intersect(foot, flat.region)) > MIN_CONTACT
}

/** How many separate solid lumps the assembled object falls into. */
export function solidCount(layers: GiftLayer[]): { count: number; loose: string[] } {
  const pieces: Piece[] = resolve(layers).flatMap((layer) => islands(layer.region).map((region) => ({ layer, region })))
  const parent = pieces.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (find(i) === find(j)) continue
      if (touching(pieces[i], pieces[j])) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, Piece[]>()
  pieces.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]))
  const sorted = [...groups.values()].sort((x, y) => y.length - x.length)
  const loose = sorted.slice(1).flat().map((p) => {
    const b = bounds(p.region)
    return `${regionArea(p.region).toFixed(2)}mm2 ${p.layer.colour}@z${p.layer.z.toFixed(1)}${p.layer.stand !== undefined ? 's' : ''} (${b.minX.toFixed(0)},${b.minY.toFixed(0)})`
  })
  return { count: groups.size, loose }
}
