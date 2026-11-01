import { AppKit } from '@circle-fin/app-kit'
import { NETWORK } from '@/lib/network'

export const appKit = new AppKit()

/** Chains users can fund from. Identifiers are App Kit chain names. */
export const SOURCE_CHAINS = NETWORK.sources
export type SourceChain = (typeof SOURCE_CHAINS)[number]
