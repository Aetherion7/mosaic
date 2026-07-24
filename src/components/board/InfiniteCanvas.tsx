'use client'
import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useBoardStore } from '@/store/boardStore'
import { INFINITE_COL_W, INFINITE_GRID_COLS, INFINITE_GRID_ROWS, GRID_GAP, GRID_ROW_H } from '@/lib/constants'
import { useT } from '@/hooks/useT'

const MIN_ZOOM    = 0.1
const MAX_ZOOM    = 3
const ZOOM_SPEED  = 0.0015

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
  }, [setCanvasView])

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
      applyZoom(zoomRef.current * (1 - e.deltaY * ZOOM_SPEED * 6), cx, cy)
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
  }, [boardId])

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
        style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 50,
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
          { label: '−', title: t('Zoom out'),  action: () => zoomCenter(1 / 1.25) },
          { label: null,                          action: null },
          { label: '+', title: t('Zoom in'),  action: () => zoomCenter(1.25) },
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

    </div>
  )
})

export default InfiniteCanvas
