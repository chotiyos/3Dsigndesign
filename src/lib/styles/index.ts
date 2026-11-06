import { bounds, center, type Region } from '../geo2d'
import { HARDWARE_STYLES } from './hardware'
import { LIT_STYLES } from './lit'
import { applyRear } from './rear'
import { BOX_STYLES, DECO_STYLES, DESK_STYLES, GIFT_STYLES, MINI_STYLES } from './more'
import type { SignPart, StyleDef } from './types'

export * from './types'
export { applyMaterials, isCuttable, lipHost, PLASTIC, withMaterial } from './kit'
export { applyRear, keyhole, rearHoles } from './rear'

export const STYLES: StyleDef[] = [
  ...LIT_STYLES,
  ...MINI_STYLES,
  ...DESK_STYLES,
  ...BOX_STYLES,
  ...DECO_STYLES,
  ...GIFT_STYLES,
  ...HARDWARE_STYLES,
]

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
      const clamped = Math.min(param.max, Math.max(param.min, raw))
      out[param.key] = param.kind === 'toggle' ? (clamped >= 0.5 ? 1 : 0) : param.kind === 'choice' ? Math.round(clamped) : clamped
    }
  }
  return out
}

export function buildStyle(style: StyleDef, art: Region, values: Record<string, number>): SignPart[] {
  const centred = center(art)
  if (style.usesArt && centred.length === 0) return []
  const v = cleanValues(style, values)
  const parts = style.build({ art: centred, box: bounds(centred), v })
  // Only styles that offer the rear add-ons (G04 has its own "wire" setting).
  return style.params.some((param) => param.key === 'deskBase') ? applyRear(parts, v) : parts
}
