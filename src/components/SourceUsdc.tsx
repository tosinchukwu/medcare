import { erc20Abi, type Address } from 'viem'
import { useReadContract } from 'wagmi'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

/** USDC (ERC-20 view) balance of an address on a source chain. */
export function SourceUsdc({ chainId, address }: { chainId: number; address: Address | undefined }) {
  const usdc = getUsdc(chainId)
  const { data } = useReadContract({
    address: usdc?.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(usdc && address), refetchInterval: 10000 },
  })
  return <>{address && data !== undefined ? formatUsdc(data) : '—'}</>
}
