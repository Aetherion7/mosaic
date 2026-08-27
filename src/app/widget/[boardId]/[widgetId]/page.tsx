'use client'
import { use, useEffect, useState } from 'react'
import { useBoardStore, setActiveBoardOverride } from '@/store/boardStore'
import { useSettings } from '@/store/settingsStore'
import { getTheme } from '@/lib/themes'
import { getFontStack } from '@/lib/fonts'
import { useT } from '@/hooks/useT'
import { TileContent, buildStyle, widgetTypeIcon, TYPE_LABELS } from '@/components/board/TileWrapper'
import WidgetErrorBoundary from '@/components/board/WidgetErrorBoundary'

// Standalone render of exactly ONE widget, outside any board grid — the page
// a pinned "desktop widget" Electron window loads (see electron/main.js's
// createWidgetWindow). Deliberately NOT reusing FocusOverlay.tsx: that
// component measures a live on-board DOM node
// (`[data-widget-tile] [data-widget-content]`) and the infinite-canvas zoom
// state to decide how big to render — both assume the widget is ALSO
// mounted on a live BoardGrid elsewhere in the same page, which is never
// true here. This page instead just fills the window at its native size
// (window itself is sized by main.js from widget.pos at pin time) and lets
// normal CSS reflow handle resizing.
export default function WidgetPage({ params }: { params: Promise<{ boardId: string; widgetId: string }> }) {
  const { boardId, widgetId } = use(params)
  const t = useT()
  const customFonts = useSettings(s => s.customFonts)

  const [hydrated, setHydrated] = useState(() => useBoardStore.persist.hasHydrated())
  useEffect(() => {
    // Set BEFORE flipping `hydrated`, in the same effect, so TileContent
    // never renders even one frame against the wrong board — mirrors how
    // BoardPage avoids a wrong-board flash via its own hydration gate.
    // Never call switchBoard(boardId) here: that persists currentBoardId
    // into the shared IndexedDB blob and would flip the MAIN window's
    // current board out from under the user on its next reload/restart.
    setActiveBoardOverride(boardId)
    if (useBoardStore.persist.hasHydrated()) { setHydrated(true); return }
    return useBoardStore.persist.onFinishHydration(() => setHydrated(true))
  }, [boardId])

  useEffect(() => {
    document.documentElement.classList.add('widget-window')
    document.body.classList.add('widget-window')
    return () => {
      document.documentElement.classList.remove('widget-window')
      document.body.classList.remove('widget-window')
    }
  }, [])

  const board  = useBoardStore(s => s.boards[boardId])
  const widget = board?.widgets[widgetId]

  useEffect(() => {
    if (!board) return
    const theme = getTheme(board.themeId)
    const root = document.documentElement
    Object.entries(theme.cssVars).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [board?.themeId])

  // Widget or its board got deleted (or this pin is simply stale) — self-unpin
  // instead of sitting there forever as a blank always-on-top window. Relies
  // on boardStore's cross-window BroadcastChannel sync having delivered the
  // deletion; if that was ever missed (e.g. the app crashed before the
  // broadcast fired), this same check re-runs and self-heals on the next
  // launch, since main.js reopens this exact route and finds nothing either way.
  //
  // Delayed on purpose: `hasHydrated()` can flip true one render tick before
  // this fresh renderer's own store state actually reflects the persisted
  // boards (observed directly — a widget window's first check sees no board
  // at all, then a correct re-render follows within ~100ms). Acting on the
  // first tick would unpin a perfectly valid widget every time. Re-reading
  // live state after a grace period, instead of trusting the closed-over
  // board/widget, avoids that false positive while still detecting a truly
  // deleted widget.
  useEffect(() => {
    if (!hydrated || (board && widget)) return
    const timer = setTimeout(() => {
      const s = useBoardStore.getState()
      const freshBoard = s.boards[boardId]
      if (!freshBoard || !freshBoard.widgets[widgetId]) {
        window.mosaicDesktop?.unpinWidgetFromDesktop(boardId, widgetId)
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [hydrated, board, widget, boardId, widgetId])

  if (!hydrated || !board || !widget) return null

  // backdrop-filter can only blur content Chromium itself is compositing —
  // on the board that's the canvas behind the tile, but a desktop-pinned
  // window has nothing in the page behind it (the real desktop/other apps
  // live outside Chromium's paint context and can't be blurred by CSS on any
  // platform). Electron exposes native blur-behind on macOS (setVibrancy)
  // and Windows 11 (setBackgroundMaterial), but there's no equivalent on
  // Linux for any desktop environment. Left as-is, a blur style with its
  // usual low opacity just looks like a hole with nothing in it — floor the
  // opacity here so the widget still reads as a card instead of vanishing.
  const effectiveStyle = widget.style.blur
    ? { ...widget.style, opacity: Math.max(widget.style.opacity, 0.85) }
    : widget.style

  return (
    <div
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        // Board-Schrift wie auf dem Board selbst — s. board/[id]/page.tsx.
        // settingsStore (Sprache/Theme-Default) synct nicht live über
        // Fenster hinweg (bewusst, wie uiStore) — eine Sprachänderung im
        // Hauptfenster übernimmt sich hier erst beim nächsten Öffnen.
        fontFamily: board.fontFamily ? getFontStack(board.fontFamily, customFonts) : 'var(--font-app)',
        ...buildStyle(effectiveStyle, false),
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          padding: '6px 8px', WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <span style={{ opacity: 0.6, color: 'var(--text2)', display: 'flex' }}>{widgetTypeIcon(widget)}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          {t(TYPE_LABELS[widget.type] ?? widget.type)}
        </span>
        <button
          onClick={() => window.mosaicDesktop?.unpinWidgetFromDesktop(boardId, widgetId)}
          title={t('Unpin from desktop')}
          style={{
            width: 20, height: 20, borderRadius: 6, border: 'none', background: 'var(--surface2)',
            color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
      <div
        style={{
          flex: 1, minHeight: 0, overflow: 'hidden',
          padding: widget.type === 'image' || widget.type === 'spreadsheet' || widget.type === 'map' ? 0 : '10px 12px',
        }}
      >
        <WidgetErrorBoundary><TileContent widget={widget} /></WidgetErrorBoundary>
      </div>
    </div>
  )
}
