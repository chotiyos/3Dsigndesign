import type { GiftDesign } from './core'
import { AWARDS } from './awards'
import { BIRTH } from './birth'
import { DESK } from './desk'
import { DOUBLE_LINE } from './doubleLine'
import { HOME } from './home'
import { LETTERS } from './letters'
import { CONNECT, MUSIC } from './music'
import { NAME_KEYS } from './nameKeys'
import { SEASONAL } from './seasonal'
import { SIGNS2 } from './signs2'
import { TOPPERS } from './toppers'

export * from './core'

/** Every gift design, in catalogue order. */
export const GIFTS: GiftDesign[] = [
  ...LETTERS,
  ...DOUBLE_LINE,
  ...SIGNS2,
  ...AWARDS,
  ...BIRTH,
  ...TOPPERS,
  ...NAME_KEYS,
  ...DESK,
  ...HOME,
  ...MUSIC,
  CONNECT,
  ...SEASONAL,
]

export const findGift = (id: string) => GIFTS.find((g) => g.id === id)
