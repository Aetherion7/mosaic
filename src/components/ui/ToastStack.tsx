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
              background: 'color-mix(in srgb, var(--surface) 95%, transparent)',
              backdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              minWidth: toast.kind === 'undo' ? 260 : 220,
            }}
          >
            {toast.kind === 'undo' ? (
              <>
                <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <WidgetTypeBadge type={toast.widget.type} /> {t('deleted')}
                </span>
                <button
                  onClick={() => {
                    if (toast.boardId !== currentBoardId) switchBoard(toast.boardId)
                    addWidget(toast.widget)
                    dismissToast(toast.id)
                  }}
                  style={{
                    padding: '5px 14px', borderRadius: 9, border: 'none',
                    background: 'var(--accent)', color: 'white',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {t('Undo')}
                </button>
              </>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1, whiteSpace: 'nowrap' }}>{toast.message}</span>
            )}
            <button
              onClick={() => dismissToast(toast.id)}
              style={{
                width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text3)',
                fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </motion.div>
      ))}
    </AnimatePresence>
  )
}
