import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { usePayer } from '@/hooks/usePayer'
import { CALL_LABEL, type PayerCall } from '@/lib/payerCalls'
import { parseOnchainError } from '@/lib/contract'

/** Runs a payer call with honest pending state, toast feedback, and a data refresh. */
export function useAction(options: { walletOnly?: boolean } = {}) {
  const payer = usePayer()
  const run = options.walletOnly ? payer.runWallet : payer.run
  const queryClient = useQueryClient()
  const [pendingKind, setPendingKind] = useState<string | undefined>()

  const execute = useCallback(
    async (call: PayerCall): Promise<string | undefined> => {
      setPendingKind(`${call.kind}`)
      try {
        const hash = await run(call)
        toast.success(`${CALL_LABEL[call.kind]}: confirmed`)
        await queryClient.invalidateQueries()
        return hash
      } catch (error) {
        const message = parseOnchainError(error)
        if (message !== 'Cancelled in wallet.') toast.error(message)
        return undefined
      } finally {
        setPendingKind(undefined)
      }
    },
    [run, queryClient],
  )

  return { execute, pendingKind, isPending: pendingKind !== undefined }
}
