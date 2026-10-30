import { useMemo } from 'react'
import { erc20Abi, type Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { bookingAbi } from '@/lib/bookingAbi'
import { ARC_CHAIN_ID, BOOKING_ADDRESS, USDC_ADDRESS, type Booking, type Doctor } from '@/lib/contract'

const REFRESH_MS = 8000

export function useDoctors() {
  const query = useReadContract({
    address: BOOKING_ADDRESS,
    abi: bookingAbi,
    functionName: 'getDoctors',
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(BOOKING_ADDRESS), refetchInterval: REFRESH_MS },
  })
  const doctors = useMemo(
    () => ((query.data ?? []) as readonly Doctor[]).filter((d) => d.approved),
    [query.data],
  )
  return { ...query, doctors }
}

export function useBookingsFor(address: Address | undefined, role: 'patient' | 'doctor') {
  const idsQuery = useReadContract({
    address: BOOKING_ADDRESS,
    abi: bookingAbi,
    functionName: role === 'patient' ? 'getPatientBookings' : 'getDoctorBookings',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(BOOKING_ADDRESS && address), refetchInterval: REFRESH_MS },
  })
  const ids = (idsQuery.data ?? [])
  const detail = useReadContracts({
    contracts: ids.map((id) => ({
      address: BOOKING_ADDRESS!,
      abi: bookingAbi,
      functionName: 'getBooking' as const,
      args: [id] as const,
      chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0, refetchInterval: REFRESH_MS },
  })
  const bookings = useMemo(
    () =>
      (detail.data ?? [])
        .map((r) => (r.status === 'success' ? (r.result) : undefined))
        .filter((b): b is Booking => Boolean(b))
        .sort((a, b) => Number(b.startTime - a.startTime)),
    [detail.data],
  )
  const refetch = async () => {
    await idsQuery.refetch()
    await detail.refetch()
  }
  return { bookings, isLoading: idsQuery.isLoading || detail.isLoading, refetch }
}

/** Booked slots for one doctor: used to grey out unavailable times. */
export function useDoctorBusy(doctor: Address | undefined) {
  const { bookings } = useBookingsFor(doctor, 'doctor')
  return useMemo(
    () => bookings.filter((b) => b.status === 0 || b.status === 1 || b.status === 5 || b.status === 2),
    [bookings],
  )
}

export function useUsdcBalance(address: Address | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: REFRESH_MS },
  })
}

export function useUsdcAllowance(owner: Address | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner && BOOKING_ADDRESS ? [owner, BOOKING_ADDRESS] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(owner && BOOKING_ADDRESS), refetchInterval: REFRESH_MS },
  })
}

export function useClaimable(address: Address | undefined) {
  return useReadContract({
    address: BOOKING_ADDRESS,
    abi: bookingAbi,
    functionName: 'claimableOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(BOOKING_ADDRESS && address), refetchInterval: REFRESH_MS },
  })
}

/** Most recent bookings across all patients (for admin dispute handling). */
export function useRecentBookings(limit = 60) {
  const count = useReadContract({
    address: BOOKING_ADDRESS,
    abi: bookingAbi,
    functionName: 'bookingCount',
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(BOOKING_ADDRESS), refetchInterval: REFRESH_MS },
  })
  const total = Number(count.data ?? 0n)
  const first = Math.max(1, total - limit + 1)
  const ids = total === 0 ? [] : Array.from({ length: total - first + 1 }, (_, i) => BigInt(first + i))
  const detail = useReadContracts({
    contracts: ids.map((id) => ({
      address: BOOKING_ADDRESS!,
      abi: bookingAbi,
      functionName: 'getBooking' as const,
      args: [id] as const,
      chainId: ARC_CHAIN_ID,
    })),
    query: { enabled: ids.length > 0, refetchInterval: REFRESH_MS },
  })
  const bookings = useMemo(
    () =>
      (detail.data ?? [])
        .map((r) => (r.status === 'success' ? (r.result) : undefined))
        .filter((b): b is Booking => Boolean(b))
        .reverse(),
    [detail.data],
  )
  return { bookings, isLoading: count.isLoading || detail.isLoading }
}

export function useOwner() {
  return useReadContract({
    address: BOOKING_ADDRESS,
    abi: bookingAbi,
    functionName: 'owner',
    chainId: ARC_CHAIN_ID,
    query: { enabled: Boolean(BOOKING_ADDRESS) },
  })
}
