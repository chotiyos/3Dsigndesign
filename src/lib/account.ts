import { useSyncExternalStore } from 'react'

/**
 * Browser-only demo account. Nothing leaves the visitor's browser: there is no
 * server, no password, and no real payment. Every screen that shows this data
 * says so.
 */
export interface DemoAccount {
  name: string
  email: string
  credits: number
  history: { at: number; text: string; delta: number }[]
}

export interface CartLine {
  id: string
  qty: number
}

interface State {
  account: DemoAccount | null
  guestCredits: number
  cart: CartLine[]
}

const KEY = 'jjdesign-demo-v1'
export const STARTING_CREDITS = 100
const listeners = new Set<() => void>()

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>
      return {
        account: parsed.account && typeof parsed.account.name === 'string' && typeof parsed.account.email === 'string' && Number.isFinite(parsed.account.credits) && parsed.account.credits >= 0 && Array.isArray(parsed.account.history)
          ? { ...parsed.account, history: parsed.account.history.filter((h) => h && Number.isFinite(h.at) && typeof h.text === 'string' && Number.isFinite(h.delta)) } : null,
        guestCredits: typeof parsed.guestCredits === 'number' && Number.isFinite(parsed.guestCredits) && parsed.guestCredits >= 0 ? parsed.guestCredits : STARTING_CREDITS,
        cart: Array.isArray(parsed.cart) ? parsed.cart.filter((l) => l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 99) : [],
      }
    }
  } catch {
    // Storage blocked or corrupted: fall back to a fresh demo state.
  }
  return { account: null, guestCredits: STARTING_CREDITS, cart: [] }
}

let state = load()

function save(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode: the demo still works for this page view.
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      state = load()
      fn()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useDemo() {
  return useSyncExternalStore(subscribe, () => state)
}

export const credits = (s: State = state) => (s.account ? s.account.credits : s.guestCredits)

export function signIn(name: string, email: string) {
  const account: DemoAccount = state.account ?? {
    name,
    email,
    credits: state.guestCredits,
    history: [{ at: Date.now(), text: 'เปิดบัญชีทดลอง', delta: 0 }],
  }
  save({ ...state, account: { ...account, name, email } })
}

export function signOut() {
  save({ ...state, account: null, guestCredits: STARTING_CREDITS })
}

/** Returns false (and charges nothing) when the balance is too low. */
export function spend(amount: number, text: string): boolean {
  if (!Number.isFinite(amount) || amount < 0 || credits() < amount) return false
  if (state.account) {
    const account = {
      ...state.account,
      credits: state.account.credits - amount,
      history: [{ at: Date.now(), text, delta: -amount }, ...state.account.history].slice(0, 50),
    }
    save({ ...state, account })
  } else {
    save({ ...state, guestCredits: state.guestCredits - amount })
  }
  return true
}

export function topUp(amount: number, text: string) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(credits() + amount)) return
  if (state.account) {
    const account = {
      ...state.account,
      credits: state.account.credits + amount,
      history: [{ at: Date.now(), text, delta: amount }, ...state.account.history].slice(0, 50),
    }
    save({ ...state, account })
  } else {
    save({ ...state, guestCredits: state.guestCredits + amount })
  }
}

export function setCartQty(id: string, qty: number) {
  if (!Number.isFinite(qty)) return
  qty = Math.min(99, Math.max(0, Math.round(qty)))
  const rest = state.cart.filter((l) => l.id !== id)
  save({ ...state, cart: qty > 0 ? [...rest, { id, qty: Math.min(99, Math.round(qty)) }] : rest })
}

export function clearCart() {
  save({ ...state, cart: [] })
}

export const EXPORT_COST = { stl: 10, dxf: 10, zip: 20, file: 15 }
