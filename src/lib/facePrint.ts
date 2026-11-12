import { strToU8 } from 'fflate'
import { buildDxf } from './exportDxf'
import { bounds, type Region } from './geo2d'
import type { FaceArt, LightboxFace } from './lightbox'

/** Print resolution for the face artwork. */
export const PRINT_DPI = 300
/** Below this the picture will look soft at full size. */
export const MIN_DPI = 150
const MAX_SIDE = 9000
const MM_PER_INCH = 25.4

/** The picture's own resolution once stretched over the face, in dots per inch. */
export const effectiveDpi = (art: FaceArt, imageWidth: number) => imageWidth / (art.rect.w / MM_PER_INCH)

const FOLDER = { uv: 'พิมพ์ UV', sticker: 'สติกเกอร์' } as const

/**
 * Print files for the face: the picture cropped to the lit window at 300 dpi
 * (and mirrored, for printing on the back of a clear panel), and the cut line
 * as DXF and SVG in millimetres.
 */
export async function faceFiles(src: string, art: FaceArt, kind: Exclude<LightboxFace, 'layers'>): Promise<Record<string, Uint8Array>> {
  const b = bounds(art.window)
  const size = `${b.w.toFixed(0)}x${b.h.toFixed(0)}มม`
  const dpi = Math.min(PRINT_DPI, (MAX_SIDE / Math.max(b.w, b.h)) * MM_PER_INCH)
  const image = await loadImage(src)
  const folder = FOLDER[kind]
  const files: Record<string, Uint8Array> = {
    [`${folder}/ลายหน้าแผ่น-${size}-${Math.round(dpi)}dpi.png`]: await facePng(image, art, dpi, false),
    [`${folder}/เส้นตัด-${size}.dxf`]: strToU8(buildDxf([{ layer: 'CUT', region: art.window }, { layer: 'PANEL', region: art.face }])),
    [`${folder}/เส้นตัด-${size}.svg`]: strToU8(cutSvg(art)),
  }
  if (kind === 'uv') files[`${folder}/ลายหน้าแผ่น-กลับด้าน-${size}-${Math.round(dpi)}dpi.png`] = await facePng(image, art, dpi, true)
  return files
}

/** Instructions for the readme. */
export function faceReadme(kind: Exclude<LightboxFace, 'layers'>, art: FaceArt, imageWidth: number) {
  const b = bounds(art.window)
  const dpi = effectiveDpi(art, imageWidth)
  const size = `${b.w.toFixed(1)} × ${b.h.toFixed(1)} มม.`
  const common = [
    `ไฟล์ลายหน้าแผ่นขนาดจริง ${size} ที่ ${PRINT_DPI} dpi ตัดตามช่องแสงในกรอบแล้ว พื้นนอกช่องโปร่งใส`,
    `เส้นตัด (DXF และ SVG หน่วยมิลลิเมตร): ชั้น CUT คือขอบช่องแสง ชั้น PANEL คือขอบแผ่นหน้าทั้งแผ่น`,
    dpi < MIN_DPI ? `รูปต้นฉบับละเอียดประมาณ ${Math.round(dpi)} dpi ที่ขนาดนี้ ภาพอาจไม่คม ใช้รูปที่ใหญ่กว่าเดิมถ้ามี` : '',
  ]
  if (kind === 'uv') {
    return [
      'ลายหน้าแผ่น: พิมพ์ Digital UV ลงแผ่นกระจายแสงโดยตรง',
      ...common,
      '- แผ่นขาวขุ่น: พิมพ์ด้านหน้าด้วยไฟล์ลายปกติ ไม่ต้องรองขาว แสงจะผ่านสีได้เต็มที่',
      '- แผ่นใส: พิมพ์ด้านหลังด้วยไฟล์ "กลับด้าน" แล้วรองขาวบาง ๆ ทับสี ภาพจะอยู่ใต้ผิวแผ่น ไม่ถลอก',
      '- ตั้งขนาดงานพิมพ์ให้ตรงกับขนาดในชื่อไฟล์ แล้ววางให้ขอบช่องแสง (ชั้น CUT) ตรงกับแผ่น',
    ].filter(Boolean)
  }
  return [
    'ลายหน้าแผ่น: สติกเกอร์พิมพ์แล้วแปะบนแผ่นกระจายแสง',
    ...common,
    '- ใช้สติกเกอร์ขาวขุ่นหรือใสแบบแสงผ่านได้ (backlit) ไม่ใช้สติกเกอร์ขาวทึบ',
    '- ไดคัทตามชั้น CUT ลอกแปะบนหน้าแผ่นให้ตรงช่องแสง รีดฟองอากาศจากกลางออกขอบ',
    '- เคลือบลามิเนตด้านหรือเงาเพิ่มได้ ช่วยกันรอยและแดด',
  ].filter(Boolean)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('โหลดรูปสำหรับไฟล์พิมพ์ไม่สำเร็จ'))
    img.src = src
  })
}

async function facePng(image: HTMLImageElement, art: FaceArt, dpi: number, mirror: boolean): Promise<Uint8Array> {
  const b = bounds(art.window)
  const k = dpi / MM_PER_INCH
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(b.w * k))
  canvas.height = Math.max(1, Math.round(b.h * k))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('เบราว์เซอร์นี้สร้างไฟล์ภาพไม่ได้')
  if (mirror) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  // Millimetres (y up) to pixels (y down), cropped to the lit window.
  const px = (x: number) => (x - b.minX) * k
  const py = (y: number) => (b.maxY - y) * k
  ctx.beginPath()
  for (const poly of art.window) {
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))))
    ctx.closePath()
  }
  ctx.clip('evenodd')
  ctx.imageSmoothingQuality = 'high'
  const { rect } = art
  ctx.drawImage(image, px(rect.x), py(rect.y + rect.h), rect.w * k, rect.h * k)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('สร้างไฟล์ภาพไม่สำเร็จ')
  return withDpi(new Uint8Array(await blob.arrayBuffer()), dpi)
}

function cutSvg(art: FaceArt) {
  const b = bounds(art.face)
  const path = (region: Region) =>
    region.map((poly) => 'M' + poly.map(([x, y]) => `${(x - b.minX).toFixed(3)} ${(b.maxY - y).toFixed(3)}`).join('L') + 'Z').join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${b.w.toFixed(2)}mm" height="${b.h.toFixed(2)}mm" viewBox="0 0 ${b.w.toFixed(3)} ${b.h.toFixed(3)}">`,
    `  <path id="PANEL" d="${path(art.face)}" fill="none" stroke="#0000ff" stroke-width="0.1"/>`,
    `  <path id="CUT" d="${path(art.window)}" fill="none" stroke="#ff0000" stroke-width="0.1" fill-rule="evenodd"/>`,
    '</svg>',
    '',
  ].join('\n')
}

/** Adds a pHYs chunk so print software opens the PNG at its real size. */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  view.setUint32(8, ppm)
  view.setUint32(12, ppm)
  chunk[16] = 1 // metres
  view.setUint32(17, crc32(chunk.subarray(4, 17)))
  // Signature (8) + IHDR chunk (25): pHYs must come before the image data.
  const at = 33
  const out = new Uint8Array(png.length + chunk.length)
  out.set(png.subarray(0, at))
  out.set(chunk, at)
  out.set(png.subarray(at), at + chunk.length)
  return out
}

let table: Uint32Array | null = null
function crc32(bytes: Uint8Array) {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
