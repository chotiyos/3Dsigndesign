/** Resolve only local app links; leave downloads and other browsing contexts native. */
export function localDestination(href: string, current: string): string | null {
  if (!(href.startsWith('/') || href.startsWith('#') || href.startsWith('?')) || href.startsWith('//')) return null
  const base = new URL(current)
  const url = new URL(href, base)
  return url.origin === base.origin ? url.pathname + url.search + url.hash : null
}

export function routeLocation(href: string) {
  const url = new URL(href)
  return { path: url.pathname.replace(/\/+$/, '') || '/', query: url.searchParams, hash: url.hash, search: url.search, href: url.href }
}

export function hashId(hash: string): string {
  try { return decodeURIComponent(hash.slice(1)) } catch { return hash.slice(1) }
}

/** Remove one-time editor launch inputs only after the draft is safely saved. */
export function consumedEditorUrl(href: string): string {
  const url = new URL(href)
  for (const key of ['style', 'text', 'file']) url.searchParams.delete(key)
  if (url.hash.startsWith('#d=')) url.hash = ''
  return url.pathname + url.search + url.hash
}
