import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { erc20Abi, type Address } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { bookingAbi } from '@/lib/bookingAbi'
import { ARC_CHAIN_ID, BOOKING_ADDRESS, USDC_ADDRESS } from '@/lib/contract'
import type { PayerCall } from '@/lib/payerCalls'
import { useModularWallet } from '@/hooks/useModularWallet'

type PayerContextValue = {
  /** Address that pays and owns bookings in the current mode. */
  address: Address | undefined
  walletAddress: Address | undefined
  /** Signs with whichever wallet the patient chose. */
  run: (call: PayerCall) => Promise<string>
  /** Always signs with the browser wallet (doctor, admin, and funding actions). */
  runWallet: (call: PayerCall) => Promise<string>
}

const PayerContext = createContext<PayerContextValue | null>(null)

export function PayerProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { address: modularAddress, account: modularAccount, client: modularClient } = useModularWallet()

  const runWithWallet = useCallback(
    async (call: PayerCall, preferModular = false): Promise<string> => {
      const payerAddress = preferModular ? modularAddress ?? walletAddress : walletAddress
      if (!payerAddress) throw new Error('Connect your wallet first.')
      const writeContract = (request: any) => {
        if (preferModular && modularClient && modularAccount) {
          return modularClient.writeContract({ ...request, account: modularAccount })
        }
        return writeContractAsync(request)
      }
      if (!BOOKING_ADDRESS) throw new Error('The booking contract is not deployed yet.')
      if (!preferModular && chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const booking = { address: BOOKING_ADDRESS, abi: bookingAbi, chainId: ARC_CHAIN_ID } as const
      let hash: `0x${string}`
      switch (call.kind) {
        case 'approve':
          hash = await writeContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            chainId: ARC_CHAIN_ID,
            functionName: 'approve',
            args: [BOOKING_ADDRESS, call.amount],
          })
          break
        case 'transfer':
          hash = await writeContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            chainId: ARC_CHAIN_ID,
            functionName: 'transfer',
            args: [call.to, call.amount],
          })
          break
        case 'book':
          hash = await writeContract({
            ...booking,
            functionName: 'bookConsultation',
            args: [call.doctor, call.startTime, call.durationMins, call.noteHash, call.maxFee],
          })
          break
        case 'cancel':
          hash = await writeContract({ ...booking, functionName: 'cancelConsultation', args: [call.id] })
          break
        case 'confirm':
          hash = await writeContract({ ...booking, functionName: 'confirmCompletion', args: [call.id] })
          break
        case 'dispute':
          hash = await writeContract({ ...booking, functionName: 'disputeCompletion', args: [call.id] })
          break
        case 'finalize':
          hash = await writeContract({ ...booking, functionName: 'finalizeCompletion', args: [call.id] })
          break
        case 'refund':
          hash = await writeContract({ ...booking, functionName: 'claimRefund', args: [call.id] })
          break
        case 'disputeRefund':
          hash = await writeContract({ ...booking, functionName: 'claimDisputeRefund', args: [call.id] })
          break
        case 'withdraw':
          hash = await writeContract({ ...booking, functionName: 'withdraw' })
          break
        case 'submit':
          hash = await writeContract({ ...booking, functionName: 'submitCompletion', args: [call.id] })
          break
        case 'resolve':
          hash = await writeContract({
            ...booking,
            functionName: 'resolveDispute',
            args: [call.id, call.patientShareBps],
          })
          break
        case 'addDoctor':
          hash = await writeContract({
            ...booking,
            functionName: 'addDoctor',
            args: [call.doctor, call.name, call.specialty, call.fee, call.uri],
          })
          break
        case 'removeDoctor':
          hash = await writeContract({ ...booking, functionName: 'removeDoctor', args: [call.doctor] })
          break
        case 'updateDoctor':
          hash = await writeContract({
            ...booking,
            functionName: 'updateDoctor',
            args: [call.name, call.specialty, call.fee, call.uri, call.active],
          })
          break
        case 'pause':
          hash = await writeContract({ ...booking, functionName: 'pause' })
          break
        case 'unpause':
          hash = await writeContract({ ...booking, functionName: 'unpause' })
          break
      }
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt?.status === 'reverted') throw new Error('Transaction reverted')
      return hash
    },
    [walletAddress, modularAddress, modularAccount, modularClient, chainId, switchChainAsync, writeContractAsync, publicClient],
  )

  const run = useCallback(
    async (call: PayerCall): Promise<string> => runWithWallet(call, true),
    [runWithWallet],
  )

  const value = useMemo<PayerContextValue>(
    () => ({
      address: modularAddress ?? walletAddress,
      walletAddress,
      run,
      runWallet: runWithWallet,
    }),
    [walletAddress, run, runWithWallet],
  )

  return <PayerContext.Provider value={value}>{children}</PayerContext.Provider>
}

export function usePayer(): PayerContextValue {
  const ctx = useContext(PayerContext)
  if (!ctx) throw new Error('usePayer must be used inside PayerProvider')
  return ctx
}
