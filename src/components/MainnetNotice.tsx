import { TriangleAlert } from 'lucide-react'
import { IS_MAINNET } from '@/lib/network'

/** Persistent reminder that this build moves real USDC. Renders nothing on testnet. */
export function MainnetBanner() {
  if (!IS_MAINNET) return null
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-semibold"
      style={{ background: 'rgba(161,92,7,0.14)', color: 'var(--warn)' }}
    >
      <TriangleAlert className="size-4 shrink-0" />
      Arc mainnet: real USDC. Transactions are irreversible.
    </div>
  )
}

/** Required checkbox before any fund-moving action on mainnet. Renders nothing on testnet. */
export function MainnetAck({
  checked,
  onChange,
  amountUsdc,
  largeAmount,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  amountUsdc?: number
  largeAmount?: number
}) {
  if (!IS_MAINNET) return null
  const large = amountUsdc !== undefined && largeAmount !== undefined && amountUsdc > largeAmount
  return (
    <div className="mt-3 rounded-2xl p-3 text-xs" style={{ background: 'rgba(161,92,7,0.1)', color: 'var(--warn)' }}>
      {large && (
        <p className="mb-2 font-semibold">This is more than {largeAmount} USDC. Double-check the amount and destination.</p>
      )}
      <label className="flex min-h-11 cursor-pointer items-start gap-2">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4" />
        <span>I understand this moves real USDC on mainnet and cannot be undone.</span>
      </label>
    </div>
  )
}

export const ackOk = (acked: boolean) => !IS_MAINNET || acked
