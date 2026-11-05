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
  it('recovers from corrupt JSON, null, and invalid balances', async () => {
    const a = await account()
    for (const raw of ['{', 'null', '42', '[]', '{"guestCredits":"100"}', '{"guestCredits":1e400}']) {
      expect(a.parseDemoState(raw)).toEqual({ account: null, guestCredits: 100, cart: [] })
    }
  })
  it('removes unrenderable dates and caps the stored history', async () => {
    const a = await account()
    const entry = { at: 123, text: 'test', delta: -10 }
    const parsed = a.parseDemoState(JSON.stringify({ account: {
      name: 'test', email: 'test@example.com', credits: 90,
      history: [null, { ...entry, at: 1e300 }, { ...entry, delta: 'bad' }, ...Array(60).fill(entry)],
    } }))
    expect(parsed.account?.history).toHaveLength(50)
    expect(parsed.account?.history.every((h) => Number.isFinite(new Date(h.at).getTime()))).toBe(true)
  })
  it('merges duplicate cart lines, caps quantities, and rejects invalid entries', async () => {
    const a = await account()
    const parsed = a.parseDemoState(JSON.stringify({ cart: [null, { id: 'pla-gold', qty: 70 }, { id: 'pla-gold', qty: 60 },
      { id: 'petg-white', qty: -1 }, { id: 'petg-white', qty: 1.5 }, { id: 'petg-white', qty: 100 }, { id: 'missing', qty: 2 }, { qty: 2 }] }))
    expect(parsed.cart).toEqual([{ id: 'pla-gold', qty: 99 }])
  })
  it('continues working when storage is blocked and rejects overflowing top-ups', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    const a = await import('./account')
    expect(a.credits()).toBe(100)
    a.topUp(Number.MAX_VALUE, 'test')
    a.topUp(Number.MAX_VALUE, 'test')
    expect(Number.isFinite(a.credits())).toBe(true)
    expect(a.spend(Infinity, 'test')).toBe(false)
  })
  it('bounds rapid cart changes and ignores invalid quantities and products', async () => {
    const a = await account()
    const saved = vi.mocked(localStorage.setItem)
    a.setCartQty('missing', 2)
    a.setCartQty('pla-gold', NaN)
    expect(saved).not.toHaveBeenCalled()
    a.changeCartQty('pla-gold', 60)
    a.changeCartQty('pla-gold', 60)
    expect(JSON.parse(saved.mock.lastCall![1]).cart).toEqual([{ id: 'pla-gold', qty: 99 }])
    a.changeCartQty('pla-gold', -100)
    expect(JSON.parse(saved.mock.lastCall![1]).cart).toEqual([])
  })
})
