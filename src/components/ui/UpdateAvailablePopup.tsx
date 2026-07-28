'use client'
import { useEffect, useState } from 'react'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useT } from '@/hooks/useT'

interface UpdateInfo {
  version: string
  releaseNotes: string
  releaseUrl: string
}

// GitHub-Release-Notes kommen als HTML-String (electron-updater rendert das
// Markdown-Body serverseitig). Nur .textContent der <li>-Einträge wird
// übernommen (nie das HTML selbst einbauen) — sicher gegen Injection und
// liefert genau die "kurzen Stichpunkte", die die Release-Notes ohnehin sind.
// Bei "generate_release_notes" hängt GitHub an jeden Punkt "by @user in
// <commit-url>" an — das ist für ein kompaktes Popup nur Rauschen und wird
// abgeschnitten.
function extractBullets(html: string): string[] {
  if (!html) return []
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const items = Array.from(doc.querySelectorAll('li'))
      .map(li => (li.textContent || '').trim().replace(/\s+by\s+@\S+\s+in\s+\S+$/i, ''))
      .filter(Boolean)
    if (items.length) return items
    const text = (doc.body.textContent || '').trim()
    return text ? text.split('\n').map(s => s.trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

// Eigenes In-App-Popup statt der nativen OS-Update-Benachrichtigung (gleiches
// Muster wie DesktopStartupPrompt) — kann Release-Notes und einen direkten
// GitHub-Link zeigen, was ein natives Notification-Bubble nicht kann.
// Erscheint bei jedem Start, solange die abgerufene Version noch nicht
// installiert ist (kein "nicht mehr anzeigen"-Schalter — Cancel blendet nur
// für die laufende Sitzung aus, beim nächsten Öffnen prüft mosaic erneut).
export default function UpdateAvailablePopup() {
  const t = useT()
  const isDesktop = useIsDesktop()
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isDesktop || !window.mosaicDesktop) return
    return window.mosaicDesktop.onUpdateAvailable(update => {
      setInfo(update)
      setVisible(true)
    })
  }, [isDesktop])

  function installNow() {
    window.mosaicDesktop?.installUpdate()
  }

  if (!visible || !info) return null

  const bullets = extractBullets(info.releaseNotes)

  return (
    <div role="dialog" aria-modal="true" aria-label={t('Update available')}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,10,0.72)', backdropFilter: 'blur(1.5px)', WebkitBackdropFilter: 'blur(1.5px)' }} />
      <div style={{
        position: 'relative', width: 460, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column',
        background: 'color-mix(in srgb, var(--surface) 45%, var(--bg))',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: 18,
        padding: '22px 26px 20px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent)',
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text1)', marginBottom: 8 }}>
          {t('Update available')} — {info.version}
        </div>

        {bullets.length > 0 ? (
          <ul style={{ margin: '0 0 16px', padding: '0 0 0 18px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, overflowY: 'auto' }}>
            {bullets.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 16 }}>
            {t('A new version of mosaic is ready to install.')}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 2 }}>
          <button onClick={() => setVisible(false)} style={{
            fontSize: 12.5, fontWeight: 600, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer',
          }}>
            {t('Cancel')}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={info.releaseUrl} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12.5, fontWeight: 600, padding: '9px 16px', borderRadius: 999,
              border: '1px solid var(--border)', color: 'var(--text2)', textDecoration: 'none',
            }}>
              {t('View on GitHub')}
            </a>
            <button onClick={installNow} style={{
              fontSize: 13, fontWeight: 700, padding: '9px 22px', borderRadius: 999,
              border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
              boxShadow: '0 4px 18px color-mix(in srgb, var(--accent) 45%, transparent)',
            }}>
              {t('Update now')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
