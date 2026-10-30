import { useState } from 'react'
import { isAddress } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { bookingAbi } from '@/lib/bookingAbi'
import { useAction } from '@/hooks/useAction'
import { useDoctors, useOwner, useRecentBookings } from '@/hooks/useBookingData'
import { ARC_CHAIN_ID, BOOKING_ADDRESS, formatWhen, shortAddr, STATUS } from '@/lib/contract'
import { formatUsdc, parseUsdc } from '@/onchain-money'
import { ActionButton, EmptyState } from '@/components/ui'

const field = 'glass-inner min-h-11 w-full rounded-xl px-3 text-sm outline-none'

function AddDoctor() {
  const { execute, isPending } = useAction({ walletOnly: true })
  const [doctor, setDoctor] = useState('')
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [fee, setFee] = useState('')
  const feeRaw = (() => {
    try {
      return fee ? parseUsdc(fee) : 0n
    } catch {
      return 0n
    }
  })()
  const valid = isAddress(doctor) && name.trim() && specialty.trim() && feeRaw > 0n
  return (
    <section className="glass-card rounded-3xl p-5">
      <h3 className="display text-lg font-semibold">Approve a doctor</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className={`${field} mono sm:col-span-2`} value={doctor} onChange={(e) => setDoctor(e.target.value.trim())} placeholder="Doctor wallet address (0x…)" aria-label="Doctor wallet address" />
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" aria-label="Display name" />
        <input className={field} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Specialty" aria-label="Specialty" />
        <input className={`${field} tabular-nums`} value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Fee (USDC)" aria-label="Fee in USDC" />
      </div>
      <ActionButton
        className="mt-3"
        disabled={!valid}
        loading={isPending}
        onClick={async () => {
          if (!isAddress(doctor)) return
          const hash = await execute({ kind: 'addDoctor', doctor, name: name.trim(), specialty: specialty.trim(), fee: feeRaw, uri: '' })
          if (hash) {
            setDoctor('')
            setName('')
            setSpecialty('')
            setFee('')
          }
        }}
      >
        Approve doctor
      </ActionButton>
    </section>
  )
}

function Doctors() {
  const { doctors } = useDoctors()
  const { execute, pendingKind } = useAction({ walletOnly: true })
  if (doctors.length === 0) return null
  return (
    <section className="glass-card rounded-3xl p-5">
      <h3 className="display text-lg font-semibold">Approved doctors</h3>
      <ul className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
        {doctors.map((d) => (
          <li key={d.doctor} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {d.name} <span style={{ color: 'var(--subtle)' }}>· {d.specialty}</span>
              </div>
              <div className="mono text-[11px]" style={{ color: 'var(--subtle)' }}>
                {shortAddr(d.doctor)} · {formatUsdc(d.feeUsdc)} USDC
              </div>
            </div>
            <ActionButton variant="danger" loading={pendingKind === 'removeDoctor'} onClick={() => execute({ kind: 'removeDoctor', doctor: d.doctor })}>
              Remove
            </ActionButton>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Disputes() {
  const { bookings } = useRecentBookings()
  const { execute, pendingKind } = useAction({ walletOnly: true })
  const disputed = bookings.filter((b) => b.status === STATUS.Disputed)
  return (
    <section className="glass-card rounded-3xl p-5">
      <h3 className="display text-lg font-semibold">Disputes</h3>
      {disputed.length === 0 ? (
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          No open disputes.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {disputed.map((b) => (
            <li key={b.id.toString()} className="glass-inner rounded-2xl p-4">
              <div className="text-sm font-semibold">
                #{b.id.toString()} · {formatUsdc(b.feeUsdc)} USDC · {formatWhen(b.startTime)}
              </div>
              <div className="mono text-[11px]" style={{ color: 'var(--subtle)' }}>
                patient {shortAddr(b.patient)} · doctor {shortAddr(b.doctor)}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { label: 'Full refund', bps: 10000 },
                  { label: '50 / 50', bps: 5000 },
                  { label: 'Pay doctor', bps: 0 },
                ].map((o) => (
                  <ActionButton key={o.bps} variant="ghost" loading={pendingKind === 'resolve'} onClick={() => execute({ kind: 'resolve', id: b.id, patientShareBps: o.bps })}>
                    {o.label}
                  </ActionButton>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AdminPanel() {
  const { address } = useAccount()
  const owner = useOwner()
  const { execute, isPending } = useAction({ walletOnly: true })
  const paused = useReadContract({
    address: BOOKING_ADDRESS,
    abi: bookingAbi,
    functionName: 'paused',
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(BOOKING_ADDRESS), refetchInterval: 8000 },
  })

  if (!address) return <EmptyState title="Connect the admin wallet" body="Only the contract owner can manage doctors and disputes." />
  if (!owner.data || owner.data.toLowerCase() !== address.toLowerCase())
    return (
      <EmptyState
        title="Admin only"
        body={owner.data ? `This area is for the contract owner (${shortAddr(owner.data)}).` : 'Loading contract owner…'}
      />
    )
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <AddDoctor />
        <Doctors />
      </div>
      <div className="grid content-start gap-4">
        <Disputes />
        <section className="glass-card flex items-center justify-between gap-3 rounded-3xl p-5">
          <div>
            <h3 className="display text-lg font-semibold">New bookings</h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {paused.data ? 'Paused. Existing bookings can still be settled and refunded.' : 'Open to patients.'}
            </p>
          </div>
          <ActionButton variant={paused.data ? 'primary' : 'ghost'} loading={isPending} onClick={() => execute({ kind: paused.data ? 'unpause' : 'pause' })}>
            {paused.data ? 'Resume' : 'Pause'}
          </ActionButton>
        </section>
      </div>
    </div>
  )
}
