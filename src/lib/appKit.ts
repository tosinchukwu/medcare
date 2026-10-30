import { AppKit } from '@circle-fin/app-kit'
import { baseSepolia, sepolia } from 'viem/chains'

export const appKit = new AppKit()

/** Testnet chains users can fund from. Identifiers are App Kit chain names. */
export const SOURCE_CHAINS = [
  { key: 'Base_Sepolia', id: baseSepolia.id, label: 'Base Sepolia' },
  { key: 'Ethereum_Sepolia', id: sepolia.id, label: 'Ethereum Sepolia' },
] as const

export type SourceChain = (typeof SOURCE_CHAINS)[number]
