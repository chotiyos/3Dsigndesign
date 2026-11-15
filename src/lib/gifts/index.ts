import type { GiftDesign } from './core'
import { AWARDS } from './awards'
import { BIRTH } from './birth'
import { DOUBLE_LINE } from './doubleLine'
import { LETTERS } from './letters'
import { NAME_KEYS } from './nameKeys'
import { ROUND1 } from './round1'
import { ROUND3 } from './round3'
import { TOPPERS } from './toppers'

export * from './core'

/** Every gift design, in catalogue order. */
export const GIFTS: GiftDesign[] = [
  ...LETTERS,
  ...DOUBLE_LINE,
  ...ROUND1,
  ...AWARDS,
  ...BIRTH,
  ...TOPPERS,
  ...NAME_KEYS,
  ...ROUND3,
]

export const findGift = (id: string) => GIFTS.find((g) => g.id === id)
