import type { GiftDesign } from './core'
import { ROUND1 } from './round1'
import { ROUND2 } from './round2'
import { ROUND3 } from './round3'

export * from './core'

/** Every gift design, in catalogue order. */
export const GIFTS: GiftDesign[] = [...ROUND1, ...ROUND2, ...ROUND3]

export const findGift = (id: string) => GIFTS.find((g) => g.id === id)
