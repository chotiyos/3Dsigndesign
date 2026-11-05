import { useEffect, useLayoutEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { hashId, localDestination, routeLocation } from './lib/router'

/** A tiny history router: the site has a fixed, small set of paths. */
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

type Position = { x: number; y: number }
let restoring = false
let restorePosition: Position | undefined

function savePosition() {
  if (!restoring) history.replaceState({ ...history.state, jjScroll: { x: window.scrollX, y: window.scrollY } }, '')
}

history.scrollRestoration = 'manual'
window.addEventListener('scroll', savePosition, { passive: true })
window.addEventListener('popstate', () => {
  restorePosition = history.state?.jjScroll
  restoring = true
  notify()
})
window.addEventListener('hashchange', notify)

export function navigate(to: string, replace = false) {
  const destination = localDestination(to, location.href)
  if (destination === null) return
  to = destination
  if (to === location.pathname + location.search + location.hash) {
    const target = location.hash ? document.getElementById(hashId(location.hash)) : null
    target?.scrollIntoView({ behavior: 'instant' })
    if (location.hash === '#content') target?.focus({ preventScroll: true })
    return
  }
  savePosition()
  restoring = true
  restorePosition = undefined
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  notify()
}

export function useLocation() {
  const path = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => location.href,
  )
  return routeLocation(path)
}

/** Run after React has mounted the destination, including its anchor elements. */
export function useNavigationScroll() {
  const { href, hash } = useLocation()
  useLayoutEffect(() => {
    const position = restorePosition
    restorePosition = undefined
    const target = hash ? document.getElementById(hashId(hash)) : null
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' })
    } else if (target) {
      target.scrollIntoView({ behavior: 'instant' })
      if (hash === '#content') target.focus({ preventScroll: true })
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
    restoring = false
    savePosition()
  }, [href, hash])
}

export function Link({ href = '/', onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (localDestination(href, location.href) === null || rest.download != null || (rest.target && rest.target !== '_self')) return
    e.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={handle} {...rest} />
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · JJDesign` : 'JJDesign — ออกแบบป้ายตัวอักษร 3D'
  }, [title])
}
