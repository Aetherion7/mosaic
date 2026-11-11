'use client'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { TileContent, TYPE_LABELS, buildStyle, widgetTypeIcon, ISLAND, islandRadius } from './TileWrapper'
import WidgetErrorBoundary from './WidgetErrorBoundary'
import { useT } from '@/hooks/useT'
import { GRID_ROW_H, GRID_GAP, INFINITE_COL_W, GRID_COLS } from '@/lib/constants'
import type { Widget } from '@/types'

// Fokus-Modus: ein Widget (oder zwei nebeneinander) als großes Overlay über dem Board.
// Öffnen per Doppelklick im Ansichtsmodus (TileWrapper) bzw. für zwei markierte
// Widgets über den Fokus-Button der Mehrfachauswahl (MultiSelectBar),
// schließen per Esc/X/Backdrop.

const HEADER_H = 40
// Abstand zwischen zwei Widgets im geteilten Fokus-Modus
const PAIR_GAP = 20
// Wie stark der Inhalt gegenüber seiner echten Board-Größe höchstens vergrößert
// wird — verhindert, dass ein winziges Widget genauso groß aufgeblasen wird wie
// ein großes und damit der Größenunterschied zwischen Widgets verloren geht.
const MAX_ZOOM = 2.4
const CONTENT_PAD = '10px 12px' // identisch zur Innen-Polsterung im TileWrapper

// Grobe Not-Schätzung der Inhaltsgröße, falls die echte Board-Kachel gerade
// nicht messbar ist (z. B. während des allerersten Renders) — zieht Kopfzeile
// und Polsterung des Board-Widgets grob ab.
function approxNaturalContent(colSpan: number, rowSpan: number, isInfinite: boolean, vw: number) {
  const colW = isInfinite
    ? INFINITE_COL_W
    : Math.max(40, (vw - 2 * GRID_GAP - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS)
  const outerW = colSpan * colW + Math.max(0, colSpan - 1) * GRID_GAP
  const outerH = rowSpan * GRID_ROW_H + Math.max(0, rowSpan - 1) * GRID_GAP
  return { w: Math.max(40, outerW - 24), h: Math.max(40, outerH - 60) }
}

export default function FocusOverlay() {
  const focusedId   = useUIStore(s => s.focusedId)
  const focusPairId = useUIStore(s => s.focusPairId)
  const setFocused  = useUIStore(s => s.setFocusedWidget)
  const first  = useBoardStore(s => (focusedId ? selectBoard(s)?.widgets[focusedId] : undefined))
  const second = useBoardStore(s => (focusPairId ? selectBoard(s)?.widgets[focusPairId] : undefined))
  const widgets = useMemo(() => [first, second].filter((w): w is Widget => !!w), [first, second])

  // Viewport beobachten, damit das Overlay bei Fenster-Resize mitzieht
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Esc schließt — Capture-Phase, damit der globale Esc-Handler (Panels) nicht zuerst greift
  useEffect(() => {
    if (!focusedId) return
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setFocused(null)
      }
    }
    window.addEventListener('keydown', fn, true)
    return () => window.removeEventListener('keydown', fn, true)
  }, [focusedId, setFocused])

  const isInfinite = useBoardStore(s => (selectBoard(s)?.layoutMode ?? 'infinite') === 'infinite')

  // Echte Inhaltsgröße jedes Widgets AUF DEM BOARD messen (dieselbe Content-Box,
  // die TileWrapper an TileContent übergibt) — dadurch bekommt der Fokus-Modus
  // exakt dasselbe Format (z. B. dieselbe Spaltenzahl bei responsiven Rastern
  // wie den Quicklinks) und vergrößert es nur gleichmäßig, statt dem Inhalt
  // eine größere Box zu geben, in der er sich neu/anders anordnet.
  const idsKey = widgets.map(w => w.id).join('|')
  const [measured, setMeasured] = useState<Record<string, { w: number; h: number }>>({})
  useLayoutEffect(() => {
    const zoom = isInfinite ? useUIStore.getState().canvasView.zoom : 1
    const next: Record<string, { w: number; h: number }> = {}
    for (const id of idsKey ? idsKey.split('|') : []) {
      const el = document.querySelector(`[data-widget-tile="${id}"] [data-widget-content]`)
      if (el instanceof HTMLElement) {
        const r = el.getBoundingClientRect()
        next[id] = { w: r.width / zoom, h: r.height / zoom }
      }
    }
    setMeasured(next)
  }, [idsKey, isInfinite])

  const n = widgets.length
  // EIN gemeinsamer Skalierungsfaktor für alle Widgets im Fokus — zwei Widgets
  // behalten so exakt ihr Größenverhältnis vom Board, statt jeweils einzeln
  // auf ihre Bildschirmhälfte aufgeblasen zu werden.
  const layout = useMemo(() => {
    if (!viewport || n === 0) return null
    const naturals = widgets.map(w => measured[w.id]
      ?? approxNaturalContent(w.pos.colSpan, w.pos.rowSpan, isInfinite, viewport.w))
    const maxTotalW = (n === 1 ? Math.min(1200, viewport.w * 0.92) : Math.min(1640, viewport.w * 0.95)) - PAIR_GAP * (n - 1)
    const maxContentH = Math.min(860, viewport.h * 0.9) - HEADER_H
    const sumW = naturals.reduce((a, x) => a + x.w, 0)
    const maxH = Math.max(...naturals.map(x => x.h))
    const scale = Math.min(MAX_ZOOM, maxTotalW / sumW, maxContentH / maxH)
    return { naturals, scale }
  }, [widgets, measured, viewport, n, isInfinite])

  return (
    <AnimatePresence>
      {n > 0 && layout && (
        <motion.div
          key="focus-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: PAIR_GAP,
            padding: 'min(4vh, 32px) min(2.5vw, 32px)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setFocused(null) }}
        >
          {widgets.map((w, i) => (
            <FocusCard key={w.id} widget={w} natural={layout.naturals[i]} scale={layout.scale}
              showClose={i === n - 1} onClose={() => setFocused(null)} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FocusCard({ widget, natural, scale, showClose, onClose }: {
  widget: Widget; natural: { w: number; h: number }; scale: number; showClose: boolean; onClose: () => void
}) {
  const t = useT()
  const layout = {
    cardWidth:  Math.round(natural.w * scale),
    cardHeight: Math.round(natural.h * scale + HEADER_H),
    naturalW:   natural.w,
    naturalH:   natural.h,
    scale,
  }

  // Dieselbe "rahmenlos" Bedingung wie im TileWrapper auf dem Board — steuert
  // dort, ob Hintergrund/Rahmen des Widgets ausgeblendet werden.
  const isTransparent =
    (widget.type === 'note' && !!widget.data?.noBg) ||
    (widget.type === 'image' && !!widget.data?.noBar) ||
    (widget.type === 'clock' && !!widget.data?.noBg)

  // Card 1:1 wie auf dem Board: Hintergrund/Verlauf, Rahmen, Eckenradius, Schatten
  // und Glow aus dem Widget-Stil übernehmen statt das feste Default-Aussehen zu
  // zeigen. Der weiche Tiefenschatten des Overlays kommt zusätzlich obendrauf.
  // Ist das Widget rahmenlos gestellt (z. B. Text/Uhr ohne Hintergrund), gilt das
  // genauso im Fokus-Modus — sonst hätte der Schalter dort keine sichtbare Wirkung.
  const cardStyle = useMemo(() => {
    if (isTransparent) {
      return { background: 'transparent', border: '1px solid transparent', borderRadius: widget.style.borderRadius, boxShadow: 'none' }
    }
    const s = buildStyle(widget.style, false)
    return { ...s, boxShadow: [s.boxShadow, '0 32px 80px rgba(0,0,0,0.55)'].filter(Boolean).join(', ') }
  }, [widget.style, isTransparent])

  return (
    <motion.div
      role="dialog" aria-modal="true" aria-label={`${t(TYPE_LABELS[widget.type])} ${t('in focus mode')}`}
      initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        width: layout.cardWidth, height: layout.cardHeight,
        maxWidth: '100%', maxHeight: '100%', flexShrink: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        ...cardStyle,
        overflow: 'hidden',
      }}
    >
      {/* Kopfzeile wie im Widget (Insel links), plus Schließen rechts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 4px', flexShrink: 0, height: HEADER_H, boxSizing: 'border-box' }}>
        <div style={{ ...ISLAND, height: 26, borderRadius: islandRadius(widget.style.cornerRadii?.[0] ?? widget.style.borderRadius) }}>
          <span style={{ opacity: 0.7, color: 'var(--text2)', display: 'flex' }}>{widgetTypeIcon(widget)}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t(TYPE_LABELS[widget.type])}
          </span>
        </div>
        {showClose && (
          <div style={{ ...ISLAND, height: 26, marginLeft: 'auto', padding: '0 2px 0 10px', gap: 8, borderRadius: islandRadius(widget.style.cornerRadii?.[1] ?? widget.style.borderRadius) }}>
            <span style={{ fontSize: 10.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{t('Esc to close')}</span>
            <button
              onClick={onClose}
              title={t('Close focus mode')} aria-label={t('Close focus mode')}
              style={{
                width: 20, height: 20, border: 'none',
                borderRadius: islandRadius(widget.style.cornerRadii?.[1] ?? widget.style.borderRadius) >= 12 ? 999 : Math.max(0, islandRadius(widget.style.cornerRadii?.[1] ?? widget.style.borderRadius) - 2),
                background: 'color-mix(in srgb, var(--text1) 9%, transparent)', color: 'var(--text2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {/* Inhalt wird in seiner ECHTEN Board-Größe gerendert und dann per
          CSS-Transform gleichmäßig hochskaliert — dieselbe Anordnung wie
          auf dem Board (z. B. dieselbe Spaltenzahl bei den Quicklinks),
          nur größer, statt sich in einer größeren Box neu anzuordnen. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: layout.naturalW, height: layout.naturalH,
          transform: `scale(${layout.scale})`, transformOrigin: 'top left',
          boxSizing: 'border-box',
          padding: widget.type === 'image' || widget.type === 'spreadsheet' || widget.type === 'map' ? 0 : CONTENT_PAD,
          overflow: 'hidden',
        }}>
          <WidgetErrorBoundary><TileContent widget={widget} /></WidgetErrorBoundary>
        </div>
      </div>
    </motion.div>
  )
}
