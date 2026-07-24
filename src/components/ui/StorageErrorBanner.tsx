'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { useIsDesktop } from '@/hooks/useIsDesktop'

// Lauscht global auf fehlgeschlagene IndexedDB-Schreibvorgänge (idbStorage.ts)
// und macht sie sichtbar — ohne das wirkt eine Änderung im UI übernommen,
// ist aber nicht gespeichert und geht beim nächsten Laden lautlos verloren
// (z.B. Storage-Quota voll, privater Browser-Modus). Bleibt bewusst bestehen,
// bis aktiv weggeklickt — kein Auto-Dismiss bei einem möglichen Datenverlust.
export default function StorageErrorBanner() {
  const t = useT()
  const isDesktop = useIsDesktop()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onError() { setVisible(true) }
    window.addEventListener('mosaic:storage-error', onError)
    return () => window.removeEventListener('mosaic:storage-error', onError)
  }, [])

  if (!visible) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10000, maxWidth: 'calc(100vw - 32px)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'color-mix(in srgb, #ef4444 12%, var(--surface, #12131e))',
        border: '1px solid color-mix(in srgb, #ef4444 40%, transparent)',
        borderRadius: 12, padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        fontSize: 12.5, color: 'var(--text1, #edeaf8)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      </svg>
      <span>{t(isDesktop
        ? 'Failed to save a change — your local storage may be full. Export a backup and free up space soon.'
        : 'Failed to save a change — your browser storage may be full. Export a backup and free up space soon.')}</span>
      <button
        onClick={() => setVisible(false)}
        aria-label={t('Close')}
        style={{ marginLeft: 4, width: 20, height: 20, flexShrink: 0, borderRadius: 6, border: 'none', background: 'var(--surface2, #191a2c)', color: 'var(--text3, #6b6990)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >×</button>
    </div>
  )
}
