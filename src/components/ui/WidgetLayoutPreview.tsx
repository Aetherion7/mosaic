'use client'
import { useRef, useState, useEffect } from 'react'

export interface LayoutPreviewItem { col: number; row: number; colSpan: number; rowSpan: number }

// Geteilte Mini-Layout-Vorschau: skaliert eine Liste von Grid-Positionen
// (col/row/colSpan/rowSpan) gleichmäßig in den verfügbaren Platz, mit Rand-
// abstand und Lücken zwischen den Kacheln. Genutzt sowohl vom Board-Karten-
// Thumbnail (BoardMiniMap in page.tsx, mit den echten Widgets eines Boards)
// als auch von der Vorlagen-Vorschau (BoardsPanel.tsx, mit den gespeicherten
// Positionen eines Custom-Templates) — dieselbe Logik, damit beide optisch
// exakt gleich aussehen statt zweier leicht unterschiedlicher Nachbauten.
export default function WidgetLayoutPreview({ items, accent, emptyLabel }: {
  items: LayoutPreviewItem[]
  accent: string
  emptyLabel?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (items.length === 0) {
    return (
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {emptyLabel && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{emptyLabel}</span>}
      </div>
    )
  }

  let minC = Infinity, minR = Infinity, maxC = 0, maxR = 0
  for (const it of items) {
    minC = Math.min(minC, it.col)
    minR = Math.min(minR, it.row)
    maxC = Math.max(maxC, it.col + it.colSpan)
    maxR = Math.max(maxR, it.row + it.rowSpan)
  }
  const cols = Math.max(1, maxC - minC)
  const rows = Math.max(1, maxR - minR)

  // Ein einziger, aus min(...) gebildeter Skalierungsfaktor statt cols/rows
  // unabhängig voneinander auf 100% zu strecken — sonst verzerrt ein einzelnes
  // weit entferntes Widget die Proportionen aller anderen. Grid-Zelle als
  // quadratisch angenommen (im Infinite-Modus exakt korrekt).
  const pad = 12
  const availW = Math.max(0, size.w - pad * 2)
  const availH = Math.max(0, size.h - pad * 2)
  const scale  = availW > 0 && availH > 0 ? Math.min(availW / cols, availH / rows) : 0
  const offX   = pad + (availW - cols * scale) / 2
  const offY   = pad + (availH - rows * scale) / 2
  const cellRadius = 3

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      {scale > 0 && items.map((it, i) => (
        <div key={i} style={{
          position: 'absolute',
          left:   offX + (it.col - minC) * scale,
          top:    offY + (it.row - minR) * scale,
          width:  Math.max(1, it.colSpan * scale - 3),
          height: Math.max(1, it.rowSpan * scale - 3),
          borderRadius: cellRadius,
          // Akzentfarbe über dunkler Basis — bleibt auf jedem Hintergrund sichtbar
          background: `color-mix(in srgb, ${accent} 45%, rgba(12,12,22,0.55))`,
          border: `1px solid color-mix(in srgb, ${accent} 65%, transparent)`,
        }} />
      ))}
    </div>
  )
}
