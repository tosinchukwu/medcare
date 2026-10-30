import { useState } from 'react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { appKit, SOURCE_CHAINS } from '@/lib/appKit'
import { useAdapter } from '@/hooks/useAdapter'
import { usePayer } from '@/hooks/usePayer'
import { ActionButton, Spinner } from '@/components/ui'
import { SourceUsdc } from '@/components/SourceUsdc'

type Row = { chain: string; amount: string }

export function GatewayPanel() {
  const { address: walletAddress } = useAccount()
  const { address: payerAddress, mode } = usePayer()
  const getAdapter = useAdapter()
  const queryClient = useQueryClient()

  const [source, setSource] = useState<(typeof SOURCE_CHAINS)[number]>(SOURCE_CHAINS[0])
  const [depositAmount, setDepositAmount] = useState('')
  const [spendAmount, setSpendAmount] = useState('')
  const [busy, setBusy] = useState<'deposit' | 'spend' | undefined>()
  const balancesQuery = useQuery({
    queryKey: ['gatewayBalances', walletAddress],
    enabled: Boolean(walletAddress),
    refetchInterval: 20000,
    retry: false,
    queryFn: async () => {
      const balances = await appKit.unifiedBalance.getBalances({
        sources: { address: walletAddress! },
        networkType: 'testnet',
      })
      return {
        total: balances.totalConfirmedBalance,
        rows: balances.breakdown.flatMap((account) =>
          account.breakdown.map((c): Row => ({ chain: c.chain, amount: c.confirmedBalance })),
        ),
      }
    },
  })
  const total = balancesQuery.data?.total
  const rows = balancesQuery.data?.rows ?? []
  const loading = balancesQuery.isLoading
  const loadBalances = async () => {
    await balancesQuery.refetch()
  }

  const isAmount = (v: string) => /^\d*\.?\d{0,6}$/.test(v) && Number(v) > 0

  const deposit = async () => {
    setBusy('deposit')
    try {
      const adapter = await getAdapter(source.id)
      await appKit.unifiedBalance.deposit({ from: { adapter, chain: source.key }, amount: depositAmount })
      toast.success('Deposited to your unified balance')
      setDepositAmount('')
      await loadBalances()
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (!/rejected/i.test(message)) toast.error(message || 'Deposit failed')
    } finally {
      setBusy(undefined)
    }
  }

  const spend = async () => {
    if (!payerAddress) return
    const from = rows.find((r) => Number(r.amount) >= Number(spendAmount))
    const fromChain = SOURCE_CHAINS.find((c) => c.key === from?.chain)
    if (!from || !fromChain) {
      toast.error('No single source chain holds that much. Try a smaller amount.')
      return
    }
    setBusy('spend')
    try {
      const adapter = await getAdapter(fromChain.id)
      await appKit.unifiedBalance.spend({
        from: { adapter, allocations: { amount: spendAmount, chain: fromChain.key } },
        to: { chain: 'Arc_Testnet', recipientAddress: payerAddress, useForwarder: true },
        amount: spendAmount,
      })
      toast.success('USDC delivered to Arc Testnet')
      setSpendAmount('')
      await loadBalances()
      await queryClient.invalidateQueries()
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (!/rejected/i.test(message)) toast.error(message || 'Spend failed')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="glass-card rounded-3xl p-5" aria-label="Gateway unified balance">
      <h3 className="display text-lg font-semibold">Unified balance with Gateway</h3>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
        Keep USDC from several chains in one balance, then send it to Arc in seconds whenever you book.
      </p>

      <div className="glass-inner mt-4 rounded-2xl p-4">
        <div className="text-xs" style={{ color: 'var(--subtle)' }}>
          Unified balance
        </div>
        <div className="flex items-baseline gap-1">
          <span className="display text-3xl font-bold tabular-nums">{loading ? '…' : (total ?? '—')}</span>
          <span className="text-sm" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
          {loading && <Spinner className="ml-1 size-3.5" />}
        </div>
        {rows.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {rows.map((r) => (
              <li key={r.chain} className="flex justify-between">
                <span>{r.chain.replace(/_/g, ' ')}</span>
                <span className="tabular-nums">{r.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        1. Deposit
      </div>
      <div className="mt-2 flex gap-2">
        {SOURCE_CHAINS.map((c) => (
          <button
            key={c.key}
            onClick={() => setSource(c)}
            aria-pressed={source.key === c.key}
            className="min-h-11 flex-1 rounded-xl text-sm font-semibold"
            style={
              source.key === c.key
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--surface-muted)', border: '1px solid var(--border)' }
            }
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          inputMode="decimal"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          aria-label="Deposit amount"
          className="glass-inner min-h-11 w-full rounded-xl px-3 text-sm tabular-nums outline-none"
        />
        <ActionButton onClick={deposit} disabled={!walletAddress || !isAmount(depositAmount)} loading={busy === 'deposit'}>
          Deposit
        </ActionButton>
      </div>
      <p className="mt-1 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
        Wallet balance on {source.label}: <SourceUsdc chainId={source.id} address={walletAddress} /> USDC
      </p>

      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        2. Send to Arc ({mode === 'wallet' ? 'your wallet' : 'Circle wallet'})
      </div>
      <div className="mt-2 flex gap-2">
        <input
          inputMode="decimal"
          value={spendAmount}
          onChange={(e) => setSpendAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          aria-label="Amount to send to Arc"
          className="glass-inner min-h-11 w-full rounded-xl px-3 text-sm tabular-nums outline-none"
        />
        <ActionButton onClick={spend} disabled={!payerAddress || !isAmount(spendAmount)} loading={busy === 'spend'}>
          Send
        </ActionButton>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
        Deposits can take a few minutes to show as confirmed on testnet.
      </p>
    </section>
  )
}
