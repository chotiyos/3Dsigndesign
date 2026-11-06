import { expect, it, vi } from 'vitest'
import { containModalFocus } from './modalFocus'

it('cycles modal controls, handles Escape, and restores the opener', () => {
  const listeners = new Map<string, (event: any) => void>()
  const opener = { isConnected: true, focus: vi.fn() }
  const doc = { activeElement: opener as unknown, addEventListener: (key: string, fn: any) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) }
  const first = { focus: vi.fn(() => { doc.activeElement = first }) }
  const last = { focus: vi.fn(() => { doc.activeElement = last }) }
  const root = { ownerDocument: doc, querySelectorAll: (selector: string) => selector === 'iframe' ? [] : [first, last], contains: (item: unknown) => item === first || item === last }
  const close = vi.fn()
  const cleanup = containModalFocus(root as unknown as HTMLElement, close)
  expect(doc.activeElement).toBe(first)
  const key = (name: string, shiftKey = false) => { const event = { key: name, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() }; listeners.get('keydown')!(event); return event }
  expect(key('Tab', true).preventDefault).toHaveBeenCalled()
  expect(doc.activeElement).toBe(last)
  key('Tab')
  expect(doc.activeElement).toBe(first)
  doc.activeElement = opener
  listeners.get('focusin')!({})
  expect(doc.activeElement).toBe(first)
  key('Escape')
  expect(close).toHaveBeenCalledOnce()
  cleanup()
  expect(listeners.size).toBe(0)
  expect(opener.focus).toHaveBeenCalledOnce()
})
