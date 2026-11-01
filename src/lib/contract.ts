import { isAddress, type Address } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { IS_MAINNET, NETWORK } from '@/lib/network'

export const ARC_CHAIN_ID: number = NETWORK.arcChain.id

const usdcFact = getUsdc(ARC_CHAIN_ID)
if (!usdcFact) throw new Error(`USDC is not registered for ${NETWORK.arcLabel}`)
export const USDC_ADDRESS = usdcFact.address as Address

// Each network has its own deployment. Never reuse a testnet address on mainnet.
const env = import.meta.env as Record<string, string | undefined>
const rawBooking = IS_MAINNET ? env.VITE_BOOKING_CONTRACT_ADDRESS_MAINNET : env.VITE_BOOKING_CONTRACT_ADDRESS_TESTNET
export const BOOKING_ADDRESS: Address | undefined =
  rawBooking && isAddress(rawBooking) ? rawBooking : undefined

export type Doctor = {
  doctor: Address
  name: string
  specialty: string
  feeUsdc: bigint
  metadataURI: string
  approved: boolean
  active: boolean
}

export const STATUS = {
  Booked: 0,
  CompletionSubmitted: 1,
  Completed: 2,
  Cancelled: 3,
  Refunded: 4,
  Disputed: 5,
  Resolved: 6,
} as const

export const STATUS_LABEL: Record<number, string> = {
  0: 'Booked',
  1: 'Awaiting your confirmation',
  2: 'Completed',
  3: 'Cancelled',
  4: 'Refunded',
  5: 'In dispute',
  6: 'Resolved',
}

export type Booking = {
  id: bigint
  patient: Address
  doctor: Address
  startTime: bigint
  durationMins: number
  noteHash: `0x${string}`
  feeUsdc: bigint
  status: number
  submittedAt: bigint
  disputedAt: bigint
}

export const WINDOWS = {
  completion: 48n * 3600n,
  dispute: 24n * 3600n,
  disputeTimeout: 14n * 24n * 3600n,
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export const formatWhen = (unixSeconds: bigint | number) =>
  new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; shortMessage?: string; code?: number } | undefined
  const message = `${e?.shortMessage ?? ''} ${e?.message ?? ''}`.toLowerCase()
  if (message.includes('user rejected') || e?.code === 4001) return 'Cancelled in wallet.'
  if (message.includes('insufficient funds') || message.includes('exceeds balance') || message.includes('transfer amount exceeds'))
    return 'Not enough USDC. Add funds and try again.'
  if (message.includes('slotalreadytaken')) return 'That time overlaps another appointment. Pick a different slot.'
  if (message.includes('feeabovemax')) return 'The doctor changed their fee. Refresh and try again.'
  if (message.includes('insufficientbookingnotice')) return 'Appointments need at least 1 hour notice.'
  if (message.includes('reverted')) return 'The transaction was rejected by the contract.'
  if (message.includes('network') || message.includes('timeout')) return 'Network issue. Check your connection and retry.'
  return e?.shortMessage ?? 'Something went wrong. Please try again.'
}
