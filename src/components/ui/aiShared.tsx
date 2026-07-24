// Geteilte KI-UI-Bausteine — eigenes Modul ohne weitere Abhängigkeiten,
// damit WidgetAiChat (im TileWrapper gemountet) sie nutzen kann, ohne über
// AiPanel → SettingsModal → TileWrapper einen Import-Zyklus zu ziehen.

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
