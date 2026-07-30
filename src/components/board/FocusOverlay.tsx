'use client'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { TileContent, TYPE_LABELS, buildStyle, widgetTypeIcon } from './TileWrapper'
import WidgetErrorBoundary from './WidgetErrorBoundary'
import { useT } from '@/hooks/useT'
import { GRID_ROW_H, GRID_GAP, INFINITE_COL_W, GRID_COLS } from '@/lib/constants'

// Fokus-Modus: ein Widget als großes Overlay über dem Board.
// Öffnen per Doppelklick im Ansichtsmodus (TileWrapper), schließen per Esc/X/Backdrop.

const HEADER_H = 45
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
  const t = useT()
  const focusedId  = useUIStore(s => s.focusedId)
  const setFocused = useUIStore(s => s.setFocusedWidget)
  const widget     = useBoardStore(s => (focusedId ? selectBoard(s)?.widgets[focusedId] : undefined))
  const isInfinite = useBoardStore(s => (selectBoard(s)?.layoutMode ?? 'infinite') === 'infinite')

  // Viewport beobachten, damit das Overlay bei Fenster-Resize mitzieht
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Echte Inhaltsgröße des Widgets AUF DEM BOARD messen (dieselbe Content-Box,
  // die TileWrapper an TileContent übergibt) — dadurch bekommt der Fokus-Modus
  // exakt dasselbe Format (z. B. dieselbe Spaltenzahl bei responsiven Rastern
  // wie den Quicklinks) und vergrößert es nur gleichmäßig, statt dem Inhalt
  // eine größere Box zu geben, in der er sich neu/anders anordnet.
  const [naturalContent, setNaturalContent] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    if (!focusedId) { setNaturalContent(null); return }
    const el = document.querySelector(`[data-widget-tile="${focusedId}"] [data-widget-content]`)
    if (!(el instanceof HTMLElement)) { setNaturalContent(null); return }
    const rect = el.getBoundingClientRect()
    const zoom = isInfinite ? useUIStore.getState().canvasView.zoom : 1
    setNaturalContent({ w: rect.width / zoom, h: rect.height / zoom })
  }, [focusedId, isInfinite])

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

  const layout = useMemo(() => {
    if (!widget || !viewport) return null
    const natural = naturalContent ?? approxNaturalContent(widget.pos.colSpan, widget.pos.rowSpan, isInfinite, viewport.w)

    const maxW = Math.min(1200, viewport.w * 0.92)
    const maxContentH = Math.min(860, viewport.h * 0.9) - HEADER_H

    // Ein einziger, gemeinsamer Skalierungsfaktor für Breite UND Höhe — wird
    // nie pro Achse unabhängig auf eine Mindestgröße hochgezogen, sonst
    // verzerrt sich der Inhalt (z. B. eine Wasserflasche bei einer sehr
    // schmalen Karte wurde sonst in die Breite gestreckt, während die Höhe
    // unverändert blieb).
    const scale = Math.min(MAX_ZOOM, maxW / natural.w, maxContentH / natural.h)
    const contentW = natural.w * scale
    const contentH = natural.h * scale

    return {
      cardWidth:  Math.round(contentW),
      cardHeight: Math.round(contentH + HEADER_H),
      naturalW:   natural.w,
      naturalH:   natural.h,
      scaleX:     scale,
      scaleY:     scale,
    }
  }, [widget, viewport, naturalContent, isInfinite])

  // Dieselbe "rahmenlos" Bedingung wie im TileWrapper auf dem Board — steuert
  // dort, ob Hintergrund/Rahmen des Widgets ausgeblendet werden.
  const isTransparent = !!widget && (
    (widget.type === 'note' && !!widget.data?.noBg) ||
    (widget.type === 'image' && !!widget.data?.noBar) ||
    (widget.type === 'clock' && !!widget.data?.noBg)
  )

  // Card 1:1 wie auf dem Board: Hintergrund/Verlauf, Rahmen, Eckenradius, Schatten
  // und Glow aus dem Widget-Stil übernehmen statt das feste Default-Aussehen zu
  // zeigen. Der weiche Tiefenschatten des Overlays kommt zusätzlich obendrauf.
  // Ist das Widget rahmenlos gestellt (z. B. Text/Uhr ohne Hintergrund), gilt das
  // genauso im Fokus-Modus — sonst hätte der Schalter dort keine sichtbare Wirkung.
  const cardStyle = useMemo(() => {
    if (!widget) return null
    if (isTransparent) {
      return { background: 'transparent', border: '1px solid transparent', borderRadius: widget.style.borderRadius, boxShadow: 'none' }
    }
    const s = buildStyle(widget.style, false)
    return { ...s, boxShadow: [s.boxShadow, '0 32px 80px rgba(0,0,0,0.55)'].filter(Boolean).join(', ') }
  }, [widget, isTransparent])

  return (
    <AnimatePresence>
      {widget && layout && cardStyle && (
        <motion.div
          key="focus-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'min(4vh, 32px) min(4vw, 40px)',
          }}
          onClick={e => { if (e.target === e.currentTarget) setFocused(null) }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={`${t(TYPE_LABELS[widget.type])} ${t('in focus mode')}`}
            initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              width: layout.cardWidth, height: layout.cardHeight,
              maxWidth: '100%', maxHeight: '100%',
              display: 'flex', flexDirection: 'column',
              ...cardStyle,
              overflow: 'hidden',
            }}
          >
            {/* Kopfzeile wie im Widget, plus Schließen */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderBottom: isTransparent ? 'none' : '1px solid var(--border)', flexShrink: 0,
            }}>
              <span style={{ opacity: 0.55, color: 'var(--text2)', display: 'flex' }}>{widgetTypeIcon(widget)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
                {t(TYPE_LABELS[widget.type])}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{t('Esc to close')}</span>
              <button
                onClick={() => setFocused(null)}
                title={t('Close focus mode')} aria-label={t('Close focus mode')}
                style={{
                  width: 26, height: 26, borderRadius: 8, border: 'none',
                  background: 'var(--surface2)', color: 'var(--text2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            {/* Inhalt wird in seiner ECHTEN Board-Größe gerendert und dann per
                CSS-Transform gleichmäßig hochskaliert — dieselbe Anordnung wie
                auf dem Board (z. B. dieselbe Spaltenzahl bei den Quicklinks),
                nur größer, statt sich in einer größeren Box neu anzuordnen. */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: layout.naturalW, height: layout.naturalH,
                transform: `scale(${layout.scaleX}, ${layout.scaleY})`, transformOrigin: 'top left',
                boxSizing: 'border-box',
                padding: widget.type === 'image' || widget.type === 'spreadsheet' || widget.type === 'map' ? 0 : CONTENT_PAD,
                overflow: 'hidden',
              }}>
                <WidgetErrorBoundary><TileContent widget={widget} /></WidgetErrorBoundary>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
