import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoxGeometry } from 'three'

vi.mock('three', async (original) => ({
  ...await original<typeof import('three')>(),
  WebGLRenderer: class { constructor() { throw new Error('WebGL unavailable') } },
}))

import { thumbnail } from './thumbnails'

afterEach(() => vi.unstubAllGlobals())

describe('catalogue without WebGL', () => {
  it('resolves to a fallback and keeps the thumbnail queue usable', async () => {
    vi.stubGlobal('window', {})
    const make = () => [{ id: 'part', code: 'A', label: 'test', material: 'print' as const, explode: 0, geometry: new BoxGeometry() }]
    await expect(thumbnail('no-webgl-first', make)).resolves.toBe('')
    await expect(thumbnail('no-webgl-second', make)).resolves.toBe('')
  })
})
