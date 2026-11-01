import { handleExec, route } from '../_lib/circle.js'

// Waits for the transaction to settle, so allow more than the default time.
export const config = { maxDuration: 60 }

export default route('POST', handleExec)
