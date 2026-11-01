import { ConnectKitButton } from 'connectkit'
import { HeartPulse } from 'lucide-react'
import { NETWORK } from '@/lib/network'
import { MainnetBanner } from '@/components/MainnetNotice'

export type TabId = 'doctors' | 'consultations' | 'funds' | 'desk' | 'admin'

const TABS: { id: TabId; label: string }[] = [
  { id: 'doctors', label: 'Find a doctor' },
  { id: 'consultations', label: 'My consultations' },
  { id: 'funds', label: 'Add funds' },
  { id: 'desk', label: 'Doctor desk' },
  { id: 'admin', label: 'Admin' },
]

export function Header({
  tab,
  onTab,
  visibleTabs,
}: {
  tab: TabId
  onTab: (tab: TabId) => void
  visibleTabs: TabId[]
}) {
  return (
    <header className="sticky top-0 z-30 border-b backdrop-blur-xl" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.7)' }}>
      <MainnetBanner />
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
            <HeartPulse className="size-5 text-white" />
          </div>
          <div>
            <div className="display text-lg font-bold leading-none">CareDesk</div>
            <div className="text-[11px]" style={{ color: 'var(--subtle)' }}>
              Online consultations · USDC on {NETWORK.arcLabel}
            </div>
          </div>
        </div>
        <ConnectKitButton showBalance={false} />
      </div>
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2" aria-label="Sections">
        {TABS.filter((t) => visibleTabs.includes(t.id)).map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className="min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors"
            style={
              tab === t.id
                ? { background: 'var(--accent)', color: '#fff' }
                : { color: 'var(--muted)', background: 'transparent' }
            }
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
