'use client'
import { useEffect, useRef, useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useT } from '@/hooks/useT'
import type { Widget } from '@/types'

// Ersetzt das frühere Plugin/Add-on-System (Installations-Liste in den
// Einstellungen, JSON-Format, pluginId/pluginName/…): hier trägt jede
// Widget-Instanz ihre eigene HTML-Seite direkt in widget.data.html — kein
// Umweg über eine separate Installation mehr. Einfügen, live sehen, Code
// jederzeit einsehen/ändern, neu laden.
export default function HtmlWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateWidget = useBoardStore(s => s.updateWidget)
  const mode = useUIStore(s => s.mode)
  const d = widget.data as { html?: string }
  const html = d.html ?? ''
  const canEdit = mode === 'edit'

  const [view, setView]   = useState<'render' | 'code'>(html ? 'render' : 'code')
  const [draft, setDraft] = useState(html)
  useEffect(() => { setDraft(html) }, [html])

  function apply() {
    updateWidget(widget.id, { data: { ...d, html: draft } })
    setView('render')
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setDraft(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  // Blob-URL statt data:-URI — läuft exakt wie ein self-contained Plugin
  // durch den gleichen sandboxed <iframe>, kein zweiter Rendering-Pfad nötig.
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!html) { setBlobUrl(null); return }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [html])
  // Eigener Zähler statt Wiederverwendung von `html` als key: erzwingt einen
  // vollständigen iframe-Neustart auch dann, wenn der Nutzer nur "Neu laden"
  // drückt, ohne den Code verändert zu haben (z. B. ein hängengebliebenes
  // Plugin-Script zurücksetzen).
  const [reloadTick, setReloadTick] = useState(0)

  // An <iframe> rendert seinen Inhalt in seiner EIGENEN CSS-Pixelgröße — ein
  // Vorfahre mit `transform: scale()` (Board-Zoom, Fokus-Modus) skaliert nur
  // die BEREITS gerenderte Bitmap nach, genau wie ein gestrecktes Rasterbild.
  // Normale DOM/Text-Widgets bleiben unter demselben Transform gestochen
  // scharf, weil der Browser Vektor-/Textinhalt beim Compositing neu für den
  // effektiven Maßstab rastern kann — ein iframe-Inhalt kann das nicht.
  // Fix: laufend den AKTUELLEN Gesamt-Maßstab messen (egal woher — Board-Zoom
  // und/oder Fokus-Modus kombiniert), über einen unsichtbaren 100×100-Sentinel
  // auf derselben Verschachtelungstiefe wie der iframe, dann den iframe intern
  // entsprechend größer rendern und den exakten Kehrwert direkt am iframe
  // gegenskalieren. Sichtbare Größe bleibt gleich, native Auflösung passt sich
  // der finalen Bildschirmgröße an, statt aus einer kleineren Bitmap gestreckt
  // zu werden. Kompensiert nur beim Hineinzoomen (scale > 1).
  const sentinelRef  = useRef<HTMLDivElement>(null)
  const lastScaleRef = useRef(1)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    let raf: number
    const measure = () => {
      const el = sentinelRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const measured = rect.width > 0 ? rect.width / 100 : 1
        const clamped = Math.min(Math.max(measured, 1), 5)
        if (Math.abs(clamped - lastScaleRef.current) > 0.01) {
          lastScaleRef.current = clamped
          setScale(clamped)
        }
      }
      raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [])

  const pillStyle: React.CSSProperties = {
    padding: '3px 9px', fontSize: 11,
    background: 'rgba(0,0,0,0.6)', color: 'white', borderRadius: 20, border: 'none', cursor: 'pointer',
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'inherit' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {view === 'code' ? (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', gap: 6 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            readOnly={!canEdit}
            placeholder={canEdit ? t('Paste your HTML here…') : t('No HTML yet')}
            spellCheck={false}
            style={{
              flex: 1, width: '100%', resize: 'none', boxSizing: 'border-box',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--surface)', color: 'var(--text1)',
              fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5, padding: 8, outline: 'none',
            }}
          />
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexShrink: 0 }}>
              <input
                ref={fileInputRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
              />
              <button onClick={() => fileInputRef.current?.click()} style={{ ...pillStyle, background: 'var(--surface3)', color: 'var(--text2)' }}>
                {t('Upload file')}
              </button>
              {html && <button onClick={() => { setDraft(html); setView('render') }} style={{ ...pillStyle, background: 'var(--surface3)', color: 'var(--text2)' }}>
                {t('Cancel')}
              </button>}
              <button onClick={apply} style={{ ...pillStyle, background: 'var(--accent)' }}>{t('Apply')}</button>
            </div>
          )}
        </div>
      ) : html ? (
        <>
          <div ref={sentinelRef} style={{ position: 'absolute', width: 100, height: 100, opacity: 0, pointerEvents: 'none' }} />
          {blobUrl && (
            <iframe
              key={reloadTick}
              src={blobUrl}
              title="HTML widget"
              style={{
                position: 'absolute', top: 0, left: 0,
                width: `${scale * 100}%`, height: `${scale * 100}%`,
                transform: `scale(${1 / scale})`, transformOrigin: 'top left',
                border: 'none', display: 'block',
              }}
              // KEIN allow-same-origin: zusammen mit allow-scripts ist das ein
              // bekanntes Sandbox-Escape-Muster. Ohne allow-same-origin läuft
              // der Inhalt in einer eigenen isolierten Origin — Skripte
              // funktionieren weiterhin, aber ohne Zugriff auf Cookies/Storage
              // irgendeiner echten Origin.
              sandbox="allow-scripts allow-forms allow-popups"
            />
          )}
        </>
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center', color: 'var(--text3)',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/>
          </svg>
          <div style={{ fontSize: 12 }}>{t('No HTML yet')}</div>
          {canEdit && (
            <button onClick={() => setView('code')} style={{ ...pillStyle, background: 'var(--accent)' }}>{t('Paste HTML')}</button>
          )}
        </div>
      )}

      {(canEdit || html) && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          {view === 'render' && html && (
            <button onClick={() => setReloadTick(x => x + 1)} style={pillStyle} title={t('Reload')}>
              {t('Reload')}
            </button>
          )}
          {(html || canEdit) && (
            <button onClick={() => setView(v => v === 'render' ? 'code' : 'render')} style={pillStyle} title={t('View/edit code')}>
              {view === 'render' ? t('Code') : t('Preview')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
