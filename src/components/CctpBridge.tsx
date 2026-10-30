import { useState } from 'react'
import { ArrowDown, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { appKit, SOURCE_CHAINS } from '@/lib/appKit'
import { useAdapter } from '@/hooks/useAdapter'
import { usePayer } from '@/hooks/usePayer'
import { shortAddr } from '@/lib/contract'
import { ActionButton } from '@/components/ui'
import { SourceUsdc } from '@/components/SourceUsdc'

type Step = { name: string; state: string; txHash?: string; explorerUrl?: string }

export function CctpBridge() {
  const { address: walletAddress } = useAccount()
  const { address: payerAddress, mode } = usePayer()
  const getAdapter = useAdapter()
  const queryClient = useQueryClient()
  const [source, setSource] = useState<(typeof SOURCE_CHAINS)[number]>(SOURCE_CHAINS[0])
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])

  const valid = /^\d*\.?\d{0,6}$/.test(amount) && Number(amount) > 0
  const ready = Boolean(walletAddress && payerAddress && valid)

  const bridge = async () => {
    if (!payerAddress) return
    setPending(true)
    setSteps([])
    try {
      const adapter = await getAdapter(source.id)
      const result = await appKit.bridge({
        from: { adapter, chain: source.key },
        to: { chain: 'Arc_Testnet', recipientAddress: payerAddress, useForwarder: true },
        amount,
      })
      setSteps(
        result.steps.map((s) => ({
          name: s.name,
          state: s.state,
          txHash: s.txHash,
          explorerUrl: s.explorerUrl,
        })),
      )
      if (result.state === 'success') {
        toast.success('USDC arrived on Arc Testnet')
        setAmount('')
        await queryClient.invalidateQueries()
      } else {
        toast.error('The bridge did not finish. Check the steps below.')
      }
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (!/rejected/i.test(message)) toast.error(message || 'Bridge failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="glass-card rounded-3xl p-5" aria-label="Bridge with CCTP">
      <h3 className="display text-lg font-semibold">Bridge USDC with CCTP</h3>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
        Burn USDC on another testnet and receive it on Arc. Circle forwards the final step, so you only sign on the source chain.
      </p>

      <div className="glass-inner mt-4 rounded-2xl p-4">
        <div className="mb-2 flex gap-2">
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
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          aria-label="Amount of USDC to bridge"
          className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
        />
        <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--subtle)' }}>
          <span>USDC</span>
          <span className="tabular-nums">
            Balance on {source.label}: <SourceUsdc chainId={source.id} address={walletAddress} />
          </span>
        </div>
      </div>

      <div className="my-2 flex justify-center" style={{ color: 'var(--subtle)' }}>
        <ArrowDown className="size-4" />
      </div>

      <div className="glass-inner rounded-2xl p-4 text-sm">
        <div className="flex justify-between">
          <span style={{ color: 'var(--muted)' }}>Arrives on</span>
          <span className="font-semibold">Arc Testnet</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span style={{ color: 'var(--muted)' }}>Recipient</span>
          <span className="mono text-xs">
            {payerAddress ? `${shortAddr(payerAddress)} (${mode === 'wallet' ? 'your wallet' : 'Circle wallet'})` : 'Connect to choose'}
          </span>
        </div>
      </div>

      <ActionButton onClick={bridge} disabled={!ready} loading={pending} className="mt-4 w-full py-3.5">
        {!walletAddress ? 'Connect a wallet' : !payerAddress ? 'Waiting for recipient' : pending ? 'Bridging…' : 'Bridge to Arc'}
      </ActionButton>
      {pending && (
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          Confirm in your wallet. Attestation can take a minute or more on testnet.
        </p>
      )}
      {steps.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {steps.map((s) => (
            <li key={s.name} className="flex items-center justify-between">
              <span className="capitalize">{s.name}</span>
              <span className="flex items-center gap-2">
                <span style={{ color: s.state === 'success' ? 'var(--success)' : 'var(--danger)' }}>{s.state}</span>
                {s.explorerUrl && (
                  <a href={s.explorerUrl} target="_blank" rel="noreferrer" aria-label={`${s.name} transaction`}>
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
