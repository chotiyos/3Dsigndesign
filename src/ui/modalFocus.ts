/** Keep keyboard focus in an open modal and restore its opener on close. */
export function containModalFocus(root: HTMLElement, close: () => void) {
  const doc = root.ownerDocument
  const previous = doc.activeElement as HTMLElement | null
  const controls = () => Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], iframe, [tabindex="0"]'))
  const focusFirst = () => controls()[0]?.focus()
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key !== 'Tab') return
    const items = controls()
    const first = items[0]
    const last = items.at(-1)
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  const focusin = () => { if (!root.contains(doc.activeElement)) focusFirst() }
  // Key events inside the job-sheet iframe do not bubble to its parent.
  const frames = Array.from(root.querySelectorAll('iframe'))
  const loaded = () => { for (const frame of frames) frame.contentDocument?.addEventListener('keydown', keydown) }
  for (const frame of frames) frame.addEventListener('load', loaded)
  loaded()
  doc.addEventListener('keydown', keydown)
  doc.addEventListener('focusin', focusin)
  focusFirst()
  return () => {
    doc.removeEventListener('keydown', keydown)
    doc.removeEventListener('focusin', focusin)
    for (const frame of frames) {
      frame.removeEventListener('load', loaded)
      frame.contentDocument?.removeEventListener('keydown', keydown)
    }
    if (previous?.isConnected) previous.focus()
  }
}
