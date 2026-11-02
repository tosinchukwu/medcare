import type { Address } from 'viem'

/** Every onchain action a patient can take, independent of which wallet signs it. */
export type PayerCall =
  | { kind: 'approve'; amount: bigint }
  | {
      kind: 'book'
      doctor: Address
      startTime: bigint
      durationMins: number
      noteHash: `0x${string}`
      maxFee: bigint
    }
  | { kind: 'cancel' | 'confirm' | 'dispute' | 'finalize' | 'refund' | 'disputeRefund'; id: bigint }
  | { kind: 'withdraw' }
  | { kind: 'transfer'; to: Address; amount: bigint }
  // Doctor and admin actions always sign with the browser wallet.
  | { kind: 'submit'; id: bigint }
  | { kind: 'resolve'; id: bigint; patientShareBps: number }
  | { kind: 'addDoctor'; doctor: Address; name: string; specialty: string; fee: bigint; uri: string }
  | { kind: 'removeDoctor'; doctor: Address }
  | { kind: 'updateDoctor'; name: string; specialty: string; fee: bigint; uri: string; active: boolean }
  | { kind: 'pause' | 'unpause' }

export const CALL_LABEL: Record<PayerCall['kind'], string> = {
  submit: 'Submit consultation',
  resolve: 'Resolve dispute',
  addDoctor: 'Add doctor',
  removeDoctor: 'Remove doctor',
  updateDoctor: 'Update profile',
  pause: 'Pause bookings',
  unpause: 'Resume bookings',
  approve: 'Approve USDC',
  book: 'Book consultation',
  cancel: 'Cancel booking',
  confirm: 'Confirm consultation',
  dispute: 'Dispute consultation',
  finalize: 'Release payment',
  refund: 'Claim refund',
  disputeRefund: 'Claim dispute refund',
  withdraw: 'Withdraw earnings',
  transfer: 'Send USDC',
}
