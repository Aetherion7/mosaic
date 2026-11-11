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
        // Insel wie Toasts/Mehrfachauswahl — Warnfarbe nur im Icon-Kreis,
        // kein roter Rahmen um die ganze Fläche
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--popover-bg, var(--surface, #12131e))',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border, #2a2d45)',
        borderRadius: 20, padding: '7px 7px 7px 7px',
        boxShadow: '0 10px 32px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
        fontSize: 12.5, color: 'var(--text1, #edeaf8)',
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 999, flexShrink: 0,
        background: 'color-mix(in srgb, var(--danger, #ef4444) 16%, transparent)', color: 'var(--danger, #ef4444)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>
      </span>
      <span>{t(isDesktop
        ? 'Failed to save a change — your local storage may be full. Export a backup and free up space soon.'
        : 'Failed to save a change — your browser storage may be full. Export a backup and free up space soon.')}</span>
      <button
        onClick={() => setVisible(false)}
        aria-label={t('Close')}
        style={{ marginLeft: 4, width: 28, height: 28, flexShrink: 0, borderRadius: 999, border: '1px solid var(--border, #2a2d45)', background: 'var(--surface2, #191a2c)', color: 'var(--text2, #a9a6c8)', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
      </button>
    </div>
  )
}
