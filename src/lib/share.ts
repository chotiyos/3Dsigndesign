import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'

/** Longest share code we hand out; past this a chat app may cut the link. */
export const SHARE_LIMIT = 30_000

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Packs a design into a short code for the address bar. It travels after
 * "#", so it never reaches the server; whoever opens the link gets a copy.
 */
export function encodeShare(design: object): string {
  return toBase64Url(deflateSync(strToU8(JSON.stringify({ app: 'jjdesign', v: 1, d: design })), { level: 9 }))
}

/** The design inside a link's "#d=…" part, or null when there is none or it is damaged. */
export function decodeShare(hash: string): Record<string, unknown> | null {
  const match = /^#?d=([A-Za-z0-9_-]+)$/.exec(hash)
  if (!match || match[1].length > SHARE_LIMIT * 2) return null
  try {
    const parsed = JSON.parse(strFromU8(inflateSync(fromBase64Url(match[1])))) as { app?: string; d?: unknown }
    if (parsed.app !== 'jjdesign' || !parsed.d || typeof parsed.d !== 'object' || Array.isArray(parsed.d)) return null
    return parsed.d as Record<string, unknown>
  } catch {
    return null
  }
}
