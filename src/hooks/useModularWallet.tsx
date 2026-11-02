import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Address } from 'viem'
import { modularWalletAvailable, registerPasskey } from '@/lib/modularWallet'

type ModularWalletContextValue = {
  address: Address | undefined
  account: unknown
  client: any
  connect: () => Promise<void>
  error: string | undefined
  isConnecting: boolean
  isAvailable: boolean
}

const ModularWalletContext = createContext<ModularWalletContextValue | null>(null)

export function ModularWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address>()
  const [account, setAccount] = useState<unknown>()
  const [client, setClient] = useState<any>()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string>()

  const connect = useCallback(async () => {
    setIsConnecting(true)
    setError(undefined)
    try {
      const username = `patient-${crypto.randomUUID().slice(0, 8)}`
      const wallet = await registerPasskey(username)
      setAddress(wallet.address)
      setAccount(wallet.account)
      setClient(wallet.client)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the passkey wallet.')
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const value = useMemo(
    () => ({ address, account, client, connect, error, isConnecting, isAvailable: modularWalletAvailable }),
    [address, account, client, connect, error, isConnecting],
  )

  return <ModularWalletContext.Provider value={value}>{children}</ModularWalletContext.Provider>
}

export function useModularWallet() {
  const context = useContext(ModularWalletContext)
  if (!context) throw new Error('useModularWallet must be used inside ModularWalletProvider')
  return context
}
