import { useCallback } from 'react'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { useAccount, useSwitchChain } from 'wagmi'

/** Builds an App Kit adapter from the connected browser wallet, switching chain first if needed. */
export function useAdapter() {
  const { connector, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  return useCallback(
    async (requiredChainId: number) => {
      if (!connector) throw new Error('Connect your wallet first.')
      if (chainId !== requiredChainId) await switchChainAsync({ chainId: requiredChainId })
      const provider = (await connector.getProvider()) as EIP1193Provider
      return createViemAdapterFromProvider({ provider })
    },
    [connector, chainId, switchChainAsync],
  )
}
