'use client'
import { useRef, useState, useMemo, useCallback, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUIStore } from '@/store/uiStore'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useSettings } from '@/store/settingsStore'
import { INFINITE_COL_W, INFINITE_GRID_COLS, INFINITE_GRID_ROWS, GRID_GAP, GRID_ROW_H } from '@/lib/constants'
import { useT } from '@/hooks/useT'

// Live-Minimap unten links: feste Panelgröße, nicht per ResizeObserver
// gemessen (anders als die statische Board-Vorschau auf der Startseite) —
// hier reicht das, weil die Größe fix im Layout steht statt von einem
// beliebigen Eltern-Container abzuhängen.
const MM_W   = 170
const MM_H   = 118

const MIN_ZOOM    = 0.1
const MAX_ZOOM    = 3
// War 0.0015 mit einem zusätzlichen ×6 in handleWheel (effektiv 0.009) — ein
// einzelnes Mausrad-Delta von ~100 ergab damit ~90% Zoom-Änderung PRO
// Wheel-Event: ein Klick am Rad sprang das Board fast auf den Anschlag.
// Trackpad-Pinch-Gesten feuern viele Events mit kleinem Delta, ein
// physisches Mausrad wenige mit großem — dieser Wert ist für beide spürbar
// sanfter, ohne bei Trackpads träge zu wirken.
const ZOOM_SPEED  = 0.0005

const INFINITE_ROWS   = INFINITE_GRID_ROWS
const GRID_PADDING    = GRID_GAP   // must match paddingTop in BoardGrid infinite mode

// Total canvas dimensions (used to compute initial centered offset)
const CANVAS_W = INFINITE_GRID_COLS * INFINITE_COL_W + (INFINITE_GRID_COLS - 1) * GRID_GAP + 2 * GRID_PADDING
const CANVAS_H = INFINITE_ROWS * GRID_ROW_H + (INFINITE_ROWS - 1) * GRID_GAP + 2 * GRID_PADDING

export interface InfiniteCanvasHandle {
  getZoom:   () => number
  getOffset: () => { x: number; y: number }
}

interface Props {
  children: React.ReactNode
}

// Center cell of the 100×100 infinite grid
const CENTER_COL = 50
const CENTER_ROW = 50

// Ausschnitt (Pan/Zoom) pro Board für die laufende Sitzung merken — sonst
// erbt jedes Board beim Wechsel den Ausschnitt des vorherigen und man landet
// im Nirgendwo statt bei seinen Widgets. Bewusst nicht persistiert.
const savedViews = new Map<string, { x: number; y: number; zoom: number }>()

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, Props>(function InfiniteCanvas(
  { children }, ref
) {
  const t = useT()
  const containerRef  = useRef<HTMLDivElement>(null)
  const innerRef      = useRef<HTMLDivElement>(null)
  const setCanvasView = useUIStore(s => s.setCanvasView)
  const boardId       = useBoardStore(s => s.currentBoardId)

  // Center on widget centroid if widgets exist, otherwise on the default center cell
  const getInitialOffset = () => {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    const state = useBoardStore.getState()
    const board = state.boards[state.currentBoardId]
    const ws    = board ? Object.values(board.widgets) : []
    const col   = ws.length > 0
      ? ws.reduce((s, w) => s + w.pos.col + (w.pos.colSpan - 1) / 2, 0) / ws.length
      : CENTER_COL
    const row   = ws.length > 0
      ? ws.reduce((s, w) => s + w.pos.row + (w.pos.rowSpan - 1) / 2, 0) / ws.length
      : CENTER_ROW
    const cellX = GRID_PADDING + (col - 1) * (INFINITE_COL_W + GRID_GAP)
    const cellY = GRID_PADDING + (row - 1) * (GRID_ROW_H     + GRID_GAP)
    return {
      x: window.innerWidth  / 2 - cellX,
      y: window.innerHeight / 2 - cellY,
    }
  }

  // Only zoom is kept in React state (for the HUD %-display). Offset and transform
  // are applied imperatively to avoid a React re-render on every scroll/pan event.
  const [zoom, setZoom] = useState(1)

  const offsetRef          = useRef({ x: 0, y: 0 })
  const zoomRef            = useRef(1)
  const isPanning          = useRef(false)
  const panStart           = useRef({ px: 0, py: 0, ox: 0, oy: 0 })
  const spaceDown          = useRef(false)
  const willChangeTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const animFrameRef       = useRef<number | undefined>(undefined)

  const pendingFocus    = useUIStore(s => s.pendingCanvasFocus)
  const setCanvasFocus  = useUIStore(s => s.setCanvasFocus)

  useImperativeHandle(ref, () => ({
    getZoom:   () => zoomRef.current,
    getOffset: () => offsetRef.current,
  }))

  // ── Live-Minimap (unten links) ──────────────────────────────────────────
  // Bewusst NICHT "Bounding-Box aller Widgets ins Panel einpassen" — das
  // würde sich beim Zoomen des Boards überhaupt nicht ändern. Stattdessen
  // ist der Maßstab direkt an den Board-Zoom gekoppelt (mal einer festen
  // Verkleinerungs-Konstante): zoomt man das Board raus, werden auch die
  // Vorschau-Kacheln kleiner — wie ein Radar, nicht wie eine Übersichts-
  // Miniatur. Zentriert wird auf die aktuelle Ausschnitt-MITTE, nicht auf
  // die Widgets — die Minimap schwenkt also mit, während man das Board
  // verschiebt. Tile-Positionen laufen (wie der Haupt-Transform) rein
  // imperativ über Refs, kein setState pro Wheel-/Pointer-Event.
  const MINIATURIZE = 0.075

  const widgets    = useBoardStore(useShallow(s => selectBoard(s)?.widgets ?? {}))
  const widgetList = useMemo(() => Object.values(widgets), [widgets])
  const showMinimap = useSettings(s => s.showMinimap)

  const mmViewportRef = useRef<HTMLDivElement>(null)
  const mmTileRefs    = useRef(new Map<string, HTMLDivElement>())
  // Für den Klick-Handler — Stand vom letzten updateMinimap()-Aufruf, ohne
  // dafür einen React-Re-render zu brauchen (s. Kommentar oben).
  const mmStateRef = useRef({ scale: 1, colCenter: CENTER_COL, rowCenter: CENTER_ROW })

  const updateMinimap = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const z = zoomRef.current
    const { x, y } = offsetRef.current
    const colStep = INFINITE_COL_W + GRID_GAP
    const rowStep = GRID_ROW_H + GRID_GAP
    // Bildschirmmitte zurück in Grid-Koordinaten — exakt umgekehrt zu
    // getInitialOffset()'s col/row → px-Umrechnung.
    const centerContentX = (container.clientWidth  / 2 - x) / z
    const centerContentY = (container.clientHeight / 2 - y) / z
    const colCenter = (centerContentX - GRID_PADDING) / colStep + 1
    const rowCenter = (centerContentY - GRID_PADDING) / rowStep + 1
    const scale = colStep * z * MINIATURIZE
    mmStateRef.current = { scale, colCenter, rowCenter }

    const vp = mmViewportRef.current
    if (vp) {
      const vpW = Math.max(4, container.clientWidth  * MINIATURIZE)
      const vpH = Math.max(4, container.clientHeight * MINIATURIZE)
      vp.style.width  = `${vpW}px`
      vp.style.height = `${vpH}px`
      vp.style.left   = `${MM_W / 2 - vpW / 2}px`
      vp.style.top    = `${MM_H / 2 - vpH / 2}px`
    }

    for (const w of widgetList) {
      const el = mmTileRefs.current.get(w.id)
      if (!el) continue
      el.style.left   = `${MM_W / 2 + (w.pos.col - colCenter) * scale}px`
      el.style.top    = `${MM_H / 2 + (w.pos.row - rowCenter) * scale}px`
      el.style.width  = `${Math.max(1, w.pos.colSpan * scale - 1)}px`
      el.style.height = `${Math.max(1, w.pos.rowSpan * scale - 1)}px`
    }
  }, [widgetList])

  // useLayoutEffect statt useEffect: läuft synchron nach dem Commit der neuen
  // Tile-<div>s (bei Widget-Änderungen), aber vor dem nächsten Browser-Paint
  // — verhindert einen sichtbaren Frame mit unpositionierten (0,0)-Kacheln.
  useLayoutEffect(() => {
    updateMinimap()
  }, [updateMinimap])

  // Fenstergröße ändert Sichtbereich-Größe und Bildschirmmitte, ohne dass
  // applyView dabei aufgerufen wird.
  useEffect(() => {
    window.addEventListener('resize', updateMinimap)
    return () => window.removeEventListener('resize', updateMinimap)
  }, [updateMinimap])

  // Klick auf die Minimap: sanft zur angeklickten Stelle schwenken (gleicher
  // Mechanismus wie ein Sprung aus der Suche — Zoomstufe bleibt unverändert).
  const onMinimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const { scale, colCenter, rowCenter } = mmStateRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    const col = colCenter + (e.clientX - rect.left - MM_W / 2) / scale
    const row = rowCenter + (e.clientY - rect.top  - MM_H / 2) / scale
    setCanvasFocus({ col, row, colSpan: 1, rowSpan: 1 })
  }, [setCanvasFocus])

  // Smooth-pan to a pending focus position set from the search modal
  useEffect(() => {
    if (!pendingFocus) return
    setCanvasFocus(null)

    const step = INFINITE_COL_W + GRID_GAP
    const targetCX = GRID_PADDING + (pendingFocus.col - 1) * step + (pendingFocus.colSpan * step) / 2
    const targetCY = GRID_PADDING + (pendingFocus.row - 1) * (GRID_ROW_H + GRID_GAP) + (pendingFocus.rowSpan * (GRID_ROW_H + GRID_GAP)) / 2
    const z        = zoomRef.current
    const targetX  = window.innerWidth  / 2 - targetCX * z
    const targetY  = window.innerHeight / 2 - targetCY * z

    const startX   = offsetRef.current.x
    const startY   = offsetRef.current.y
    const duration = 420
    const start    = performance.now()

    cancelAnimationFrame(animFrameRef.current!)
    function tick(now: number) {
      const t   = Math.min((now - start) / duration, 1)
      // ease-out cubic
      const e   = 1 - Math.pow(1 - t, 3)
      applyView({ x: startX + (targetX - startX) * e, y: startY + (targetY - startY) * e }, zoomRef.current)
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [pendingFocus])

  // Apply the CSS transform directly to the DOM — zero React re-renders during pan/zoom.
  // will-change is enabled for the duration of the interaction, then cleared so the
  // browser re-rasterises at the current zoom level (prevents pixelation).
  const applyView = useCallback((newOffset: { x: number; y: number }, newZoom: number) => {
    const prevPct = Math.round(zoomRef.current * 100)
    offsetRef.current = newOffset
    zoomRef.current   = newZoom

    if (innerRef.current) {
      innerRef.current.style.willChange = 'transform'
      innerRef.current.style.transform  =
        `translate(${newOffset.x}px,${newOffset.y}px) scale(${newZoom})`
    }

    // Drop will-change ~200 ms after the last interaction so the browser
    // can re-rasterise at full quality for the current zoom level.
    clearTimeout(willChangeTimer.current)
    willChangeTimer.current = setTimeout(() => {
      if (innerRef.current) innerRef.current.style.willChange = 'auto'
    }, 200)

    // Update React state only when the HUD percentage actually changes
    if (Math.round(newZoom * 100) !== prevPct) setZoom(newZoom)
    setCanvasView(newOffset.x, newOffset.y, newZoom)
    // Ausschnitt fürs aktuelle Board merken (Wiederherstellung beim Wechsel)
    savedViews.set(useBoardStore.getState().currentBoardId, { x: newOffset.x, y: newOffset.y, zoom: newZoom })
    updateMinimap()
  }, [setCanvasView, updateMinimap])

  const applyZoom = useCallback((nextZoom: number, cx: number, cy: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
    const ratio   = clamped / zoomRef.current
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y
    applyView({ x: cx - (cx - ox) * ratio, y: cy - (cy - oy) * ratio }, clamped)
  }, [applyView])

  const handleWheel = useCallback((e: WheelEvent) => {
    // If wheel is over a scrollable element inside a widget, let it scroll natively
    if (!e.ctrlKey && !e.metaKey) {
      let el = e.target as HTMLElement | null
      while (el && el !== containerRef.current) {
        const style = window.getComputedStyle(el)
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 1) return
        if ((style.overflowX === 'auto' || style.overflowX === 'scroll') &&
            el.scrollWidth > el.clientWidth + 1) return
        el = el.parentElement
      }
    }
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    const cx = e.clientX - (rect?.left ?? 0)
    const cy = e.clientY - (rect?.top  ?? 0)
    if (e.ctrlKey || e.metaKey) {
      applyZoom(zoomRef.current * (1 - e.deltaY * ZOOM_SPEED), cx, cy)
    } else {
      applyView({ x: offsetRef.current.x - e.deltaX, y: offsetRef.current.y - e.deltaY }, zoomRef.current)
    }
  }, [applyView, applyZoom])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Apply the initial transform once the DOM node is available — and bei
  // jedem Boardwechsel neu: gemerkter Ausschnitt des Boards, sonst Zentrierung
  // auf die Widget-Mitte. getInitialOffset() is called here (not in useRef) so
  // window is guaranteed to exist, and setCanvasView is synced so TilePicker
  // reads the correct viewport position when placing the first widget.
  useEffect(() => {
    const saved = savedViews.get(boardId)
    const init  = saved ?? { ...getInitialOffset(), zoom: 1 }
    offsetRef.current = { x: init.x, y: init.y }
    zoomRef.current   = init.zoom
    if (innerRef.current) {
      innerRef.current.style.transform =
        `translate(${init.x}px,${init.y}px) scale(${init.zoom})`
    }
    setZoom(init.zoom)
    useUIStore.getState().setCanvasView(init.x, init.y, init.zoom)
    updateMinimap()
  }, [boardId, updateMinimap])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 1 || spaceDown.current) {
      e.preventDefault()
      isPanning.current = true
      panStart.current  = { px: e.clientX, py: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
      containerRef.current?.setPointerCapture(e.pointerId)
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning.current) return
    applyView({
      x: panStart.current.ox + (e.clientX - panStart.current.px),
      y: panStart.current.oy + (e.clientY - panStart.current.py),
    }, zoomRef.current)
  }, [applyView])

  const onPointerUp = useCallback(() => { isPanning.current = false }, [])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement
      if (t.matches('input,textarea,[contenteditable="true"]')) return
      e.preventDefault()
      spaceDown.current = true
    }
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  const zoomCenter = useCallback((factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    applyZoom(zoomRef.current * factor, rect.width / 2, rect.height / 2)
  }, [applyZoom])

  const resetView = useCallback(() => {
    const init = getInitialOffset()
    applyView(init, 1)
  }, [applyView])

  const pct = Math.round(zoom * 100)

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: isPanning.current ? 'grabbing' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* transformed canvas — transform applied imperatively via innerRef */}
      <div
        ref={innerRef}
        style={{
          position:        'absolute',
          top:             0, left: 0,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>

      {/* zoom HUD */}
      <div
        data-board-chrome="1"
        style={{
          // Höher als BoardGrid.tsx's Auswahlrechteck (zIndex 2000) — sonst
          // malt die Marquee-Auswahl darüber; data-board-chrome verhindert
          // zusätzlich, dass ein Drag hier überhaupt erst startet (s. dort).
          position: 'absolute', bottom: 16, right: 16, zIndex: 2001,
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          padding: '3px 4px',
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        {[
          { label: '−', title: t('Zoom out'),  action: () => zoomCenter(1 / 1.15) },
          { label: null,                          action: null },
          { label: '+', title: t('Zoom in'),  action: () => zoomCenter(1.15) },
        ].map((btn, i) =>
          btn.label ? (
            <button
              key={i}
              title={btn.title}
              onClick={btn.action!}
              style={{
                width: 26, height: 26, borderRadius: 7, border: 'none',
                background: 'transparent', color: 'var(--text2)',
                cursor: 'pointer', fontSize: 16, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              {btn.label}
            </button>
          ) : (
            <button
              key="pct"
              title={t('Reset view')}
              onClick={resetView}
              style={{
                height: 26, padding: '0 8px', borderRadius: 7, border: 'none',
                background: 'transparent', color: 'var(--text1)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                minWidth: 44, transition: 'background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              {pct}%
            </button>
          )
        )}
      </div>

      {/* Live-Minimap */}
      {showMinimap && widgetList.length > 0 && (
        <div
          data-board-chrome="1"
          onPointerDown={e => e.stopPropagation()}
          onClick={onMinimapClick}
          title={t('Click to jump to that area')}
          style={{
            // s. Kommentar beim zoom-HUD oben — dieselbe Marquee-Auswahl-Fix-Begründung.
            position: 'absolute', bottom: 16, left: 16, zIndex: 2001,
            width: MM_W, height: MM_H,
            background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            overflow: 'hidden', cursor: 'pointer',
          }}
        >
          {/* Position/Größe jeder Kachel wird per Ref direkt aus updateMinimap()
              gesetzt (zoom-abhängig), nicht über React-Props — s. Kommentar oben */}
          {widgetList.map(w => (
            <div
              key={w.id}
              ref={el => { if (el) mmTileRefs.current.set(w.id, el); else mmTileRefs.current.delete(w.id) }}
              style={{
                position: 'absolute',
                borderRadius: 2,
                background: 'color-mix(in srgb, var(--accent) 45%, var(--surface3))',
                border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
              }}
            />
          ))}
          {/* Sichtbereichs-Rahmen — Position/Größe ebenfalls per Ref gesetzt */}
          <div ref={mmViewportRef} style={{
            position: 'absolute',
            border: '1.5px solid var(--accent)', borderRadius: 2,
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            pointerEvents: 'none',
          }} />
        </div>
      )}

    </div>
  )
})

export default InfiniteCanvas
