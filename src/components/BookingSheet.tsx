import { useMemo, useState } from 'react'
import { TokenUSDC } from '@web3icons/react'
import { Lock } from 'lucide-react'
import { useDoctorBusy, useUsdcAllowance, useUsdcBalance } from '@/hooks/useBookingData'
import { useAction } from '@/hooks/useAction'
import { usePayer } from '@/hooks/usePayer'
import { commitNote } from '@/lib/notes'
import { formatWhen, type Doctor } from '@/lib/contract'
import { formatUsdc } from '@/onchain-money'
import { ActionButton, Sheet } from '@/components/ui'
import { useNow } from '@/components/MyConsultations'
import { MainnetAck, ackOk } from '@/components/MainnetNotice'

const DURATIONS = [15, 30, 45, 60]
const SLOT_STEP_MIN = 30
const DAY_START_HOUR = 9
const DAY_END_HOUR = 17
const MIN_NOTICE_SECONDS = 3600 + 300

function dayOptions() {
  const days: Date[] = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    days.push(d)
  }
  return days
}

export function BookingSheet({
  doctor,
  onClose,
  onBooked,
}: {
  doctor: Doctor | undefined
  onClose: () => void
  onBooked: () => void
}) {
  const { address, mode, circleConfigured } = usePayer()
  const { execute, pendingKind, isPending } = useAction()
  const busy = useDoctorBusy(doctor?.doctor)
  const allowance = useUsdcAllowance(address)
  const balance = useUsdcBalance(address)

  const nowSec = Number(useNow())
  const days = useMemo(() => dayOptions(), [])
  const [dayIndex, setDayIndex] = useState(0)
  const [slot, setSlot] = useState<number | undefined>()
  const [duration, setDuration] = useState(30)
  const [note, setNote] = useState('')
  const [acked, setAcked] = useState(false)

  const slots = useMemo(() => {
    const day = days[dayIndex]
    const now = nowSec
    const list: number[] = []
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_STEP_MIN) {
        const t = new Date(day)
        t.setHours(h, m, 0, 0)
        list.push(Math.floor(t.getTime() / 1000))
      }
    }
    return list.map((start) => {
      const end = start + duration * 60
      const clash = busy.some((b) => {
        const bs = Number(b.startTime)
        const be = bs + b.durationMins * 60
        return start < be && bs < end
      })
      return { start, disabled: start < now + MIN_NOTICE_SECONDS || clash }
    })
  }, [days, dayIndex, busy, duration, nowSec])

  if (!doctor) return null

  const fee = doctor.feeUsdc
  const hasAllowance = (allowance.data ?? 0n) >= fee
  const enoughBalance = (balance.data ?? 0n) >= fee
  const canSubmit = Boolean(address) && slot !== undefined && enoughBalance && !isPending && ackOk(acked)

  const submit = async () => {
    if (slot === undefined) return
    if (!hasAllowance) {
      const approved = await execute({ kind: 'approve', amount: fee })
      if (!approved) return
    }
    const hash = await execute({
      kind: 'book',
      doctor: doctor.doctor,
      startTime: BigInt(slot),
      durationMins: duration,
      noteHash: commitNote(note),
      maxFee: fee,
    })
    if (hash) onBooked()
  }

  const label = !address
    ? mode === 'circle'
      ? circleConfigured
        ? 'Preparing Circle wallet…'
        : 'Backend not running'
      : 'Connect a wallet to book'
    : slot === undefined
      ? 'Pick a time'
      : !enoughBalance
        ? 'Not enough USDC. Add funds first'
        : pendingKind === 'approve'
          ? 'Approving USDC…'
          : pendingKind === 'book'
            ? 'Booking…'
            : hasAllowance
              ? `Pay ${formatUsdc(fee)} USDC and book`
              : `Approve and pay ${formatUsdc(fee)} USDC`

  return (
    <Sheet open onClose={onClose} title={`Book ${doctor.name}`}>
      <p className="-mt-1 mb-4 text-sm" style={{ color: 'var(--muted)' }}>
        {doctor.specialty}. Times are in your local timezone.
      </p>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {days.map((d, i) => (
          <button
            key={d.toISOString()}
            onClick={() => {
              setDayIndex(i)
              setSlot(undefined)
            }}
            aria-pressed={dayIndex === i}
            className="min-h-14 shrink-0 rounded-2xl px-4 text-center"
            style={
              dayIndex === i
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-muted)', border: '1px solid var(--border)' }
            }
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] opacity-70">
              {d.toLocaleDateString(undefined, { weekday: 'short' })}
            </div>
            <div className="display text-lg font-bold tabular-nums">{d.getDate()}</div>
          </button>
        ))}
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        Length
      </div>
      <div className="mb-4 flex gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => {
              setDuration(d)
              setSlot(undefined)
            }}
            aria-pressed={duration === d}
            className="min-h-11 flex-1 rounded-xl text-sm font-semibold"
            style={
              duration === d
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-muted)', border: '1px solid var(--border)' }
            }
          >
            {d} min
          </button>
        ))}
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        Time
      </div>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {slots.map((s) => (
          <button
            key={s.start}
            disabled={s.disabled}
            onClick={() => setSlot(s.start)}
            aria-pressed={slot === s.start}
            className="min-h-11 rounded-xl text-sm font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-30"
            style={
              slot === s.start
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-muted)', border: '1px solid var(--border)' }
            }
          >
            {new Date(s.start * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }} htmlFor="note">
        Reason for visit (optional)
      </label>
      <textarea
        id="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Describe your symptoms for the doctor"
        className="glass-inner w-full resize-none rounded-2xl p-3 text-sm outline-none"
      />
      <p className="mt-1.5 flex items-start gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <Lock className="mt-0.5 size-3 shrink-0" />
        Your note stays in this browser. Only a salted fingerprint is recorded onchain, never the text.
      </p>

      <div className="glass-inner mt-4 space-y-2 rounded-2xl p-4 text-sm">
        <div className="flex justify-between">
          <span style={{ color: 'var(--muted)' }}>When</span>
          <span className="font-semibold tabular-nums">{slot ? formatWhen(slot) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--muted)' }}>Fee held in escrow</span>
          <span className="flex items-center gap-1 font-semibold tabular-nums">
            <TokenUSDC variant="branded" size={14} /> {formatUsdc(fee)} USDC
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Cancel any time before the start for a full refund. The doctor is paid after you confirm the consultation, or after 24 hours
          if you do not dispute it.
        </p>
      </div>

      <MainnetAck checked={acked} onChange={setAcked} />
      <ActionButton onClick={submit} disabled={!canSubmit} loading={isPending} className="mt-4 w-full py-3.5">
        {label}
      </ActionButton>
    </Sheet>
  )
}
