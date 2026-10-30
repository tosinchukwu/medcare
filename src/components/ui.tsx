import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { STATUS_LABEL } from '@/lib/contract'

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden />
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            role="dialog"
            aria-label={title}
            className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl"
            style={{
              background: 'rgba(255,255,255,0.94)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-1"
              style={{ background: 'linear-gradient(90deg,#85b1ed,#acc6e9,#f2d7a8,#e9b7c4)' }}
            />
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="display text-xl font-semibold">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex size-11 items-center justify-center rounded-full btn-ghost"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-5 pb-6 pt-2">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const STATUS_TONE: Record<number, { bg: string; fg: string }> = {
  0: { bg: 'rgba(16,97,166,0.10)', fg: '#1061a6' },
  1: { bg: 'rgba(161,92,7,0.12)', fg: '#a15c07' },
  2: { bg: 'rgba(26,128,71,0.12)', fg: '#1a8047' },
  3: { bg: 'rgba(107,101,128,0.14)', fg: '#6b6580' },
  4: { bg: 'rgba(107,101,128,0.14)', fg: '#6b6580' },
  5: { bg: 'rgba(186,43,76,0.12)', fg: '#ba2b4c' },
  6: { bg: 'rgba(26,128,71,0.12)', fg: '#1a8047' },
}

export function StatusBadge({ status }: { status: number }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE[0]
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {STATUS_LABEL[status] ?? 'Unknown'}
    </span>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass-card rounded-3xl p-8 text-center">
      <h3 className="display text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-pretty text-sm" style={{ color: 'var(--muted)' }}>
        {body}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function ActionButton({
  children,
  onClick,
  disabled,
  loading,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode
  onClick: () => unknown
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
}) {
  const style =
    variant === 'danger'
      ? { background: 'rgba(186,43,76,0.1)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.25)' }
      : undefined
  return (
    <button
      onClick={() => {
        void onClick()
      }}
      disabled={disabled || loading}
      style={style}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : ''
      } ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
