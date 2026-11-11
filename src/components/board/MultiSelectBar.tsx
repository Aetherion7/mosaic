'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useT } from '@/hooks/useT'

export default function MultiSelectBar() {
  const t = useT()
  const multiSelectedIds   = useUIStore(s => s.multiSelectedIds)
  const pendingBulkDelete  = useUIStore(s => s.pendingBulkDelete)
  const clearMultiSelect   = useUIStore(s => s.clearMultiSelect)
  const setPendingBulkDelete = useUIStore(s => s.setPendingBulkDelete)
  const deleteWidgets      = useBoardStore(s => s.deleteWidgets)
  const setFocusedPair     = useUIStore(s => s.setFocusedPair)

  const count = multiSelectedIds.length
  if (count === 0) return null

  function handleDeleteClick() {
    if (count === 1) {
      deleteWidgets(multiSelectedIds)
      clearMultiSelect()
    } else {
      setPendingBulkDelete(true)
    }
  }

  // Genau zwei markierte Widgets → nebeneinander im Fokus-Modus öffnen
  function focusPair() {
    const [a, b] = multiSelectedIds
    clearMultiSelect()
    setFocusedPair(a, b)
  }

  function confirmDelete() {
    deleteWidgets(multiSelectedIds)
    clearMultiSelect()
  }

  return (
    <AnimatePresence>
      <motion.div
        key="multi-select-bar"
        layout
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        style={{
          pointerEvents: 'auto', flexShrink: 0,
          // Insel wie TopBar und Widget-Kopfzeile: eine runde, getönte Pille
          // ohne farbiges Glühen — Rot nur auf dem Löschen-Knopf selbst.
          background: 'var(--popover-bg)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          padding: 5,
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 10px 32px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px 0 6px',
          borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
        }}>
          <span style={{
            minWidth: 20, height: 20, padding: '0 5px', borderRadius: 999, boxSizing: 'border-box',
            background: 'var(--accent)', color: 'var(--on-accent, white)',
            fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{count}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text1)' }}>
            {count !== 1 ? t('Widgets') : t('Widget')} {t('selected')}
          </span>
        </span>

        {pendingBulkDelete ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500, padding: '0 4px' }}>
              {count} {count !== 1 ? t('Widgets') : t('Widget')} {t('delete?')}
            </span>
            <button onClick={confirmDelete} style={pill('danger')}>{t('Yes, delete')}</button>
            <button onClick={() => setPendingBulkDelete(false)} style={pill('ghost')}>{t('Cancel')}</button>
          </>
        ) : (
          <>
            {count === 2 && (
              <button onClick={focusPair} title={t('Show both widgets side by side')} style={pill('accent')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="7.5" height="14" rx="2"/><rect x="13.5" y="5" width="7.5" height="14" rx="2"/>
                </svg>
                {t('Focus mode')}
              </button>
            )}
            <button onClick={handleDeleteClick} style={pill('danger')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              {t('Delete')}
            </button>
            <button
              onClick={clearMultiSelect}
              title={t('Clear selection') + ' [Esc]'}
              aria-label={t('Clear selection')}
              style={{ ...pill('ghost'), width: 30, padding: 0, justifyContent: 'center' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function pill(kind: 'accent' | 'danger' | 'ghost'): React.CSSProperties {
  return {
    height: 30, padding: '0 13px', borderRadius: 999, flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: kind === 'ghost' ? '1px solid var(--border)' : 'none',
    background: kind === 'accent' ? 'var(--accent)' : kind === 'danger' ? 'color-mix(in srgb, var(--danger) 16%, transparent)' : 'transparent',
    color: kind === 'accent' ? 'var(--on-accent, white)' : kind === 'danger' ? 'var(--danger)' : 'var(--text2)',
  }
}
