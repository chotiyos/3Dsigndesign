import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface TourStep {
  /** CSS selector of the thing this step points at. */
  target: string
  title: string
  text: string
}

const GAP = 12
const MARGIN = 16

/**
 * A short guided walk through a page: dims everything but one element and
 * explains it in a card beside it. Steps whose element is missing (hidden on
 * this screen size) are skipped.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const shown = steps.filter((step) => typeof document === 'undefined' || document.querySelector(step.target))
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [card, setCard] = useState({ w: 340, h: 180 })
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const step = shown[Math.min(index, shown.length - 1)]

  useLayoutEffect(() => {
    if (!step) return
    const measure = () => {
      setRect(document.querySelector(step.target)?.getBoundingClientRect() ?? null)
      const box = cardRef.current?.getBoundingClientRect()
      if (box) setCard((c) => (Math.abs(c.w - box.width) > 1 || Math.abs(c.h - box.height) > 1 ? { w: box.width, h: box.height } : c))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step])

  useEffect(() => {
    nextRef.current?.focus()
  }, [index])

  if (!step) return null
  const last = index >= shown.length - 1
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top: number
  let left: number
  if (!rect) {
    top = (vh - card.h) / 2
    left = (vw - card.w) / 2
  } else {
    left = Math.min(Math.max(rect.left, MARGIN), vw - card.w - MARGIN)
    if (rect.bottom + GAP + card.h <= vh - MARGIN) top = rect.bottom + GAP
    else if (rect.top - GAP - card.h >= MARGIN) top = rect.top - GAP - card.h
    else if (rect.left - GAP - card.w >= MARGIN) {
      left = rect.left - GAP - card.w
      top = Math.min(Math.max(rect.top, MARGIN), vh - card.h - MARGIN)
    } else {
      // Large targets (the 3D view): sit inside, near the bottom.
      top = Math.min(rect.bottom, vh) - card.h - MARGIN * 2
      left = Math.min(Math.max(rect.left + (rect.width - card.w) / 2, MARGIN), vw - card.w - MARGIN)
    }
  }

  return (
    <div className="tour" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {rect && (
        <div
          className="tour-ring"
          aria-hidden="true"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        style={{ top: Math.max(MARGIN, top), left: Math.max(MARGIN, left) }}
      >
        <p className="tour-count tabular">{index + 1} / {shown.length}</p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-text">{step.text}</p>
        <div className="tour-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>ข้าม</button>
          {index > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setIndex(index - 1)}>ย้อนกลับ</button>
          )}
          <button ref={nextRef} type="button" className="btn btn-primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? 'เริ่มออกแบบ' : 'ถัดไป'}
          </button>
        </div>
      </div>
    </div>
  )
}
