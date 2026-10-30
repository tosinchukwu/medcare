import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Stethoscope } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { useDoctors } from '@/hooks/useBookingData'
import { BOOKING_ADDRESS, shortAddr, type Doctor } from '@/lib/contract'
import { formatUsdc } from '@/onchain-money'
import { EmptyState, Spinner } from '@/components/ui'

function initials(name: string) {
  return name
    .replace(/^dr\.?\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function DoctorList({ onBook }: { onBook: (doctor: Doctor) => void }) {
  const { doctors, isLoading } = useDoctors()
  const [filter, setFilter] = useState('All')

  const specialties = useMemo(() => ['All', ...Array.from(new Set(doctors.map((d) => d.specialty)))], [doctors])
  const visible = doctors.filter((d) => d.active && (filter === 'All' || d.specialty === filter))

  if (!BOOKING_ADDRESS)
    return (
      <EmptyState
        title="Contract not deployed yet"
        body="The booking contract address is not configured. Once it is deployed, doctors appear here."
      />
    )
  if (isLoading)
    return (
      <div className="flex justify-center p-10">
        <Spinner className="size-6" />
      </div>
    )
  if (doctors.length === 0)
    return (
      <EmptyState
        title="No doctors yet"
        body="An admin needs to approve doctors before patients can book. Use the Admin tab if you own the contract."
      />
    )

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Specialty">
        {specialties.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            role="tab"
            aria-selected={filter === s}
            className="min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold"
            style={
              filter === s
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink-2)' }
            }
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((d, i) => (
          <motion.article
            key={d.doctor}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="glass-card flex flex-col rounded-3xl p-5"
          >
            <div className="flex items-start gap-3">
              <div
                className="display flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold"
                style={{ background: 'rgba(133,177,237,0.25)', color: 'var(--accent)' }}
              >
                {initials(d.name) || <Stethoscope className="size-5" />}
              </div>
              <div className="min-w-0">
                <h3 className="display truncate text-lg font-semibold">{d.name}</h3>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {d.specialty}
                </p>
                <p className="mono mt-0.5 text-[11px]" style={{ color: 'var(--subtle)' }}>
                  {shortAddr(d.doctor)}
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between">
              <div>
                <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                  Consultation fee
                </div>
                <div className="flex items-center gap-1.5">
                  <TokenUSDC variant="branded" size={18} />
                  <span className="display text-2xl font-bold tabular-nums">{formatUsdc(d.feeUsdc)}</span>
                </div>
              </div>
              <button
                onClick={() => onBook(d)}
                className="btn-primary min-h-11 rounded-2xl px-5 text-sm font-semibold transition-all active:scale-[0.99]"
              >
                Book
              </button>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  )
}
