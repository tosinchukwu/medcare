import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Header, type TabId } from '@/components/Header'
import { PayerProvider } from '@/hooks/usePayer'
import { ModularWalletProvider } from '@/hooks/useModularWallet'
import { PayerSwitch } from '@/components/PayerSwitch'
import { DoctorList } from '@/components/DoctorList'
import { BookingSheet } from '@/components/BookingSheet'
import { MyConsultations } from '@/components/MyConsultations'
import { FundPanel } from '@/components/FundPanel'
import { DoctorDesk } from '@/components/DoctorDesk'
import { AdminPanel } from '@/components/AdminPanel'
import { useDoctors, useOwner } from '@/hooks/useBookingData'
import type { Doctor } from '@/lib/contract'

function Shell() {
  const [tab, setTab] = useState<TabId>('doctors')
  const [booking, setBooking] = useState<Doctor | undefined>()
  const { address } = useAccount()
  const { doctors } = useDoctors()
  const owner = useOwner()

  const lower = address?.toLowerCase()
  const isDoctor = doctors.some((d) => d.doctor.toLowerCase() === lower)
  const isOwner = owner.data?.toLowerCase() === lower
  const visibleTabs: TabId[] = ['doctors', 'consultations', 'funds']
  if (isDoctor) visibleTabs.push('desk')
  visibleTabs.push('admin')
  const activeTab = visibleTabs.includes(tab) ? tab : 'doctors'
  const patientTab = activeTab === 'doctors' || activeTab === 'consultations' || activeTab === 'funds'

  return (
    <div className="min-h-dvh pb-24">
      <Header tab={activeTab} onTab={setTab} visibleTabs={visibleTabs} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {patientTab && (
          <div className="mb-5">
            <PayerSwitch />
          </div>
        )}
        {activeTab === 'doctors' && (
          <>
            <div className="mb-4">
              <h1 className="display text-balance text-3xl font-bold sm:text-4xl">See a doctor online, pay in USDC</h1>
              <p className="mt-1 max-w-xl text-pretty text-sm" style={{ color: 'var(--muted)' }}>
                Your fee is held in escrow and only released to the doctor after your consultation. Cancel before it starts for a full
                refund.
              </p>
            </div>
            <DoctorList onBook={setBooking} />
          </>
        )}
        {activeTab === 'consultations' && <MyConsultations onFindDoctor={() => setTab('doctors')} />}
        {activeTab === 'funds' && <FundPanel />}
        {activeTab === 'desk' && <DoctorDesk />}
        {activeTab === 'admin' && <AdminPanel />}
      </main>
      <BookingSheet
        doctor={booking}
        onClose={() => setBooking(undefined)}
        onBooked={() => {
          setBooking(undefined)
          setTab('consultations')
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <ModularWalletProvider>
      <PayerProvider>
        <Shell />
      </PayerProvider>
    </ModularWalletProvider>
  )
}
