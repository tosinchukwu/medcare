import { Wallet, ShieldCheck } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { usePayer, type PayerMode } from '@/hooks/usePayer'
import { useUsdcBalance } from '@/hooks/useBookingData'
import { formatUsdc } from '@/onchain-money'
import { shortAddr } from '@/lib/contract'
import { Spinner } from '@/components/ui'

const OPTIONS: { id: PayerMode; label: string; hint: string; icon: typeof Wallet }[] = [
  { id: 'wallet', label: 'My wallet', hint: 'Sign with your browser wallet', icon: Wallet },
  { id: 'circle', label: 'Circle wallet', hint: 'Managed wallet, no signing pop-ups', icon: ShieldCheck },
]

export function PayerSwitch() {
  const { mode, setMode, address, circleLoading, circleError, circleConfigured } = usePayer()
  const balance = useUsdcBalance(address)

  return (
    <section className="glass-card rounded-3xl p-4" aria-label="Pay with">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        Pay with
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {OPTIONS.map((o) => {
          const active = mode === o.id
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={active}
              onClick={() => setMode(o.id)}
              className="rounded-2xl p-3 text-left transition-colors"
              style={{
                background: active ? 'var(--surface-strong)' : 'transparent',
                border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
              }}
            >
              <o.icon className="mb-1.5 size-4" style={{ color: active ? 'var(--accent-hover)' : 'var(--subtle)' }} />
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {o.hint}
              </div>
            </button>
          )
        })}
      </div>

      <div className="glass-inner mt-3 flex items-center justify-between rounded-2xl p-3">
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>
            {mode === 'wallet' ? 'Browser wallet' : 'Circle wallet'}
          </div>
          <div className="mono truncate text-xs" style={{ color: 'var(--ink-2)' }}>
            {mode === 'circle' && !circleConfigured
              ? 'Backend not running'
              : mode === 'circle' && circleLoading
                ? 'Preparing your wallet…'
                : address
                  ? shortAddr(address)
                  : mode === 'circle' && circleError
                    ? 'Unavailable'
                    : 'Not connected'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {mode === 'circle' && circleLoading ? (
            <Spinner />
          ) : (
            <>
              <TokenUSDC variant="branded" size={18} />
              <span className="display text-lg font-bold tabular-nums">
                {address && balance.data !== undefined ? formatUsdc(balance.data) : '—'}
              </span>
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                USDC
              </span>
            </>
          )}
        </div>
      </div>
      {mode === 'circle' && circleError && (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {circleError}
        </p>
      )}
    </section>
  )
}
