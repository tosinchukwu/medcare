/**
 * Managed-wallet logic shared by the Vercel functions in /api and the local dev server.
 * Stateless on purpose: Vercel has no persistent disk, so a patient's wallet is found
 * through Circle by a reference id derived from a secret that only their browser holds.
 * This file imports nothing from src/ so it deploys as a standalone function.
 */
import { createHash } from 'node:crypto'
// Load Circle SDK only when needed.
type Sdk = typeof import('@circle-fin/developer-controlled-wallets')
let sdk: Promise<Sdk> | undefined
const loadSdk = () => (sdk ??= import('@circle-fin/developer-controlled-wallets'))

export type ApiRequest = { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined> }
export type ApiResponse = { status: (code: number) => ApiResponse; json: (body: unknown) => void }
export type Result = { status: number; body: unknown }

type CircleClient = ReturnType<Sdk['initiateDeveloperControlledWalletsClient']>
type Blockchains = Parameters<CircleClient['createWallets']>[0]['blockchains']
type ListBlockchain = NonNullable<Parameters<CircleClient['listWallets']>[0]>['blockchain']

const env = process.env
const IS_MAINNET = env.VITE_NETWORK === 'mainnet'
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const bookingAddress = IS_MAINNET ? env.VITE_BOOKING_CONTRACT_ADDRESS_MAINNET : env.VITE_BOOKING_CONTRACT_ADDRESS_TESTNET
const BLOCKCHAIN = IS_MAINNET ? env.CIRCLE_WALLET_BLOCKCHAIN : 'ARC-TESTNET'
const apiKey = env.CIRCLE_API_KEY
const entitySecret = env.CIRCLE_ENTITY_SECRET ?? env.ENTITY_SECRET
const WALLET_SET_NAME = 'CareDesk patients'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const UINT = /^\d{1,78}$/
const BYTES32 = /^0x[0-9a-fA-F]{64}$/

const ALLOWED: Record<string, { target: 'usdc' | 'booking'; checks: RegExp[] }> = {
  'approve(address,uint256)': { target: 'usdc', checks: [ADDRESS, UINT] },
  'transfer(address,uint256)': { target: 'usdc', checks: [ADDRESS, UINT] },
  'bookConsultation(address,uint64,uint32,bytes32,uint256)': { target: 'booking', checks: [ADDRESS, UINT, UINT, BYTES32, UINT] },
  'cancelConsultation(uint256)': { target: 'booking', checks: [UINT] },
  'confirmCompletion(uint256)': { target: 'booking', checks: [UINT] },
  'disputeCompletion(uint256)': { target: 'booking', checks: [UINT] },
  'finalizeCompletion(uint256)': { target: 'booking', checks: [UINT] },
  'claimRefund(uint256)': { target: 'booking', checks: [UINT] },
  'claimDisputeRefund(uint256)': { target: 'booking', checks: [UINT] },
  'withdraw()': { target: 'booking', checks: [] },
}

const isConfigured = () => Boolean(apiKey && entitySecret && bookingAddress && BLOCKCHAIN)

let cached: CircleClient | undefined
async function getClient(): Promise<CircleClient> {
  if (!apiKey || !entitySecret || !isConfigured()) throw new Error('Wallet service is not configured')
  const { initiateDeveloperControlledWalletsClient } = await loadSdk()
  cached ??= initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  return cached
}

const validToken = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const refIdFor = (token: string) => digest(token).slice(0, 32)

function idempotencyKeyFor(token: string, scope: string) {
  const h = createHash('sha256').update(`${scope}:${token}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

async function ensureWalletSet(client: CircleClient): Promise<string> {
  if (env.CIRCLE_WALLET_SET_ID) return env.CIRCLE_WALLET_SET_ID
  const existing = await client.listWalletSets({ pageSize: 1 })
  const found = existing.data?.walletSets?.[0]
  if (found?.id) return found.id
  const created = await client.createWalletSet({
    name: WALLET_SET_NAME,
    idempotencyKey: idempotencyKeyFor(WALLET_SET_NAME, 'walletset'),
  })
  const id = created.data?.walletSet?.id
  if (!id) throw new Error('Could not create wallet set')
  return id
}

async function findWallet(client: CircleClient, token: string) {
  const res = await client.listWallets({ refId: refIdFor(token), blockchain: BLOCKCHAIN as ListBlockchain, pageSize: 1 })
  const wallet = res.data?.wallets?.[0]
  return wallet?.id && wallet.address ? { walletId: wallet.id, address: wallet.address } : undefined
}

export async function handleStatus(): Promise<Result> {
  return { status: 200, body: { configured: isConfigured() } }
}

export async function handleWallet(body: unknown): Promise<Result> {
  const token = (body as { token?: unknown } | null)?.token
  if (!validToken(token)) return { status: 400, body: { error: 'Invalid session' } }
  const client = await getClient()
  const existing = await findWallet(client, token)
  if (existing) return { status: 200, body: existing }

  const created = await client.createWallets({
    accountType: 'EOA',
    blockchains: [BLOCKCHAIN] as unknown as Blockchains,
    count: 1,
    walletSetId: await ensureWalletSet(client),
    metadata: [{ name: 'patient', refId: refIdFor(token) }],
    idempotencyKey: idempotencyKeyFor(token, 'wallet'),
  })
  const wallet = created.data?.wallets?.[0]
  if (!wallet?.id || !wallet.address) throw new Error('Could not create wallet')
  return { status: 200, body: { walletId: wallet.id, address: wallet.address } }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function handleExec(body: unknown): Promise<Result> {
  const { token, signature, params } = (body ?? {}) as { token?: unknown; signature?: unknown; params?: unknown }
  if (!validToken(token)) return { status: 400, body: { error: 'Invalid session' } }
  const client = await getClient()
  const wallet = await findWallet(client, token)
  if (!wallet) return { status: 400, body: { error: 'Wallet not found' } }

  const rule = typeof signature === 'string' ? ALLOWED[signature] : undefined
  if (!rule || !Array.isArray(params) || params.length !== rule.checks.length) {
    return { status: 400, body: { error: 'Call not allowed' } }
  }
  const values: string[] = []
  for (const [i, p] of (params as unknown[]).entries()) {
    const v = p === 'BOOKING' && i === 0 && signature === 'approve(address,uint256)' ? bookingAddress : p
    if (typeof v !== 'string' || !rule.checks[i].test(v)) return { status: 400, body: { error: 'Invalid parameter' } }
    values.push(v)
  }

  const sent = await client.createContractExecutionTransaction({
    walletId: wallet.walletId,
    contractAddress: rule.target === 'usdc' ? USDC_ADDRESS : (bookingAddress as string),
    abiFunctionSignature: signature as string,
    abiParameters: values,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  })
  const id = sent.data?.id
  if (!id) throw new Error('Circle did not return a transaction id')

  const deadline = Date.now() + 50_000
  for (;;) {
    const tx = (await client.getTransaction({ id })).data?.transaction
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
      await (await getClient()).listWalletSets({ pageSize: 1 })
    return { status: 200, body: { ok: true, network: IS_MAINNET ? 'mainnet' : 'testnet', blockchain: BLOCKCHAIN } }
  } catch (error) {
    const e = error as { message?: string; response?: { status?: number } }
    return { status: 200, body: { ok: false, circleStatus: e.response?.status, error: e.message ?? 'Circle rejected the request' } }
  }
}

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

export const config = { maxDuration: 60 }

const routes: Record<string, ReturnType<typeof route>> = {
  status: route('GET', () => handleStatus()),
  check: route('GET', () => handleCheck()),
  wallet: route('POST', handleWallet),
  exec: route('POST', handleExec),
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action
  const target = action ? routes[action] : undefined
  if (!target) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await target(req, res)
}
EOF
