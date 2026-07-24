'use client'

// Ein-/Ausklapp-Leiste für die Wochenstatistik der Tracking-Widgets
// (Wasser, Schlaf, Aufgaben) — sitzt am unteren Widget-Rand.
export default function StatsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      data-stats-toggle=""
      onPointerDown={e => e.stopPropagation()}
      onClick={onToggle}
      title={open ? 'Statistik einklappen' : 'Statistik anzeigen'}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '5px 6px', background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 8, fontWeight: 700, color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        transition: 'color 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text2)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)' }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
        <polyline points="6,9 12,15 18,9"/>
      </svg>
      Statistik
    </button>
  )
}
