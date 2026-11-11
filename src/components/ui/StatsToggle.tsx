'use client'
import { useT } from '@/hooks/useT'

// Ein-/Ausklapp-Leiste für die Wochenstatistik der Tracking-Widgets
// (Wasser, Schlaf, Aufgaben) — sitzt am unteren Widget-Rand. Die volle
// Breite bleibt Klickfläche; sichtbar ist nur eine kleine Pille in
// Satzschreibung, die beim Hover tonal hinterlegt wird.
export default function StatsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT()
  return (
    <button
      data-stats-toggle=""
      onPointerDown={e => e.stopPropagation()}
      onClick={onToggle}
      title={open ? t('Hide statistics') : t('Show statistics')}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '3px 6px', background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text3)',
        transition: 'color 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--text2)'
        ;(e.currentTarget.firstElementChild as HTMLElement).style.background = 'color-mix(in srgb, var(--surface2) 70%, transparent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--text3)'
        ;(e.currentTarget.firstElementChild as HTMLElement).style.background = 'transparent'
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999,
        fontSize: 9.5, fontWeight: 600,
        background: 'transparent', transition: 'background 0.12s',
      }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6,9 12,15 18,9"/>
        </svg>
        {t('Stats')}
      </span>
    </button>
  )
}
