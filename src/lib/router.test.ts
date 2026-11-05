import { describe, expect, it } from 'vitest'
import { hashId, localDestination, routeLocation } from './router'

const current = 'https://jjdesign.test/styles?text=old#details'

describe('local router destinations', () => {
  it('preserves queries and hashes and resolves same-page links', () => {
    expect(localDestination('/app?text=%E0%B8%81&style=halo#parts', current)).toBe('/app?text=%E0%B8%81&style=halo#parts')
    expect(localDestination('#group-lit', current)).toBe('/styles?text=old#group-lit')
    expect(localDestination('?text=', current)).toBe('/styles?text=')
  })

  it('leaves external and non-app links to the browser', () => {
    for (const href of ['https://example.com', '//example.com', '/\\example.com', 'mailto:a@example.com', 'data:text/plain,x']) {
      expect(localDestination(href, current)).toBeNull()
    }
  })

  it('normalizes routing paths without discarding empty or Thai query values', () => {
    const route = routeLocation('https://jjdesign.test/app///?text=&name=%E0%B8%81#group-lit')
    expect(route.path).toBe('/app')
    expect(route.query.get('text')).toBe('')
    expect(route.query.get('name')).toBe('ก')
    expect(route.hash).toBe('#group-lit')
    expect(routeLocation('https://jjdesign.test/').path).toBe('/')
  })

  it('decodes anchor IDs and tolerates malformed percent escapes', () => {
    expect(hashId('#%E0%B8%81')).toBe('ก')
    expect(hashId('#bad%escape')).toBe('bad%escape')
  })
})
