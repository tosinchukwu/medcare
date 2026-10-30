import { Clock, MessageSquareText } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { useAction } from '@/hooks/useAction'
import { useDoctors } from '@/hooks/useBookingData'
import { recallNote } from '@/lib/notes'
import { formatWhen, shortAddr, WINDOWS, STATUS, type Booking } from '@/lib/contract'
import { formatUsdc } from '@/onchain-money'
import { ActionButton, StatusBadge } from '@/components/ui'

export function BookingCard({ booking, now }: { booking: Booking; now: bigint }) {
  const { execute, pendingKind } = useAction()
  const { doctors } = useDoctors()
  const doctor = doctors.find((d) => d.doctor.toLowerCase() === booking.doctor.toLowerCase())
  const note = recallNote(booking.noteHash)

  const start = booking.startTime
  const submittedWindowOpen = now < booking.submittedAt + WINDOWS.dispute
  const id = booking.id
  const busy = (kind: string) => pendingKind === kind

  return (
    <article className="glass-card rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="display truncate text-lg font-semibold">{doctor?.name ?? shortAddr(booking.doctor)}</h3>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {doctor?.specialty ?? 'Doctor'} · #{id.toString()}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" style={{ color: 'var(--subtle)' }} />
          <span className="tabular-nums">{formatWhen(start)}</span>
          <span style={{ color: 'var(--subtle)' }}>· {booking.durationMins} min</span>
        </span>
        <span className="flex items-center gap-1.5">
          <TokenUSDC variant="branded" size={16} />
          <span className="font-semibold tabular-nums">{formatUsdc(booking.feeUsdc)}</span>
        </span>
      </div>

      {note && (
        <p className="mt-3 flex items-start gap-1.5 text-sm" style={{ color: 'var(--ink-2)' }}>
          <MessageSquareText className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
          <span className="text-pretty">{note}</span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {booking.status === STATUS.Booked && now < start && (
          <ActionButton variant="danger" loading={busy('cancel')} onClick={() => execute({ kind: 'cancel', id })}>
            Cancel and refund
          </ActionButton>
        )}
        {booking.status === STATUS.Booked && now >= start && now < start + WINDOWS.completion && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Waiting for the doctor to submit the consultation. If they do not within 48 hours of the start, you can claim a full
            refund.
          </p>
        )}
        {booking.status === STATUS.Booked && now >= start + WINDOWS.completion && (
          <ActionButton loading={busy('refund')} onClick={() => execute({ kind: 'refund', id })}>
            Claim full refund
          </ActionButton>
        )}
        {booking.status === STATUS.CompletionSubmitted && (
          <>
            <ActionButton loading={busy('confirm')} onClick={() => execute({ kind: 'confirm', id })}>
              Confirm it happened
            </ActionButton>
            {submittedWindowOpen ? (
              <ActionButton variant="danger" loading={busy('dispute')} onClick={() => execute({ kind: 'dispute', id })}>
                Dispute
              </ActionButton>
            ) : (
              <ActionButton variant="ghost" loading={busy('finalize')} onClick={() => execute({ kind: 'finalize', id })}>
                Release payment
              </ActionButton>
            )}
          </>
        )}
        {booking.status === STATUS.Disputed &&
          (now >= booking.disputedAt + WINDOWS.disputeTimeout ? (
            <ActionButton loading={busy('disputeRefund')} onClick={() => execute({ kind: 'disputeRefund', id })}>
              Claim refund
            </ActionButton>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              An admin is reviewing this dispute. If it stays unresolved for 14 days you can claim a full refund.
            </p>
          ))}
      </div>
    </article>
  )
}
