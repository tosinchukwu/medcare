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

/** Serializable form sent to the backend for the managed Circle wallet. */
export type CircleCallParams = {
  target: 'usdc' | 'booking'
  signature: string
  params: string[]
}

export function toCircleParams(call: PayerCall): CircleCallParams {
  switch (call.kind) {
    case 'approve':
      return { target: 'usdc', signature: 'approve(address,uint256)', params: ['BOOKING', call.amount.toString()] }
    case 'transfer':
      return { target: 'usdc', signature: 'transfer(address,uint256)', params: [call.to, call.amount.toString()] }
    case 'book':
      return {
        target: 'booking',
        signature: 'bookConsultation(address,uint64,uint32,bytes32,uint256)',
        params: [call.doctor, call.startTime.toString(), String(call.durationMins), call.noteHash, call.maxFee.toString()],
      }
    case 'cancel':
      return { target: 'booking', signature: 'cancelConsultation(uint256)', params: [call.id.toString()] }
    case 'confirm':
      return { target: 'booking', signature: 'confirmCompletion(uint256)', params: [call.id.toString()] }
    case 'dispute':
      return { target: 'booking', signature: 'disputeCompletion(uint256)', params: [call.id.toString()] }
    case 'finalize':
      return { target: 'booking', signature: 'finalizeCompletion(uint256)', params: [call.id.toString()] }
    case 'refund':
      return { target: 'booking', signature: 'claimRefund(uint256)', params: [call.id.toString()] }
    case 'disputeRefund':
      return { target: 'booking', signature: 'claimDisputeRefund(uint256)', params: [call.id.toString()] }
    case 'withdraw':
      return { target: 'booking', signature: 'withdraw()', params: [] }
    default:
      throw new Error(`${call.kind} must be signed by a browser wallet`)
  }
}
