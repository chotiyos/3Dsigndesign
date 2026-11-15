import type { GiftDesign } from './core'
import { ROUND1 } from './round1'

export * from './core'

/** Every gift design, in catalogue order. */
export const GIFTS: GiftDesign[] = [...ROUND1]

export const findGift = (id: string) => GIFTS.find((g) => g.id === id)
