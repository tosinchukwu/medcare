import { keccak256, toBytes, zeroHash } from 'viem'

const KEY = 'caredesk.notes'

type NoteStore = Record<string, { note: string; salt: string }>

function read(): NoteStore {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as NoteStore
  } catch {
    return {}
  }
}

/**
 * Notes never go onchain. Only a salted hash is stored in the booking;
 * the plaintext stays in this browser.
 */
export function commitNote(note: string): `0x${string}` {
  const trimmed = note.trim()
  if (!trimmed) return zeroHash
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  const hash = keccak256(toBytes(`${salt}|${trimmed}`))
  const store = read()
  store[hash] = { note: trimmed, salt }
  localStorage.setItem(KEY, JSON.stringify(store))
  return hash
}

export function recallNote(hash: string): string | undefined {
  if (hash === zeroHash) return undefined
  return read()[hash]?.note
}
