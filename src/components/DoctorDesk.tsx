import { useState } from 'react'
import { useAccount } from 'wagmi'
import { TokenUSDC } from '@web3icons/react'
import { Clock } from 'lucide-react'
import { useAction } from '@/hooks/useAction'
import { useBookingsFor, useClaimable, useDoctors } from '@/hooks/useBookingData'
import { useNow } from '@/components/MyConsultations'
import { formatWhen, shortAddr, STATUS, STATUS_LABEL, WINDOWS, type Booking } from '@/lib/contract'
import { formatUsdc, parseUsdc } from '@/onchain-money'
import { ActionButton, EmptyState, StatusBadge } from '@/components/ui'

function Appointment({ booking, now }: { booking: Booking; now: bigint }) {
  const { execute, pendingKind } = useAction({ walletOnly: true })
  const start = booking.startTime
  const end = start + BigInt(booking.durationMins) * 60n
  const canSubmit = booking.status === STATUS.Booked && now >= end && now < start + WINDOWS.completion
  return (
    <article className="glass-card rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="display text-lg font-semibold">Patient {shortAddr(booking.patient)}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
            <Clock className="size-4" />
            <span className="tabular-nums">{formatWhen(start)}</span> · {booking.durationMins} min
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-sm">
        <TokenUSDC variant="branded" size={16} />
        <span className="font-semibold tabular-nums">{formatUsdc(booking.feeUsdc)}</span>
        <span style={{ color: 'var(--subtle)' }}>in escrow</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canSubmit && (
          <ActionButton loading={pendingKind === 'submit'} onClick={() => execute({ kind: 'submit', id: booking.id })}>
            Mark consultation done
          </ActionButton>
        )}
        {booking.status === STATUS.Booked && now < end && (
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            You can submit after the session ends.
          </span>
        )}
        {booking.status === STATUS.Booked && (
          <ActionButton variant="danger" loading={pendingKind === 'cancel'} onClick={() => execute({ kind: 'cancel', id: booking.id })}>
            Cancel and refund patient
          </ActionButton>
        )}
        {booking.status === STATUS.CompletionSubmitted && (
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            Waiting for the patient. Payment is released automatically 24 hours after you submitted unless they dispute.
          </span>
        )}
        {booking.status === STATUS.CompletionSubmitted && now >= booking.submittedAt + WINDOWS.dispute && (
          <ActionButton variant="ghost" loading={pendingKind === 'finalize'} onClick={() => execute({ kind: 'finalize', id: booking.id })}>
            Release payment
          </ActionButton>
        )}
        {booking.status === STATUS.Disputed && (
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            {STATUS_LABEL[booking.status]}. An admin will decide how the fee is split.
          </span>
        )}
      </div>
    </article>
  )
}

function ProfileForm({ current }: { current: { name: string; specialty: string; fee: bigint; uri: string; active: boolean } }) {
  const { execute, isPending } = useAction({ walletOnly: true })
  const [name, setName] = useState(current.name)
  const [specialty, setSpecialty] = useState(current.specialty)
  const [fee, setFee] = useState(formatUsdc(current.fee))
  const [active, setActive] = useState(current.active)

  const feeRaw = (() => {
    try {
      return parseUsdc(fee)
    } catch {
      return 0n
    }
  })()
  const field = 'glass-inner min-h-11 w-full rounded-xl px-3 text-sm outline-none'
  return (
    <section className="glass-card rounded-3xl p-5">
      <h3 className="display text-lg font-semibold">Your profile</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" placeholder="Display name" />
        <input className={field} value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Specialty" placeholder="Specialty" />
        <input className={`${field} tabular-nums`} value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Fee in USDC" placeholder="Fee (USDC)" />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
          Accepting new bookings
        </label>
      </div>
      <ActionButton
        className="mt-3"
        disabled={!name || !specialty || feeRaw === 0n}
        loading={isPending}
        onClick={() => execute({ kind: 'updateDoctor', name, specialty, fee: feeRaw, uri: current.uri, active })}
      >
        Save profile
      </ActionButton>
    </section>
  )
}

export function DoctorDesk() {
  const { address } = useAccount()
  const { doctors } = useDoctors()
  const me = doctors.find((d) => d.doctor.toLowerCase() === address?.toLowerCase())
  const { bookings } = useBookingsFor(me?.doctor, 'doctor')
  const claimable = useClaimable(address)
  const { execute, isPending } = useAction({ walletOnly: true })
  const now = useNow()

  if (!address) return <EmptyState title="Connect your wallet" body="Doctors sign in with the wallet an admin approved." />
  if (!me)
    return (
      <EmptyState
        title="This wallet is not an approved doctor"
        body="Ask the platform admin to add your wallet address. Once approved, your appointments and earnings show up here."
      />
    )

  return (
    <div className="grid gap-4">
      <section className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
        <div>
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>
            Earnings ready to withdraw
          </div>
          <div className="flex items-baseline gap-1">
            <span className="display text-4xl font-bold tabular-nums">{claimable.data !== undefined ? formatUsdc(claimable.data) : '—'}</span>
            <span style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>
        <ActionButton disabled={!claimable.data} loading={isPending} onClick={() => execute({ kind: 'withdraw' })}>
          Withdraw
        </ActionButton>
      </section>
      <ProfileForm key={`${me.name}|${me.specialty}|${me.feeUsdc}|${me.active}`} current={{ name: me.name, specialty: me.specialty, fee: me.feeUsdc, uri: me.metadataURI, active: me.active }} />
      <h3 className="display px-1 text-lg font-semibold">Appointments</h3>
      {bookings.length === 0 ? (
        <EmptyState title="No appointments yet" body="Patients who book you will appear here." />
      ) : (
        bookings.map((b) => <Appointment key={b.id.toString()} booking={b} now={now} />)
      )}
    </div>
  )
}
