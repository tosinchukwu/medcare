/**
 * Managed-wallet logic shared by the Vercel functions in /api and the local dev server.
 * Stateless on purpose: Vercel has no persistent disk, so a patient's wallet is found
 * through Circle by a reference id derived from a secret that only their browser holds.
 * This file imports nothing from src/ and no SDK: it talks to Circle's REST API with fetch, so there
 * is nothing for the host to bundle and nothing that can fail to load at startup.
 */
import { createHash, constants, publicEncrypt, randomUUID } from 'node:crypto'

export type ApiRequest = { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined> }
export type ApiResponse = { status: (code: number) => ApiResponse; json: (body: unknown) => void }
export type Result = { status: number; body: unknown }

const env = process.env
const IS_MAINNET = env.VITE_NETWORK === 'mainnet'

// Arc's USDC predeploy is the same address on every Arc network.
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const bookingAddress = IS_MAINNET ? env.VITE_BOOKING_CONTRACT_ADDRESS_MAINNET : env.VITE_BOOKING_CONTRACT_ADDRESS_TESTNET
// Circle's identifier for Arc mainnet must be set explicitly (ARC). Testnet is ARC-TESTNET.
const BLOCKCHAIN = IS_MAINNET ? env.CIRCLE_WALLET_BLOCKCHAIN : 'ARC-TESTNET'
const apiKey = env.CIRCLE_API_KEY
const entitySecret = env.CIRCLE_ENTITY_SECRET ?? env.ENTITY_SECRET
const WALLET_SET_NAME = 'CareDesk patients'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const UINT = /^\d{1,78}$/
const BYTES32 = /^0x[0-9a-fA-F]{64}$/

/** Only these calls can ever be sent from a managed wallet. */
const ALLOWED: Record<string, { target: 'usdc' | 'booking'; checks: RegExp[] }> = {
  'approve(address,uint256)': { target: 'usdc', checks: [ADDRESS, UINT] },
  'transfer(address,uint256)': { target: 'usdc', checks: [ADDRESS, UINT] },
  'bookConsultation(address,uint64,uint32,bytes32,uint256)': {
    target: 'booking',
    checks: [ADDRESS, UINT, UINT, BYTES32, UINT],
  },
  'cancelConsultation(uint256)': { target: 'booking', checks: [UINT] },
  'confirmCompletion(uint256)': { target: 'booking', checks: [UINT] },
  'disputeCompletion(uint256)': { target: 'booking', checks: [UINT] },
  'finalizeCompletion(uint256)': { target: 'booking', checks: [UINT] },
  'claimRefund(uint256)': { target: 'booking', checks: [UINT] },
  'claimDisputeRefund(uint256)': { target: 'booking', checks: [UINT] },
  'withdraw()': { target: 'booking', checks: [] },
}

const isConfigured = () => Boolean(apiKey && entitySecret && bookingAddress && BLOCKCHAIN)

const CIRCLE_BASE = 'https://api.circle.com'

type CircleBody = Record<string, unknown>
type Json = { data?: Record<string, unknown> & { message?: string }; message?: string; code?: number }

class CircleError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function circleFetch(path: string, init: { method?: 'GET' | 'POST'; body?: CircleBody } = {}): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error('Wallet service is not configured')
  const res = await fetch(`${CIRCLE_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Request-Id': randomUUID() },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as Json
  if (!res.ok) throw new CircleError(json.message ?? `Circle request failed (${res.status})`, res.status)
  return (json.data ?? {}) as Record<string, unknown>
}

let cachedPublicKey: string | undefined
/** Every signed request needs a fresh ciphertext: the entity secret encrypted with Circle's public key. */
async function entitySecretCiphertext(): Promise<string> {
  if (!entitySecret) throw new Error('Wallet service is not configured')
  cachedPublicKey ??= (await circleFetch('/v1/w3s/config/entity/publicKey')).publicKey as string
  return publicEncrypt(
    { key: cachedPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(entitySecret, 'hex'),
  ).toString('base64')
}

const validToken = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const refIdFor = (token: string) => digest(token).slice(0, 32)

/** Deterministic UUIDv4-shaped key so two simultaneous first requests create only one wallet. */
function idempotencyKeyFor(token: string, scope: string) {
  const h = createHash('sha256').update(`${scope}:${token}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

async function ensureWalletSet(): Promise<string> {
  if (env.CIRCLE_WALLET_SET_ID) return env.CIRCLE_WALLET_SET_ID
  // Wallet sets are not chain specific, so reuse the account's first one if it has any.
  const existing = await circleFetch('/v1/w3s/walletSets?pageSize=1')
  const found = (existing.walletSets as { id?: string }[] | undefined)?.[0]
  if (found?.id) return found.id
  const created = await circleFetch('/v1/w3s/developer/walletSets', {
    method: 'POST',
    body: {
      name: WALLET_SET_NAME,
      idempotencyKey: idempotencyKeyFor(WALLET_SET_NAME, 'walletset'),
      entitySecretCiphertext: await entitySecretCiphertext(),
    },
  })
  const id = (created.walletSet as { id?: string } | undefined)?.id
  if (!id) throw new Error('Could not create wallet set')
  return id
}

async function findWallet(token: string) {
  const query = new URLSearchParams({ refId: refIdFor(token), blockchain: BLOCKCHAIN ?? '', pageSize: '1' })
  const res = await circleFetch(`/v1/w3s/wallets?${query.toString()}`)
  const wallet = (res.wallets as { id?: string; address?: string }[] | undefined)?.[0]
  return wallet?.id && wallet.address ? { walletId: wallet.id, address: wallet.address } : undefined
}

export async function handleStatus(): Promise<Result> {
  return { status: 200, body: { configured: isConfigured() } }
}

export async function handleWallet(body: unknown): Promise<Result> {
  const token = (body as { token?: unknown } | null)?.token
  if (!validToken(token)) return { status: 400, body: { error: 'Invalid session' } }
  if (!isConfigured()) throw new Error('Wallet service is not configured')

  const existing = await findWallet(token)
  if (existing) return { status: 200, body: existing }

  const created = await circleFetch('/v1/w3s/developer/wallets', {
    method: 'POST',
    body: {
      accountType: 'EOA',
      blockchains: [BLOCKCHAIN],
      count: 1,
      walletSetId: await ensureWalletSet(),
      metadata: [{ name: 'patient', refId: refIdFor(token) }],
      idempotencyKey: idempotencyKeyFor(token, 'wallet'),
      entitySecretCiphertext: await entitySecretCiphertext(),
    },
  })
  const wallet = (created.wallets as { id?: string; address?: string }[] | undefined)?.[0]
  if (!wallet?.id || !wallet.address) throw new Error('Could not create wallet')
  return { status: 200, body: { walletId: wallet.id, address: wallet.address } }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function handleExec(body: unknown): Promise<Result> {
  const { token, signature, params } = (body ?? {}) as { token?: unknown; signature?: unknown; params?: unknown }
  if (!validToken(token)) return { status: 400, body: { error: 'Invalid session' } }
  if (!isConfigured()) throw new Error('Wallet service is not configured')
  const wallet = await findWallet(token)
  if (!wallet) return { status: 400, body: { error: 'Wallet not found' } }

  const rule = typeof signature === 'string' ? ALLOWED[signature] : undefined
  if (!rule || !Array.isArray(params) || params.length !== rule.checks.length) {
    return { status: 400, body: { error: 'Call not allowed' } }
  }
  const values: string[] = []
  for (const [i, p] of (params as unknown[]).entries()) {
    // The browser cannot choose the spender: approvals always go to the booking contract.
    const v = p === 'BOOKING' && i === 0 && signature === 'approve(address,uint256)' ? bookingAddress : p
    if (typeof v !== 'string' || !rule.checks[i].test(v)) return { status: 400, body: { error: 'Invalid parameter' } }
    values.push(v)
  }

  const sent = await circleFetch('/v1/w3s/developer/transactions/contractExecution', {
    method: 'POST',
    body: {
      walletId: wallet.walletId,
      contractAddress: rule.target === 'usdc' ? USDC_ADDRESS : bookingAddress,
      abiFunctionSignature: signature,
      abiParameters: values,
      feeLevel: 'MEDIUM',
      idempotencyKey: randomUUID(),
      entitySecretCiphertext: await entitySecretCiphertext(),
    },
  })
  const id = sent.id as string | undefined
  if (!id) throw new Error('Circle did not return a transaction id')

  // Only COMPLETE is success. CONFIRMED means included in a block but not final.
  const deadline = Date.now() + 50_000
  for (;;) {
    const tx = (await circleFetch(`/v1/w3s/transactions/${id}`)).transaction as { state?: string; txHash?: string } | undefined
    if (tx?.state === 'COMPLETE') return { status: 200, body: { txHash: tx.txHash ?? '' } }
    if (tx?.state === 'FAILED' || tx?.state === 'DENIED' || tx?.state === 'CANCELLED') {
      return { status: 400, body: { error: `Transaction ${tx.state.toLowerCase()}` } }
    }
    if (Date.now() > deadline) {
      return { status: 202, body: { error: 'Still processing. Check your consultations in a minute.' } }
    }
    await sleep(1500)
  }
}

/** Reports whether the Circle credentials actually work. Never returns secrets. */
export async function handleCheck(): Promise<Result> {
  if (!isConfigured()) {
    const missing = [
      !apiKey && 'CIRCLE_API_KEY',
      !entitySecret && 'CIRCLE_ENTITY_SECRET',
      !bookingAddress && (IS_MAINNET ? 'VITE_BOOKING_CONTRACT_ADDRESS_MAINNET' : 'VITE_BOOKING_CONTRACT_ADDRESS_TESTNET'),
      !BLOCKCHAIN && 'CIRCLE_WALLET_BLOCKCHAIN',
    ].filter(Boolean)
    return { status: 200, body: { ok: false, network: IS_MAINNET ? 'mainnet' : 'testnet', missing } }
  }
  try {
    await circleFetch('/v1/w3s/walletSets?pageSize=1')
    await entitySecretCiphertext()
    return { status: 200, body: { ok: true, network: IS_MAINNET ? 'mainnet' : 'testnet', blockchain: BLOCKCHAIN } }
  } catch (error) {
    const e = error as { message?: string; status?: number }
    return { status: 200, body: { ok: false, circleStatus: e.status, error: e.message ?? 'Circle rejected the request' } }
  }
}

/** Wraps a handler as a Vercel function: method check, JSON body, error mapping. */
export function route(method: 'GET' | 'POST', fn: (body: unknown) => Promise<Result>) {
  return async (req: ApiRequest, res: ApiResponse) => {
    if (req.method !== method) {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }
    try {
      const result = await fn(req.body)
      res.status(result.status).json(result.body)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      console.error('wallet api error:', message)
      res.status(400).json({ error: message })
    }
  }
}

// Waits for the transaction to settle, so allow more than the default time.
export const config = { maxDuration: 60 }

const routes: Record<string, ReturnType<typeof route>> = {
  status: route('GET', () => handleStatus()),
  check: route('GET', () => handleCheck()),
  wallet: route('POST', handleWallet),
  exec: route('POST', handleExec),
}

/** One function serves /api/circle/status, /check, /wallet and /exec. */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action
  const target = action ? routes[action] : undefined
  if (!target) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await target(req, res)
}
