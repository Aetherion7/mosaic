'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/store/uiStore'
import { useBoardStore } from '@/store/boardStore'
import { WidgetTypeBadge } from '@/components/board/TileWrapper'
import { useT } from '@/hooks/useT'

// Rückgängig- und Status-Kurzmeldungen teilen sich denselben Stapel und
// dieselbe Bildschirmposition (unten, zentriert). flex-direction:
// column-reverse + der `layout`-Prop sorgen dafür, dass eine neu
// hinzukommende Meldung immer unten erscheint und ältere, noch sichtbare
// Meldungen sanft nach oben rutschen statt überlagert zu werden.
export default function ToastStack() {
  const toasts          = useUIStore(s => s.toasts)
  const dismissToast    = useUIStore(s => s.dismissToast)
  const addWidget       = useBoardStore(s => s.addWidget)
  const switchBoard     = useBoardStore(s => s.switchBoard)
  const currentBoardId  = useBoardStore(s => s.currentBoardId)
  const t = useT()

  if (toasts.length === 0) return null

  return (
    <AnimatePresence initial={false}>
      {toasts.map(toast => (
          <motion.div
            key={toast.id}
            layout
            role="status" aria-live="polite"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            style={{
              pointerEvents: 'auto',
              flexShrink: 0,
              width: 'fit-content',
              // Insel wie Mehrfachauswahl-Leiste: einzeilige, voll runde Pille
              background: 'var(--popover-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '5px 5px 5px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 10px 32px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
              minWidth: toast.kind === 'undo' ? 260 : 220,
            }}
          >
            {toast.kind === 'undo' ? (
              <>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text2)', flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <WidgetTypeBadge type={toast.widget.type} /> {t('deleted')}
                </span>
                <button
                  onClick={() => {
                    if (toast.boardId !== currentBoardId) switchBoard(toast.boardId)
                    addWidget(toast.widget)
                    dismissToast(toast.id)
                  }}
                  style={{
                    height: 30, padding: '0 14px', borderRadius: 999, border: 'none',
                    background: 'var(--accent)', color: 'var(--on-accent, white)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {t('Undo')}
                </button>
              </>
            ) : (
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text2)', flex: 1, whiteSpace: 'nowrap', padding: '6px 0' }}>{toast.message}</span>
            )}
            <button
              onClick={() => dismissToast(toast.id)}
              style={{
                width: 28, height: 28, borderRadius: 999, border: '1px solid var(--border)', padding: 0,
                background: 'var(--surface2)', color: 'var(--text2)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
            </button>
          </motion.div>
      ))}
    </AnimatePresence>
  )
}
