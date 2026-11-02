import { createPublicClient, type Address } from 'viem'
import { arc } from 'viem/chains'
import {
  type WebAuthnAccount,
  toWebAuthnAccount,
} from 'viem/account-abstraction'

import {
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from '@circle-fin/modular-wallets-core'

const circleClientKey = import.meta.env.VITE_CIRCLE_CLIENT_KEY as string | undefined

const circleClientUrl = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'

export const modularWalletAvailable = Boolean(circleClientKey)

function requireClientKey() {
  if (!circleClientKey) {
    throw new Error('Circle Client Key is not configured.')
  }

  return circleClientKey
}

const passkeyTransport = toPasskeyTransport(
  circleClientUrl,
  requireClientKey()
)

const modularTransport = toModularTransport(
  `${circleClientUrl}/arc`,
  requireClientKey()
)

const client = createPublicClient({
  chain: arc,
  transport: modularTransport,
})

export async function registerPasskey(username: string) {
  const credential = await toWebAuthnCredential({
    transport: passkeyTransport,
    username,
    mode: WebAuthnMode.Register,
  })

  const owner = toWebAuthnAccount({
    credential,
  }) as WebAuthnAccount

  const account = await toCircleSmartAccount({
    client,
    owner,
    name: username,
  })

  return {
    address: account.address as Address,
    credentialId: credential.id,
    account,
    client,
  }
}
