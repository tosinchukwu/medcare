import { useState } from 'react'
import { Copy, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { usePayer } from '@/hooks/usePayer'
import { useAction } from '@/hooks/useAction'
import { useUsdcBalance } from '@/hooks/useBookingData'
import { parseUsdc, formatUsdc } from '@/onchain-money'
import { ActionButton, Spinner } from '@/components/ui'

/** Move USDC between the browser wallet and the managed Circle wallet. */
export function CircleWalletCard() {
  const { walletAddress, circleAddress, circleLoading, circleError, circleConfigured } = usePayer()
  const { execute: sendFromWallet, isPending: sending } = useAction({ walletOnly: true })
  const { execute: cashOut, isPending: cashing } = useAction()
  const circleBalance = useUsdcBalance(circleAddress)
  const [amount, setAmount] = useState('')

  const raw = (() => {
    try {
      return amount ? parseUsdc(amount) : 0n
    } catch {
      return 0n
    }
  })()

  return (
    <section className="glass-card rounded-3xl p-5" aria-label="Circle wallet">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5" style={{ color: 'var(--accent-hover)' }} />
        <h3 className="display text-lg font-semibold">Your Circle wallet</h3>
      </div>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
        A managed wallet created for you. Bookings and refunds happen with no wallet pop-ups. Fund it from your own wallet, a CCTP
        bridge, or Gateway.
      </p>

      {!circleConfigured ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
          The wallet service is not running, so Circle wallets are unavailable right now.
        </p>
      ) : circleLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Spinner /> Creating your wallet…
        </div>
      ) : circleError ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
          {circleError}
        </p>
      ) : circleAddress ? (
        <>
          <div className="glass-inner mt-4 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="mono break-all text-xs">{circleAddress}</span>
              <button
                aria-label="Copy wallet address"
                className="btn-ghost flex size-11 shrink-0 items-center justify-center rounded-xl"
                onClick={() => {
                  void navigator.clipboard.writeText(circleAddress)
                  toast.success('Address copied')
                }}
              >
                <Copy className="size-4" />
              </button>
            </div>
            <div className="mt-2 text-sm">
              Balance:{' '}
              <span className="display font-bold tabular-nums">
                {circleBalance.data !== undefined ? formatUsdc(circleBalance.data) : '—'}
              </span>{' '}
              USDC
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Amount"
              aria-label="Amount of USDC to move"
              className="glass-inner min-h-11 w-full rounded-xl px-3 text-sm tabular-nums outline-none"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ActionButton
              disabled={!walletAddress || raw === 0n}
              loading={sending}
              onClick={() => sendFromWallet({ kind: 'transfer', to: circleAddress, amount: raw }).then(() => setAmount(''))}
            >
              Add from my wallet
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={!walletAddress || raw === 0n}
              loading={cashing}
              onClick={() => walletAddress && cashOut({ kind: 'transfer', to: walletAddress, amount: raw }).then(() => setAmount(''))}
            >
              Send to my wallet
            </ActionButton>
          </div>
        </>
      ) : null}
    </section>
  )
}
