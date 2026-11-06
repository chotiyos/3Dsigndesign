import { bounds, islands, type Point, type Region } from './geo2d'
import { holeGrid } from './styles/lit'

/** Common 12 V power supply ratings, in watts. */
export const PSU_SIZES = [12, 24, 36, 60, 100, 150, 200, 250, 350, 400]
/** Headroom kept on a power supply: run it at no more than 80 % of its rating. */
export const PSU_LOAD = 0.8

/**
 * Spreads LED modules through the hollow inside a sign, roughly `pitch` mm
 * apart and at least `edge` mm from any wall. Every hollow big enough for a
 * module gets at least one. An estimate for quoting, not a wiring plan.
 */
export function planModules(cavity: Region, pitch: number, edge = 5): Point[] {
  const modules: Point[] = []
  const cell = Math.max(pitch, 1)
  const grid = new Map<string, Point[]>()
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`
  const near = ([x, y]: Point) => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const [px, py] of grid.get(`${cx + i},${cy + j}`) ?? []) {
          if (Math.hypot(px - x, py - y) < pitch * 0.85) return true
        }
      }
    }
    return false
  }
  for (const piece of islands(cavity)) {
    const start = modules.length
    const b = bounds(piece)
    const fine = Math.max(1, Math.min(pitch / 5, Math.min(b.w, b.h) / 6))
    const spots = holeGrid(piece, fine, edge, 8000)
    // Start from the middle of each letter so short strokes get centred modules.
    spots.sort((a, c) => Math.hypot(a[0] - b.cx, a[1] - b.cy) - Math.hypot(c[0] - b.cx, c[1] - b.cy))
    for (const spot of spots) {
      // Separate letters still need their own light even when closer than a pitch.
      if (modules.length > start && near(spot)) continue
      modules.push(spot)
      const k = key(spot[0], spot[1])
      grid.set(k, [...(grid.get(k) ?? []), spot])
    }
  }
  return modules
}

/** Total load and the power supplies to run it. */
export function powerFor(count: number, wattsEach: number) {
  const watts = count * wattsEach
  const needed = watts / PSU_LOAD
  const largest = PSU_SIZES[PSU_SIZES.length - 1]
  const supply = PSU_SIZES.find((size) => size >= needed) ?? largest
  const supplies = needed > largest ? Math.ceil(needed / largest) : watts > 0 ? 1 : 0
  return { watts, amps: watts / 12, supply, supplies }
}
