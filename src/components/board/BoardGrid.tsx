'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  DndContext, DragEndEvent, DragMoveEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import { useBoardStore, selectBoard } from '@/store/boardStore'

import { INFINITE_GRID_ROWS } from '@/lib/constants'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { DEFAULT_BG } from '@/lib/defaults'
import { useT } from '@/hooks/useT'
import CanvasBackground from '@/components/canvas/CanvasBackground'
import TileWrapper, { GRID_COLS, GRID_GAP, GRID_ROW_H, INFINITE_COL_W, INFINITE_GRID_COLS } from './TileWrapper'
import TilePicker from './TilePicker'
import InfiniteCanvas, { type InfiniteCanvasHandle } from './InfiniteCanvas'
import type { Widget } from '@/types'

export default function BoardGrid() {
  const t = useT()
  const gridRef        = useRef<HTMLDivElement>(null)
  const scrollerRef    = useRef<HTMLDivElement>(null)
  const canvasRef      = useRef<InfiniteCanvasHandle>(null)
  const outerRef       = useRef<HTMLDivElement>(null)
  const [dropPreviews, setDropPreviews] = useState<Array<{ id: string; col: number; row: number; colSpan: number; rowSpan: number }>>([])
  // Rubber-band — fully imperative, zero React overhead
  const selBoxElRef    = useRef<HTMLDivElement>(null)
  const selStateRef    = useRef<{ x1: number; y1: number; x2: number; y2: number; active: boolean } | null>(null)
  const selRafRef      = useRef<number | undefined>(undefined)
  const justDraggedRef = useRef(false)
  const isDraggingRef  = useRef(false)
  const getWIRRef      = useRef<((x1: number, y1: number, x2: number, y2: number) => string[]) | null>(null)
  const cleanupRubber  = useRef<(() => void) | null>(null)
  const spaceHeld      = useRef(false)
  const headerStyle = useSettings(s => s.headerStyle)
  const isIsland    = headerStyle === 'island'
  const topPad      = isIsland ? 64 : 24

  const layoutMode    = useBoardStore(s => selectBoard(s)?.layoutMode ?? 'infinite')
  const isInfinite    = layoutMode === 'infinite'
  const currentBoardId = useBoardStore(s => s.currentBoardId)

  const bg      = useBoardStore(s => selectBoard(s)?.bg ?? DEFAULT_BG)
  const widgets = useBoardStore(useShallow(s => {
    const board = selectBoard(s)
    return board ? Object.values(board.widgets) : []
  }))
  const moveWidget          = useBoardStore(s => s.moveWidget)
  const bumpWidgetZIndex    = useBoardStore(s => s.bumpWidgetZIndex)
  const mode                = useUIStore(s => s.mode)
  const openPanel           = useUIStore(s => s.openPanel)
  const selectWidget        = useUIStore(s => s.selectWidget)
  const lastAddedWidgetId   = useUIStore(s => s.lastAddedWidgetId)

  // Auto-scroll to newly added widget (grid mode only; infinite mode places widget at viewport center)
  useEffect(() => {
    if (!lastAddedWidgetId) return
    useUIStore.getState().setLastAddedWidget(null)
    if (!scrollerRef.current) return
    const el = document.getElementById(`widget-${lastAddedWidgetId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [lastAddedWidgetId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Space-key tracking (prevents rubber-band during canvas pan)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space') spaceHeld.current = true }
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') spaceHeld.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup',   ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  // ── Rubber-band: stable useCallback ref — React only calls it when the DOM element
  // actually changes (mount/unmount), NOT on every re-render like an inline function would.
  const attachOuter = useCallback((el: HTMLDivElement | null) => {
    outerRef.current = el
    if (cleanupRubber.current) { cleanupRubber.current(); cleanupRubber.current = null }
    if (!el) return

    const onMove = (e: PointerEvent) => {
      const state = selStateRef.current
      if (!state) return
      state.x2 = e.clientX
      state.y2 = e.clientY
      if (!state.active) {
        if (Math.hypot(state.x2 - state.x1, state.y2 - state.y1) < 6) return
        state.active = true
      }
      const box = selBoxElRef.current
      if (box) {
        const r = el.getBoundingClientRect()
        box.style.display = 'block'
        box.style.left    = Math.min(state.x1, state.x2) - r.left + 'px'
        box.style.top     = Math.min(state.y1, state.y2) - r.top  + 'px'
        box.style.width   = Math.abs(state.x2 - state.x1) + 'px'
        box.style.height  = Math.abs(state.y2 - state.y1) + 'px'
      }
      cancelAnimationFrame(selRafRef.current!)
      selRafRef.current = requestAnimationFrame(() => {
        const s = selStateRef.current
        if (!s?.active || !getWIRRef.current) return
        const ids = getWIRRef.current(s.x1, s.y1, s.x2, s.y2)
        const cur = useUIStore.getState().multiSelectedIds
        if (ids.length !== cur.length || ids.some((id, i) => id !== cur[i]))
          useUIStore.getState().setMultiSelectedIds(ids)
      })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(selRafRef.current!)
      const state = selStateRef.current
      selStateRef.current = null
      if (selBoxElRef.current) selBoxElRef.current.style.display = 'none'
      if (!state) return
      if (state.active) {
        justDraggedRef.current = true
        setTimeout(() => { justDraggedRef.current = false }, 0)
      } else {
        useUIStore.getState().clearMultiSelect()
        useUIStore.getState().selectWidget(null)
      }
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || spaceHeld.current) return
      if (useUIStore.getState().mode !== 'edit') return
      if (useUIStore.getState().panel !== null) return
      if ((e.target as HTMLElement).closest('[data-widget-tile]')) return
      // Zoom-HUD/Minimap liegen als absolut positionierte Kinder INNERHALB
      // von outerRef — ihr eigenes onPointerDown+stopPropagation() greift zu
      // spät, weil dieser Listener hier nativ auf outerRef sitzt und daher
      // VOR Reacts synthetischem Event-Dispatch feuert. Deshalb ein
      // explizites Attribut statt uns auf stopPropagation() zu verlassen.
      if ((e.target as HTMLElement).closest('[data-board-chrome]')) return
      selStateRef.current = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY, active: false }
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerup',   onUp,   { once: true })
    }

    el.addEventListener('pointerdown', onDown)
    cleanupRubber.current = () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(selRafRef.current!)
    }
  }, []) // stable — all state accessed via refs or store.getState()

  // Grid mode needs both scrollerRef and attachOuter
  const attachGridOuter = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el
    attachOuter(el)
  }, [attachOuter])

  // ── Drag helpers ──────────────────────────────────────────────────────────────
  // In infinite mode the grid has a fixed row count — rows below it collapse to
  // auto height, so drags must stay inside.
  function maxRowFor(rowSpan: number) {
    return isInfinite ? INFINITE_GRID_ROWS - rowSpan + 1 : Infinity
  }

  function computeDelta(widget: Widget, dx: number, dy: number, z: number) {
    const gridW = isInfinite ? INFINITE_GRID_COLS * INFINITE_COL_W : (gridRef.current!.clientWidth - 2 * GRID_GAP)
    const colW  = isInfinite ? (INFINITE_COL_W + GRID_GAP) : (gridW + GRID_GAP) / GRID_COLS
    const rowH  = GRID_ROW_H + GRID_GAP
    const cols  = isInfinite ? INFINITE_GRID_COLS : GRID_COLS
    const dcol  = Math.round(dx / z / colW)
    const drow  = Math.round(dy / z / rowH)
    const maxCS = cols - widget.pos.colSpan + 1
    const newCol = Math.max(1, Math.min(maxCS, widget.pos.col + dcol))
    const newRow = Math.max(1, Math.min(maxRowFor(widget.pos.rowSpan), widget.pos.row + drow))
    return { dcol: newCol - widget.pos.col, drow: newRow - widget.pos.row, newCol, newRow }
  }

  function handleDragStart() {
    isDraggingRef.current = true
    selStateRef.current = null
    if (selBoxElRef.current) selBoxElRef.current.style.display = 'none'
  }

  function handleDragMove(event: DragMoveEvent) {
    if (!isDraggingRef.current) return
    if (!gridRef.current) return
    const widget = widgets.find(w => w.id === event.active.id)
    if (!widget) return
    const z = isInfinite ? (canvasRef.current?.getZoom() ?? 1) : 1
    const { dcol, drow, newCol, newRow } = computeDelta(widget, event.delta.x, event.delta.y, z)
    const multiIds = useUIStore.getState().multiSelectedIds
    const isMultiDrag = multiIds.length > 1 && multiIds.includes(event.active.id as string)

    if (isMultiDrag) {
      const previews = multiIds.map(id => {
        const w = widgets.find(x => x.id === id)
        if (!w) return null
        const cols = isInfinite ? INFINITE_GRID_COLS : GRID_COLS
        const col = Math.max(1, Math.min(cols - w.pos.colSpan + 1, w.pos.col + dcol))
        const row = Math.max(1, Math.min(maxRowFor(w.pos.rowSpan), w.pos.row + drow))
        return { id, col, row, colSpan: w.pos.colSpan, rowSpan: w.pos.rowSpan }
      }).filter(Boolean) as typeof dropPreviews
      setDropPreviews(prev => {
        const same = prev.length === previews.length && prev.every((p, i) => p.col === previews[i].col && p.row === previews[i].row)
        return same ? prev : previews
      })
    } else {
      const p = { id: widget.id, col: newCol, row: newRow, colSpan: widget.pos.colSpan, rowSpan: widget.pos.rowSpan }
      setDropPreviews(prev => prev.length === 1 && prev[0].col === p.col && prev[0].row === p.row ? prev : [p])
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    isDraggingRef.current = false
    setDropPreviews([])
    const { active, delta } = event

    if (!gridRef.current) return
    const widget = widgets.find(w => w.id === active.id)
    if (!widget) return
    const z = isInfinite ? (canvasRef.current?.getZoom() ?? 1) : 1
    const { dcol, drow, newCol, newRow } = computeDelta(widget, delta.x, delta.y, z)

    const multiIds = useUIStore.getState().multiSelectedIds
    if (multiIds.length > 1 && multiIds.includes(active.id as string)) {
      const cols = isInfinite ? INFINITE_GRID_COLS : GRID_COLS
      for (const id of multiIds) {
        const w = widgets.find(x => x.id === id)
        if (!w) continue
        const col = Math.max(1, Math.min(cols - w.pos.colSpan + 1, w.pos.col + dcol))
        const row = Math.max(1, Math.min(maxRowFor(w.pos.rowSpan), w.pos.row + drow))
        moveWidget(id, { ...w.pos, col, row })
        bumpWidgetZIndex(id)
      }
    } else {
      moveWidget(active.id as string, { ...widget.pos, col: newCol, row: newRow })
      bumpWidgetZIndex(active.id as string)
    }
    useUIStore.getState().clearMultiSelect()
  }

  const maxRow    = widgets.reduce((m, w) => Math.max(m, w.pos.row + w.pos.rowSpan - 1), 0)
  const totalRows = Math.max(8, maxRow + 2)

  const sortedWidgets = [...widgets].sort((a, b) => a.pos.row - b.pos.row || a.pos.col - b.pos.col)

  // Update the stable ref that the native rubber-band listener calls — always fresh widget data
  getWIRRef.current = (sx1: number, sy1: number, sx2: number, sy2: number): string[] => {
    const rx1 = Math.min(sx1, sx2), ry1 = Math.min(sy1, sy2)
    const rx2 = Math.max(sx1, sx2), ry2 = Math.max(sy1, sy2)
    const selectable = sortedWidgets.filter(w => !w.locked)
    if (isInfinite) {
      const zoom   = canvasRef.current?.getZoom() ?? 1
      const offset = canvasRef.current?.getOffset() ?? { x: 0, y: 0 }
      const rect   = outerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
      const pL = GRID_GAP, pT = isIsland ? topPad : GRID_GAP
      const cx1 = (rx1 - rect.left - offset.x) / zoom, cy1 = (ry1 - rect.top - offset.y) / zoom
      const cx2 = (rx2 - rect.left - offset.x) / zoom, cy2 = (ry2 - rect.top - offset.y) / zoom
      return selectable.filter(w => {
        const wx1 = pL + (w.pos.col - 1) * (INFINITE_COL_W + GRID_GAP)
        const wy1 = pT + (w.pos.row - 1) * (GRID_ROW_H + GRID_GAP)
        const wx2 = wx1 + w.pos.colSpan * INFINITE_COL_W + (w.pos.colSpan - 1) * GRID_GAP
        const wy2 = wy1 + w.pos.rowSpan * GRID_ROW_H + (w.pos.rowSpan - 1) * GRID_GAP
        return wx2 > cx1 && wx1 < cx2 && wy2 > cy1 && wy1 < cy2
      }).map(w => w.id)
    } else {
      return selectable.filter(w => {
        const el = document.getElementById(`widget-${w.id}`)
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.right > rx1 && r.left < rx2 && r.bottom > ry1 && r.top < ry2
      }).map(w => w.id)
    }
  }

  const infiniteRows = INFINITE_GRID_ROWS

  const dndGrid = (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={() => { isDraggingRef.current = false; setDropPreviews([]) }}>
      <div
        ref={gridRef}
        data-board-grid
        style={{
          display: 'grid',
          gridTemplateColumns: isInfinite
            ? `repeat(${INFINITE_GRID_COLS}, ${INFINITE_COL_W}px)`
            : `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${isInfinite ? infiniteRows : totalRows}, ${GRID_ROW_H}px)`,
          gap: GRID_GAP,
          paddingTop:    isIsland ? topPad : GRID_GAP,
          paddingRight:  GRID_GAP,
          paddingBottom: GRID_GAP,
          paddingLeft:   GRID_GAP,
          position: 'relative',
          zIndex: 1,
          ...(isInfinite ? {} : { minHeight: '100%' }),
        }}
      >
        {mode === 'edit' && bg.pattern === 'columns' && (
          <div style={{
            position: 'absolute', top: isIsland ? topPad : GRID_GAP, right: GRID_GAP, bottom: GRID_GAP, left: GRID_GAP,
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gap: GRID_GAP,
            pointerEvents: 'none', zIndex: 0,
          }}>
            {Array.from({ length: GRID_COLS }).map((_, i) => (
              <div key={i} style={{
                borderRadius: 8,
                border: `1px dashed ${bg.patternColor ?? '#ffffff'}`,
                opacity: bg.patternOpacity ?? 0.06,
                height: '100%',
              }} />
            ))}
          </div>
        )}

        <AnimatePresence>
          {sortedWidgets.map(w => (
            <TileWrapper key={w.id} widget={w} gridRef={gridRef} />
          ))}
        </AnimatePresence>

        {dropPreviews.map(dp => {
          const w = widgets.find(x => x.id === dp.id)
          return (
            <div key={dp.id} style={{
              gridColumn: `${dp.col} / span ${dp.colSpan}`,
              gridRow:    `${dp.row} / span ${dp.rowSpan}`,
              borderRadius: w?.style.borderRadius ?? 12,
              border: '2px dashed var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
              pointerEvents: 'none', zIndex: 999,
              transition: 'grid-column 0.08s, grid-row 0.08s',
            }} />
          )
        })}
      </div>

    </DndContext>
  )

  const emptyState = sortedWidgets.length === 0 && (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      zIndex: 10, pointerEvents: 'auto',
    }}>
      <button
        onClick={e => {
          e.stopPropagation()
          useUIStore.getState().setMode('edit')
          openPanel('addWidget')
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '18px 36px', fontSize: 16, fontWeight: 600,
          background: 'var(--surface2)',
          border: '1.5px dashed var(--accent)',
          borderRadius: 16, color: 'var(--accent)',
          cursor: 'pointer', transition: 'all 0.15s',
          boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 15%, var(--surface2))' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {t('Add widgets')}
      </button>
    </div>
  )

  // Selection-box overlay — always mounted, shown/hidden imperatively (zero re-renders)
  const selBoxEl = (
    <div ref={selBoxElRef} style={{
      display: 'none', position: 'absolute', pointerEvents: 'none', zIndex: 2000,
      border: '1.5px solid var(--accent)',
      background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
      borderRadius: 10,
    }} />
  )

  const onBoardClick = () => { if (!justDraggedRef.current) selectWidget(null) }

  // ── Infinite canvas mode ──
  if (isInfinite) {
    return (
      <div
        ref={attachOuter}
        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
        onClick={onBoardClick}
      >
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
          <CanvasBackground />
        </div>
        <InfiniteCanvas key={currentBoardId} ref={canvasRef}>
          {dndGrid}
        </InfiniteCanvas>
        {selBoxEl}
        {emptyState}
        <TilePicker />
      </div>
    )
  }

  // ── Normal grid mode ──
  return (
    <div
      ref={attachGridOuter}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto' }}
      onClick={onBoardClick}
    >
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <CanvasBackground />
      </div>
      {dndGrid}
      {emptyState}
      {selBoxEl}
      <TilePicker />
    </div>
  )
}
