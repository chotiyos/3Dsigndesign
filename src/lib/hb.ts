import * as hb from 'harfbuzzjs'

export interface LoadedFont {
  hbFont: hb.Font
  hbFace: hb.Face
  /** Font design units per em (e.g. 1000 or 2048). All outline/advance
   *  values from HarfBuzz are expressed in this unit space. */
  upem: number
}

const fontCache = new Map<string, Promise<LoadedFont>>()

export function loadFont(url: string): Promise<LoadedFont> {
  const cached = fontCache.get(url)
  if (cached) return cached

  const promise = (async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${res.status}`)
    const buffer = await res.arrayBuffer()
    return fontFromArrayBuffer(buffer)
  })()

  fontCache.set(url, promise)
  return promise
}

export function fontFromArrayBuffer(buffer: ArrayBuffer): LoadedFont {
  const blob = new hb.Blob(buffer)
  const face = new hb.Face(blob)
  const font = new hb.Font(face)
  return { hbFont: font, hbFace: face, upem: face.upem }
}

export { hb }
