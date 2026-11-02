import { CctpBridge } from '@/components/CctpBridge'
import { GatewayPanel } from '@/components/GatewayPanel'
import { IS_MAINNET } from '@/lib/network'

export function FundPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <p className="px-1 text-sm" style={{ color: 'var(--muted)' }}>
          {IS_MAINNET ? (
            <>Fund the wallet you want to pay with using real USDC on Arc, or bridge it in with CCTP or Gateway.</>
          ) : (
            <>
              Need test USDC on Arc? Use <strong>Get test USDC</strong> in the Arc Studio sidebar, then send it to the wallet you want
              to pay with.
            </>
          )}
        </p>
      </div>
      <div className="grid content-start gap-4">
        <CctpBridge />
        <GatewayPanel />
      </div>
    </div>
  )
}
