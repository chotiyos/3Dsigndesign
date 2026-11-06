import { afterEach, expect, it, vi } from 'vitest'
vi.mock('harfbuzzjs', () => ({
  Blob: class {}, Face: class { upem = 1000 }, Font: class {},
}))
import { loadFont } from './hb'

afterEach(() => vi.unstubAllGlobals())

it('retries failed font downloads while sharing successful and pending loads', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })
  vi.stubGlobal('fetch', fetch)
  const failed = loadFont('/retry.ttf')
  expect(loadFont('/retry.ttf')).toBe(failed)
  await expect(failed).rejects.toThrow('503')
  const retry = loadFont('/retry.ttf')
  expect(loadFont('/retry.ttf')).toBe(retry)
  await expect(retry).resolves.toHaveProperty('upem', 1000)
  expect(loadFont('/retry.ttf')).toBe(retry)
  expect(fetch).toHaveBeenCalledTimes(2)
})
