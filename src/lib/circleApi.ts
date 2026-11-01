import type { Address } from 'viem'
import type { CircleCallParams } from '@/lib/payerCalls'

const TOKEN_KEY = 'caredesk.circleToken'

/** Random secret kept only in this browser. The server stores a hash of it. */
export function getCircleToken(): string {
  let token = localStorage.getItem(TOKEN_KEY)
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(TOKEN_KEY, token)
  }
  return token
}

export type CircleWallet = { address: Address; walletId: string }

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: getCircleToken(), ...body }),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

export const circleApi = {
  wallet: () => post<CircleWallet>('/circle/wallet', {}),
  exec: (call: CircleCallParams) => post<{ txHash: string }>('/circle/exec', { ...call }),
  status: () => fetch('/api/circle/status').then((r) => r.json() as Promise<{ configured: boolean }>),
}
