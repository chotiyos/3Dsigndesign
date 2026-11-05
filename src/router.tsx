import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

/** A tiny history router: the site has a fixed, small set of paths. */
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

window.addEventListener('popstate', notify)

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search + location.hash) return
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  notify()
  if (!to.includes('#')) window.scrollTo({ top: 0 })
}

export function useLocation() {
  const path = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => location.pathname + location.search,
  )
  const url = new URL(path, location.origin)
  return { path: url.pathname.replace(/\/+$/, '') || '/', query: url.searchParams }
}

export function Link({ href = '/', onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!href.startsWith('/') || rest.target === '_blank') return
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
