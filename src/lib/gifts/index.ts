import type { GiftDesign } from './core'
import { DOUBLE_LINE } from './doubleLine'
import { NAME_KEYS } from './nameKeys'
import { ROUND1 } from './round1'
import { ROUND2 } from './round2'
import { ROUND3 } from './round3'

export * from './core'

/** Every gift design, in catalogue order. */
export const GIFTS: GiftDesign[] = [
  ...ROUND1.filter((g) => g.group === 'initial'),
  ...DOUBLE_LINE,
  ...ROUND1.filter((g) => g.group !== 'initial'),
  ...ROUND2,
  ...NAME_KEYS,
  ...ROUND3,
]

export const findGift = (id: string) => GIFTS.find((g) => g.id === id)
