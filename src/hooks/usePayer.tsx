import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi, type Address } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { bookingAbi } from '@/lib/bookingAbi'
import { ARC_CHAIN_ID, BOOKING_ADDRESS, USDC_ADDRESS } from '@/lib/contract'
import { circleApi } from '@/lib/circleApi'
import { toCircleParams, type PayerCall } from '@/lib/payerCalls'

export type PayerMode = 'wallet' | 'circle'

type PayerContextValue = {
  mode: PayerMode
  setMode: (mode: PayerMode) => void
  /** Address that pays and owns bookings in the current mode. */
  address: Address | undefined
  walletAddress: Address | undefined
  circleAddress: Address | undefined
  circleLoading: boolean
  circleError: string | undefined
  circleConfigured: boolean
  /** Signs with whichever wallet the patient chose. */
  run: (call: PayerCall) => Promise<string>
  /** Always signs with the browser wallet (doctor, admin, and funding actions). */
  runWallet: (call: PayerCall) => Promise<string>
}

const PayerContext = createContext<PayerContextValue | null>(null)

export function PayerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PayerMode>('wallet')
  const { address: walletAddress, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })

  const status = useQuery({ queryKey: ['circleStatus'], queryFn: circleApi.status, staleTime: 30_000 })
  const circleConfigured = status.data?.configured ?? false
  const circle = useQuery({
    queryKey: ['circleWallet'],
    queryFn: circleApi.wallet,
    enabled: mode === 'circle' && circleConfigured,
    staleTime: Infinity,
    retry: false,
  })

  const runWithWallet = useCallback(
    async (call: PayerCall): Promise<string> => {
      if (!walletAddress) throw new Error('Connect your wallet first.')
      if (!BOOKING_ADDRESS) throw new Error('The booking contract is not deployed yet.')
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const booking = { address: BOOKING_ADDRESS, abi: bookingAbi, chainId: ARC_CHAIN_ID } as const
      let hash: `0x${string}`
      switch (call.kind) {
        case 'approve':
          hash = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            chainId: ARC_CHAIN_ID,
            functionName: 'approve',
            args: [BOOKING_ADDRESS, call.amount],
          })
          break
        case 'transfer':
          hash = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            chainId: ARC_CHAIN_ID,
            functionName: 'transfer',
            args: [call.to, call.amount],
          })
          break
        case 'book':
          hash = await writeContractAsync({
            ...booking,
            functionName: 'bookConsultation',
            args: [call.doctor, call.startTime, call.durationMins, call.noteHash, call.maxFee],
          })
          break
        case 'cancel':
          hash = await writeContractAsync({ ...booking, functionName: 'cancelConsultation', args: [call.id] })
          break
        case 'confirm':
          hash = await writeContractAsync({ ...booking, functionName: 'confirmCompletion', args: [call.id] })
          break
        case 'dispute':
          hash = await writeContractAsync({ ...booking, functionName: 'disputeCompletion', args: [call.id] })
          break
        case 'finalize':
          hash = await writeContractAsync({ ...booking, functionName: 'finalizeCompletion', args: [call.id] })
          break
        case 'refund':
          hash = await writeContractAsync({ ...booking, functionName: 'claimRefund', args: [call.id] })
          break
        case 'disputeRefund':
          hash = await writeContractAsync({ ...booking, functionName: 'claimDisputeRefund', args: [call.id] })
          break
        case 'withdraw':
          hash = await writeContractAsync({ ...booking, functionName: 'withdraw' })
          break
        case 'submit':
          hash = await writeContractAsync({ ...booking, functionName: 'submitCompletion', args: [call.id] })
          break
        case 'resolve':
          hash = await writeContractAsync({
            ...booking,
            functionName: 'resolveDispute',
            args: [call.id, call.patientShareBps],
          })
          break
        case 'addDoctor':
          hash = await writeContractAsync({
            ...booking,
            functionName: 'addDoctor',
            args: [call.doctor, call.name, call.specialty, call.fee, call.uri],
          })
          break
        case 'removeDoctor':
          hash = await writeContractAsync({ ...booking, functionName: 'removeDoctor', args: [call.doctor] })
          break
        case 'updateDoctor':
          hash = await writeContractAsync({
            ...booking,
            functionName: 'updateDoctor',
            args: [call.name, call.specialty, call.fee, call.uri, call.active],
          })
          break
        case 'pause':
          hash = await writeContractAsync({ ...booking, functionName: 'pause' })
          break
        case 'unpause':
          hash = await writeContractAsync({ ...booking, functionName: 'unpause' })
          break
      }
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt?.status === 'reverted') throw new Error('Transaction reverted')
      return hash
    },
    [walletAddress, chainId, switchChainAsync, writeContractAsync, publicClient],
  )

  const run = useCallback(
    async (call: PayerCall): Promise<string> => {
      if (mode === 'wallet') return runWithWallet(call)
      const { txHash } = await circleApi.exec(toCircleParams(call))
      return txHash
    },
    [mode, runWithWallet],
  )

  const circleAddress = circle.data?.address
  const value = useMemo<PayerContextValue>(
    () => ({
      mode,
      setMode,
      address: mode === 'wallet' ? walletAddress : circleAddress,
      walletAddress,
      circleAddress,
      circleLoading: circle.isLoading,
      circleError: circle.error ? circle.error.message : undefined,
      circleConfigured,
      run,
      runWallet: runWithWallet,
    }),
    [mode, walletAddress, circleAddress, circle.isLoading, circle.error, circleConfigured, run, runWithWallet],
  )

  return <PayerContext.Provider value={value}>{children}</PayerContext.Provider>
}

export function usePayer(): PayerContextValue {
  const ctx = useContext(PayerContext)
  if (!ctx) throw new Error('usePayer must be used inside PayerProvider')
  return ctx
}
