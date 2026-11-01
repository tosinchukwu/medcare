import { useEffect, useState } from 'react'
import { usePayer } from '@/hooks/usePayer'
import { useBookingsFor } from '@/hooks/useBookingData'
import { BookingCard } from '@/components/BookingCard'
import { EmptyState, Spinner } from '@/components/ui'

export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function MyConsultations({ onFindDoctor }: { onFindDoctor: () => void }) {
  const { address, mode } = usePayer()
  const { bookings, isLoading } = useBookingsFor(address, 'patient')
  const now = useNow()

  if (!address)
    return (
      <EmptyState
        title="Connect to see your consultations"
        body={
          mode === 'wallet'
            ? 'Connect your wallet to load the consultations booked from it.'
            : 'Your Circle wallet is still loading, or the backend is not running.'
        }
      />
    )
  if (isLoading)
    return (
      <div className="flex justify-center p-10">
        <Spinner className="size-6" />
      </div>
    )
  if (bookings.length === 0)
    return (
      <EmptyState
        title="No consultations yet"
        body={`Nothing booked from this ${mode === 'wallet' ? 'wallet' : 'Circle wallet'} yet.`}
        action={
          <button onClick={onFindDoctor} className="btn-primary min-h-11 rounded-2xl px-5 text-sm font-semibold">
            Find a doctor
          </button>
        }
      />
    )
  return (
    <div className="grid gap-3">
      {bookings.map((b) => (
        <BookingCard key={b.id.toString()} booking={b} now={now} />
      ))}
    </div>
  )
}
