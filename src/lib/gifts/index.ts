import type { GiftDesign } from './core'
import { ROUND1 } from './round1'
import { ROUND2 } from './round2'

export * from './core'

/** Every gift design, in catalogue order. */
export const GIFTS: GiftDesign[] = [...ROUND1, ...ROUND2]

export const findGift = (id: string) => GIFTS.find((g) => g.id === id)
