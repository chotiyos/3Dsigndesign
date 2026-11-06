import { beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { rect } from '../lib/geo2d'

const h = vi.hoisted(() => ({ drag: null as any, svg: null as any }))
vi.mock('react', async () => ({
  ...await vi.importActual('react'),
  useRef: () => ({ current: h.svg }),
  useState: () => [h.drag, (value: unknown) => { h.drag = value }],
}))
import { LayoutBoard } from './LayoutBoard'
function nodes(n: ReactNode): any[] {
  if (Array.isArray(n)) return n.flatMap(nodes)
  if (!isValidElement<any>(n)) return []
  return [n, ...nodes((n.props as any).children)]
}
const blocks = [{ id: 'a', label: 'ข้อความ 2', shape: rect(0, 0, 100, 20), x: 0, y: -80 }, { id: 'b', label: 'ข้อความ 3', shape: rect(0, 0, 100, 20), x: 50, y: -120 }]
let onMove = vi.fn(), onSelect = vi.fn()
const render = () => nodes(LayoutBoard({ main: rect(0, 0, 400, 100), blocks, selected: 'a', onMove, onSelect }))
const block = (index = 0) => render().filter(n => n.type === 'g')[index].props
const event = (pointerId = 1) => ({ pointerId, button: 0, clientX: 0, clientY: 0, currentTarget: { setPointerCapture: vi.fn(), focus: vi.fn() } })
beforeEach(() => { h.drag = null; h.svg = null; onMove = vi.fn(); onSelect = vi.fn() })
it('focuses a pointer-selected block and refuses a competing drag', () => {
  const e = event()
  block().onPointerDown(e)
  expect(e.currentTarget.focus).toHaveBeenCalledOnce()
  const drag = h.drag
  block(1).onPointerDown(event(2))
  expect(h.drag).toBe(drag)
  block().onPointerMove(event(2))
  block().onPointerUp(event(2))
  expect(h.drag).toBe(drag)
  expect(onMove).not.toHaveBeenCalled()
})
it('cancels interrupted gestures without committing their preview', () => {
  block().onPointerDown(event())
  h.drag = { ...h.drag, x: 22 }
  block().onPointerCancel(event())
  expect(h.drag).toBeNull()
  expect(onMove).not.toHaveBeenCalled()
  block().onPointerDown(event())
  block().onLostPointerCapture(event())
  expect(h.drag).toBeNull()
})
it('keeps the view fixed during a drag and commits only on release', () => {
  block().onPointerDown(event())
  const view = h.drag.view
  h.drag = { ...h.drag, x: 22.24, y: -87.36 }
  expect(render()[0].props.viewBox).toBe(view)
  expect(onMove).not.toHaveBeenCalled()
  block().onPointerUp(event())
  expect(onMove).toHaveBeenCalledExactlyOnceWith('a', 22.2, -87.4)
})
it('supports button activation and exposes selection and position to assistive technology', () => {
  const preventDefault = vi.fn()
  block().onKeyDown({ key: ' ', preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(onSelect).toHaveBeenCalledWith('a')
  expect(block()['aria-pressed']).toBe(true)
  expect(block()['aria-label']).toContain('0, -80')
  block().onKeyDown({ key: 'ArrowRight', shiftKey: true, preventDefault })
  expect(onMove).toHaveBeenCalledWith('a', 10, -80)
})

it('keeps dragged and nudged positions within the project round-trip limits', () => {
  block().onPointerDown(event())
  h.drag = { ...h.drag, x: 25000, y: -25000 }
  block().onPointerUp(event())
  expect(onMove).toHaveBeenLastCalledWith('a', 20000, -20000)
  const edge = [{ ...blocks[0], x: 20000, y: -20000 }]
  const tree = nodes(LayoutBoard({ main: rect(0, 0, 400, 100), blocks: edge, selected: 'a', onMove, onSelect }))
  const props = tree.find(n => n.type === 'g').props
  props.onKeyDown({ key: 'ArrowRight', shiftKey: true, preventDefault: vi.fn() })
  expect(onMove).toHaveBeenLastCalledWith('a', 20000, -20000)
  props.onKeyDown({ key: 'ArrowDown', shiftKey: true, preventDefault: vi.fn() })
  expect(onMove).toHaveBeenLastCalledWith('a', 20000, -20000)
})
