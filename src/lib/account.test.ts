import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
async function account(raw = '{}') {
  vi.stubGlobal('localStorage', { getItem: () => raw, setItem: vi.fn() })
  return import('./account')
}
describe('demo balances and cart', () => {
  it('rejects negative and non-finite credit operations', async () => {
    const a = await account()
    for (const amount of [-1, NaN, Infinity]) {
      expect(a.spend(amount, 'test')).toBe(false)
      a.topUp(amount, 'test')
    }
    expect(a.credits()).toBe(100)
    expect(a.spend(10, 'test')).toBe(true)
    expect(a.credits()).toBe(90)
  })
  it('ignores malformed stored account data', async () => {
    const a = await account(JSON.stringify({ account: { name: 'x', credits: 'bad' }, guestCredits: -20 }))
    expect(a.credits()).toBe(100)
    a.signIn('test', 'test@example.com')
    expect(a.spend(10, 'test')).toBe(true)
  })
})
