import { createPublicClient, type Address, type Transport } from 'viem'
import { arc } from 'viem/chains'
import {
  createRpClient,
  toCircleModularWalletClient,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from '@circle-fin/modular-wallets-core'

const circleClientKey = (import.meta.env.VITE_CIRCLE_CLIENT_KEY ?? import.meta.env.CIRCLE_API_KEY) as string | undefined
const circleClientUrl = 'https://api.circle.com/v1/w3s'

export const modularWalletAvailable = Boolean(circleClientKey)

function requireClientKey() {
  if (!circleClientKey) {
    throw new Error('Circle client key is not configured for this preview.')
  }
  return circleClientKey
}

export function createPasskeyRpClient() {
  const transport = toPasskeyTransport(circleClientUrl, requireClientKey()) as unknown as Transport
  return createRpClient({ name: 'CareDesk', transport } as any)
}

export async function registerPasskey(username: string) {
  const rpClient = createPasskeyRpClient()
  const credential = await toWebAuthnCredential({
    transport: rpClient.transport as unknown as Transport,
    username,
    mode: WebAuthnMode.Register,
  })
  const client = toCircleModularWalletClient({
    client: createPublicClient({ chain: arc, transport: toModularTransport(circleClientUrl, requireClientKey()) }),
  })
  const account = await toCircleSmartAccount({ client, owner: credential as any })
  return { address: account.address as Address, credentialId: credential.id, account, client }
}
