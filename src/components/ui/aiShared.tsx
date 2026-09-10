'use client'
// Geteilte KI-UI-Bausteine — eigenes Modul ohne weitere Abhängigkeiten,
// damit WidgetAiChat (im TileWrapper gemountet) sie nutzen kann, ohne über
// AiPanel → SettingsModal → TileWrapper einen Import-Zyklus zu ziehen.
import { useState } from 'react'
import { useT } from '@/hooks/useT'

export function IconSparkle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>
    </svg>
  )
}

// ── Leichtgewichtiges Inline-Markdown für Assistent-Antworten ────────────────
// Nur **fett**, *kursiv* und `Code` — Zeilenumbrüche/Listen erledigt pre-wrap.
// Bewusst keine Markdown-Bibliothek: die Antworten sind kurz, und mehr Syntax
// (Links, Bilder, HTML) soll hier gar nicht gerendert werden.
export function renderInlineMd(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**'))     out.push(<strong key={k++} style={{ fontWeight: 700 }}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k++} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.92em', background: 'color-mix(in srgb, var(--text3) 14%, transparent)', borderRadius: 4, padding: '1px 4px' }}>{tok.slice(1, -1)}</code>)
    else                          out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// ── Per-message actions (copy always, regenerate on the latest assistant
// reply only) ─────────────────────────────────────────────────────────────
// Shared by AiPanel.tsx, WidgetAiChat.tsx, and ChatHistoryModal.tsx — same
// reasoning as the rest of this file: one implementation instead of three
// copies drifting apart. `onRegenerate` omitted = copy-only (used on user
// messages, and on assistant messages that aren't the latest one in their
// thread — regenerating an older reply would silently discard everything
// after it, which isn't obviously what "regenerate" should do here).
export function MessageActions({ text, onRegenerate, light }: { text: string; onRegenerate?: () => void; light?: boolean }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const color = light ? 'rgba(255,255,255,0.75)' : 'var(--text3)'
  const btnStyle: React.CSSProperties = {
    width: 20, height: 20, border: 'none', background: 'none', color,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 5, padding: 0, flexShrink: 0,
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch { /* clipboard API unavailable (e.g. insecure context) — silently no-op */ }
  }
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      <button onClick={copy} title={copied ? t('Copied!') : t('Copy')} style={btnStyle}>
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        )}
      </button>
      {onRegenerate && (
        <button onClick={onRegenerate} title={t('Regenerate')} style={btnStyle}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
        </button>
      )}
    </div>
  )
}
