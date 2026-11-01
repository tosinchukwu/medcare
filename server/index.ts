/**
 * Local dev server for the managed-wallet API. On Vercel the same logic runs as the
 * functions in /api. Run with: bun run server   (the Vite dev server proxies /api here)
 */
import { createServer, type IncomingMessage } from 'node:http'
import { handleExec, handleStatus, handleWallet, type Result } from '../api/_lib/circle'

const PORT = Number(process.env.SERVER_PORT ?? 3001)

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
      if (raw.length > 10_000) reject(new Error('Body too large'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as unknown) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function route(req: IncomingMessage): Promise<Result> {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (req.method === 'GET' && path === '/circle/status') return handleStatus()
  if (req.method === 'POST' && path === '/circle/wallet') return handleWallet(await readBody(req))
  if (req.method === 'POST' && path === '/circle/exec') return handleExec(await readBody(req))
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
  console.log(`Wallet service on :${PORT}`)
})
