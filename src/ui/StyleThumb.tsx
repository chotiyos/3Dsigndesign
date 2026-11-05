import { useEffect, useState } from 'react'
import { textToRegion } from '../lib/artwork'
import { FONT_OPTIONS } from '../lib/fonts'
import { loadFont } from '../lib/hb'
import { buildStyle, defaultValues, type StyleDef } from '../lib/styles'
import { thumbnail } from '../three/thumbnails'

const SAMPLE = 'ก'

/** A rendered preview of a style using a sample letter, drawn once and cached. */
export function StyleThumb({ style, text = SAMPLE, className }: { style: StyleDef; text?: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    loadFont(FONT_OPTIONS[0].url)
      .then((font) =>
        thumbnail(`${style.id}:${text}`, () => buildStyle(style, textToRegion(font, text, 120, 0), defaultValues(style))),
      )
      .then((url) => !cancelled && setSrc(url || null))
      .catch(() => !cancelled && setSrc(null))
    return () => {
      cancelled = true
    }
  }, [style, text])
  return (
    <span className={`thumb ${className ?? ''}`} data-loaded={src ? 'true' : 'false'}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <span className="thumb-wait" aria-hidden="true" />}
    </span>
  )
}
