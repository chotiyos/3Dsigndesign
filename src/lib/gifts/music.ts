import { puffUp } from '../bubbleKeychain'
import { charmArt } from '../charms'
import { encodeQr } from '../qr'
import { bounds, circle, diff, offset, rect, roundRect, scale, translate, union, type Region } from '../geo2d'
import { silhouette } from '../styles/kit'
import { filled, fitText, fontOf, missingGlyphs, num, standingFoot, str, type GiftContext, type GiftDesign, type GiftLayer, type GiftValues } from './core'

const NO_GLYPH = 'ฟอนต์นี้ไม่มีตัวอักษรบางตัว ลองเปลี่ยนฟอนต์ (ฟอนต์อังกฤษใช้กับภาษาไทยไม่ได้)'

const sized = (region: Region, h: number): Region => {
  const b = bounds(region)
  const k = h / b.h
  return translate(scale(region, k), -((b.minX + b.maxX) / 2) * k, -((b.minY + b.maxY) / 2) * k)
}
const centreAt = (region: Region, x: number, y: number): Region => {
  const b = bounds(region)
  return translate(region, x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2)
}
function text(ctx: GiftContext, v: GiftValues, key: string, w: number, h: number) {
  const fit = fitText(fontOf(ctx, v, key), str(v, key), w, h * 1.5, h, false)
  return fit.art.length ? puffUp(fit.art, Math.min(0.4, fit.height * 0.03)) : []
}

/** The QR code for `link` as raised squares, `size` mm wide, centred at (x, y). */
export function qrRegion(link: string, size: number, x: number, y: number): Region {
  const qr = encodeQr(link || ' ')
  const m = size / qr.size
  const runs: Region[] = []
  qr.modules.forEach((row, r) => {
    // Neighbouring dark modules in a row become one bar.
    let start = -1
    row.forEach((dark, c) => {
      if (dark && start < 0) start = c
      if ((!dark || c === row.length - 1) && start >= 0) {
        const end = dark ? c + 1 : c
        runs.push(rect(x - size / 2 + ((start + end) / 2) * m, y + size / 2 - (r + 0.5) * m, (end - start) * m + 0.02, m + 0.02))
        start = -1
      }
    })
  })
  return union(...runs)
}

/** Play controls: back, play (in a ring), forward, and a progress bar above them. */
function controls(w: number, y: number): Region {
  const s = w * 0.07
  const play: Region = [[[-s * 0.6, y - s * 0.8], [s * 0.85, y], [-s * 0.6, y + s * 0.8]]]
  const ring = diff(circle(0, y, s * 1.7, 48), circle(0, y, s * 1.3, 48))
  const back = union([[[-w * 0.24, y], [-w * 0.24 + s * 1.2, y - s * 0.8], [-w * 0.24 + s * 1.2, y + s * 0.8]]], rect(-w * 0.24 - 0.7, y, 1.4, s * 1.6))
  const fwd = union([[[w * 0.24, y], [w * 0.24 - s * 1.2, y + s * 0.8], [w * 0.24 - s * 1.2, y - s * 0.8]]], rect(w * 0.24 + 0.7, y, 1.4, s * 1.6))
  const bar = union(roundRect(0, y + s * 3, w * 0.7, 1.4, 0.7), circle(-w * 0.1, y + s * 3, 2.2, 24))
  return union(play, ring, back, fwd, bar)
}

/**
 * A phone-style music card standing on a block: a photo window (or a heart),
 * the names, playback controls; the song's QR code on the block in front.
 */
function music(ctx: GiftContext, v: GiftValues, heart: boolean) {
  if (missingGlyphs(fontOf(ctx, v, 'names'), str(v, 'names'))) return { layers: [], warning: NO_GLYPH }
  const W = num(v, 'width')
  const H = W * 1.55
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const blockH = 14
  const D = W * 0.75
  const back = D * 0.18
  const layers: GiftLayer[] = []
  // The block, with a groove-free top: the card is joined to it.
  layers.push({ colour: 'block', region: roundRect(0, 0, W * 1.05, D, 6), z: 0, h: blockH })
  const qrSize = Math.min(D * 0.55, W * 0.5)
  layers.push({ colour: 'qrBack', region: roundRect(0, -D * 0.12, qrSize + 6, qrSize + 6, 2), z: blockH, h: 0.8 })
  try {
    layers.push({ colour: 'qr', region: qrRegion(str(v, 'link'), qrSize, 0, -D * 0.12), z: blockH + 0.8, h: 0.8 })
  } catch (err) {
    return { layers: [], warning: err instanceof Error ? err.message : 'สร้าง QR ไม่สำเร็จ' }
  }
  // The card, drawn front-on from the block's top up.
  const card = roundRect(0, blockH + H / 2, W, H, W * 0.1)
  const win = roundRect(0, blockH + H * 0.66, W * 0.78, W * 0.78, W * 0.05)
  layers.push({ colour: 'card', region: diff(card, win), z: 0, h: t, stand: back })
  if (heart) {
    // A heart outline instead of a photo.
    const h = sized(filled(charmArt('heart')), W * 0.6)
    const outline = diff(h, offset(h, -2.4))
    layers.push({ colour: 'card', region: win, z: 0, h: t - 1, stand: back })
    layers.push({ colour: 'accent', region: centreAt(outline, 0, blockH + H * 0.66), z: t - 1, h: r + 1, stand: back })
  } else {
    layers.push({ colour: 'window', region: win, z: 0, h: t - 1.4, stand: back })
  }
  const names = text(ctx, v, 'names', W * 0.84, W * 0.12)
  if (names.length) layers.push({ colour: 'accent', region: centreAt(names, 0, blockH + H * 0.3), z: t, h: r, stand: back })
  layers.push({ colour: 'accent', region: controls(W, blockH + H * 0.12), z: t, h: r, stand: back })
  return { layers }
}

/** A social sign: an Instagram-style camera icon, the handle, and a QR code, on a deep slab. */
function connect(ctx: GiftContext, v: GiftValues) {
  if (missingGlyphs(fontOf(ctx, v, 'handle'), str(v, 'handle'))) return { layers: [], warning: NO_GLYPH }
  const H = num(v, 'size')
  const t = num(v, 'base')
  const r = num(v, 'raise')
  const handle = text(ctx, v, 'handle', H * 6, H * 0.62)
  const hb = handle.length ? bounds(handle) : { w: 0, h: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 }
  const iconS = H * 0.86
  const qrS = H * 0.9
  const gap = H * 0.18
  const total = iconS + gap + hb.w + gap + qrS
  const x0 = -total / 2
  const icon = roundRect(x0 + iconS / 2, 0, iconS, iconS, iconS * 0.28)
  const lens = diff(circle(x0 + iconS / 2, 0, iconS * 0.24, 48), circle(x0 + iconS / 2, 0, iconS * 0.16, 48))
  const dot = circle(x0 + iconS * 0.76, iconS * 0.25, iconS * 0.06, 24)
  const iconCut = diff(icon, offset(icon, -iconS * 0.08))
  const face = handle.length ? translate(handle, x0 + iconS + gap - hb.minX, -(hb.minY + hb.maxY) / 2) : []
  const qx = x0 + total - qrS / 2
  let qr: Region
  try {
    qr = qrRegion(str(v, 'link'), qrS - 4, qx, 0)
  } catch (err) {
    return { layers: [], warning: err instanceof Error ? err.message : 'สร้าง QR ไม่สำเร็จ' }
  }
  const slab = roundRect(0, 0, total + H * 0.4, H * 1.3, H * 0.2)
  const layers: GiftLayer[] = [
    { colour: 'slab', region: slab, z: 0, h: t },
    { colour: 'icon', region: union(iconCut, lens, dot), z: t, h: r },
    { colour: 'outline', region: silhouette(face, 1.6), z: t, h: 0.8 },
    { colour: 'text', region: face, z: t + 0.8, h: r },
    { colour: 'qrBack', region: roundRect(qx, 0, qrS, qrS, 2), z: t, h: 0.8 },
    { colour: 'slab', region: qr, z: t + 0.8, h: 0.8 },
  ]
  if (v.stand) layers.unshift(standingFoot(slab, 'slab', t))
  return { layers }
}

const QR_HINT = 'ลิงก์เพลง (Spotify YouTube) หรือหน้าโปรไฟล์ สแกนทดสอบด้วยมือถือก่อนพิมพ์'

export const MUSIC: GiftDesign[] = ([false, true] as const).map((heart): GiftDesign => ({
  id: heart ? 'home-heartbeat' : 'home-music',
  name: heart ? 'ป้ายเพลงคู่รักหัวใจ' : 'ป้ายเพลงคู่รักใส่รูป',
  group: 'home',
  blurb: heart ? 'การ์ดทรงมือถือ หัวใจกลางจอ ชื่อคู่รัก ปุ่มเล่นเพลง และ QR เพลงบนฐาน' : 'การ์ดทรงมือถือ ช่องใส่รูป ชื่อคู่รัก ปุ่มเล่นเพลง และ QR เพลงบนฐาน',
  params: [
    { key: 'names', label: 'ชื่อคู่รัก', kind: 'text', default: heart ? 'MARY&JOHN' : 'EMMA&JOE', maxChars: 20, font: 'cherry-bomb' },
    { key: 'link', label: 'ลิงก์สำหรับ QR', kind: 'text', default: 'https://open.spotify.com/', maxChars: 200, hint: QR_HINT, font: 'kanit-bold' },
    { key: 'width', label: 'ความกว้างการ์ด', kind: 'number', default: 70, min: 50, max: 120, step: 1, unit: 'มม.' },
    { key: 'base', label: 'ความหนาการ์ด', kind: 'number', default: 4, min: 2.4, max: 8, step: 0.2, unit: 'มม.' },
    { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.2, min: 0.4, max: 3, step: 0.2, unit: 'มม.' },
  ],
  colours: [
    { key: 'block', label: 'ฐาน', default: '#374151' },
    { key: 'qrBack', label: 'พื้น QR', default: '#ffffff' },
    { key: 'qr', label: 'QR', default: '#111827' },
    { key: 'card', label: 'การ์ด', default: '#fbcfe8' },
    { key: 'window', label: 'ช่องรูป', default: '#ffffff' },
    { key: 'accent', label: 'ชื่อ ปุ่ม และหัวใจ', default: '#ec4899' },
  ],
  howTo: ['พิมพ์ตั้งตรงตามไฟล์ การ์ดยืนบนฐาน ใส่รูปขนาดเท่าช่องแล้วติดเทปกาว QR พิมพ์สองสี ชั้นละ 0.8 มม. สแกนทดสอบก่อนให้ของขวัญ'],
  upright: true,
  build: (ctx, v) => music(ctx, v, heart),
}))

export const CONNECT: GiftDesign = {
  id: 'home-connect', name: 'ป้ายโซเชียลพร้อม QR', group: 'home', blurb: 'ไอคอนกล้อง ชื่อบัญชีตัวอ้วน และ QR ไปหน้าโปรไฟล์ บนแผ่นหนาสีดำ',
  params: [
    { key: 'handle', label: 'ชื่อบัญชี', kind: 'text', default: 'jjdesign', maxChars: 20, font: 'cherry-bomb' },
    { key: 'link', label: 'ลิงก์สำหรับ QR', kind: 'text', default: 'https://instagram.com/', maxChars: 200, hint: QR_HINT, font: 'kanit-bold' },
    { key: 'size', label: 'ความสูงป้าย', kind: 'number', default: 40, min: 25, max: 90, step: 1, unit: 'มม.' },
    { key: 'stand', label: 'ฐานตั้งโต๊ะ', kind: 'toggle', default: false, hint: 'แผ่นหนาตั้งได้เอง' },
    { key: 'base', label: 'ความหนาแผ่น', kind: 'number', default: 16, min: 3, max: 24, step: 0.2, unit: 'มม.' },
    { key: 'raise', label: 'ตัวอักษรนูน', kind: 'number', default: 1.6, min: 0.4, max: 4, step: 0.2, unit: 'มม.' },
  ],
  colours: [
    { key: 'slab', label: 'แผ่นและ QR', default: '#111827' },
    { key: 'icon', label: 'ไอคอน', default: '#ffffff' },
    { key: 'outline', label: 'ขอบชื่อ', default: '#ffffff' },
    { key: 'text', label: 'ชื่อบัญชี', default: '#ef4444' },
    { key: 'qrBack', label: 'พื้น QR', default: '#ffffff' },
  ],
  howTo: ['QR เป็นลายนูนสีเข้มบนพื้นขาว สแกนทดสอบด้วยมือถือก่อนพิมพ์จริง'],
  build: connect,
}
