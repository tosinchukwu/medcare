import { arc, arcTestnet, base, baseSepolia, mainnet, sepolia } from 'viem/chains'

/**
 * One switch for the whole app: VITE_NETWORK=mainnet uses real USDC on Arc mainnet.
 * Anything else (or unset) stays on Arc Testnet.
 */
export const IS_MAINNET = (import.meta.env as Record<string, string | undefined>).VITE_NETWORK === 'mainnet'

const TESTNET = {
  arcChain: arcTestnet,
  arcKey: 'Arc_Testnet',
  arcLabel: 'Arc Testnet',
  kitNetworkType: 'testnet',
  sources: [
    { key: 'Base_Sepolia', id: baseSepolia.id, label: 'Base Sepolia' },
    { key: 'Ethereum_Sepolia', id: sepolia.id, label: 'Ethereum Sepolia' },
  ],
} as const

const MAINNET = {
  arcChain: arc,
  arcKey: 'Arc',
  arcLabel: 'Arc',
  kitNetworkType: 'mainnet',
  sources: [
    { key: 'Base', id: base.id, label: 'Base' },
    { key: 'Ethereum', id: mainnet.id, label: 'Ethereum' },
  ],
} as const

export const NETWORK = IS_MAINNET ? MAINNET : TESTNET

/** Warn before moving more than this many USDC on mainnet. */
export const LARGE_AMOUNT_USDC = 100
