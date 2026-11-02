import { Wallet } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { usePayer } from '@/hooks/usePayer'
import { useUsdcBalance } from '@/hooks/useBookingData'
import { formatUsdc } from '@/onchain-money'
import { shortAddr } from '@/lib/contract'
import { ModularWalletCard } from '@/components/ModularWalletCard'

export function PayerSwitch() {
  const { address } = usePayer()
  const balance = useUsdcBalance(address)

  return (
    <div className="flex flex-col gap-4">
      <ModularWalletCard />
      <section className="glass-card rounded-3xl p-4" aria-label="Pay with">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        Pay with
      </div>
      <div className="glass-inner flex items-center gap-3 rounded-2xl p-3">
        <Wallet className="size-4" style={{ color: 'var(--accent-hover)' }} />
        <div>
          <div className="text-sm font-semibold">Your browser wallet</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Sign transactions directly with your connected wallet</div>
        </div>
      </div>

      <div className="glass-inner mt-3 flex items-center justify-between rounded-2xl p-3">
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>
            Browser wallet
          </div>
          <div className="mono truncate text-xs" style={{ color: 'var(--ink-2)' }}>
            {address ? shortAddr(address) : 'Not connected'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TokenUSDC variant="branded" size={18} />
          <span className="display text-lg font-bold tabular-nums">
            {address && balance.data !== undefined ? formatUsdc(balance.data) : '—'}
          </span>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
        </div>
      </div>
      </section>
    </div>
  )
}
