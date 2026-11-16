/**
 * A small QR Code encoder (model 2): byte mode, error correction level M,
 * versions 1–10 (up to 213 bytes, plenty for a link). Returns the module
 * grid, true = dark, without the quiet zone.
 */

// Codewords per version for level M: [ec per block, [blocks, data words], ...groups].
const M_BLOCKS: [number, [number, number][]][] = [
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
  [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]],
]
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]

// GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)

/** Reed–Solomon check words for `data`. */
export function rsEncode(data: number[], ecLen: number): number[] {
  // Generator polynomial (x - a^0)(x - a^1)…(x - a^(ecLen-1)), highest power first.
  let gen = [1]
  for (let i = 0; i < ecLen; i++) {
    const next = Array.from({ length: gen.length + 1 }, () => 0)
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= mul(gen[j], EXP[i])
    }
    gen = next
  }
  const rem: number[] = Array.from({ length: ecLen }, () => 0)
  for (const d of data) {
    const factor = d ^ rem.shift()!
    rem.push(0)
    for (let j = 0; j < ecLen; j++) rem[j] ^= mul(gen[j + 1], factor)
  }
  return rem
}

/** Syndromes of a received block (all zero for a valid code word). */
export function rsSyndromes(block: number[], ecLen: number): number[] {
  return Array.from({ length: ecLen }, (_, i) => block.reduce((acc, c) => mul(acc, EXP[i]) ^ c, 0))
}

function bchBits(value: number, poly: number, polyBits: number, total: number) {
  let v = value << (polyBits - 1)
  for (let i = total - 1; i >= polyBits - 1; i--) if ((v >> i) & 1) v ^= poly << (i - (polyBits - 1))
  return (value << (polyBits - 1)) | v
}

export interface QrCode {
  size: number
  version: number
  modules: boolean[][]
}

export function encodeQr(text: string): QrCode {
  const bytes = Array.from(new TextEncoder().encode(text))
  let version = 0
  for (let v = 1; v <= 10; v++) {
    const [, groups] = M_BLOCKS[v - 1]
    const capacity = groups.reduce((s, [n, d]) => s + n * d, 0)
    const countBits = v < 10 ? 8 : 16
    if (4 + countBits + bytes.length * 8 <= capacity * 8) { version = v; break }
  }
  if (!version) throw new Error('ข้อความยาวเกินไปสำหรับ QR (สูงสุดประมาณ 200 ตัวอักษร)')
  const [ecLen, groups] = M_BLOCKS[version - 1]
  const dataWords = groups.reduce((s, [n, d]) => s + n * d, 0)

  // Data bits: mode, count, bytes, terminator, padding.
  const bits: number[] = []
  const put = (value: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1) }
  put(0b0100, 4)
  put(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  put(0, Math.min(4, dataWords * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const words: number[] = []
  for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0; words.length < dataWords; pad++) words.push(pad % 2 ? 0x11 : 0xec)

  // Blocks and interleaving.
  const blocks: number[][] = []
  let at = 0
  for (const [n, d] of groups) for (let i = 0; i < n; i++) { blocks.push(words.slice(at, at + d)); at += d }
  const ecs = blocks.map((b) => rsEncode(b, ecLen))
  const stream: number[] = []
  const maxData = Math.max(...blocks.map((b) => b.length))
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) stream.push(b[i])
  for (let i = 0; i < ecLen; i++) for (const e of ecs) stream.push(e[i])

  const size = 17 + 4 * version
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array.from({ length: size }, (): boolean | null => null))
  const reserved: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const set = (r: number, c: number, dark: boolean) => { grid[r][c] = dark; reserved[r][c] = true }

  // Finder patterns with separators.
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
      set(rr, cc, ring !== 2 && ring !== 4 && r >= 0 && r <= 6 && c >= 0 && c <= 6)
    }
  }
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  // Alignment patterns.
  const pos = ALIGN[version - 1]
  for (const r of pos) for (const c of pos) {
    if ((r === 6 && c === 6) || (r === 6 && c === pos.at(-1)) || (r === pos.at(-1) && c === 6)) continue
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
  }
  // Dark module and reserved format areas.
  set(size - 8, 8, true)
  for (let i = 0; i < 9; i++) { if (!reserved[8][i]) set(8, i, false); if (!reserved[i][8]) set(i, 8, false) }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, false) }
  // Version information (versions 7+).
  if (version >= 7) {
    const info = bchBits(version, 0x1f25, 13, 18)
    for (let i = 0; i < 18; i++) {
      const bit = ((info >> i) & 1) === 1
      const a = Math.floor(i / 3), b = (i % 3) + size - 11
      set(a, b, bit)
      set(b, a, bit)
    }
  }

  // Data placement in the zig-zag order.
  const dataBits: number[] = []
  for (const w of stream) for (let i = 7; i >= 0; i--) dataBits.push((w >> i) & 1)
  let k = 0
  let upward = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue
        grid[row][c] = k < dataBits.length ? dataBits[k] === 1 : false
        k++
      }
    }
    upward = !upward
  }

  // Try all eight masks, keep the one with the lowest penalty.
  const masks: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ]
  let best: boolean[][] | null = null
  let bestScore = Infinity
  masks.forEach((mask, m) => {
    const g = grid.map((row, r) => row.map((cell, c) => (reserved[r][c] ? Boolean(cell) : Boolean(cell) !== mask(r, c))))
    // Format bits: level M (00) and the mask number.
    const format = bchBits((0b00 << 3) | m, 0x537, 11, 15) ^ 0x5412
    for (let i = 0; i < 15; i++) {
      const bit = ((format >> i) & 1) === 1
      // First copy, round the top-left finder.
      if (i < 6) g[i][8] = bit
      else if (i === 6) g[7][8] = bit
      else if (i === 7) g[8][8] = bit
      else if (i === 8) g[8][7] = bit
      else g[8][14 - i] = bit
      // Second copy, split between the other two finders.
      if (i < 8) g[8][size - 1 - i] = bit
      else g[size - 15 + i][8] = bit
    }
    g[size - 8][8] = true
    const score = penalty(g)
    if (score < bestScore) { bestScore = score; best = g }
  })
  return { size, version, modules: best! }
}

function penalty(g: boolean[][]) {
  const n = g.length
  let score = 0
  // Runs of five or more in rows and columns.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let run = 1
      for (let j = 1; j < n; j++) {
        const a = pass ? g[j][i] : g[i][j]
        const b = pass ? g[j - 1][i] : g[i][j - 1]
        if (a === b) run++
        else { if (run >= 5) score += run - 2; run = 1 }
      }
      if (run >= 5) score += run - 2
    }
  }
  // 2×2 blocks.
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
    const v = g[i][j]
    if (v === g[i + 1][j] && v === g[i][j + 1] && v === g[i + 1][j + 1]) score += 3
  }
  // Dark balance.
  const dark = g.flat().filter(Boolean).length
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10
  return score
}
