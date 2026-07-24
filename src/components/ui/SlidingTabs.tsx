'use client'
import { motion } from 'framer-motion'

// Segmented-Umschalter mit gleitender Akzent-Pille — DAS einheitliche
// Interaktionsmuster für alle Modus-Umschalter der App (TopBar Bearbeiten/
// Ansicht, Verschieben/Kopie, Stil-Tabs, Diagramm-Modus, Dark/Light …).
// Bei ausgeschalteten Animationen springt die Pille hart (MotionGlobalConfig
// in MotionProvider.tsx überspringt den Spring automatisch).
//
// slotW gesetzt → feste Slotbreite, Pille gleitet in Pixeln.
// slotW weggelassen → Slots teilen die Breite (flex: 1), Pille gleitet in %.
export default function SlidingTabs<T extends string>({
  options, value, onChange, slotW, slotH, radius = 999, fontSize = 10, soft = false,
}: {
  options: { value: T; label?: React.ReactNode; icon?: React.ReactNode; title?: string }[]
  value: T
  onChange: (v: T) => void
  slotW?: number
  slotH: number
  radius?: number
  fontSize?: number
  // soft: Akzent nur als getönte Fläche + akzentfarbene Schrift
  // (für dichte Kontexte); Standard: volle Akzentfarbe + weiße Schrift
  soft?: boolean
}) {
  const idx = Math.max(0, options.findIndex(o => o.value === value))
  const n = options.length

  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <motion.div
        animate={slotW != null ? { x: idx * slotW } : { x: `${idx * 100}%` }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        style={{
          position: 'absolute', top: 0, left: 0, height: slotH,
          width: slotW ?? `${100 / n}%`,
          borderRadius: radius,
          background: soft ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--accent)',
          border: soft ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : 'none',
          boxSizing: 'border-box',
        }}
      />
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          style={{
            position: 'relative', zIndex: 1,
            width: slotW, flex: slotW == null ? 1 : undefined, height: slotH,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            border: 'none', background: 'none', cursor: 'pointer', borderRadius: radius,
            fontSize, fontWeight: 700, padding: 0,
            color: value === o.value ? (soft ? 'var(--accent)' : 'white') : 'var(--text3)',
            transition: 'color 0.15s',
          }}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}
