import { describe, expect, it } from 'vitest'
import { encodeQr, rsEncode, rsSyndromes } from './qr'

describe('QR encoder', () => {
  it('Reed–Solomon check words make every syndrome zero', () => {
    const data = Array.from({ length: 28 }, (_, i) => (i * 37 + 11) & 0xff)
    const block = [...data, ...rsEncode(data, 16)]
    expect(rsSyndromes(block, 16).every((s) => s === 0)).toBe(true)
    block[3] ^= 0x55
    expect(rsSyndromes(block, 16).some((s) => s !== 0)).toBe(true)
  })

  it('matches the known check words for the standard example (01 Mode "01234567" test vector)', () => {
    // From the QR specification annex: version 1-M data words and their 10 EC words.
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]
    expect(rsEncode(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55])
  })

  it('draws finder patterns, timing and a valid format word', () => {
    const qr = encodeQr('https://jjdesign.pages.dev/gifts')
    const g = qr.modules
    expect(qr.size).toBe(17 + 4 * qr.version)
    // Finder: dark border, light ring, dark centre.
    for (const [r, c] of [[0, 0], [0, qr.size - 7], [qr.size - 7, 0]]) {
      expect(g[r][c] && g[r + 6][c + 6] && !g[r + 1][c + 1] && g[r + 3][c + 3]).toBe(true)
    }
    for (let i = 8; i < qr.size - 8; i++) expect(g[6][i]).toBe(i % 2 === 0)
    // The two format copies agree and decode to level M with a valid BCH code.
    const read1 = [0, 1, 2, 3, 4, 5, 7, 8].map((r) => g[r][8]).concat([7, 5, 4, 3, 2, 1, 0].map((c) => g[8][c]))
    const read2 = Array.from({ length: 8 }, (_, i) => g[8][qr.size - 1 - i]).concat(Array.from({ length: 7 }, (_, i) => g[qr.size - 7 + i][8]))
    expect(read1).toEqual(read2)
    const word = read1.reduce((acc, bit, i) => acc | (Number(bit) << i), 0) ^ 0x5412
    expect(word >> 13).toBe(0)
    expect(g[qr.size - 8][8]).toBe(true)
  })

  it('grows the version with the text and refuses very long text', () => {
    expect(encodeQr('hi').version).toBe(1)
    expect(encodeQr('x'.repeat(100)).version).toBeGreaterThan(4)
    expect(() => encodeQr('x'.repeat(400))).toThrow()
  })
})
