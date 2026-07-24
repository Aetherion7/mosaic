'use client'
import { useT } from '@/hooks/useT'
import type { Widget } from '@/types'

export default function PluginWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const d = widget.data as Record<string, unknown>
  const embedUrl   = d.embedUrl   as string | undefined
  const pluginIcon = d.pluginIcon as string | undefined
  const pluginName = d.pluginName as string | undefined
  const pluginDesc = d.pluginDesc as string | undefined

  if (embedUrl) {
    return (
      <iframe
        src={embedUrl}
        title={pluginName ?? 'Plugin'}
        style={{ width: '100%', height: '100%', border: 'none', borderRadius: 'inherit', display: 'block' }}
        // KEIN allow-same-origin: zusammen mit allow-scripts ist das ein
        // bekanntes Sandbox-Escape-Muster (die gerahmte Seite kann per
        // document.write eine neue, nicht mehr sandboxed Ansicht erzeugen).
        // Ohne allow-same-origin läuft das Plugin in einer eigenen isolierten
        // Origin — Skripte funktionieren weiterhin, aber ohne Zugriff auf
        // Cookies/Storage irgendeiner echten Origin.
        sandbox="allow-scripts allow-forms allow-popups"
        loading="lazy"
      />
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
