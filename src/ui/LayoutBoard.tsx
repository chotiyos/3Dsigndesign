import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { snapBlock, type Snap } from '../lib/blocks'
import { bounds, type Bounds, type Region } from '../lib/geo2d'

export interface BoardBlock {
  id: string
  label: string
  /** Outline centred anywhere; the board places it by x and y. */
  shape: Region
  x: number
  y: number
}

const pathOf = (region: Region, dx = 0, dy = 0) =>
  region.map((poly) => `M${poly.map(([x, y]) => `${(x + dx).toFixed(2)},${(-(y + dy)).toFixed(2)}`).join('L')}Z`).join('')

/**
 * A flat plan of the sign: the main artwork stays put, extra text blocks are
 * dragged (or nudged with the arrow keys) and snap to its centre line and
 * edges, with a guide line drawn while they are lined up.
 */
export function LayoutBoard({ main, blocks, selected, onSelect, onMove }: {
  main: Region
  blocks: BoardBlock[]
  selected: string | null
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: string; pointerId: number; x: number; y: number; from: [number, number]; start: [number, number]; view: string; snap: Snap } | null>(null)
  const anchor = bounds(main)
  const sizes = new Map(blocks.map((b) => [b.id, b.shape.length ? bounds(b.shape) : null]))
  const at = (b: BoardBlock) => (drag?.id === b.id ? { x: drag.x, y: drag.y } : b)

  // Frame everything placed, with room around it.
  const all: Bounds[] = [anchor]
  for (const b of blocks) {
    const s = sizes.get(b.id)
    if (s) all.push({ ...s, minX: anchor.cx + b.x - s.w / 2, maxX: anchor.cx + b.x + s.w / 2, minY: anchor.cy + b.y - s.h / 2, maxY: anchor.cy + b.y + s.h / 2 })
  }
  const minX = Math.min(...all.map((b) => b.minX))
  const maxX = Math.max(...all.map((b) => b.maxX))
  const minY = Math.min(...all.map((b) => b.minY))
  const maxY = Math.max(...all.map((b) => b.maxY))
  const pad = Math.max(maxX - minX, maxY - minY, 10) * 0.08
  const liveView = `${minX - pad} ${-maxY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
  const view = drag?.view ?? liveView
  const [, , vw, vh] = view.split(' ').map(Number)
  const reach = Math.max(vw, vh) * 0.025

  const toSign = (e: PointerEvent): [number, number] => {
    const svg = svgRef.current
    const m = svg?.getScreenCTM()
    if (!svg || !m) return [0, 0]
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [p.x, -p.y]
  }

  const down = (e: PointerEvent<SVGGElement>, b: BoardBlock) => {
    const size = sizes.get(b.id)
    if (!size || e.button !== 0 || drag) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    onSelect(b.id)
    setDrag({ id: b.id, pointerId: e.pointerId, x: b.x, y: b.y, from: toSign(e), start: [b.x, b.y], view: liveView, snap: { x: b.x, y: b.y, guides: { v: [], h: [] } } })
  }
  const move = (e: PointerEvent<SVGGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const size = sizes.get(drag.id)
    if (!size) return
    const [px, py] = toSign(e)
    const snap = snapBlock(drag.start[0] + px - drag.from[0], drag.start[1] + py - drag.from[1], size, anchor, reach)
    setDrag({ ...drag, x: snap.x, y: snap.y, snap })
  }
  const up = (e: PointerEvent<SVGGElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (drag.x !== drag.start[0] || drag.y !== drag.start[1]) onMove(drag.id, Math.round(drag.x * 10) / 10, Math.round(drag.y * 10) / 10)
    setDrag(null)
  }
  const key = (e: KeyboardEvent<SVGGElement>, b: BoardBlock) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(b.id)
      return
    }
    const step = e.shiftKey ? 10 : 1
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
    if (!d) return
    e.preventDefault()
    onMove(b.id, Math.round((b.x + d[0]) * 10) / 10, Math.round((b.y + d[1]) * 10) / 10)
  }

  const [x0, y0] = view.split(' ').map(Number)
  return (
    <svg ref={svgRef} className="layout-board" viewBox={view} preserveAspectRatio="xMidYMid meet" role="group" aria-label="จัดวางข้อความบนป้าย">
      <path d={pathOf(main)} className="board-main" fillRule="evenodd" />
      {drag?.snap.guides.v.map((x) => <line key={`v${x}`} className="board-guide" x1={x} x2={x} y1={y0} y2={y0 + vh} />)}
      {drag?.snap.guides.h.map((y) => <line key={`h${y}`} className="board-guide" x1={x0} x2={x0 + vw} y1={-y} y2={-y} />)}
      {blocks.map((b) => {
        const s = sizes.get(b.id)
        if (!s) return null
        const p = at(b)
        const dx = anchor.cx + p.x - s.cx
        const dy = anchor.cy + p.y - s.cy
        return (
          <g
            key={b.id}
            className="board-block"
            data-selected={selected === b.id || undefined}
            data-dragging={drag?.id === b.id || undefined}
            tabIndex={0}
            role="button"
            aria-pressed={selected === b.id}
            aria-label={`${b.label} ตำแหน่ง ${b.x}, ${b.y} มม. ลากเพื่อย้าย หรือกดลูกศรเพื่อเลื่อนทีละ 1 มม. (Shift 10 มม.)`}
            onPointerDown={(e) => down(e, b)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={(e) => { if (drag?.pointerId === e.pointerId) setDrag(null) }}
            onLostPointerCapture={(e) => { if (drag?.pointerId === e.pointerId) setDrag(null) }}
            onFocus={() => onSelect(b.id)}
            onKeyDown={(e) => key(e, b)}
          >
            <rect x={s.minX + dx - pad * 0.15} y={-(s.maxY + dy) - pad * 0.15} width={s.w + pad * 0.3} height={s.h + pad * 0.3} className="board-hit" />
            <path d={pathOf(b.shape, dx, dy)} fillRule="evenodd" />
          </g>
        )
      })}
    </svg>
  )
}
