/**
 * Managed-wallet backend. Holds Circle credentials so the browser never sees them.
 * Run with: bun run server   (the Vite dev server proxies /api to this port)
 */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { getUsdc } from '../src/onchain-facts'
import { waitForSuccessfulTransaction } from '../src/onchain-wait'

const PORT = Number(process.env.SERVER_PORT ?? 3001)
const IS_MAINNET = process.env.VITE_NETWORK === 'mainnet'
const ARC_CHAIN_ID = IS_MAINNET ? 5042 : 5042002
// Circle's blockchain enum for Arc mainnet must be set explicitly after checking Circle's docs.
const BLOCKCHAIN = (IS_MAINNET ? process.env.CIRCLE_WALLET_BLOCKCHAIN : 'ARC-TESTNET') as 'ARC-TESTNET' | undefined

const DATA_FILE = new URL(IS_MAINNET ? './data.mainnet.json' : './data.json', import.meta.url).pathname

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
const bookingAddress = IS_MAINNET
  ? process.env.VITE_BOOKING_CONTRACT_ADDRESS_MAINNET
  : process.env.VITE_BOOKING_CONTRACT_ADDRESS_TESTNET
const usdcAddress = getUsdc(ARC_CHAIN_ID)?.address

const configured = Boolean(apiKey && entitySecret && bookingAddress && usdcAddress && BLOCKCHAIN)
const client = configured
  ? initiateDeveloperControlledWalletsClient({ apiKey: apiKey!, entitySecret: entitySecret! })
  : undefined

type Store = { walletSetId?: string; wallets: Record<string, { walletId: string; address: string }> }

function load(): Store {
  if (!existsSync(DATA_FILE)) return { wallets: {} }
  return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Store
}
function save(store: Store) {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2))
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const validToken = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)

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

async function ensureWallet(token: string) {
  if (!client) throw new Error('Wallet service is not configured')
  const store = load()
  const key = hashToken(token)
  const existing = store.wallets[key]
  if (existing) return existing

  if (!store.walletSetId) {
    const set = await client.createWalletSet({ name: 'CareDesk patients' })
    store.walletSetId = set.data?.walletSet?.id
    if (!store.walletSetId) throw new Error('Could not create wallet set')
  }
  const created = await client.createWallets({
    accountType: 'EOA',
    blockchains: [BLOCKCHAIN!],
    count: 1,
    walletSetId: store.walletSetId,
    metadata: [{ name: 'patient', refId: key.slice(0, 32) }],
  })
  const wallet = created.data?.wallets?.[0]
  if (!wallet?.id || !wallet.address) throw new Error('Could not create wallet')
  store.wallets[key] = { walletId: wallet.id, address: wallet.address }
  save(store)
  return store.wallets[key]
}

async function exec(body: Record<string, unknown>) {
  if (!client || !bookingAddress || !usdcAddress) throw new Error('Wallet service is not configured')
  const { token, signature, params } = body
  if (!validToken(token)) throw new Error('Invalid session')
  const wallet = load().wallets[hashToken(token)]
  if (!wallet) throw new Error('Wallet not found')

  const rule = typeof signature === 'string' ? ALLOWED[signature] : undefined
  if (!rule || !Array.isArray(params) || params.length !== rule.checks.length) throw new Error('Call not allowed')

  const values = (params as unknown[]).map((p, i) => {
    // The client cannot choose the spender: approvals always go to the booking contract.
    const v = p === 'BOOKING' && i === 0 && signature === 'approve(address,uint256)' ? bookingAddress : p
    if (typeof v !== 'string' || !rule.checks[i].test(v)) throw new Error('Invalid parameter')
    return v
  })

  const response = await client.createContractExecutionTransaction({
    walletId: wallet.walletId,
    contractAddress: rule.target === 'usdc' ? usdcAddress : bookingAddress,
    abiFunctionSignature: signature as string,
    abiParameters: values,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  })
  const id = response.data?.id
  if (!id) throw new Error('Circle did not return a transaction id')

  const tx = await waitForSuccessfulTransaction(
    async () => (await client.getTransaction({ id })).data?.transaction,
    (t) => t?.state,
    { label: signature as string },
  )
  return { txHash: tx?.txHash ?? '' }
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
      if (raw.length > 10_000) reject(new Error('Body too large'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function route(req: IncomingMessage): Promise<{ status: number; body: unknown }> {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (req.method === 'GET' && path === '/circle/status') return { status: 200, body: { configured } }
  if (req.method === 'POST' && path === '/circle/wallet') {
    const body = await readBody(req)
    if (!validToken(body.token)) return { status: 400, body: { error: 'Invalid session' } }
    return { status: 200, body: await ensureWallet(body.token) }
  }
  if (req.method === 'POST' && path === '/circle/exec') {
    return { status: 200, body: await exec(await readBody(req)) }
  }
  return { status: 404, body: { error: 'Not found' } }
}

createServer((req, res) => {
  route(req)
    .then(({ status, body }) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Request failed'
      console.error('request failed:', req.url, message)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    })
}).listen(PORT, () => {
  console.log(`Wallet service on :${PORT} (configured: ${configured})`)
})
