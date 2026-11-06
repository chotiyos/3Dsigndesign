import { bounds, translate, type Bounds, type Region } from './geo2d'

/**
 * An extra line of text on the same sign, with its own font and size: a
 * slogan under the shop name, a phone number, an opening-hours line.
 * `x` and `y` place the centre of the block relative to the centre of the
 * main artwork, in mm, y up.
 */
export interface TextBlock {
  id: string
  text: string
  fontId: string
  heightMM: number
  spacingMM: number
  x: number
  y: number
}

export const MAX_BLOCKS = 4

const finite = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/** Blocks read back from storage, a project file or a share link. */
export function cleanBlocks(input: unknown, fontIds: readonly string[]): TextBlock[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: TextBlock[] = []
  for (const raw of input) {
    if (out.length >= MAX_BLOCKS) break
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const b = raw as Partial<TextBlock>
    let id = typeof b.id === 'string' && /^[a-z0-9]{1,12}$/.test(b.id) ? b.id : `b${out.length + 1}`
    while (seen.has(id)) id = `${id}x`.slice(-12)
    seen.add(id)
    out.push({
      id,
      text: typeof b.text === 'string' ? b.text.slice(0, 120) : '',
      fontId: typeof b.fontId === 'string' && fontIds.includes(b.fontId) ? b.fontId : fontIds[0],
      heightMM: finite(b.heightMM, 5, 1500, 60),
      spacingMM: finite(b.spacingMM, -30, 150, 0),
      x: finite(b.x, -20000, 20000, 0),
      y: finite(b.y, -20000, 20000, 0),
    })
  }
  return out
}

/** Moves a block's outline so its centre sits at its offset from the main artwork's centre. */
export function placeBlock(region: Region, block: Pick<TextBlock, 'x' | 'y'>, main: Bounds): Region {
  if (!region.length) return region
  const b = bounds(region)
  return translate(region, main.cx + block.x - b.cx, main.cy + block.y - b.cy)
}

/** A new block's starting offset: centred under everything placed so far. */
export function belowOffset(main: Bounds, all: Bounds, heightMM: number) {
  return { x: 0, y: all.minY - main.cy - heightMM * 0.5 - heightMM * 0.6 }
}

export interface Snap {
  x: number
  y: number
  /** Guide lines to draw, in sign mm: vertical lines at these x, horizontal at these y. */
  guides: { v: number[]; h: number[] }
}

/**
 * Pulls a dragged block onto the main artwork's centre line or edges when it
 * comes within `reach` mm, so lines of text line up exactly. Vertically it
 * snaps to the centre, or to sitting just under or over the main artwork
 * with a gap of a quarter of the block's height.
 */
export function snapBlock(x: number, y: number, size: { w: number; h: number }, main: Bounds, reach: number): Snap {
  const guides: Snap['guides'] = { v: [], h: [] }
  const cx = main.cx + x
  const cy = main.cy + y
  const gap = size.h * 0.25
  const xs: [number, number][] = [
    [main.cx, main.cx],
    [main.minX + size.w / 2, main.minX],
    [main.maxX - size.w / 2, main.maxX],
  ]
  const ys: [number, number][] = [
    [main.cy, main.cy],
    [main.minY - gap - size.h / 2, main.minY - gap / 2],
    [main.maxY + gap + size.h / 2, main.maxY + gap / 2],
  ]
  let outX = x
  let outY = y
  let bestX = reach
  for (const [target, line] of xs) {
    if (Math.abs(cx - target) <= bestX) {
      bestX = Math.abs(cx - target)
      outX = target - main.cx
      guides.v = [line]
    }
  }
  let bestY = reach
  for (const [target, line] of ys) {
    if (Math.abs(cy - target) <= bestY) {
      bestY = Math.abs(cy - target)
      outY = target - main.cy
      guides.h = [line]
    }
  }
  return { x: outX, y: outY, guides }
}
