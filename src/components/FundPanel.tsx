import { CctpBridge } from '@/components/CctpBridge'
import { CircleWalletCard } from '@/components/CircleWalletCard'
import { GatewayPanel } from '@/components/GatewayPanel'

export function FundPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <CircleWalletCard />
        <p className="px-1 text-sm" style={{ color: 'var(--muted)' }}>
          Need test USDC on Arc? Use <strong>Get test USDC</strong> in the Arc Studio sidebar, then send it to the wallet you want to
          pay with.
        </p>
      </div>
      <div className="grid content-start gap-4">
        <CctpBridge />
        <GatewayPanel />
      </div>
    </div>
  )
}
