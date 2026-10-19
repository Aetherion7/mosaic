'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { PortalPopover } from '@/components/ui/PortalPopover'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useT } from '@/hooks/useT'
import type { Widget, DrawElement, DrawPoint as Pt, DrawArrowHead, DrawEdgeStyle } from '@/types'
import { uid } from '@/lib/defaults'
import {
  type Box, type ById, type ShapePreset, type SnapLines, type AlignKind, type Unit,
  SHAPE_LIBRARY, GRID, normBox, boxW, boxH, boxCenter, unionBox, boxContains, boxesIntersect,
  isShape, isEdge, isBindable, elBox, fillBox, hitShape, hitEdge, segDist,
  translateEl, resizeEl, detachEdgesFrom, cloneElements, snapCandidates, snapBox, snapPoint,
  snapToGrid, alignDeltas, distributeDeltas, labelBox,
} from './drawboard/geometry'
import {
  type HandleName, type QuickDir, drawElement, drawSelectionOverlay, drawGuides, getHandlePoints,
  quickArrowPoints, normalizeElements, refitText, edgeLabelBox, fontOf, measureWidth, FONT_FAMILIES,
  LINE_HEIGHT, DEFAULT_LABEL_SIZE,
} from './drawboard/render'
import { buildSvg } from './drawboard/svgExport'
import {
  IcoSelect, IcoHand, IcoPen, IcoText, IcoEraser, IcoBucket, IcoLine, IcoArrow, IcoUndo, IcoRedo, IcoTrash,
  IcoDownload, IcoShapes, IcoFormat, IcoMore, IcoChevron, IcoZoomFit, IcoCopy, IcoCut, IcoPaste,
  IcoDuplicate, IcoToFront, IcoToBack, IcoGroup, IcoUngroup, IcoLock, IcoUnlock, IcoEditText,
  IcoSelectAll, ShapePreview,
} from './drawboard/icons'
import {
  FormatPanel, type StyleState, type Kinds, type CanvasBg, type FontFamily,
  type FillStyle, type StrokeDash, type TextAlign,
} from './drawboard/FormatPanel'

export type { DrawElement }

// ─── Types & constants ────────────────────────────────────────────────────────

type DrawTool = 'select' | 'hand' | 'pen' | 'shape' | 'line' | 'arrow' | 'text' | 'eraser' | 'fill'
const TOOLS: DrawTool[] = ['select', 'hand', 'pen', 'shape', 'line', 'arrow', 'text', 'eraser', 'fill']
// Tools persisted by boards from before the shape library existed.
const LEGACY_SHAPE_TOOLS = ['rect', 'ellipse', 'triangle']

const MAX_SW = 40
const pctToSw = (pct: number) => Math.max(0.5, (pct / 100) * MAX_SW)
const swToPct = (sw: number) => Math.max(1, Math.round((sw / MAX_SW) * 100))

// Single-letter tool shortcuts (only while the drawboard has focus, where the
// board's own E/A/T/S shortcuts are suppressed anyway).
const TOOL_KEYS: Record<string, { tool: DrawTool; shape?: string }> = {
  v: { tool: 'select' }, h: { tool: 'hand' }, p: { tool: 'pen' }, r: { tool: 'shape', shape: 'rect' }, o: { tool: 'shape', shape: 'ellipse' },
  d: { tool: 'shape', shape: 'diamond' }, l: { tool: 'line' }, a: { tool: 'arrow' }, t: { tool: 'text' },
  x: { tool: 'eraser' }, b: { tool: 'fill' },
}

const PV = ({ children, fill = 'none', stroke = 'currentColor' }: { children: React.ReactNode; fill?: string; stroke?: string }) => (
  <svg viewBox="0 0 90 22" fill={fill} stroke={stroke} style={{ width: '100%', height: 22, display: 'block' }} preserveAspectRatio="none">
    {children}
  </svg>
)

const BRUSH_DEFS: { id: string; label: string; preview: React.ReactNode }[] = [
  { id: 'pen', label: 'Pen',
    preview: <PV><path d="M4 16 Q22 5 45 11 Q68 17 86 6" strokeWidth="1.6" strokeLinecap="round" fill="none"/></PV> },
  { id: 'marker', label: 'Marker',
    preview: <PV><path d="M4 16 Q22 5 45 11 Q68 17 86 6" strokeWidth="7" strokeLinecap="round" strokeOpacity="0.55" fill="none"/></PV> },
  { id: 'highlighter', label: 'Highlighter',
    preview: <PV><path d="M4 11 Q45 9 86 11" strokeWidth="15" strokeLinecap="square" strokeOpacity="0.3" fill="none"/></PV> },
  { id: 'spray', label: 'Spray',
    preview: <PV fill="currentColor" stroke="none"><g>{([
      [13, 9, 1.1], [16, 7, 0.8], [20, 6, 0.9], [22, 9, 1.0], [18, 13, 0.8], [14, 12, 0.7], [21, 14, 0.9],
      [28, 8, 0.7], [32, 14, 0.8], [37, 7, 0.7],
      [40, 9, 1.1], [43, 7, 0.9], [47, 6, 0.8], [50, 9, 1.0], [46, 14, 0.9], [41, 14, 0.7], [51, 13, 0.8],
      [58, 8, 0.7], [62, 14, 0.8],
      [66, 9, 1.1], [69, 7, 0.9], [73, 6, 0.8], [76, 9, 1.0], [72, 14, 0.9], [67, 13, 0.7], [77, 14, 0.8],
    ] as [number, number, number][]).map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r}/>)}</g></PV> },
  { id: 'chalk', label: 'Chalk',
    preview: <PV><path d="M4 15 Q18 9 30 12 Q44 16 58 8 Q70 3 86 9" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 2" fill="none"/><path d="M5 16 Q19 10 31 13 Q45 17 59 9 Q71 4 87 10" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="2 3" strokeOpacity="0.5" fill="none"/></PV> },
  { id: 'calligraphy', label: 'Calligraphy',
    preview: <PV fill="currentColor" stroke="none"><path d="M 5 15 Q 24 5 45 1 Q 66 4 82 13 L 86 22 Q 66 13 45 9 Q 23 20 4 19 Z"/></PV> },
]

const CANVAS_COLOR: Record<CanvasBg, string> = { white: '#ffffff', grid: '#ffffff', dark: '#1e1e2e' }

type Drag =
  | { kind: 'pan'; mx: number; my: number; ox: number; oy: number }
  | { kind: 'move'; start: Pt; sx: number; sy: number; moved: boolean; origs: Map<string, DrawElement>; box: Box; lines: SnapLines | null }
  | { kind: 'resize'; id: string; handle: HandleName; orig: DrawElement; origBox: Box; lines: SnapLines | null }
  | { kind: 'edgeEnd'; id: string; end: 'start' | 'end'; lines: SnapLines | null }
  | { kind: 'marquee'; sx: number; sy: number; ex: number; ey: number; additive: boolean; active: boolean; origSel: string[] }
  | { kind: 'draw'; start: Pt; preset?: ShapePreset; lines: SnapLines | null }
  | { kind: 'erase'; changed: boolean; last?: Pt }
  | { kind: 'quick'; shapeId: string; dir: QuickDir; sx: number; sy: number }

type Editor = { id: string | null; x: number; y: number }

// Shared across every drawboard on the page, so a copy in one widget can be
// pasted into another. Bindings to shapes outside the copied set are
// already frozen into coordinates at copy time.
const SHARED = { clipboard: [] as DrawElement[], pasteCount: 0 }

const HANDLE_CURSORS: Record<HandleName, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', start: 'crosshair', end: 'crosshair',
}

// Pulls one persisted view/style field back into local state whenever the
// widget's OTHER mount (board tile vs. Focus Mode) changes it.
function useSyncFromStore<T>(stored: T | undefined, current: T, set: (v: T) => void, allowUndefined = false) {
  const cur = useRef(current)
  cur.current = current
  useEffect(() => {
    if ((stored !== undefined || allowUndefined) && stored !== cur.current) set(stored as T)
  }, [stored, set, allowUndefined])
}

const BTN: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0, padding: 0,
}
const HUD_BTN: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: 'none',
  background: 'transparent', color: 'var(--text2)',
  cursor: 'pointer', fontSize: 15, display: 'flex',
  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const POPOVER: React.CSSProperties = {
  background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid var(--border)', borderRadius: 10, padding: 10,
  boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 8,
}
const POP_LABEL: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }
const MENU_ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
  border: 'none', background: 'none', color: 'var(--text1)', cursor: 'pointer', fontSize: 11.5,
  textAlign: 'left', width: '100%',
}

function tb(active: boolean): React.CSSProperties {
  return { ...BTN, background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? 'var(--on-accent, white)' : 'var(--text2)' }
}

function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DrawboardWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateWidget      = useBoardStore(s => s.updateWidget)
  const updateWidgetQuiet = useBoardStore(s => s.updateWidgetQuiet)
  const mode   = useUIStore(s => s.mode)
  const isEdit = mode === 'edit'
  const data   = (widget.data ?? {}) as Record<string, unknown>

  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef    = useRef<HTMLDivElement>(null)
  const rootRef         = useRef<HTMLDivElement>(null)
  const penGroupRef     = useRef<HTMLDivElement>(null)
  const shapeGroupRef   = useRef<HTMLDivElement>(null)
  const edgeGroupRef    = useRef<HTMLDivElement>(null)
  const moreGroupRef    = useRef<HTMLDivElement>(null)

  // ── Tool & style state (persisted as view state, s. saveView) ──
  const init = <T,>(key: string, fallback: T): T => (data[key] as T | undefined) ?? fallback
  const [tool, setTool] = useState<DrawTool>(() => {
    const v = data.tool as string | undefined
    return v && LEGACY_SHAPE_TOOLS.includes(v) ? 'shape' : (TOOLS.includes(v as DrawTool) ? v as DrawTool : 'pen')
  })
  const [shapeKind, setShapeKind] = useState<string>(() => {
    const v = data.tool as string | undefined
    return v && LEGACY_SHAPE_TOOLS.includes(v) ? v : init('shapeKind', 'rect')
  })
  const [color,        setColor]        = useState<string>(() => init('color', '#111827'))
  const [strokePct,    setStrokePct]    = useState<number>(() => init('strokePct', 10))
  const [opacityPct,   setOpacityPct]   = useState<number>(() => init('opacityPct', 100))
  const [filled,       setFilled]       = useState<boolean>(() => init('filled', false))
  const [bgColor,      setBgColor]      = useState<string | undefined>(() => data.bgColor as string | undefined)
  const [fillStyle,    setFillStyle]    = useState<FillStyle>(() => init('fillStyle', 'hachure'))
  const [strokeDash,   setStrokeDash]   = useState<StrokeDash>(() => init('strokeStyle', 'solid'))
  const [roundCorners, setRoundCorners] = useState<boolean>(() => init('roundCorners', false))
  const [shadow,       setShadow]       = useState<boolean>(() => init('shadow', false))
  const [fontSize,     setFontSize]     = useState<number>(() => init('fontSize', 16))
  const [fontFamily,   setFontFamily]   = useState<FontFamily>(() => init('fontFamily', 'sans'))
  const [bold,         setBold]         = useState<boolean>(() => init('bold', false))
  const [italic,       setItalic]       = useState<boolean>(() => init('italic', false))
  const [textAlign,    setTextAlign]    = useState<TextAlign>('left')
  const [fontColor,    setFontColor]    = useState<string | undefined>(() => data.fontColor as string | undefined)
  const [edgeStyle,    setEdgeStyle]    = useState<DrawEdgeStyle>(() => init('edgeStyle', 'straight'))
  const [startArrow,   setStartArrow]   = useState<DrawArrowHead>(() => init('startArrow', 'none'))
  const [endArrow,     setEndArrow]     = useState<DrawArrowHead>(() => init('endArrow', 'arrow'))
  const [brushType,    setBrushType]    = useState<string>(() => init('brushType', 'pen'))
  const [canvasBg,     setCanvasBg]     = useState<CanvasBg>(() => init('canvasBg', 'white'))
  const [snapOn,       setSnapOn]       = useState<boolean>(() => init('snapToGrid', false))
  const [guidesOn,     setGuidesOn]     = useState<boolean>(() => init('guides', true))
  const [formatOpen,   setFormatOpen]   = useState<boolean>(() => init('formatOpen', false))
  const [zoomPct,      setZoomPct]      = useState(() => Math.round(init('zoom', 1) * 100))

  // ── Transient UI ──
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; hasTarget: boolean } | null>(null)
  const [popover, setPopover] = useState<null | 'pen' | 'shape' | 'edge' | 'more'>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorVal, setEditorVal] = useState('')
  // Bumped on every committed change so panel/context menu re-read elsRef.
  const [rev, setRev] = useState(0)

  // ── Canvas refs ──
  const elsRef      = useRef<DrawElement[]>(normalizeElements((widget.data?.elements as DrawElement[] | undefined) ?? []))
  const curRef      = useRef<DrawElement | null>(null)
  const dragRef     = useRef<Drag | null>(null)
  const panRef      = useRef({ x: init('panX', 0), y: init('panY', 0) })
  const scaleRef    = useRef(init('zoom', 1))
  const selIdsRef   = useRef<Set<string>>(new Set())
  const histRef     = useRef<DrawElement[][]>([[...elsRef.current]])
  const histIdxRef  = useRef(0)
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cursorPtRef = useRef<Pt | null>(null)
  const guideRef    = useRef<{ gx: number | null; gy: number | null }>({ gx: null, gy: null })
  const hoverBindRef = useRef<string | null>(null)
  const hoverShapeRef = useRef<string | null>(null)
  const spaceRef    = useRef(false)
  const editorRef   = useRef<Editor | null>(null)
  const editorValRef = useRef('')
  const fillImgCacheRef   = useRef(new Map<string, HTMLImageElement>())
  const isWidgetActiveRef = useRef(false)
  // Last element array this mount saw in the store — distinguishes the
  // other mount's writes from our own echo (s. the elements sync effect).
  const lastExtRef  = useRef(widget.data?.elements)

  const style: StyleState = {
    color, strokePct, opacityPct, filled, bgColor, fillStyle, strokeDash, roundCorners, shadow,
    fontSize, fontFamily, bold, italic, textAlign, fontColor, edgeStyle, startArrow, endArrow,
  }
  const styleRef = useRef(style);  styleRef.current = style
  const isEditRef = useRef(isEdit); isEditRef.current = isEdit
  const toolRef = useRef(tool);     toolRef.current = tool
  const shapeKindRef = useRef(shapeKind); shapeKindRef.current = shapeKind
  const brushTypeRef = useRef(brushType); brushTypeRef.current = brushType
  const canvasBgRef = useRef(canvasBg); canvasBgRef.current = canvasBg
  const snapRef = useRef(snapOn); snapRef.current = snapOn
  const guidesRef = useRef(guidesOn); guidesRef.current = guidesOn
  selIdsRef.current = new Set(selectedIds)
  editorRef.current = editor
  editorValRef.current = editorVal

  const byIdNow = (): ById => new Map(elsRef.current.map(e => [e.id, e]))

  // ── Render ────────────────────────────────────────────────────────────────

  const paintElements = useCallback((ctx: CanvasRenderingContext2D, els: DrawElement[], byId: ById, scale: number, editingId: string | null, onImg?: () => void) => {
    // Flood fills are raster snapshots taken at the pan/zoom active when they
    // were made (s. DrawElement.fillPanX) — drawn at that logical rect so
    // they track pan/zoom like everything else, underneath all vectors.
    for (const el of els) {
      if (el.type !== 'fill' || !el.fillImageUrl) continue
      let img = fillImgCacheRef.current.get(el.id)
      if (!img) {
        img = new Image()
        fillImgCacheRef.current.set(el.id, img)
        if (onImg) img.onload = onImg
        img.src = el.fillImageUrl
      }
      if (img.complete && img.naturalWidth > 0) {
        const b = fillBox(el)
        ctx.save()
        ctx.globalAlpha = (el.opacity ?? 100) / 100
        ctx.drawImage(img, b.x1, b.y1, boxW(b), boxH(b))
        ctx.restore()
      }
    }
    const o = { scale, byId, canvasColor: CANVAS_COLOR[canvasBgRef.current], editingId, dark: canvasBgRef.current === 'dark' }
    for (const el of els) if (el.type !== 'fill') drawElement(ctx, el, o)
  }, [])

  // The canvas bitmap is sized to what's actually on screen: layout size ×
  // device pixel ratio × the board's own CSS zoom. Without this, zooming
  // the board out (or a HiDPI display) resampled a 1:1 bitmap and every
  // stroke went soft. All drawing goes through setTransform(k) and every
  // coordinate conversion below uses the LAYOUT size (viewRef), never the
  // bitmap size.
  const viewRef = useRef({ w: 0, h: 0, k: 1 })
  const syncBacking = useCallback((): boolean => {
    const container = containerRef.current, c = canvasRef.current
    if (!container || !c) return false
    const w = container.clientWidth, h = container.clientHeight
    if (!w || !h) return false
    const r = container.getBoundingClientRect()
    const boardZoom = r.width / w || 1
    const raw = (window.devicePixelRatio || 1) * boardZoom
    const k = Math.max(0.25, Math.min(4, Math.ceil(raw * 8 - 0.01) / 8))
    const v = viewRef.current
    if (v.w === w && v.h === h && v.k === k) return false
    viewRef.current = { w, h, k }
    for (const cv of [c, cursorCanvasRef.current]) {
      if (!cv) continue
      cv.width = Math.round(w * k); cv.height = Math.round(h * k)
      cv.style.width = `${w}px`; cv.style.height = `${h}px`
    }
    return true
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    syncBacking()
    const { w: W, h: H, k } = viewRef.current
    ctx.setTransform(k, 0, 0, k, 0, 0)
    const bg = canvasBgRef.current
    const scale = scaleRef.current, pan = panRef.current

    ctx.fillStyle = CANVAS_COLOR[bg]
    ctx.fillRect(0, 0, W, H)
    if (bg === 'grid' || (snapRef.current && bg === 'dark')) {
      const gridPx = Math.max(8, GRID * scale)
      const offX = ((pan.x % gridPx) + gridPx) % gridPx
      const offY = ((pan.y % gridPx) + gridPx) % gridPx
      ctx.strokeStyle = bg === 'dark' ? 'rgba(255,255,255,0.07)' : '#e5e7eb'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let x = offX - gridPx; x <= W + gridPx; x += gridPx) { ctx.moveTo(x, 0); ctx.lineTo(x, H) }
      for (let y = offY - gridPx; y <= H + gridPx; y += gridPx) { ctx.moveTo(0, y); ctx.lineTo(W, y) }
      ctx.stroke()
    }

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(scale, scale)
    const els = elsRef.current
    const byId: ById = new Map(els.map(e => [e.id, e]))
    const cur = curRef.current
    if (cur) byId.set(cur.id, cur)
    // Shadow blur/offset ignore the transform, so they get the bitmap scale too.
    paintElements(ctx, els, byId, scale * k, editorRef.current?.id ?? null, () => render())
    if (cur) drawElement(ctx, cur, { scale: scale * k, byId, canvasColor: CANVAS_COLOR[bg], dark: bg === 'dark' })

    if (isEditRef.current) {
      const drag = dragRef.current
      drawSelectionOverlay(ctx, els, {
        scale, byId, selected: selIdsRef.current,
        showHandles: toolRef.current === 'select' && drag?.kind !== 'move',
        quickId: toolRef.current === 'select' && !drag ? quickTarget() : null,
        bindHoverId: hoverBindRef.current,
      })
      if (drag?.kind === 'marquee' && drag.active) {
        const x = Math.min(drag.sx, drag.ex), y = Math.min(drag.sy, drag.ey)
        const w = Math.abs(drag.ex - drag.sx), h = Math.abs(drag.ey - drag.sy)
        ctx.save()
        ctx.fillStyle = 'rgba(59,130,246,0.10)'
        ctx.strokeStyle = 'rgba(59,130,246,0.7)'
        ctx.lineWidth = 1 / scale
        ctx.setLineDash([4 / scale, 3 / scale])
        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
        ctx.restore()
      }
      const view = { x1: -pan.x / scale, y1: -pan.y / scale, x2: (W - pan.x) / scale, y2: (H - pan.y) / scale }
      drawGuides(ctx, guideRef.current.gx, guideRef.current.gy, view, scale)
    }
    ctx.restore()
  }, [paintElements, syncBacking])

  // Pen cursor dot on its own overlay canvas so hovering only repaints one circle.
  const renderCursor = useCallback(() => {
    const canvas = cursorCanvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const { w: W, h: H, k } = viewRef.current
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (!cursorPtRef.current) return
    ctx.save()
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(scaleRef.current, scaleRef.current)
    const { x, y } = cursorPtRef.current
    ctx.beginPath()
    ctx.arc(x, y, 4 / scaleRef.current, 0, Math.PI * 2)
    ctx.fillStyle = styleRef.current.color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1.5 / scaleRef.current
    ctx.stroke()
    ctx.restore()
  }, [])

  useEffect(() => { cursorPtRef.current = null; renderCursor(); render() }, [tool, renderCursor, render])
  useEffect(() => { render() }, [canvasBg, snapOn, selectedIds, render])

  // External changes (e.g. drawing in Focus Mode while the tile stays mounted).
  // Our own saves write elsRef.current itself to the store, so they pass
  // through this unchanged.
  useEffect(() => {
    const ext = widget.data?.elements as DrawElement[] | undefined
    if (ext === lastExtRef.current) return
    lastExtRef.current = ext
    if (ext === elsRef.current) return
    elsRef.current = normalizeElements(ext ?? [])
    histRef.current = [[...elsRef.current]]
    histIdxRef.current = 0
    setSelectedIds([])
    setRev(r => r + 1)
    render()
  }, [widget.data?.elements, render])

  useEffect(() => {
    const container = containerRef.current; if (!container) return
    const obs = new ResizeObserver(() => { syncBacking(); render(); renderCursor() })
    obs.observe(container)
    // The board zooms via a CSS transform, which no observer reports —
    // poll cheaply and re-render at the new resolution when it changes.
    const poll = setInterval(() => { if (syncBacking()) { render(); renderCursor() } }, 250)
    return () => { obs.disconnect(); clearInterval(poll) }
  }, [render, renderCursor, syncBacking])

  // View mode is read-only: close everything floating, drop the selection.
  useEffect(() => {
    if (isEdit) return
    setPopover(null)
    editorRef.current = null
    setEditor(null)
    setSelectedIds([])
    setCtxMenu(null)
    cursorPtRef.current = null
    render(); renderCursor()
  }, [isEdit, render, renderCursor])

  // ── Persist ───────────────────────────────────────────────────────────────

  // Reads the LIVE store data at fire time instead of the (possibly stale)
  // `widget.data` prop: save() and saveView() are independent debounced
  // timers that replace `data` wholesale, and a stale spread from one would
  // silently wipe whatever the other just wrote.
  function getLiveData(): Record<string, unknown> {
    const boards = useBoardStore.getState().boards
    const boardId = Object.keys(boards).find(bid => boards[bid]?.widgets[widget.id])
    const live = boardId ? boards[boardId].widgets[widget.id]?.data : undefined
    return (live ?? widget.data ?? {}) as Record<string, unknown>
  }

  const savePendingRef = useRef(false)
  const writeElements = useCallback(() => {
    savePendingRef.current = false
    lastExtRef.current = elsRef.current
    updateWidget(widget.id, { data: { ...getLiveData(), elements: elsRef.current } })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, updateWidget])
  const save = useCallback(() => {
    clearTimeout(saveTimer.current)
    savePendingRef.current = true
    saveTimer.current = setTimeout(writeElements, 600)
  }, [writeElements])
  // Don't lose the last edit if the window closes / the widget unmounts
  // inside the debounce window.
  useEffect(() => {
    const flush = () => { if (savePendingRef.current) { clearTimeout(saveTimer.current); writeElements() } }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [writeElements])

  // View/tool state is a pure view change (no undo step) but still has to
  // reach the store so a simultaneously open Focus Mode mount stays in sync.
  const saveViewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveView = useCallback(() => {
    clearTimeout(saveViewTimer.current)
    saveViewTimer.current = setTimeout(() => {
      const s = styleRef.current
      updateWidgetQuiet(widget.id, { data: {
        ...getLiveData(),
        zoom: scaleRef.current, panX: panRef.current.x, panY: panRef.current.y,
        tool: toolRef.current, shapeKind: shapeKindRef.current, brushType: brushTypeRef.current,
        color: s.color, strokePct: s.strokePct, opacityPct: s.opacityPct, filled: s.filled,
        bgColor: s.bgColor, fillStyle: s.fillStyle, strokeStyle: s.strokeDash, roundCorners: s.roundCorners,
        shadow: s.shadow, fontSize: s.fontSize, fontFamily: s.fontFamily, bold: s.bold, italic: s.italic,
        fontColor: s.fontColor, edgeStyle: s.edgeStyle, startArrow: s.startArrow, endArrow: s.endArrow,
        canvasBg: canvasBgRef.current, snapToGrid: snapRef.current, guides: guidesRef.current, formatOpen: formatOpenRef.current,
      } })
    }, 400)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, updateWidgetQuiet])
  const formatOpenRef = useRef(formatOpen); formatOpenRef.current = formatOpen
  useEffect(() => () => { clearTimeout(saveViewTimer.current) }, [])
  useEffect(() => { saveView() }, [
    saveView, tool, shapeKind, brushType, color, strokePct, opacityPct, filled, bgColor, fillStyle, strokeDash,
    roundCorners, shadow, fontSize, fontFamily, bold, italic, fontColor, edgeStyle, startArrow, endArrow,
    canvasBg, snapOn, guidesOn, formatOpen,
  ])

  // ── Re-sync from the other mount ──
  useEffect(() => {
    const z = data.zoom as number | undefined, px = data.panX as number | undefined, py = data.panY as number | undefined
    let changed = false
    if (typeof z === 'number' && z !== scaleRef.current) { scaleRef.current = z; setZoomPct(Math.round(z * 100)); changed = true }
    if (typeof px === 'number' && typeof py === 'number' && (px !== panRef.current.x || py !== panRef.current.y)) {
      panRef.current = { x: px, y: py }; changed = true
    }
    if (changed) { render(); renderCursor() }
  }, [data.zoom, data.panX, data.panY, render, renderCursor])
  useEffect(() => {
    const v = data.tool as string | undefined
    if (!v) return
    if (LEGACY_SHAPE_TOOLS.includes(v)) { setTool('shape'); setShapeKind(v) }
    else if (TOOLS.includes(v as DrawTool) && v !== toolRef.current) setTool(v as DrawTool)
  }, [data.tool])
  useSyncFromStore(data.shapeKind as string | undefined, shapeKind, setShapeKind)
  useSyncFromStore(data.color as string | undefined, color, setColor)
  useSyncFromStore(data.strokePct as number | undefined, strokePct, setStrokePct)
  useSyncFromStore(data.opacityPct as number | undefined, opacityPct, setOpacityPct)
  useSyncFromStore(data.filled as boolean | undefined, filled, setFilled)
  useSyncFromStore(data.bgColor as string | undefined, bgColor, setBgColor, true)
  useSyncFromStore(data.fillStyle as FillStyle | undefined, fillStyle, setFillStyle)
  useSyncFromStore(data.strokeStyle as StrokeDash | undefined, strokeDash, setStrokeDash)
  useSyncFromStore(data.roundCorners as boolean | undefined, roundCorners, setRoundCorners)
  useSyncFromStore(data.shadow as boolean | undefined, shadow, setShadow)
  useSyncFromStore(data.fontSize as number | undefined, fontSize, setFontSize)
  useSyncFromStore(data.fontFamily as FontFamily | undefined, fontFamily, setFontFamily)
  useSyncFromStore(data.bold as boolean | undefined, bold, setBold)
  useSyncFromStore(data.italic as boolean | undefined, italic, setItalic)
  useSyncFromStore(data.fontColor as string | undefined, fontColor, setFontColor, true)
  useSyncFromStore(data.edgeStyle as DrawEdgeStyle | undefined, edgeStyle, setEdgeStyle)
  useSyncFromStore(data.startArrow as DrawArrowHead | undefined, startArrow, setStartArrow)
  useSyncFromStore(data.endArrow as DrawArrowHead | undefined, endArrow, setEndArrow)
  useSyncFromStore(data.brushType as string | undefined, brushType, setBrushType)
  useSyncFromStore(data.canvasBg as CanvasBg | undefined, canvasBg, setCanvasBg)
  useSyncFromStore(data.snapToGrid as boolean | undefined, snapOn, setSnapOn)
  useSyncFromStore(data.guides as boolean | undefined, guidesOn, setGuidesOn)
  useSyncFromStore(data.formatOpen as boolean | undefined, formatOpen, setFormatOpen)

  // Selecting something pulls ITS style into the toolbar/panel (draw.io's
  // format panel always reflects the selection), which is what makes the
  // controls read as "edit this shape" rather than "next shape's defaults".
  useEffect(() => {
    if (!selectedIds.length) return
    // Each property group comes from the first selected element that has
    // it, so e.g. a box + arrow selection shows the ARROW's line ends.
    const sel = elsRef.current.filter(x => selectedIds.includes(x.id) && x.type !== 'fill')
    if (!sel.length) return
    const first = sel[0]
    setColor(first.color)
    setOpacityPct(first.opacity ?? 100)
    setShadow(!!first.shadow)
    const stroked = sel.find(el => el.type !== 'text')
    if (stroked) { setStrokePct(swToPct(stroked.strokeWidth)); setStrokeDash(stroked.strokeStyle ?? 'solid') }
    const shapeEl = sel.find(isShape)
    if (shapeEl) {
      setFilled(!!shapeEl.filled)
      setBgColor(shapeEl.bgColor)
      if (shapeEl.fillStyle) setFillStyle(shapeEl.fillStyle)
      setRoundCorners(!!shapeEl.roundCorners)
    }
    const free = sel.find(el => el.type === 'freedraw')
    if (free?.brushType) setBrushType(free.brushType)
    const texty = sel.find(el => el.type !== 'freedraw')
    if (texty) {
      setFontSize(texty.fontSize ?? (texty.type === 'text' ? 16 : DEFAULT_LABEL_SIZE))
      setFontFamily(texty.fontFamily ?? 'sans')
      setBold(!!texty.bold)
      setItalic(!!texty.italic)
      setTextAlign(texty.textAlign ?? (texty.type === 'text' ? 'left' : 'center'))
      setFontColor(texty.type === 'text' ? undefined : texty.fontColor)
    }
    const edgeEl = sel.find(isEdge)
    if (edgeEl) {
      setEdgeStyle(edgeEl.edgeStyle ?? 'straight')
      setStartArrow(edgeEl.startArrow ?? 'none')
      setEndArrow(edgeEl.endArrow ?? (edgeEl.type === 'arrow' ? 'arrow' : 'none'))
    }
  }, [selectedIds])

  // ── History ───────────────────────────────────────────────────────────────

  function pushHist(els: DrawElement[]) {
    histRef.current = histRef.current.slice(0, histIdxRef.current + 1)
    histRef.current.push([...els])
    if (histRef.current.length > 200) histRef.current.shift()
    histIdxRef.current = histRef.current.length - 1
    setRev(r => r + 1)
  }
  function commit(next: DrawElement[]) {
    elsRef.current = next
    pushHist(next); render(); save()
  }
  function setSelection(ids: string[]) {
    selIdsRef.current = new Set(ids)
    setSelectedIds(ids)
  }
  const undo = () => {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    elsRef.current = [...histRef.current[histIdxRef.current]]
    setSelection([]); setRev(r => r + 1); render(); save()
  }
  const redo = () => {
    if (histIdxRef.current >= histRef.current.length - 1) return
    histIdxRef.current++
    elsRef.current = [...histRef.current[histIdxRef.current]]
    setSelection([]); setRev(r => r + 1); render(); save()
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  function zoomAt(ns: number, mx: number, my: number) {
    ns = Math.max(0.1, Math.min(10, ns))
    panRef.current = { x: mx - (mx - panRef.current.x) * (ns / scaleRef.current), y: my - (my - panRef.current.y) * (ns / scaleRef.current) }
    scaleRef.current = ns
    setZoomPct(Math.round(ns * 100))
    render(); renderCursor(); saveView()
  }
  const zoomBy = (factor: number) => {
    const c = canvasRef.current; if (!c) return
    zoomAt(scaleRef.current * factor, viewRef.current.w / 2, viewRef.current.h / 2)
  }
  // Back to 100 % around the middle of the view — keeps you where you are.
  const resetZoom = () => {
    const c = canvasRef.current; if (!c) return
    zoomAt(1, viewRef.current.w / 2, viewRef.current.h / 2)
  }
  // Fill rasters span the whole viewport they were made in (mostly
  // transparent), so they only count when there's nothing else.
  function contentBounds(): Box | null {
    const byId = byIdNow()
    return unionBox(elsRef.current.filter(el => el.type !== 'fill').map(el => elBox(el, byId)))
      ?? unionBox(elsRef.current.map(fillBox))
  }
  const zoomToFit = () => {
    const canvas = canvasRef.current; if (!canvas) return
    const b = unionBox(elsRef.current.filter(el => el.type !== 'fill').map(el => elBox(el, byIdNow())))
    if (!b) { panRef.current = { x: 0, y: 0 }; zoomAt(1, 0, 0); return }
    const w = Math.max(1, boxW(b)), h = Math.max(1, boxH(b))
    const { w: W, h: H } = viewRef.current
    const ns = Math.max(0.1, Math.min(4, Math.min(W / w, H / h) * 0.85))
    scaleRef.current = ns
    panRef.current = { x: W / 2 - (b.x1 + w / 2) * ns, y: H / 2 - (b.y1 + h / 2) * ns }
    setZoomPct(Math.round(ns * 100))
    render(); renderCursor(); saveView()
  }

  // ── Style application ─────────────────────────────────────────────────────

  function selectedEditable(): Set<string> {
    return new Set(elsRef.current.filter(el => selIdsRef.current.has(el.id) && !el.locked).map(el => el.id))
  }

  function patchFor(patch: Partial<StyleState>) {
    return (el: DrawElement): DrawElement => {
      const out: Partial<DrawElement> = {}
      const hasText = el.type !== 'freedraw' && el.type !== 'fill'
      if (patch.color !== undefined) out.color = patch.color
      if (patch.strokePct !== undefined && el.type !== 'text') out.strokeWidth = pctToSw(patch.strokePct)
      if (patch.opacityPct !== undefined) out.opacity = patch.opacityPct
      if (patch.strokeDash !== undefined && el.type !== 'text') out.strokeStyle = patch.strokeDash
      if (patch.shadow !== undefined) out.shadow = patch.shadow || undefined
      if (isShape(el)) {
        if (patch.filled !== undefined) {
          out.filled = patch.filled
          // Turning fill on also applies the style/color currently shown, so
          // a shape without its own fill style doesn't fall back to the plain
          // legacy look regardless of what the panel displays.
          if (patch.filled) { out.fillStyle = styleRef.current.fillStyle; out.bgColor = styleRef.current.bgColor }
        }
        if ('bgColor' in patch) out.bgColor = patch.bgColor
        if (patch.fillStyle !== undefined) out.fillStyle = patch.fillStyle
        if (patch.roundCorners !== undefined && el.type === 'rect') out.roundCorners = patch.roundCorners
      }
      if (hasText) {
        if (patch.fontSize !== undefined) out.fontSize = patch.fontSize
        if (patch.fontFamily !== undefined) out.fontFamily = patch.fontFamily
        if (patch.bold !== undefined) out.bold = patch.bold || undefined
        if (patch.italic !== undefined) out.italic = patch.italic || undefined
        if (patch.textAlign !== undefined) out.textAlign = patch.textAlign
        if (patch.fontColor !== undefined) { if (el.type === 'text') out.color = patch.fontColor; else out.fontColor = patch.fontColor }
      }
      if (isEdge(el)) {
        if (patch.edgeStyle !== undefined) out.edgeStyle = patch.edgeStyle
        if (patch.startArrow !== undefined) out.startArrow = patch.startArrow
        if (patch.endArrow !== undefined) out.endArrow = patch.endArrow
      }
      const next = { ...el, ...out }
      return next.type === 'text' ? refitText(next) : next
    }
  }

  // Every style control both sets the default for the next element AND
  // restyles the current selection. `live` = slider being dragged: repaint
  // without a history entry; commitLive() records one on release.
  function setStyle(patch: Partial<StyleState>, live = false) {
    if (patch.color !== undefined) setColor(patch.color)
    if (patch.strokePct !== undefined) setStrokePct(patch.strokePct)
    if (patch.opacityPct !== undefined) setOpacityPct(patch.opacityPct)
    if (patch.filled !== undefined) setFilled(patch.filled)
    if ('bgColor' in patch) setBgColor(patch.bgColor)
    if (patch.fillStyle !== undefined) setFillStyle(patch.fillStyle)
    if (patch.strokeDash !== undefined) setStrokeDash(patch.strokeDash)
    if (patch.roundCorners !== undefined) setRoundCorners(patch.roundCorners)
    if (patch.shadow !== undefined) setShadow(patch.shadow)
    if (patch.fontSize !== undefined) setFontSize(patch.fontSize)
    if (patch.fontFamily !== undefined) setFontFamily(patch.fontFamily)
    if (patch.bold !== undefined) setBold(patch.bold)
    if (patch.italic !== undefined) setItalic(patch.italic)
    if (patch.textAlign !== undefined) setTextAlign(patch.textAlign)
    if (patch.fontColor !== undefined) {
      setFontColor(patch.fontColor)
      if (elsRef.current.some(el => selIdsRef.current.has(el.id) && el.type === 'text')) setColor(patch.fontColor)
    }
    if (patch.edgeStyle !== undefined) setEdgeStyle(patch.edgeStyle)
    if (patch.startArrow !== undefined) setStartArrow(patch.startArrow)
    if (patch.endArrow !== undefined) setEndArrow(patch.endArrow)

    const ids = selectedEditable()
    if (!ids.size) return
    const fn = patchFor(patch)
    elsRef.current = elsRef.current.map(el => ids.has(el.id) ? fn(el) : el)
    if (live) render()
    else { pushHist(elsRef.current); render(); save() }
  }
  function commitLive() {
    if (!selectedEditable().size) return
    pushHist(elsRef.current); save()
  }

  // ── Selection operations ──────────────────────────────────────────────────

  function withGroups(ids: string[]): string[] {
    const groups = new Set(elsRef.current.filter(e => ids.includes(e.id) && e.groupId).map(e => e.groupId!))
    if (!groups.size) return ids
    return Array.from(new Set([...ids, ...elsRef.current.filter(e => e.groupId && groups.has(e.groupId)).map(e => e.id)]))
  }

  const selectAll = () => setSelection(elsRef.current.filter(el => el.type !== 'fill' && !el.locked).map(el => el.id))

  function copySelection() {
    const sel = elsRef.current.filter(el => selIdsRef.current.has(el.id))
    if (!sel.length) return
    SHARED.clipboard = cloneElements(sel, byIdNow(), 0, 0, uid)
    SHARED.pasteCount = 0
  }
  function pasteClipboard() {
    const clip = SHARED.clipboard
    if (!clip.length) return
    SHARED.pasteCount++
    const off = 24 * SHARED.pasteCount
    const pasted = cloneElements(clip, new Map(clip.map(e => [e.id, e])), off, off, uid)
    commit([...elsRef.current, ...pasted])
    setSelection(pasted.map(p => p.id))
  }
  function duplicateSelection() {
    const sel = elsRef.current.filter(el => selIdsRef.current.has(el.id))
    if (!sel.length) return
    const dups = cloneElements(sel, byIdNow(), 16, 16, uid)
    commit([...elsRef.current, ...dups])
    setSelection(dups.map(d => d.id))
  }
  // draw.io semantics: Delete leaves connected lines in place (detached);
  // Ctrl+Delete removes them together with the shape.
  function deleteSelection(withEdges = false) {
    const removed = selectedEditable()
    if (!removed.size) return
    if (withEdges) {
      for (const el of elsRef.current) {
        if (isEdge(el) && !el.locked && ((el.startId && removed.has(el.startId)) || (el.endId && removed.has(el.endId)))) removed.add(el.id)
      }
    }
    const byId = byIdNow()
    commit(detachEdgesFrom(elsRef.current.filter(el => !removed.has(el.id)), removed, byId))
    setSelection([])
  }
  function cutSelection() { copySelection(); deleteSelection() }

  function groupSelection() {
    const ids = selectedEditable()
    if (ids.size < 2) return
    const gid = uid()
    commit(elsRef.current.map(el => ids.has(el.id) ? { ...el, groupId: gid } : el))
  }
  function ungroupSelection() {
    const ids = selectedEditable()
    if (![...ids].some(id => elsRef.current.find(e => e.id === id)?.groupId)) return
    commit(elsRef.current.map(el => ids.has(el.id) ? { ...el, groupId: undefined } : el))
  }
  function toggleLock() {
    const sel = elsRef.current.filter(el => selIdsRef.current.has(el.id))
    if (!sel.length) return
    const lock = !sel.every(el => el.locked)
    commit(elsRef.current.map(el => selIdsRef.current.has(el.id) ? { ...el, locked: lock || undefined } : el))
  }

  // Array order = paint order. front/back move the whole selection to one
  // end; forward/backward swap each selected element past one neighbour,
  // iterating from the right end so a multi-selection moves as a block.
  function reorderSelection(dir: 'front' | 'back' | 'forward' | 'backward') {
    if (!selIdsRef.current.size) return
    const isSel = (el: DrawElement) => selIdsRef.current.has(el.id)
    const arr = elsRef.current
    let next: DrawElement[]
    if (dir === 'front') next = [...arr.filter(el => !isSel(el)), ...arr.filter(isSel)]
    else if (dir === 'back') next = [...arr.filter(isSel), ...arr.filter(el => !isSel(el))]
    else if (dir === 'forward') {
      next = [...arr]
      for (let i = next.length - 2; i >= 0; i--) if (isSel(next[i]) && !isSel(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]]
    } else {
      next = [...arr]
      for (let i = 1; i < next.length; i++) if (isSel(next[i]) && !isSel(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]]
    }
    commit(next)
  }

  // A group moves as one unit; lines attached at both ends just follow.
  function selectionUnits(): { units: Unit[]; members: Map<string, string[]> } {
    const byId = byIdNow()
    const members = new Map<string, string[]>()
    const boxes = new Map<string, Box[]>()
    for (const el of elsRef.current) {
      if (!selIdsRef.current.has(el.id) || el.locked || el.type === 'fill') continue
      if (isEdge(el) && el.startId && el.endId) continue
      const key = el.groupId ?? el.id
      members.set(key, [...(members.get(key) ?? []), el.id])
      boxes.set(key, [...(boxes.get(key) ?? []), elBox(el, byId)])
    }
    return { units: [...boxes.entries()].map(([key, bs]) => ({ key, box: unionBox(bs)! })), members }
  }
  function applyUnitDeltas(deltas: Map<string, Pt>, members: Map<string, string[]>) {
    const move = new Map<string, Pt>()
    for (const [key, d] of deltas) for (const id of members.get(key) ?? []) move.set(id, d)
    if (![...move.values()].some(d => Math.abs(d.x) > 0.01 || Math.abs(d.y) > 0.01)) return
    commit(elsRef.current.map(el => { const d = move.get(el.id); return d ? translateEl(el, d.x, d.y) : el }))
  }
  function alignSelection(kind: AlignKind) {
    const { units, members } = selectionUnits()
    if (units.length >= 2) applyUnitDeltas(alignDeltas(units, kind), members)
  }
  function distributeSelection(axis: 'h' | 'v') {
    const { units, members } = selectionUnits()
    if (units.length >= 3) applyUnitDeltas(distributeDeltas(units, axis), members)
  }
  function nudge(dx: number, dy: number) {
    const { units, members } = selectionUnits()
    applyUnitDeltas(new Map(units.map(u => [u.key, { x: dx, y: dy }])), members)
  }
  function setGeometry(b: Box) {
    const sel = elsRef.current.filter(el => selIdsRef.current.has(el.id))
    if (sel.length !== 1 || sel[0].locked || isEdge(sel[0])) return
    const el = sel[0]
    const ob = normBox(el.x, el.y, el.x2, el.y2)
    const next = el.type === 'text' ? translateEl(el, b.x1 - ob.x1, b.y1 - ob.y1) : resizeEl(el, ob, b)
    commit(elsRef.current.map(x => x.id === el.id ? next : x))
  }

  // draw.io's blue hover arrows: clone the shape next to itself and connect.
  function cloneAndConnect(shapeId: string, dir: QuickDir) {
    const src = elsRef.current.find(e => e.id === shapeId)
    if (!src) return
    const b = normBox(src.x, src.y, src.x2, src.y2)
    const gap = 60
    const dx = dir === 'right' ? boxW(b) + gap : dir === 'left' ? -(boxW(b) + gap) : 0
    const dy = dir === 'down' ? boxH(b) + gap : dir === 'up' ? -(boxH(b) + gap) : 0
    const clone: DrawElement = { ...translateEl(src, dx, dy), id: uid(), label: undefined, groupId: undefined, locked: undefined }
    const edge = newEdge(src.id, boxCenter(b), boxCenter(normBox(clone.x, clone.y, clone.x2, clone.y2)), src)
    edge.endId = clone.id
    commit([...elsRef.current, clone, edge])
    setSelection([clone.id])
  }

  function newEdge(startId: string | undefined, a: Pt, b: Pt, from?: DrawElement, type: 'line' | 'arrow' = 'arrow'): DrawElement {
    const s = styleRef.current
    return {
      id: uid(), type, x: a.x, y: a.y, x2: b.x, y2: b.y,
      // Quick-connect lines take the source shape's stroke (capped, so a
      // thick outline doesn't produce a club of an arrow).
      color: from?.color ?? s.color, strokeWidth: from ? Math.min(from.strokeWidth, 4) : pctToSw(s.strokePct),
      opacity: s.opacityPct, filled: false,
      strokeStyle: s.strokeDash, shadow: s.shadow || undefined,
      startId, edgeStyle: s.edgeStyle,
      startArrow: s.startArrow !== 'none' ? s.startArrow : undefined,
      endArrow: type === 'arrow' ? (s.endArrow !== 'arrow' ? s.endArrow : undefined) : undefined,
    }
  }

  // ── Coordinates & hit testing ─────────────────────────────────────────────

  function toCanvas(sx: number, sy: number): Pt {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    // Accounts for a parent CSS transform (the infinite board's zoom).
    const kx = viewRef.current.w / r.width, ky = viewRef.current.h / r.height
    return {
      x: ((sx - r.left) * kx - panRef.current.x) / scaleRef.current,
      y: ((sy - r.top) * ky - panRef.current.y) / scaleRef.current,
    }
  }

  function hitFreedraw(el: DrawElement, p: Pt, tol: number): boolean {
    const pts = el.points ?? []
    const bt = el.brushType ?? 'pen'
    const reach = Math.max(tol, el.strokeWidth * (bt === 'spray' ? 5 : bt === 'highlighter' ? 4.5 : bt === 'marker' ? 1.5 : 0.6))
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < reach
    return pts.some((q, i) => i < pts.length - 1 && segDist(p.x, p.y, q.x, q.y, pts[i + 1].x, pts[i + 1].y) < reach)
  }

  // 'select' also returns the empty interior of an unfilled shape (but only
  // if nothing visible was hit); 'erase' only what's actually drawn.
  function hitAt(p: Pt, purpose: 'select' | 'erase'): DrawElement | null {
    const els = elsRef.current
    const byId = byIdNow()
    const tol = 6 / scaleRef.current
    let weak: DrawElement | null = null
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]
      if (el.type === 'fill') continue
      if (purpose === 'erase' && el.locked) continue
      if (isEdge(el)) {
        if (hitEdge(el, p, tol, byId) || (el.label && boxContains(edgeLabelBox(el, byId), p))) return el
      } else if (isShape(el)) {
        const h = hitShape(el, p, tol)
        if (h === 'strong') return el
        if (h === 'weak' && !weak) weak = el
      } else if (el.type === 'text') {
        if (boxContains(normBox(el.x, el.y, el.x2, el.y2), p, tol / 2)) return el
      } else if (el.type === 'freedraw') {
        if (hitFreedraw(el, p, tol)) return el
      }
    }
    return purpose === 'select' ? weak : null
  }

  function bindableAt(p: Pt, exclude: Set<string>): DrawElement | null {
    const els = elsRef.current
    const tol = 8 / scaleRef.current
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]
      if (exclude.has(el.id) || !isBindable(el)) continue
      if (el.type === 'text' ? boxContains(normBox(el.x, el.y, el.x2, el.y2), p, tol) : hitShape(el, p, tol)) return el
    }
    return null
  }

  function snapLines(exclude: Set<string>): SnapLines | null {
    return guidesRef.current ? snapCandidates(elsRef.current, exclude, byIdNow()) : null
  }
  const snapThr = () => 6 / scaleRef.current

  // ── Text editor ───────────────────────────────────────────────────────────

  // `replaceWith`: typing on a selected shape starts a NEW label with that
  // character (draw.io behaviour) instead of appending to the old one.
  function openEditor(el: DrawElement | null, at?: Pt, replaceWith?: string) {
    if (el?.locked) return
    const ed: Editor = el ? { id: el.id, x: 0, y: 0 } : { id: null, x: at?.x ?? 0, y: at?.y ?? 0 }
    editorRef.current = ed
    setEditor(ed)
    const v = replaceWith ?? (el ? (el.type === 'text' ? el.text ?? '' : el.label ?? '') : '')
    editorValRef.current = v
    setEditorVal(v)
    setPopover(null)
    render()
  }

  function commitEditor() {
    const ed = editorRef.current
    if (!ed) return
    editorRef.current = null
    setEditor(null)
    const val = editorValRef.current.replace(/\s+$/, '')
    const s = styleRef.current
    if (ed.id === null) {
      if (val.trim()) {
        const el = refitText({
          id: uid(), type: 'text', x: ed.x, y: ed.y, x2: ed.x, y2: ed.y, textTop: true,
          text: val, fontSize: s.fontSize, fontFamily: s.fontFamily !== 'sans' ? s.fontFamily : undefined,
          bold: s.bold || undefined, italic: s.italic || undefined,
          color: s.color, strokeWidth: pctToSw(s.strokePct), opacity: s.opacityPct, filled: false,
          shadow: s.shadow || undefined,
        })
        commit([...elsRef.current, el])
        setTool('select'); setSelection([el.id])
        return
      }
    } else {
      const el = elsRef.current.find(e => e.id === ed.id)
      if (el) {
        if (el.type === 'text') {
          if (!val.trim()) {
            const gone = new Set([el.id])
            commit(detachEdgesFrom(elsRef.current.filter(e => e.id !== el.id), gone, byIdNow()))
            setSelection([])
            return
          }
          if (val !== el.text) { commit(elsRef.current.map(e => e.id === el.id ? refitText({ ...e, text: val }) : e)); return }
        } else {
          const label = val.trim() ? val : undefined
          if (label !== el.label) { commit(elsRef.current.map(e => e.id === el.id ? { ...e, label } : e)); return }
        }
      }
    }
    render()
  }

  function cancelEditor() {
    editorRef.current = null
    setEditor(null)
    render()
  }

  // ── Pointer handlers ──────────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    // preventDefault keeps the browser from moving focus on its own after
    // this handler (which would instantly blur a text editor opened below).
    e.preventDefault()
    if (editorRef.current) commitEditor()
    rootRef.current?.focus({ preventScroll: true })
    setPopover(null)
    setCtxMenu(null)

    if (e.button === 1 || (e.button === 0 && (e.altKey || spaceRef.current || toolRef.current === 'hand'))) {
      dragRef.current = { kind: 'pan', mx: e.clientX, my: e.clientY, ox: panRef.current.x, oy: panRef.current.y }
      return
    }
    if (e.button !== 0) return
    const pos = toCanvas(e.clientX, e.clientY)
    const tool = toolRef.current
    const s = styleRef.current

    if (tool === 'select') {
      const byId = byIdNow()
      const sel = [...selIdsRef.current]
      if (sel.length === 1) {
        const el = byId.get(sel[0])
        if (el && !el.locked) {
          const hitR = 9 / scaleRef.current
          const handles = getHandlePoints(el, byId)
          for (const name of Object.keys(handles) as HandleName[]) {
            const hp = handles[name]; if (!hp) continue
            if (Math.hypot(pos.x - hp.x, pos.y - hp.y) > hitR) continue
            const lines = snapLines(new Set([el.id]))
            if (name === 'start' || name === 'end') dragRef.current = { kind: 'edgeEnd', id: el.id, end: name, lines }
            else dragRef.current = { kind: 'resize', id: el.id, handle: name, orig: { ...el, points: el.points?.map(p => ({ ...p })) }, origBox: normBox(el.x, el.y, el.x2, el.y2), lines }
            render(); return
          }
        }
      }
      const qt = quickTarget()
      const qEl = qt ? byId.get(qt) : undefined
      if (qEl) {
        for (const q of quickArrowPoints(qEl, scaleRef.current)) {
          if (Math.hypot(pos.x - q.p.x, pos.y - q.p.y) <= 10 / scaleRef.current) {
            dragRef.current = { kind: 'quick', shapeId: qEl.id, dir: q.dir, sx: e.clientX, sy: e.clientY }
            return
          }
        }
      }
      const hit = hitAt(pos, 'select')
      if (hit) {
        const groupIds = withGroups([hit.id])
        let next: string[]
        if (e.shiftKey) {
          next = selIdsRef.current.has(hit.id)
            ? [...selIdsRef.current].filter(id => !groupIds.includes(id))
            : [...new Set([...selIdsRef.current, ...groupIds])]
        } else if (selIdsRef.current.has(hit.id)) next = [...selIdsRef.current]
        else next = groupIds
        setSelection(next)
        if (next.includes(hit.id)) {
          const moving = new Set(next.filter(id => !byId.get(id)?.locked))
          const origs = new Map<string, DrawElement>()
          // A line moved without the shape it's attached to lets go of it.
          const detachFrom = new Set<string>()
          for (const el of elsRef.current) {
            if (!moving.has(el.id)) continue
            if (isEdge(el)) {
              if (el.startId && !moving.has(el.startId)) detachFrom.add(el.startId)
              if (el.endId && !moving.has(el.endId)) detachFrom.add(el.endId)
            }
          }
          const base = detachFrom.size ? detachEdgesFrom(elsRef.current.filter(el => moving.has(el.id)), detachFrom, byId) : elsRef.current.filter(el => moving.has(el.id))
          for (const el of base) origs.set(el.id, el)
          const box = unionBox([...origs.values()].map(el => elBox(el, byId)))
          if (box) dragRef.current = { kind: 'move', start: pos, sx: e.clientX, sy: e.clientY, moved: false, origs, box, lines: snapLines(new Set(next)) }
        }
      } else {
        if (!e.shiftKey) setSelection([])
        dragRef.current = { kind: 'marquee', sx: pos.x, sy: pos.y, ex: pos.x, ey: pos.y, additive: e.shiftKey, active: false, origSel: e.shiftKey ? [...selIdsRef.current] : [] }
      }
      render(); return
    }

    if (tool === 'fill') {
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      const r = canvas.getBoundingClientRect()
      const kx = canvas.width / r.width, ky = canvas.height / r.height
      const px = Math.min(canvas.width - 1, Math.max(0, Math.round((e.clientX - r.left) * kx)))
      const py = Math.min(canvas.height - 1, Math.max(0, Math.round((e.clientY - r.top) * ky)))
      // Repaint without the selection overlay first, so its handles/boxes
      // don't act as walls for the flood fill.
      setSelection([]); selIdsRef.current = new Set(); render()
      const filledData = applyFloodFill(ctx.getImageData(0, 0, canvas.width, canvas.height), px, py, s.color)
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width; tmp.height = canvas.height
      tmp.getContext('2d')!.putImageData(filledData, 0, 0)
      const fillUrl = tmp.toDataURL()
      const fillEl: DrawElement = {
        id: uid(), type: 'fill', fillImageUrl: fillUrl,
        x: 0, y: 0, x2: canvas.width, y2: canvas.height,
        color: s.color, strokeWidth: 0, opacity: 100, filled: true,
        // The raster is in BITMAP pixels: fold the backing scale into the
        // recorded pan/zoom so fillBox() maps it back to logical space.
        fillPanX: panRef.current.x * viewRef.current.k, fillPanY: panRef.current.y * viewRef.current.k,
        fillScale: scaleRef.current * viewRef.current.k,
      }
      const img = new Image()
      img.onload = () => render()
      img.src = fillUrl
      fillImgCacheRef.current.set(fillEl.id, img)
      // Fills paint underneath all vector elements; keeping them at the
      // front of the array matches that so layer order stays honest.
      commit([fillEl, ...elsRef.current])
      return
    }

    if (tool === 'eraser') {
      dragRef.current = { kind: 'erase', changed: false }
      eraseAt(pos)
      return
    }

    if (tool === 'text') {
      const hit = hitAt(pos, 'select')
      if (hit && !hit.locked && (hit.type === 'text' || isShape(hit) || isEdge(hit))) openEditor(hit)
      else openEditor(null, pos)
      return
    }

    const lines = snapLines(new Set())
    const noSnap = e.altKey
    const sp = (tool === 'pen' || noSnap) ? pos : snapPoint(pos, lines, snapThr(), snapRef.current).p

    if (tool === 'line' || tool === 'arrow') {
      const start = e.ctrlKey || e.metaKey ? null : bindableAt(pos, new Set())
      curRef.current = newEdge(start?.id, sp, sp, undefined, tool)
      dragRef.current = { kind: 'draw', start: sp, lines }
      render(); return
    }

    if (tool === 'pen') {
      curRef.current = {
        id: uid(), type: 'freedraw', x: pos.x, y: pos.y, x2: pos.x, y2: pos.y, points: [pos],
        color: s.color, strokeWidth: pctToSw(s.strokePct), opacity: s.opacityPct, filled: false,
        brushType: brushTypeRef.current, strokeStyle: s.strokeDash !== 'solid' ? s.strokeDash : undefined,
      }
      dragRef.current = { kind: 'draw', start: pos, lines: null }
      render(); return
    }

    // shape
    const preset = SHAPE_LIBRARY.find(p => p.id === shapeKindRef.current) ?? SHAPE_LIBRARY[0]
    curRef.current = {
      id: uid(), type: preset.type, x: sp.x, y: sp.y, x2: sp.x, y2: sp.y,
      color: s.color, strokeWidth: pctToSw(s.strokePct), opacity: s.opacityPct,
      filled: s.filled, bgColor: s.bgColor, fillStyle: s.fillStyle, strokeStyle: s.strokeDash,
      roundCorners: preset.type === 'rect' && s.roundCorners ? true : undefined, shadow: s.shadow || undefined,
    }
    dragRef.current = { kind: 'draw', start: sp, preset, lines }
    render()
  }

  // Samples the whole swipe since the last event (not just its end point),
  // so a fast stroke can't skip over thin lines.
  function eraseAt(pos: Pt) {
    const d = dragRef.current
    if (d?.kind !== 'erase') return
    const from = d.last ?? pos
    const steps = Math.max(1, Math.ceil(Math.hypot(pos.x - from.x, pos.y - from.y) / (4 / scaleRef.current)))
    const gone = new Set<string>()
    for (let i = 0; i <= steps; i++) {
      const p = { x: from.x + (pos.x - from.x) * (i / steps), y: from.y + (pos.y - from.y) * (i / steps) }
      for (let hit = hitAt(p, 'erase'); hit && !gone.has(hit.id); hit = hitAt(p, 'erase')) {
        gone.add(hit.id)
        const byId = byIdNow()
        elsRef.current = detachEdgesFrom(elsRef.current.filter(el => el.id !== hit!.id), new Set([hit.id]), byId)
      }
    }
    d.last = pos
    if (gone.size) { d.changed = true; render() }
  }

  // The single selected shape, otherwise the shape under the mouse — the
  // one that shows the blue connect arrows.
  function quickTarget(): string | null {
    if (selIdsRef.current.size === 1) {
      const id = [...selIdsRef.current][0]
      const el = elsRef.current.find(x => x.id === id)
      if (el && isShape(el) && !el.locked) return id
    }
    const h = hoverShapeRef.current
    return h && elsRef.current.some(x => x.id === h && !x.locked) ? h : null
  }

  // Tracks the hovered shape; it stays "hovered" while the mouse is still
  // within reach of its arrows, so they can actually be clicked.
  function updateHoverShape(pos: Pt) {
    const prev = hoverShapeRef.current
    const hit = hitAt(pos, 'select')
    let next: string | null = hit && isShape(hit) && !hit.locked ? hit.id : null
    if (!next && prev) {
      const el = elsRef.current.find(x => x.id === prev)
      const reach = 5 + 30 / scaleRef.current
      if (el && boxContains(normBox(el.x, el.y, el.x2, el.y2), pos, reach)) next = prev
    }
    if (next !== prev) { hoverShapeRef.current = next; render() }
  }

  function updateHoverCursor(pos: Pt) {
    const canvas = canvasRef.current; if (!canvas) return
    updateHoverShape(pos)
    let c = 'default'
    if (spaceRef.current) c = 'grab'
    else {
      const byId = byIdNow()
      const sel = [...selIdsRef.current]
      const el = sel.length === 1 ? byId.get(sel[0]) : undefined
      const hitR = 9 / scaleRef.current
      if (el && !el.locked) {
        const handles = getHandlePoints(el, byId)
        for (const name of Object.keys(handles) as HandleName[]) {
          const hp = handles[name]
          if (hp && Math.hypot(pos.x - hp.x, pos.y - hp.y) <= hitR) { c = HANDLE_CURSORS[name]; break }
        }
      }
      const qt = quickTarget()
      const qEl = qt ? byId.get(qt) : undefined
      if (c === 'default' && qEl && quickArrowPoints(qEl, scaleRef.current).some(q => Math.hypot(pos.x - q.p.x, pos.y - q.p.y) <= 10 / scaleRef.current)) c = 'pointer'
      if (c === 'default') {
        const hit = hitAt(pos, 'select')
        if (hit) c = hit.locked ? 'not-allowed' : 'move'
      }
    }
    if (canvas.style.cursor !== c) canvas.style.cursor = c
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const tool = toolRef.current
    const pos = toCanvas(e.clientX, e.clientY)
    if (tool === 'pen') cursorPtRef.current = pos
    const d = dragRef.current
    if (!d) {
      if (tool === 'pen') renderCursor()
      else if (tool === 'select') updateHoverCursor(pos)
      return
    }
    const noSnap = e.altKey
    const thr = snapThr()

    switch (d.kind) {
      case 'pan':
        panRef.current = { x: d.ox + e.clientX - d.mx, y: d.oy + e.clientY - d.my }
        render(); renderCursor(); return

      case 'move': {
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return
        d.moved = true
        let dx = pos.x - d.start.x, dy = pos.y - d.start.y
        if (!noSnap) {
          const sn = snapBox({ x1: d.box.x1 + dx, y1: d.box.y1 + dy, x2: d.box.x2 + dx, y2: d.box.y2 + dy }, d.lines, thr, snapRef.current)
          dx += sn.dx; dy += sn.dy
          guideRef.current = { gx: sn.gx, gy: sn.gy }
        } else guideRef.current = { gx: null, gy: null }
        elsRef.current = elsRef.current.map(el => { const o = d.origs.get(el.id); return o ? translateEl(o, dx, dy) : el })
        render(); return
      }

      case 'resize': {
        const { id, handle, orig, origBox } = d
        let p = pos
        if (!noSnap) { const sn = snapPoint(pos, d.lines, thr, snapRef.current); p = sn.p; guideRef.current = { gx: sn.gx, gy: sn.gy } }
        let { x1, y1, x2, y2 } = origBox
        if (handle === 'nw' || handle === 'n' || handle === 'ne') y1 = p.y
        if (handle === 'sw' || handle === 's' || handle === 'se') y2 = p.y
        if (handle === 'nw' || handle === 'w' || handle === 'sw') x1 = p.x
        if (handle === 'ne' || handle === 'e' || handle === 'se') x2 = p.x
        const isCorner = handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se'
        if ((e.shiftKey || orig.type === 'text') && isCorner) {
          const ratio = (boxW(origBox) || 1) / (boxH(origBox) || 1)
          const nw = x2 - x1, nh = y2 - y1
          if (Math.abs(nw) > Math.abs(nh) * ratio) {
            const th = Math.sign(nh || 1) * Math.abs(nw) / ratio
            if (handle === 'nw' || handle === 'ne') y1 = y2 - th; else y2 = y1 + th
          } else {
            const tw = Math.sign(nw || 1) * Math.abs(nh) * ratio
            if (handle === 'nw' || handle === 'sw') x1 = x2 - tw; else x2 = x1 + tw
          }
        }
        elsRef.current = elsRef.current.map(el => {
          if (el.id !== id) return el
          if (orig.type === 'text') {
            const k = Math.abs(x2 - x1) / (boxW(origBox) || 1)
            const fs = Math.max(6, Math.round((orig.fontSize ?? 16) * k))
            return refitText({ ...orig, x: Math.min(x1, x2), y: Math.min(y1, y2), fontSize: fs })
          }
          return resizeEl(orig, origBox, orig.type === 'freedraw' ? { x1, y1, x2, y2 } : normBox(x1, y1, x2, y2))
        })
        render(); return
      }

      case 'edgeEnd': {
        const el = elsRef.current.find(x => x.id === d.id); if (!el) return
        const other = d.end === 'start' ? el.endId : el.startId
        const cand = e.ctrlKey || e.metaKey ? null : bindableAt(pos, new Set([el.id, ...(other ? [other] : [])]))
        hoverBindRef.current = cand?.id ?? null
        let p = pos
        if (!cand && !noSnap) { const sn = snapPoint(pos, d.lines, thr, snapRef.current); p = sn.p; guideRef.current = { gx: sn.gx, gy: sn.gy } }
        else guideRef.current = { gx: null, gy: null }
        elsRef.current = elsRef.current.map(x => x.id !== d.id ? x : d.end === 'start'
          ? { ...x, x: p.x, y: p.y, startId: cand?.id }
          : { ...x, x2: p.x, y2: p.y, endId: cand?.id })
        render(); return
      }

      case 'marquee': {
        d.ex = pos.x; d.ey = pos.y
        if (!d.active && Math.hypot(d.ex - d.sx, d.ey - d.sy) > 4 / scaleRef.current) d.active = true
        if (d.active) {
          const area = normBox(d.sx, d.sy, d.ex, d.ey)
          const byId = byIdNow()
          const hits = elsRef.current.filter(el => el.type !== 'fill' && !el.locked && boxesIntersect(elBox(el, byId), area)).map(el => el.id)
          const next = withGroups(d.additive ? [...new Set([...d.origSel, ...hits])] : hits)
          setSelection(next)
        }
        render(); return
      }

      case 'quick': {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return
        const src = elsRef.current.find(x => x.id === d.shapeId)
        if (!src) { dragRef.current = null; return }
        curRef.current = newEdge(src.id, boxCenter(normBox(src.x, src.y, src.x2, src.y2)), pos, src)
        dragRef.current = { kind: 'draw', start: pos, lines: snapLines(new Set()) }
        render(); return
      }

      case 'erase':
        eraseAt(pos); return

      case 'draw': {
        const el = curRef.current; if (!el) return
        if (el.type === 'freedraw') {
          el.points = [...(el.points ?? []), pos]
          el.x = Math.min(el.x, pos.x); el.y = Math.min(el.y, pos.y)
          el.x2 = Math.max(el.x2, pos.x); el.y2 = Math.max(el.y2, pos.y)
        } else if (isEdge(el)) {
          const cand = e.ctrlKey || e.metaKey ? null : bindableAt(pos, new Set(el.startId ? [el.startId] : []))
          hoverBindRef.current = cand?.id ?? null
          el.endId = cand?.id
          let p = pos
          if (!cand) {
            if (e.shiftKey && !el.startId) {
              const dx = pos.x - el.x, dy = pos.y - el.y
              const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
              const dist = Math.hypot(dx, dy)
              p = { x: el.x + dist * Math.cos(a), y: el.y + dist * Math.sin(a) }
              guideRef.current = { gx: null, gy: null }
            } else if (!noSnap) {
              const sn = snapPoint(pos, d.lines, thr, snapRef.current); p = sn.p; guideRef.current = { gx: sn.gx, gy: sn.gy }
            }
          } else guideRef.current = { gx: null, gy: null }
          el.x2 = p.x; el.y2 = p.y
        } else {
          let p = pos
          if (!noSnap) { const sn = snapPoint(pos, d.lines, thr, snapRef.current); p = sn.p; guideRef.current = { gx: sn.gx, gy: sn.gy } }
          if (e.shiftKey || d.preset?.aspect) {
            const dx = p.x - el.x, dy = p.y - el.y
            const m = Math.max(Math.abs(dx), Math.abs(dy))
            p = { x: el.x + Math.sign(dx || 1) * m, y: el.y + Math.sign(dy || 1) * m }
          }
          el.x2 = p.x; el.y2 = p.y
        }
        render(); renderCursor(); return
      }
    }
  }

  function onMouseUp() {
    const d = dragRef.current
    dragRef.current = null
    guideRef.current = { gx: null, gy: null }
    hoverBindRef.current = null
    if (!d) return
    switch (d.kind) {
      case 'pan': saveView(); return
      case 'move': if (d.moved) { pushHist(elsRef.current); save() } render(); return
      case 'resize': case 'edgeEnd': {
        if (d.kind === 'edgeEnd') {
          // A line can't start and end on the same shape.
          elsRef.current = elsRef.current.map(x => x.id === d.id && x.startId && x.startId === x.endId ? { ...x, endId: undefined } : x)
        }
        pushHist(elsRef.current); save(); render(); return
      }
      case 'marquee': render(); return
      case 'quick': cloneAndConnect(d.shapeId, d.dir); return
      case 'erase': if (d.changed) { pushHist(elsRef.current); save() } return
      case 'draw': {
        const el = curRef.current
        curRef.current = null
        if (!el) { render(); return }
        let ok = false
        let add = el
        if (el.type === 'freedraw') ok = (el.points?.length ?? 0) > 1
        else if (isEdge(el)) {
          if (el.endId && el.endId === el.startId) add = { ...el, endId: undefined }
          ok = !!add.endId || Math.hypot(el.x2 - el.x, el.y2 - el.y) > 4 / scaleRef.current
        } else {
          ok = true
          if (Math.abs(el.x2 - el.x) < 3 && Math.abs(el.y2 - el.y) < 3) {
            // A plain click places the shape at its library default size.
            const p = d.preset ?? SHAPE_LIBRARY[0]
            let x = d.start.x - p.w / 2, y = d.start.y - p.h / 2
            if (snapRef.current) { x = snapToGrid(x); y = snapToGrid(y) }
            add = { ...el, x, y, x2: x + p.w, y2: y + p.h }
          }
        }
        if (ok) {
          commit([...elsRef.current, add])
          // Like draw.io: a placed shape/line is selected right away, so it
          // can be labelled by just typing (or styled in the panel).
          if (add.type !== 'freedraw') { setTool('select'); setSelection([add.id]) }
        } else render()
        return
      }
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (toolRef.current !== 'select') return
    const pos = toCanvas(e.clientX, e.clientY)
    const hit = hitAt(pos, 'select')
    if (hit) {
      if (hit.type === 'text' || isShape(hit) || isEdge(hit)) { setSelection([hit.id]); openEditor(hit) }
    } else openEditor(null, pos)
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.stopPropagation()   // keep scroll/zoom inside the widget, don't pan the board
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const mx = (e.clientX - r.left) * (viewRef.current.w / r.width), my = (e.clientY - r.top) * (viewRef.current.h / r.height)
    if (e.ctrlKey || e.metaKey) {
      zoomAt(scaleRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), mx, my)
    } else {
      panRef.current = { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY }
      render(); renderCursor(); saveView()
    }
    if (editorRef.current) setRev(r => r + 1)
  }

  function onContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (editorRef.current) commitEditor()
    if (toolRef.current !== 'select') setTool('select')
    const pos = toCanvas(e.clientX, e.clientY)
    const hit = hitAt(pos, 'select')
    if (hit && !selIdsRef.current.has(hit.id)) setSelection(withGroups([hit.id]))
    else if (!hit) setSelection([])
    setCtxMenu({ x: e.clientX, y: e.clientY, hasTarget: !!hit })
    render()
  }

  // ── Keyboard (only while the drawboard has focus) ─────────────────────────

  function editableSingle(): DrawElement | null {
    if (selIdsRef.current.size !== 1) return null
    const el = elsRef.current.find(x => selIdsRef.current.has(x.id))
    return el && !el.locked && (isShape(el) || isEdge(el) || el.type === 'text') ? el : null
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!isEditRef.current) return
    const target = e.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    const hasSel = selIdsRef.current.size > 0
    let handled = true
    if (mod && k === 'z' && !e.shiftKey) undo()
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) redo()
    else if (mod && k === 'a') { setTool('select'); selectAll() }
    else if (mod && k === 'c') copySelection()
    else if (mod && k === 'x') cutSelection()
    else if (mod && k === 'v') pasteClipboard()
    else if (mod && k === 'd') duplicateSelection()
    else if (mod && e.shiftKey && (k === 'g' || k === 'u')) ungroupSelection()
    else if (mod && k === 'g') groupSelection()
    else if (mod && k === 'l') toggleLock()
    else if (mod && e.shiftKey && k === 'f') reorderSelection('front')
    else if (mod && e.shiftKey && k === 'b') reorderSelection('back')
    else if (mod && k === '0') resetZoom()
    else if (e.shiftKey && e.code === 'Digit1') zoomToFit()
    else if ((e.key === 'Delete' || e.key === 'Backspace') && hasSel) deleteSelection(mod)
    else if (e.key.startsWith('Arrow') && hasSel) {
      const step = e.shiftKey ? GRID : 1
      nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
    }
    else if ((e.key === 'Enter' || e.key === 'F2') && selIdsRef.current.size === 1) {
      const el = elsRef.current.find(x => selIdsRef.current.has(x.id))
      if (el && (el.type === 'text' || isShape(el) || isEdge(el))) openEditor(el)
    }
    else if (e.key === 'Escape') {
      if (hasSel) setSelection([])
      else if (toolRef.current !== 'select') setTool('select')
      else handled = false
    }
    else if (e.key === ' ') {
      if (!spaceRef.current) { spaceRef.current = true; if (canvasRef.current) canvasRef.current.style.cursor = 'grab' }
    }
    else if (!mod && !e.altKey && e.key.length === 1 && editableSingle()) {
      openEditor(editableSingle()!, undefined, e.key)
    }
    else if (!mod && !e.altKey && TOOL_KEYS[k]) {
      const tk = TOOL_KEYS[k]
      setTool(tk.tool)
      if (tk.shape) setShapeKind(tk.shape)
      if (tk.tool !== 'select') setSelection([])
    }
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation(); render() }
  }
  function onKeyUp(e: React.KeyboardEvent) {
    if (e.key === ' ') {
      spaceRef.current = false
      if (canvasRef.current) canvasRef.current.style.cursor = ''
    }
  }

  // Deactivate wheel capture when clicking outside the widget.
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) isWidgetActiveRef.current = false
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])
  // Block wheel events from reaching the board while the widget is active.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const onNativeWheel = (e: WheelEvent) => { if (isWidgetActiveRef.current) e.stopPropagation() }
    canvas.addEventListener('wheel', onNativeWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onNativeWheel)
  }, [])
  // Close the context menu on an outside click or Escape.
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [ctxMenu])

  // ── Export ────────────────────────────────────────────────────────────────

  function exportPng() {
    const b = contentBounds()
    if (!b) { const c = canvasRef.current; if (c) download(c.toDataURL('image/png'), `${t('drawing')}.png`); return }
    const pad = 24
    const w = boxW(b) + pad * 2, h = boxH(b) + pad * 2
    const k = Math.min(2, 8192 / Math.max(w, h))
    const out = document.createElement('canvas')
    out.width = Math.ceil(w * k); out.height = Math.ceil(h * k)
    const ctx = out.getContext('2d')!
    ctx.fillStyle = CANVAS_COLOR[canvasBgRef.current]
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.scale(k, k)
    ctx.translate(pad - b.x1, pad - b.y1)
    paintElements(ctx, elsRef.current, byIdNow(), k, null)
    download(out.toDataURL('image/png'), `${t('drawing')}.png`)
  }

  function exportSvg() {
    const b = contentBounds() ?? { x1: 0, y1: 0, x2: 400, y2: 300 }
    const pad = 24
    const svg = buildSvg(elsRef.current, byIdNow(), { x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad }, CANVAS_COLOR[canvasBgRef.current], canvasBgRef.current === 'dark')
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    download(url, `${t('drawing')}.svg`)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function clearAll() {
    curRef.current = null
    setSelection([])
    commit([])
  }

  // ── Derived UI data ───────────────────────────────────────────────────────

  void rev
  const selectedEls = elsRef.current.filter(el => selectedIds.includes(el.id))
  const activePreset = SHAPE_LIBRARY.find(p => p.id === shapeKind) ?? SHAPE_LIBRARY[0]
  const kinds: Kinds = selectedEls.length
    ? {
        shape: selectedEls.some(isShape), edge: selectedEls.some(isEdge), free: selectedEls.some(el => el.type === 'freedraw'),
        text: selectedEls.some(el => el.type === 'text'), rect: selectedEls.some(el => el.type === 'rect'),
      }
    : tool === 'shape' ? { shape: true, edge: false, free: false, text: false, rect: activePreset.type === 'rect' }
    : tool === 'line' || tool === 'arrow' ? { shape: false, edge: true, free: false, text: false, rect: false }
    : tool === 'pen' ? { shape: false, edge: false, free: true, text: false, rect: false }
    : tool === 'text' ? { shape: false, edge: false, free: false, text: true, rect: false }
    : { shape: true, edge: true, free: true, text: true, rect: true }
  const singleSel = selectedEls.length === 1 ? selectedEls[0] : null
  const unitCount = selectedEls.length ? new Set(selectedEls.filter(el => !(isEdge(el) && el.startId && el.endId)).map(el => el.groupId ?? el.id)).size : 0
  const allLocked = selectedEls.length > 0 && selectedEls.every(el => el.locked)
  const canGroup = selectedEls.filter(el => !el.locked).length >= 2 && new Set(selectedEls.map(el => el.groupId ?? `_${el.id}`)).size > 1
  const canUngroup = selectedEls.some(el => el.groupId && !el.locked)
  const canEditText = !!singleSel && !singleSel.locked && singleSel.type !== 'freedraw'
  const cursor = tool === 'pen' ? 'none' : tool === 'select' ? 'default' : tool === 'hand' ? 'grab' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair'
  const togglePop = (p: NonNullable<typeof popover>) => setPopover(cur => cur === p ? null : p)

  const typeLabel = (el: DrawElement) =>
    el.type === 'freedraw' ? 'Freehand' : el.type === 'text' ? 'Text' : el.type === 'line' ? 'Line' : el.type === 'arrow' ? 'Arrow'
      : SHAPE_LIBRARY.find(p => p.type === el.type && (el.type !== 'rect' || !!p.round === !!el.roundCorners))?.label ?? 'Shape'
  const subject = selectedEls.length === 1 ? t(typeLabel(selectedEls[0]))
    : selectedEls.length > 1 ? `${selectedEls.length} ${t('elements')}`
    : tool === 'shape' ? `${t('New shape')}: ${t(activePreset.label)}`
    : tool === 'line' ? t('New line') : tool === 'arrow' ? t('New arrow')
    : tool === 'pen' ? `${t('Pen')}: ${t(BRUSH_DEFS.find(b => b.id === brushType)?.label ?? 'Pen')}`
    : tool === 'text' ? t('New text') : t('Defaults for new elements')
  const contentEl = canEditText ? singleSel : null

  // Live text editing from the panel: repaint per keystroke, one undo step
  // when the field loses focus.
  function setContent(v: string) {
    const el = contentEl; if (!el) return
    elsRef.current = elsRef.current.map(x => x.id !== el.id ? x : x.type === 'text' ? refitText({ ...x, text: v }) : { ...x, label: v || undefined })
    setRev(r => r + 1); render()
  }
  function commitContent() { pushHist(elsRef.current); save() }

  // Picking what to draw opens the properties once per session (that's
  // where its colors/fill live) — but never against an explicit close.
  const panelRevealedRef = useRef(false)
  function revealPanel() {
    if (panelRevealedRef.current) return
    panelRevealedRef.current = true
    setFormatOpen(true)
  }

  // ── Popover contents ──────────────────────────────────────────────────────

  const penPanel = (
    <div style={{ ...POPOVER, width: 220 }} onPointerDown={e => e.stopPropagation()}>
      <div style={POP_LABEL}>{t('Brush type')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {BRUSH_DEFS.map(b => (
          <button key={b.id} type="button"
            onClick={() => {
              setBrushType(b.id); setTool('pen')
              const ids = selectedEditable()
              if (ids.size) commit(elsRef.current.map(el => ids.has(el.id) && el.type === 'freedraw' ? { ...el, brushType: b.id } : el))
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: brushType === b.id ? 'var(--accent)' : 'var(--surface2)',
              color: brushType === b.id ? 'var(--on-accent, white)' : 'var(--text2)',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>{b.preview}</div>
            <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{t(b.label)}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const shapePanel = (
    <div style={{ ...POPOVER, width: 216 }} onPointerDown={e => e.stopPropagation()}>
      <div style={POP_LABEL}>{t('Shapes')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {SHAPE_LIBRARY.map(p => {
          const active = tool === 'shape' && shapeKind === p.id
          return (
            <button key={p.id} type="button" title={t(p.label)}
              onClick={() => { setShapeKind(p.id); setTool('shape'); setSelection([]); if (p.type === 'rect') setRoundCorners(!!p.round); setPopover(null); revealPanel() }}
              style={{
                height: 40, borderRadius: 7, cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 16%, var(--surface2))' : 'var(--surface2)',
                color: active ? 'var(--accent)' : 'var(--text2)',
              }}>
              <ShapePreview id={p.id} />
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{t('Click to place, drag to size. Shift keeps proportions.')}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{t('Colors, fill and line style: Properties panel.')}</div>
    </div>
  )

  const edgePanel = (
    <div style={{ ...POPOVER, width: 216 }} onPointerDown={e => e.stopPropagation()}>
      <div style={POP_LABEL}>{t('Connector')}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['line', 'arrow'] as const).map(k => (
          <button key={k} type="button" onClick={() => { setTool(k); setSelection([]); setPopover(null); revealPanel() }}
            style={{ ...tb(tool === k), flex: 1, width: 'auto', gap: 6, fontSize: 11, fontWeight: 600 }}>
            {k === 'line' ? <IcoLine /> : <IcoArrow />}{t(k === 'line' ? 'Line' : 'Arrow')}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{t('Start or end on a shape to connect it — the line then follows the shape. Hold Ctrl to place it freely.')}</div>
    </div>
  )

  const morePanel = (
    <div style={{ ...POPOVER, padding: 4, gap: 1, minWidth: 180 }} onPointerDown={e => e.stopPropagation()}>
      {([
        { icon: <IcoDownload />, label: 'Export as PNG', fn: exportPng },
        { icon: <IcoDownload />, label: 'Export as SVG', fn: exportSvg },
        { icon: <IcoSelectAll />, label: 'Select all', key: 'Ctrl+A', fn: () => { setTool('select'); selectAll() } },
      ] as { icon: React.ReactNode; label: string; key?: string; fn: () => void }[]).map(item => (
        <button key={item.label} type="button" onClick={() => { item.fn(); setPopover(null) }} style={MENU_ITEM}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
          <span style={{ color: 'var(--text2)', display: 'flex' }}>{item.icon}</span>
          <span style={{ flex: 1 }}>{t(item.label)}</span>
          {item.key && <span style={{ fontSize: 9.5, color: 'var(--text3)' }}>{item.key}</span>}
        </button>
      ))}
      <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
      <button type="button" onClick={() => { clearAll(); setPopover(null) }} style={{ ...MENU_ITEM, color: 'var(--danger, #ef4444)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
        <span style={{ display: 'flex' }}><IcoTrash /></span><span style={{ flex: 1 }}>{t('Clear all')}</span>
      </button>
    </div>
  )

  // ── Text editor overlay ───────────────────────────────────────────────────

  let editorEl: React.ReactNode = null
  if (editor && isEdit) {
    const s = scaleRef.current, pan = panRef.current
    const el = editor.id ? elsRef.current.find(x => x.id === editor.id) : null
    const isText = !el || el.type === 'text'
    const fs = (el?.fontSize ?? (isText ? fontSize : DEFAULT_LABEL_SIZE))
    const fam = FONT_FAMILIES[(el ? el.fontFamily : fontFamily) ?? 'sans']
    const lines = Math.max(1, editorVal.split('\n').length)
    const lineH = fs * LINE_HEIGHT * s
    let left: number, top: number, width: number, align: TextAlign
    if (isText) {
      left = (el?.x ?? editor.x) * s + pan.x
      top = (el?.y ?? editor.y) * s + pan.y
      const font = fontOf(el ?? { fontFamily, bold, italic }, fs)
      width = Math.max(90, Math.max(...editorVal.split('\n').map(l => measureWidth(l + 'W', font, fs))) * s + 10)
      align = el?.textAlign ?? 'left'
    } else {
      const b = isEdge(el) ? edgeLabelBox(el, byIdNow()) : labelBox(el, normBox(el.x, el.y, el.x2, el.y2))
      width = Math.max(80, boxW(b) * s)
      left = (b.x1 + b.x2) / 2 * s + pan.x - width / 2
      top = (b.y1 + b.y2) / 2 * s + pan.y - (lines * lineH) / 2 - 3
      align = el.textAlign ?? 'center'
    }
    editorEl = (
      <textarea
        autoFocus
        data-text-input="true"
        value={editorVal}
        rows={lines}
        placeholder={t(isText ? 'Text…' : 'Label…')}
        onChange={e => { editorValRef.current = e.target.value; setEditorVal(e.target.value) }}
        onBlur={commitEditor}
        onFocus={e => { const v = e.currentTarget.value; e.currentTarget.setSelectionRange(v.length, v.length) }}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditor(); rootRef.current?.focus({ preventScroll: true }) }
          if (e.key === 'Escape') { e.preventDefault(); cancelEditor(); rootRef.current?.focus({ preventScroll: true }) }
        }}
        onPointerDown={e => e.stopPropagation()}
        style={{
          position: 'absolute', left, top, width, height: lines * lineH + 6,
          fontSize: fs * s, lineHeight: LINE_HEIGHT, fontFamily: fam,
          fontWeight: (el ? el.bold : bold) ? 700 : 400, fontStyle: (el ? el.italic : italic) ? 'italic' : 'normal',
          color: el ? (el.type === 'text' ? el.color : (el.fontColor ?? el.color)) : color,
          textAlign: align, background: 'rgba(59,130,246,0.06)', border: 'none', outline: '1.5px dashed #3b82f6',
          borderRadius: 3, padding: '3px 0', margin: 0, resize: 'none', overflow: 'hidden', zIndex: 10, whiteSpace: 'pre',
        }}
      />
    )
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  const sep = <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 1px', flexShrink: 0 }} />

  return (
    <div ref={rootRef} data-widget-content tabIndex={-1}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4, overflow: 'hidden', outline: 'none' }}
      onPointerDown={e => { e.stopPropagation(); isWidgetActiveRef.current = true }}
      onWheel={e => { if (isWidgetActiveRef.current) e.stopPropagation() }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}>

      {isEdit && (
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Properties panel toggle sits above the panel itself (left). */}
          <button type="button" title={t('Properties (colors, text, arrange)')} onClick={() => { panelRevealedRef.current = true; setFormatOpen(o => !o) }} style={tb(formatOpen)}><IcoFormat /></button>
          {sep}
          {/* Navigate */}
          <button type="button" title={`${t('Select')} (V)`} onClick={() => { setTool('select'); render() }} style={tb(tool === 'select')}><IcoSelect /></button>
          <button type="button" title={`${t('Hand (pan)')} (H)`} onClick={() => { setTool('hand'); setSelection([]) }} style={tb(tool === 'hand')}><IcoHand /></button>
          {sep}

          {/* Create */}
          <div ref={penGroupRef} style={{ display: 'flex' }}>
            <button type="button" title={`${t('Freehand')} (P)`} onClick={() => { setTool('pen'); setSelection([]); setPopover(null) }}
              style={{ ...tb(tool === 'pen'), borderRadius: '6px 0 0 6px', borderRight: 'none' }}>
              <IcoPen />
            </button>
            <button type="button" title={t('Brush type')} onClick={() => togglePop('pen')}
              style={{ ...tb(popover === 'pen'), borderRadius: '0 6px 6px 0', width: 14 }}>
              <IcoChevron />
            </button>
            <PortalPopover open={popover === 'pen'} anchorRef={penGroupRef} onClose={() => setPopover(null)}>{penPanel}</PortalPopover>
          </div>
          <div ref={shapeGroupRef}>
            <button type="button" title={`${t('Shapes')} (R, O, D)`} onClick={() => togglePop('shape')}
              style={{ ...tb(tool === 'shape' || popover === 'shape'), gap: 2, width: 'auto', padding: '0 4px 0 2px' }}>
              {tool === 'shape' ? <ShapePreview id={shapeKind} size={22} /> : <IcoShapes />}
              <IcoChevron />
            </button>
            <PortalPopover open={popover === 'shape'} anchorRef={shapeGroupRef} onClose={() => setPopover(null)}>{shapePanel}</PortalPopover>
          </div>
          <div ref={edgeGroupRef}>
            <button type="button" title={`${t('Line / arrow')} (L, A)`} onClick={() => togglePop('edge')}
              style={{ ...tb(tool === 'line' || tool === 'arrow' || popover === 'edge'), gap: 3, width: 'auto', padding: '0 5px' }}>
              {tool === 'line' ? <IcoLine /> : <IcoArrow />}
              <IcoChevron />
            </button>
            <PortalPopover open={popover === 'edge'} anchorRef={edgeGroupRef} onClose={() => setPopover(null)}>{edgePanel}</PortalPopover>
          </div>
          <button type="button" title={`${t('Text')} (T)`} onClick={() => { setTool('text'); setSelection([]) }} style={tb(tool === 'text')}><IcoText /></button>
          {sep}

          {/* Modify */}
          <button type="button" title={`${t('Eraser')} (X)`} onClick={() => { setTool('eraser'); setSelection([]) }} style={tb(tool === 'eraser')}><IcoEraser /></button>
          <button type="button" title={`${t('Fill bucket (fill area with color)')} (B)`} onClick={() => { setTool('fill'); setSelection([]) }} style={tb(tool === 'fill')}><IcoBucket /></button>

          <div style={{ flex: 1, minWidth: 4 }} />

          <button type="button" title={t('Undo (Ctrl+Z)')} onClick={undo} style={BTN}><IcoUndo /></button>
          <button type="button" title={t('Redo (Ctrl+Y)')} onClick={redo} style={BTN}><IcoRedo /></button>
          <div ref={moreGroupRef}>
            <button type="button" title={t('More')} onClick={() => togglePop('more')} style={tb(popover === 'more')}><IcoMore /></button>
            <PortalPopover open={popover === 'more'} anchorRef={moreGroupRef} onClose={() => setPopover(null)}>{morePanel}</PortalPopover>
          </div>
        </div>
      )}

      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 6, border: '1px solid var(--border)' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: isEdit ? cursor : 'default' }}
          onMouseDown={isEdit ? onMouseDown : undefined}
          onMouseMove={isEdit ? onMouseMove : undefined}
          onMouseUp={isEdit ? onMouseUp : undefined}
          onMouseLeave={isEdit ? () => { if (dragRef.current?.kind !== 'pan') onMouseUp(); cursorPtRef.current = null; hoverShapeRef.current = null; renderCursor(); render() } : undefined}
          onDoubleClick={isEdit ? onDoubleClick : undefined}
          onWheel={isEdit ? onWheel : undefined}
          onContextMenu={isEdit ? onContextMenu : undefined}
        />
        <canvas ref={cursorCanvasRef} style={{ display: 'block', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />

        {isEdit && formatOpen && (
          <FormatPanel
            t={t}
            hasSelection={selectedEls.length > 0}
            kinds={kinds}
            style={style}
            setStyle={setStyle}
            commitLive={commitLive}
            diagram={{ canvasBg, snap: snapOn, guides: guidesOn, count: elsRef.current.filter(el => el.type !== 'fill').length }}
            setDiagram={p => {
              if (p.canvasBg) setCanvasBg(p.canvasBg)
              if (p.snap !== undefined) setSnapOn(p.snap)
              if (p.guides !== undefined) setGuidesOn(p.guides)
            }}
            subject={subject}
            content={contentEl ? { value: contentEl.type === 'text' ? contentEl.text ?? '' : contentEl.label ?? '', placeholder: t(contentEl.type === 'text' ? 'Text…' : 'Label…') } : null}
            setContent={setContent}
            commitContent={commitContent}
            arrange={{
              units: unitCount, canGroup, canUngroup, allLocked,
              geometry: singleSel && !isEdge(singleSel) ? normBox(singleSel.x, singleSel.y, singleSel.x2, singleSel.y2) : null,
            }}
            actions={{
              reorder: reorderSelection, align: alignSelection, distribute: distributeSelection,
              group: groupSelection, ungroup: ungroupSelection, toggleLock, duplicate: duplicateSelection,
              remove: () => deleteSelection(), setGeometry,
            }}
          />
        )}

        {isEdit && (
          <div
            style={{
              position: 'absolute', bottom: 8, right: 8, zIndex: 5,
              display: 'flex', alignItems: 'center', gap: 2,
              background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid var(--border)', borderRadius: 9,
              boxShadow: '0 4px 14px rgba(0,0,0,0.22)', padding: '3px 4px',
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            <button type="button" title={t('Zoom out')} onClick={() => zoomBy(1 / 1.15)} style={HUD_BTN}>−</button>
            <button type="button" title={t('Reset zoom (Ctrl+0)')} onClick={resetZoom}
              style={{ ...HUD_BTN, width: 'auto', padding: '0 6px', fontSize: 10.5, fontWeight: 700 }}>
              {zoomPct}%
            </button>
            <button type="button" title={t('Zoom in')} onClick={() => zoomBy(1.15)} style={HUD_BTN}>+</button>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 1px' }} />
            <button type="button" title={t('Zoom to fit (Shift+1)')} onClick={zoomToFit} style={HUD_BTN}><IcoZoomFit /></button>
          </div>
        )}

        {ctxMenu && createPortal(
          <div
            style={{
              position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 50,
              background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid var(--border)', borderRadius: 9, padding: 4,
              boxShadow: '0 8px 28px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 180,
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            {([
              ...(ctxMenu.hasTarget && canEditText ? [{ icon: <IcoEditText />, label: 'Edit text', key: 'Enter', fn: () => singleSel && openEditor(singleSel) }] : []),
              ...(ctxMenu.hasTarget ? [
                { icon: <IcoDuplicate />, label: 'Duplicate', key: 'Ctrl+D', fn: duplicateSelection },
                { icon: <IcoCopy />, label: 'Copy selection', key: 'Ctrl+C', fn: copySelection },
                { icon: <IcoCut />, label: 'Cut', key: 'Ctrl+X', fn: cutSelection },
              ] : []),
              ...(SHARED.clipboard.length ? [{ icon: <IcoPaste />, label: 'Paste', key: 'Ctrl+V', fn: pasteClipboard }] : []),
              ...(!ctxMenu.hasTarget ? [{ icon: <IcoSelectAll />, label: 'Select all', key: 'Ctrl+A', fn: selectAll }] : []),
              ...(ctxMenu.hasTarget ? [
                ...(canGroup ? [{ icon: <IcoGroup />, label: 'Group', key: 'Ctrl+G', fn: groupSelection }] : []),
                ...(canUngroup ? [{ icon: <IcoUngroup />, label: 'Ungroup', key: 'Ctrl+Shift+G', fn: ungroupSelection }] : []),
                { icon: allLocked ? <IcoUnlock /> : <IcoLock />, label: allLocked ? 'Unlock' : 'Lock', key: 'Ctrl+L', fn: toggleLock },
                { icon: <IcoToFront />, label: 'Bring to front', key: 'Ctrl+Shift+F', fn: () => reorderSelection('front') },
                { icon: <IcoToBack />, label: 'Send to back', key: 'Ctrl+Shift+B', fn: () => reorderSelection('back') },
                ...(!allLocked ? [{ icon: <IcoTrash />, label: 'Delete', key: 'Del', fn: () => deleteSelection() }] : []),
              ] : []),
            ] as { icon: React.ReactNode; label: string; key?: string; fn: () => void }[]).map(item => (
              <button key={item.label} type="button" onClick={() => { item.fn(); setCtxMenu(null) }} style={MENU_ITEM}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                <span style={{ color: 'var(--text2)', display: 'flex', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{t(item.label)}</span>
                {item.key && <span style={{ fontSize: 9.5, color: 'var(--text3)' }}>{item.key}</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}

        {editorEl}
      </div>
    </div>
  )
}

// ─── Flood fill ───────────────────────────────────────────────────────────────

// Returns ONLY the newly filled pixels (transparent elsewhere) instead of a
// full canvas snapshot — otherwise everything already drawn would be baked
// into this one fill element, leaving the originals unselectable beneath it.
function applyFloodFill(imageData: ImageData, startX: number, startY: number, fillHex: string): ImageData {
  const { data, width, height } = imageData
  const out = new Uint8ClampedArray(data.length)
  const hex = fillHex.startsWith('#') && fillHex.length >= 7 ? fillHex : '#000000'
  const fr = parseInt(hex.slice(1, 3), 16)
  const fg = parseInt(hex.slice(3, 5), 16)
  const fb = parseInt(hex.slice(5, 7), 16)
  const si = (startY * width + startX) * 4
  const tr = data[si], tg = data[si + 1], tb = data[si + 2], ta = data[si + 3]
  if (tr === fr && tg === fg && tb === fb) return new ImageData(width, height)
  const TOL = 25
  const matches = (pos: number) =>
    Math.abs(data[pos] - tr) + Math.abs(data[pos + 1] - tg) + Math.abs(data[pos + 2] - tb) + Math.abs(data[pos + 3] - ta) <= TOL * 4
  const visited = new Uint8Array(width * height)
  const queue: number[] = [startY * width + startX]
  visited[startY * width + startX] = 1
  let head = 0
  while (head < queue.length) {
    const p = queue[head++]
    const pi = p * 4
    out[pi] = fr; out[pi + 1] = fg; out[pi + 2] = fb; out[pi + 3] = 255
    const x = p % width, y = (p / width) | 0
    if (x > 0 && !visited[p - 1] && matches((p - 1) * 4)) { visited[p - 1] = 1; queue.push(p - 1) }
    if (x < width - 1 && !visited[p + 1] && matches((p + 1) * 4)) { visited[p + 1] = 1; queue.push(p + 1) }
    if (y > 0 && !visited[p - width] && matches((p - width) * 4)) { visited[p - width] = 1; queue.push(p - width) }
    if (y < height - 1 && !visited[p + width] && matches((p + width) * 4)) { visited[p + width] = 1; queue.push(p + width) }
  }
  return new ImageData(out, width, height)
}
