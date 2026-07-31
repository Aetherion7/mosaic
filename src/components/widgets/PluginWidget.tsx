'use client'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import type { Widget } from '@/types'

export default function PluginWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const d = widget.data as Record<string, unknown>
  const embedUrl   = d.embedUrl   as string | undefined
  const html       = d.html       as string | undefined
  const pluginIcon = d.pluginIcon as string | undefined
  const pluginName = d.pluginName as string | undefined
  const pluginDesc = d.pluginDesc as string | undefined

  // Self-contained plugins ship their whole page as a string instead of a
  // hosted URL — no external hosting required to install one. Turned into a
  // Blob URL so it can go through the exact same sandboxed <iframe> as an
  // embedUrl plugin, rather than needing a second rendering path.
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!html) { setBlobUrl(null); return }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [html])

  const src = blobUrl ?? embedUrl

  // An <iframe> renders its content at its OWN native CSS pixel size — an
  // ancestor `transform: scale()` (board zoom, InfiniteCanvas.tsx; Focus
  // Mode's up-to-2.4× blow-up, FocusOverlay.tsx) only rescales the ALREADY
  // painted bitmap afterwards, same as stretching a raster image. Normal
  // DOM/text widgets stay crisp under that same transform because the
  // browser can re-rasterize vector content at the new effective scale
  // during compositing — an iframe's contents can't, which is exactly why
  // embedded pages looked soft compared to the rest of the app.
  //
  // Fix: continuously measure the CURRENT ambient scale — however it's
  // being applied, board zoom and/or Focus Mode combined — via an invisible
  // 100×100 sentinel placed at the same nesting depth as the iframe, then
  // render the iframe that many times larger internally and apply the
  // exact inverse scale directly on the iframe itself. Net visual size is
  // unchanged, but the iframe now natively renders at (at least) the final
  // on-screen pixel resolution instead of being stretched up from a
  // smaller bitmap. Only compensates for zooming IN (scale > 1) — zoomed
  // out, the browser's normal downscaling already looks fine, so there's
  // no reason to needlessly render the iframe at extra resolution there.
  const sentinelRef = useRef<HTMLDivElement>(null)
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

  if (src) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'inherit' }}>
        <div ref={sentinelRef} style={{ position: 'absolute', width: 100, height: 100, opacity: 0, pointerEvents: 'none' }} />
        <iframe
          src={src}
          title={pluginName ?? 'Plugin'}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: `${scale * 100}%`, height: `${scale * 100}%`,
            transform: `scale(${1 / scale})`, transformOrigin: 'top left',
            border: 'none', display: 'block',
          }}
          // KEIN allow-same-origin: zusammen mit allow-scripts ist das ein
          // bekanntes Sandbox-Escape-Muster (die gerahmte Seite kann per
          // document.write eine neue, nicht mehr sandboxed Ansicht erzeugen).
          // Ohne allow-same-origin läuft das Plugin in einer eigenen isolierten
          // Origin — Skripte funktionieren weiterhin, aber ohne Zugriff auf
          // Cookies/Storage irgendeiner echten Origin. Gilt gleichermaßen für
          // Blob-URLs (self-contained `html`-Plugins).
          sandbox="allow-scripts allow-forms allow-popups"
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>{pluginIcon || '🧩'}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>{pluginName || 'Plugin'}</div>
      {pluginDesc && (
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, maxWidth: 200 }}>{String(pluginDesc)}</div>
      )}
      <div style={{
        marginTop: 4, fontSize: 10, color: 'var(--text3)',
        padding: '3px 10px', borderRadius: 20,
        border: '1px solid var(--border)', background: 'var(--surface2)',
      }}>
        {t('Extension — set the URL in settings')}
      </div>
    </div>
  )
}
