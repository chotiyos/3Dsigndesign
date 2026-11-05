import { bounds, center, type Region } from '../geo2d'
import { HARDWARE_STYLES } from './hardware'
import { LIT_STYLES } from './lit'
import { BOX_STYLES, DECO_STYLES, DESK_STYLES, GIFT_STYLES, MINI_STYLES } from './more'
import type { SignPart, StyleDef } from './types'

export * from './types'

export const STYLES: StyleDef[] = [
  ...LIT_STYLES,
  ...MINI_STYLES,
  ...DESK_STYLES,
  ...BOX_STYLES,
  ...DECO_STYLES,
  ...GIFT_STYLES,
  ...HARDWARE_STYLES,
]

export const DEFAULT_STYLE_ID = STYLES[0].id

export function findStyle(id: string | null | undefined): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[0]
}

export function defaultValues(style: StyleDef): Record<string, number> {
  return Object.fromEntries(style.params.map((param) => [param.key, param.value]))
}

/** Clamps saved or typed values into each parameter's range, filling any gaps. */
export function cleanValues(style: StyleDef, values: Record<string, number> | undefined) {
  const out = defaultValues(style)
  for (const param of style.params) {
    const raw = values?.[param.key]
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[param.key] = Math.min(param.max, Math.max(param.min, raw))
    }
  }
  return out
}

export function buildStyle(style: StyleDef, art: Region, values: Record<string, number>): SignPart[] {
  const centred = center(art)
  if (style.usesArt && centred.length === 0) return []
  return style.build({ art: centred, box: bounds(centred), v: cleanValues(style, values) })
}
