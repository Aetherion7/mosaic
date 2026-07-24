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
          background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
          border: '1px solid rgba(239,68,68,0.6)',
          borderRadius: 14,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(239,68,68,0.25), 0 0 24px rgba(239,68,68,0.2)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: '#ef4444', display: 'flex', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7v3h-7z"/>
          </svg>
        </span>

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>
          {count} {count !== 1 ? t('Widgets') : t('Widget')} {t('selected')}
        </span>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {pendingBulkDelete ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>
              {count} {count !== 1 ? t('Widgets') : t('Widget')} {t('delete?')}
            </span>
            <button
              onClick={confirmDelete}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 700,
                borderRadius: 8, border: 'none',
                background: 'var(--danger)', color: 'white', cursor: 'pointer',
                flexShrink: 0,
              }}
            >{t('Yes, delete')}</button>
            <button
              onClick={() => setPendingBulkDelete(false)}
              style={{
                padding: '5px 12px', fontSize: 12,
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer',
                flexShrink: 0,
              }}
            >{t('Cancel')}</button>
          </>
        ) : (
          <>
            <button
              onClick={handleDeleteClick}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 700,
                borderRadius: 8, border: 'none',
                background: '#ef4444',
                color: 'white', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 0 12px rgba(239,68,68,0.6), 0 0 24px rgba(239,68,68,0.3)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              {t('Delete')}
            </button>
            <button
              onClick={clearMultiSelect}
              title={t('Clear selection') + ' [Esc]'}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text3)',
                fontSize: 16, lineHeight: 1, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >×</button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
