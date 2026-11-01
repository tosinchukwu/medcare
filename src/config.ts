/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig, type Config } from 'wagmi'
import { arc, arcTestnet, base, baseSepolia, mainnet, sepolia } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { IS_MAINNET } from './lib/network'

const mainnetConfig = createConfig({
  // Arc mainnet is where bookings settle. Base and Ethereum are CCTP / Gateway funding sources.
  chains: [arc, base, mainnet],
  connectors: [injected()],
  transports: {
    [arc.id]: http(arc.rpcUrls.default.http[0]),
    [base.id]: http(),
    [mainnet.id]: http(),
  },
})

const testnetConfig = createConfig({
  // Arc Testnet is where bookings settle. Sepolia chains are CCTP / Gateway funding sources.
  chains: [arcTestnet, baseSepolia, sepolia, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})

// Pre-register chain RPC URLs so trace events show correct chain names immediately
const settlementChain = IS_MAINNET ? arc : arcTestnet
registerChain(settlementChain.id, settlementChain.rpcUrls.default.http[0])

export const config: Config = IS_MAINNET ? mainnetConfig : testnetConfig
