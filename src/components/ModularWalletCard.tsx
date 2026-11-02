import { KeyRound } from 'lucide-react'
import { ActionButton } from '@/components/ui'
import { useModularWallet } from '@/hooks/useModularWallet'
import { shortAddr } from '@/lib/contract'

export function ModularWalletCard() {
  const { address, connect, error, isAvailable, isConnecting } = useModularWallet()

  return (
    <section className="glass-card rounded-3xl p-4" aria-label="Passkey wallet">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            <KeyRound className="size-4" aria-hidden="true" />
            Circle modular wallet
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Create an Arc smart wallet secured by your device passkey. No seed phrase required.
          </p>
        </div>
        {!address && (
          <ActionButton onClick={connect} disabled={!isAvailable || isConnecting} loading={isConnecting}>
            Create wallet
          </ActionButton>
        )}
      </div>
      {address && (
        <div className="glass-inner rounded-2xl p-3">
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>Passkey wallet address</div>
          <div className="mono mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>{shortAddr(address)}</div>
        </div>
      )}
      {!isAvailable && <p className="text-xs" style={{ color: 'var(--muted)' }}>Circle client key is unavailable in this build.</p>}
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
    </section>
  )
}
