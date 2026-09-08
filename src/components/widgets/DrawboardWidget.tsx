'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { PortalPopover } from '@/components/ui/PortalPopover'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useT } from '@/hooks/useT'
import type { Widget, DrawboardData } from '@/types'
import { uid } from '@/lib/defaults'

// ─── Types ────────────────────────────────────────────────────────────────────

type DrawTool = 'select' | 'pen' | 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'text' | 'eraser' | 'fill'
type CanvasBg = 'white' | 'grid' | 'dark'
type BrushType = 'pen' | 'marker' | 'highlighter' | 'spray' | 'chalk' | 'calligraphy'
type ShapeTool = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow'
const SHAPE_TOOLS: DrawTool[] = ['rect', 'ellipse', 'triangle', 'line', 'arrow']
const BG_CYCLE: CanvasBg[] = ['white', 'grid', 'dark']
const BG_LABELS: Record<CanvasBg, string> = { white: 'White', grid: 'Grid', dark: 'Dark' }

// Typ lebt zentral in types/index.ts (DrawboardData.elements ist damit
// echt typisiert statt unknown[]); hier nur Re-Export + lokales Alias
import type { DrawElement, DrawPoint as Pt } from '@/types'
export type { DrawElement }

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  '#111827','#6b7280','#e5e7eb',
  '#ef4444','#f97316','#eab308',
  '#22c55e','#06b6d4','#3b82f6',
  '#8b5cf6','#ec4899','#ffffff',
]
const MAX_SW = 40

function pctToSw(pct: number) { return Math.max(0.5, (pct / 100) * MAX_SW) }

// ─── SVG Icon components ──────────────────────────────────────────────────────

const I = ({ children, size = 15, strokeWidth = '1.6' }: { children: React.ReactNode; size?: number; strokeWidth?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const IcoSelect   = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2l10 5.5-5 1-2.5 5.5z"/></svg>
const IcoPen      = () => <I><path d="M11 2l3 3-8 8-3.5.5.5-3.5z"/><line x1="9.5" y1="3.5" x2="12.5" y2="6.5"/></I>
const IcoText     = () => <I strokeWidth="1.8"><line x1="2" y1="4" x2="14" y2="4"/><line x1="8" y1="4" x2="8" y2="14"/></I>
const IcoEraser   = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
    <path d="M22 21H7"/><path d="m5 11 8 8"/>
  </svg>
)
const IcoBucket   = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/>
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" fill="currentColor"/>
  </svg>
)
const IcoRect     = () => <I><rect x="2" y="3" width="12" height="10" rx="1"/></I>
const IcoEllipse  = () => <I><ellipse cx="8" cy="8" rx="6" ry="4.5"/></I>
const IcoTriangle = () => <I><polygon points="8,2 15,14 1,14"/></I>
const IcoLine     = () => <I><line x1="2" y1="14" x2="14" y2="2"/></I>
const IcoArrow    = () => <I><line x1="2" y1="14" x2="14" y2="2"/><path d="M14 2l-4.5 1.5 3 3z" fill="currentColor" stroke="none"/></I>
const IcoUndo     = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
)
const IcoRedo     = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
)
const IcoTrash    = () => <I><polyline points="3,5 13,5"/><path d="M5 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><rect x="4" y="5" width="8" height="9" rx="1"/></I>
const IcoDownload = () => <I><line x1="8" y1="2" x2="8" y2="11"/><polyline points="5,8 8,11 11,8"/><polyline points="2,13 2,14 14,14 14,13"/></I>
const IcoGrid = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    {([3.5, 8, 12.5] as const).map(x => <line key={`v${x}`} x1={x} y1="1.5" x2={x} y2="14.5"/>)}
    {([3.5, 8, 12.5] as const).map(y => <line key={`h${y}`} x1="1.5" y1={y} x2="14.5" y2={y}/>)}
  </svg>
)
const IcoShapes   = () => <I strokeWidth="1.4"><rect x="2" y="3" width="5" height="5" rx="0.5"/><ellipse cx="11.5" cy="5.5" rx="2.5" ry="2"/><line x1="2" y1="12" x2="7" y2="12"/><path d="M9 14l2.5-4 2.5 4z"/></I>

// Fill-style previews
const IcoFillSolid      = () => <I strokeWidth="1.3"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity="0.35"/></I>
const HACHURE_LINES: [number, number, number, number][] = [
  [2.5, 6, 6, 2.5], [2.5, 9.5, 9.5, 2.5], [2.5, 13, 13, 2.5], [6, 13.5, 13.5, 6], [9.5, 13.5, 13.5, 9.5],
]
const IcoFillHachure    = () => (
  <I strokeWidth="0.9"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/>
    {HACHURE_LINES.map(([x1,y1,x2,y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>)}
  </I>
)
const IcoFillCrossHatch = () => (
  <I strokeWidth="0.9"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/>
    {HACHURE_LINES.map(([x1,y1,x2,y2], i) => <line key={`a${i}`} x1={x1} y1={y1} x2={x2} y2={y2}/>)}
    {HACHURE_LINES.map(([x1,y1,x2,y2], i) => <line key={`b${i}`} x1={16-x1} y1={y1} x2={16-x2} y2={y2}/>)}
  </I>
)
// Stroke-style previews
const IcoStrokeSolid  = () => <I strokeWidth="1.8"><line x1="2" y1="8" x2="14" y2="8"/></I>
const IcoStrokeDashed = () => <I strokeWidth="1.8"><line x1="2" y1="8" x2="14" y2="8" strokeDasharray="3.5 2.5"/></I>
const IcoStrokeDotted = () => <I strokeWidth="1.8"><line x1="2" y1="8" x2="14" y2="8" strokeDasharray="0.5 2.5" strokeLinecap="round"/></I>
const IcoRoundCorner  = () => <I strokeWidth="1.5"><path d="M2 8V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8"/></I>
// Layer ordering
const IcoToFront  = () => <I strokeWidth="1.3"><rect x="2" y="5" width="7" height="7" rx="1" opacity="0.4"/><rect x="6" y="2" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M9 2V.8M9 .8l-1.4 1.4M9 .8l1.4 1.4" strokeWidth="1.1"/></I>
const IcoToBack   = () => <I strokeWidth="1.3"><rect x="6" y="2" width="8" height="8" rx="1" opacity="0.4"/><rect x="2" y="5" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M5.5 14v1.2M5.5 15.2l-1.4-1.4M5.5 15.2l1.4-1.4" strokeWidth="1.1"/></I>
const IcoForward  = () => <I strokeWidth="1.3"><rect x="2" y="5" width="7" height="7" rx="1" opacity="0.4"/><rect x="6" y="2" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M9 3.5l1.6-1.6M10.6 1.9v1.6M10.6 1.9H9" strokeWidth="1.1"/></I>
const IcoBackward = () => <I strokeWidth="1.3"><rect x="6" y="2" width="8" height="8" rx="1" opacity="0.4"/><rect x="2" y="5" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M6.5 12.5l-1.6 1.6M4.9 14.1v-1.6M4.9 14.1h1.6" strokeWidth="1.1"/></I>
const IcoZoomFit  = () => (
  <I strokeWidth="1.5"><path d="M2 5V3a1 1 0 0 1 1-1h2"/><path d="M14 5V3a1 1 0 0 0-1-1h-2"/><path d="M2 11v2a1 1 0 0 0 1 1h2"/><path d="M14 11v2a1 1 0 0 1-1 1h-2"/><rect x="5" y="5" width="6" height="6" rx="0.5"/></I>
)
const IcoCopy     = () => <I strokeWidth="1.4"><rect x="5" y="5" width="8" height="9" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h7"/></I>
const IcoPaste    = () => <I strokeWidth="1.4"><rect x="3" y="4" width="10" height="10" rx="1"/><path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/></I>
const IcoDuplicate = () => <I strokeWidth="1.4"><rect x="2" y="2" width="8" height="8" rx="1"/><path d="M6 10v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2"/></I>

const PV = ({ children, fill = 'none', stroke = 'currentColor' }: { children: React.ReactNode; fill?: string; stroke?: string }) => (
  <svg viewBox="0 0 90 22" fill={fill} stroke={stroke} style={{ width: '100%', height: 22, display: 'block' }} preserveAspectRatio="none">
    {children}
  </svg>
)

const BRUSH_DEFS: { id: BrushType | string; label: string; preview: React.ReactNode }[] = [
  { id: 'pen', label: 'Pen',
    preview: <PV><path d="M4 16 Q22 5 45 11 Q68 17 86 6" strokeWidth="1.6" strokeLinecap="round" fill="none"/></PV> },
  { id: 'marker', label: 'Marker',
    preview: <PV><path d="M4 16 Q22 5 45 11 Q68 17 86 6" strokeWidth="7" strokeLinecap="round" strokeOpacity="0.55" fill="none"/></PV> },
  { id: 'highlighter', label: 'Highlighter',
    preview: <PV><path d="M4 11 Q45 9 86 11" strokeWidth="15" strokeLinecap="square" strokeOpacity="0.3" fill="none"/></PV> },
  { id: 'spray', label: 'Spray',
    preview: <PV fill="currentColor" stroke="none"><g>{([
      [13,9,1.1],[16,7,0.8],[20,6,0.9],[22,9,1.0],[18,13,0.8],[14,12,0.7],[21,14,0.9],
      [28,8,0.7],[32,14,0.8],[37,7,0.7],
      [40,9,1.1],[43,7,0.9],[47,6,0.8],[50,9,1.0],[46,14,0.9],[41,14,0.7],[51,13,0.8],
      [58,8,0.7],[62,14,0.8],
      [66,9,1.1],[69,7,0.9],[73,6,0.8],[76,9,1.0],[72,14,0.9],[67,13,0.7],[77,14,0.8],
    ] as [number,number,number][]).map(([cx,cy,r],i)=><circle key={i} cx={cx} cy={cy} r={r}/>)}</g></PV> },
  { id: 'chalk', label: 'Chalk',
    preview: <PV><path d="M4 15 Q18 9 30 12 Q44 16 58 8 Q70 3 86 9" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 2" fill="none"/><path d="M5 16 Q19 10 31 13 Q45 17 59 9 Q71 4 87 10" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="2 3" strokeOpacity="0.5" fill="none"/></PV> },
  { id: 'calligraphy', label: 'Calligraphy',
    preview: <PV fill="currentColor" stroke="none">
      {/* S-wave: thin NE going up-right → thick SE going down-right */}
      <path d="M 5 15 Q 24 5 45 1 Q 66 4 82 13 L 86 22 Q 66 13 45 9 Q 23 20 4 19 Z"/>
    </PV> },
]

function srand(s: number) { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x) }

const SHAPE_ICONS: Record<ShapeTool, React.ReactNode> = {
  rect: <IcoRect />, ellipse: <IcoEllipse />, triangle: <IcoTriangle />, line: <IcoLine />, arrow: <IcoArrow />,
}
const SHAPE_LABELS: Record<ShapeTool, string> = {
  rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', line: 'Line', arrow: 'Arrow',
}
const STROKE_STYLE_LABELS = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' } as const
const FILL_STYLE_LABELS   = { hachure: 'Hachure', 'cross-hatch': 'Cross-hatch', solid: 'Solid' } as const

// ─── Canvas rendering ─────────────────────────────────────────────────────────

// Named resize-handle points around an element's (padded) bbox — shared by
// renderEl (drawing them) and onMouseDown (hit-testing them), so the two can
// never drift apart.
// 'start'/'end' are only used for line/arrow — those have two meaningful
// points (their literal endpoints, one of them the arrowhead), not a bbox,
// so they get 2 draggable handles instead of the usual 8.
type HandleName = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'start' | 'end'
const HANDLE_PAD = 5
function getHandlePoints(el: DrawElement, pad = HANDLE_PAD): Partial<Record<HandleName, Pt>> {
  if (el.type === 'line' || el.type === 'arrow') {
    return { start: { x: el.x, y: el.y }, end: { x: el.x2, y: el.y2 } }
  }
  const x1 = Math.min(el.x, el.x2) - pad, y1 = Math.min(el.y, el.y2) - pad
  const x2 = Math.max(el.x, el.x2) + pad, y2 = Math.max(el.y, el.y2) + pad
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  return {
    nw: { x: x1, y: y1 }, n: { x: mx, y: y1 }, ne: { x: x2, y: y1 },
    w:  { x: x1, y: my },                       e:  { x: x2, y: my },
    sw: { x: x1, y: y2 }, s: { x: mx, y: y2 }, se: { x: x2, y: y2 },
  }
}

function applyStrokeDash(ctx: CanvasRenderingContext2D, el: DrawElement) {
  if (el.strokeStyle === 'dashed') ctx.setLineDash([el.strokeWidth * 2.5 + 5, el.strokeWidth * 1.8 + 3])
  else if (el.strokeStyle === 'dotted') { ctx.setLineDash([0.1, el.strokeWidth * 1.8 + 4]); ctx.lineCap = 'round' }
  else ctx.setLineDash([])
}

// Fills the CURRENT path. 'solid'/undefined keeps this file's original look
// (translucent stroke-color fill when no explicit style was ever set, so
// old boards render pixel-identical); 'hachure'/'cross-hatch' clip to the
// path and stroke parallel diagonal lines across it — Excalidraw's
// signature hand-drawn fill look.
function applyFill(ctx: CanvasRenderingContext2D, el: DrawElement, x1: number, y1: number, x2: number, y2: number) {
  const style = el.fillStyle
  const bg = el.bgColor ?? el.color
  if (!style || style === 'solid') {
    ctx.fillStyle = style === 'solid' ? bg : el.color + '33'
    ctx.fill()
    return
  }
  // Path2D so this clip doesn't depend on whatever the caller's "current
  // path" happens to be at call time (beginPath/moveTo/lineTo etc. are NOT
  // part of the save/restore-managed state, unlike clip/style/transform).
  const clipPath = new Path2D()
  clipPath.rect(x1, y1, x2 - x1, y2 - y1)
  ctx.save()
  ctx.clip(clipPath)
  ctx.strokeStyle = bg
  ctx.lineWidth = Math.max(1, el.strokeWidth * 0.35)
  ctx.setLineDash([])
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  const diag = Math.hypot(x2 - x1, y2 - y1) || 1
  const spacing = 6
  const drawAngle = (angle: number) => {
    const cos = Math.cos(angle), sin = Math.sin(angle)
    ctx.beginPath()
    for (let o = -diag; o <= diag; o += spacing) {
      const px = cx - sin * o, py = cy + cos * o
      ctx.moveTo(px - cos * diag, py - sin * diag)
      ctx.lineTo(px + cos * diag, py + sin * diag)
    }
    ctx.stroke()
  }
  drawAngle(Math.PI / 4)
  if (style === 'cross-hatch') drawAngle(-Math.PI / 4)
  ctx.restore()
}

function renderEl(ctx: CanvasRenderingContext2D, el: DrawElement, selected: boolean, scale = 1, showHandles = false) {
  ctx.save()
  ctx.globalAlpha = (el.opacity ?? 100) / 100
  ctx.strokeStyle = el.color
  ctx.fillStyle   = el.color + '33'
  ctx.lineWidth   = el.strokeWidth
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  applyStrokeDash(ctx, el)

  switch (el.type) {
    case 'freedraw': {
      const pts = el.points ?? []
      if (pts.length < 1) break
      const bt = el.brushType ?? 'pen'
      if (bt.startsWith('custom-')) break  // handled separately in render()

      const drawBezier = () => {
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2
          const my = (pts[i].y + pts[i + 1].y) / 2
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
        }
        if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
      }

      if (bt === 'spray') {
        ctx.fillStyle = el.color
        const r = Math.max(4, el.strokeWidth * 5)
        const dotR = Math.max(0.4, el.strokeWidth * 0.35)
        for (let pi = 0; pi < pts.length; pi++) {
          const pt = pts[pi]
          for (let i = 0; i < 14; i++) {
            const seed = pi * 200 + i
            const angle = srand(seed) * Math.PI * 2
            const dist  = srand(seed + 100) * r
            ctx.beginPath()
            ctx.arc(pt.x + Math.cos(angle) * dist, pt.y + Math.sin(angle) * dist, dotR, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      } else if (bt === 'marker') {
        ctx.globalAlpha *= 0.5
        ctx.lineWidth  *= 3
        drawBezier(); ctx.stroke()
      } else if (bt === 'highlighter') {
        ctx.globalAlpha *= 0.22
        ctx.lineWidth  *= 9
        ctx.lineCap = 'square'
        drawBezier(); ctx.stroke()
      } else if (bt === 'chalk') {
        const baseAlpha = ctx.globalAlpha
        for (let pass = 0; pass < 3; pass++) {
          ctx.globalAlpha = baseAlpha * (0.25 + srand(pass * 7 + pts.length) * 0.35)
          ctx.lineWidth   = el.strokeWidth * (0.8 + srand(pass * 13) * 0.5)
          ctx.beginPath()
          ctx.moveTo(pts[0].x + (srand(pass * 31) - 0.5) * 2, pts[0].y + (srand(pass * 37) - 0.5) * 2)
          for (let i = 1; i < pts.length - 1; i++) {
            const jx = (srand(pass * 50 + i) - 0.5) * 2.5
            const jy = (srand(pass * 70 + i) - 0.5) * 2.5
            const mx = (pts[i].x + pts[i + 1].x) / 2 + jx
            const my = (pts[i].y + pts[i + 1].y) / 2 + jy
            ctx.quadraticCurveTo(pts[i].x + jx, pts[i].y + jy, mx, my)
          }
          if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
          ctx.stroke()
        }
      } else if (bt === 'calligraphy') {
        ctx.fillStyle = el.color
        const nibAngle = Math.PI / 4
        if (pts.length < 2) break

        // Layer 1: pre-smooth raw mouse points (2 passes of weighted 3-pt average)
        let spts = pts as { x: number; y: number }[]
        for (let pass = 0; pass < 2; pass++) {
          spts = spts.map((p, i) =>
            i === 0 || i === spts.length - 1 ? p
              : { x: (spts[i-1].x + p.x * 2 + spts[i+1].x) / 4, y: (spts[i-1].y + p.y * 2 + spts[i+1].y) / 4 }
          )
        }

        // Layer 2: adaptive EMA on direction with lower alpha cap (never respond too fast)
        const lx: number[] = [], ly: number[] = [], rx: number[] = [], ry: number[] = []
        let avgDx = spts[1].x - spts[0].x || 1
        let avgDy = spts[1].y - spts[0].y || 0
        let prevW  = el.strokeWidth * 0.7
        for (let i = 0; i < spts.length; i++) {
          const rdx  = i > 0 ? spts[i].x - spts[i-1].x : avgDx
          const rdy  = i > 0 ? spts[i].y - spts[i-1].y : avgDy
          const dist = Math.hypot(rdx, rdy)
          const a = Math.min(0.45, Math.max(0.03, dist / 15))
          avgDx = a * rdx + (1 - a) * avgDx
          avgDy = a * rdy + (1 - a) * avgDy
          const len = Math.hypot(avgDx, avgDy)
          if (len < 1e-9) {
            lx.push(spts[i].x); ly.push(spts[i].y)
            rx.push(spts[i].x); ry.push(spts[i].y)
            continue
          }
          const dir  = Math.atan2(avgDy, avgDx)
          // Deutlich feinere Feder: schmale Grundbreite, dünne Haarlinien quer zur Federrichtung
          const rawW = Math.max(0.15, el.strokeWidth * Math.abs(Math.cos(dir - nibAngle)) * 1.4 + 0.15)
          prevW = 0.10 * rawW + 0.90 * prevW
          const perp = dir + Math.PI / 2
          const cp = Math.cos(perp), sp = Math.sin(perp)
          lx.push(spts[i].x + cp * prevW); ly.push(spts[i].y + sp * prevW)
          rx.push(spts[i].x - cp * prevW); ry.push(spts[i].y - sp * prevW)
        }

        // Layer 3: post-smooth the outline arrays to remove residual jitter
        const smArr = (a: number[]) =>
          a.map((v, i) => i === 0 || i === a.length - 1 ? v : (a[i-1] + v * 2 + a[i+1]) / 4)
        const slx = smArr(lx), sly = smArr(ly), srx = smArr(rx), sry = smArr(ry)

        if (slx.length < 2) break
        ctx.beginPath()
        ctx.moveTo(slx[0], sly[0])
        for (let i = 1; i < slx.length - 1; i++) {
          const mx = (slx[i] + slx[i+1]) / 2, my = (sly[i] + sly[i+1]) / 2
          ctx.quadraticCurveTo(slx[i], sly[i], mx, my)
        }
        ctx.lineTo(slx[slx.length-1], sly[sly.length-1])
        for (let i = srx.length - 1; i >= 1; i--) {
          const mx = (srx[i] + srx[i-1]) / 2, my = (sry[i] + sry[i-1]) / 2
          ctx.quadraticCurveTo(srx[i], sry[i], mx, my)
        }
        ctx.lineTo(srx[0], sry[0])
        ctx.closePath(); ctx.fill()
      } else {
        drawBezier(); ctx.stroke()
      }
      break
    }
    case 'rect': {
      const x = Math.min(el.x, el.x2), y = Math.min(el.y, el.y2)
      const w = Math.abs(el.x2 - el.x), h = Math.abs(el.y2 - el.y)
      const buildPath = () => {
        ctx.beginPath()
        if (el.roundCorners) ctx.roundRect(x, y, w, h, Math.min(Math.min(w, h) * 0.12 + 2, w / 2, h / 2))
        else ctx.rect(x, y, w, h)
      }
      buildPath()
      if (el.filled) applyFill(ctx, el, x, y, x + w, y + h)
      // applyFill's hachure/cross-hatch branch calls ctx.beginPath() itself
      // (repeatedly, for each hachure line) — beginPath/moveTo/lineTo are
      // NOT saved/restored by ctx.save()/restore() (only clip/style/transform
      // are), so the shape's own path here would otherwise still be
      // whatever hachure line was drawn LAST, making this stroke() re-trace
      // that instead of the rect — rebuild it explicitly first.
      buildPath()
      applyStrokeDash(ctx, el)
      ctx.stroke()
      break
    }
    case 'ellipse': {
      const cx = (el.x + el.x2) / 2, cy = (el.y + el.y2) / 2
      const rx = Math.abs(el.x2 - el.x) / 2, ry = Math.abs(el.y2 - el.y) / 2
      if (rx < 1 || ry < 1) break
      const buildPath = () => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2) }
      buildPath()
      if (el.filled) applyFill(ctx, el, cx - rx, cy - ry, cx + rx, cy + ry)
      buildPath()   // s. rect case above for why this must be rebuilt
      applyStrokeDash(ctx, el)
      ctx.stroke()
      break
    }
    case 'triangle': {
      const x1 = Math.min(el.x, el.x2), y1 = Math.min(el.y, el.y2)
      const x2 = Math.max(el.x, el.x2), y2 = Math.max(el.y, el.y2)
      const buildPath = () => {
        ctx.beginPath()
        ctx.moveTo((x1 + x2) / 2, y1)
        ctx.lineTo(x2, y2)
        ctx.lineTo(x1, y2)
        ctx.closePath()
      }
      buildPath()
      if (el.filled) applyFill(ctx, el, x1, y1, x2, y2)
      buildPath()   // s. rect case above for why this must be rebuilt
      applyStrokeDash(ctx, el)
      ctx.stroke()
      break
    }
    case 'line':
      ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(el.x2, el.y2); ctx.stroke()
      break
    case 'arrow': {
      const ang = Math.atan2(el.y2 - el.y, el.x2 - el.x)
      const h = Math.max(12, el.strokeWidth * 4)
      // Shorten shaft so it doesn't poke through the filled head
      const sx = el.x2 - h * Math.cos(ang) * 0.75
      const sy = el.y2 - h * Math.sin(ang) * 0.75
      ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(sx, sy); ctx.stroke()
      // Filled closed triangle arrowhead
      ctx.beginPath()
      ctx.moveTo(el.x2, el.y2)
      ctx.lineTo(el.x2 - h * Math.cos(ang - Math.PI / 6), el.y2 - h * Math.sin(ang - Math.PI / 6))
      ctx.lineTo(el.x2 - h * Math.cos(ang + Math.PI / 6), el.y2 - h * Math.sin(ang + Math.PI / 6))
      ctx.closePath()
      ctx.fillStyle = el.color
      ctx.fill()
      break
    }
    case 'text': {
      const fs = el.fontSize ?? 16
      ctx.font = `${fs}px sans-serif`
      ctx.fillStyle = el.color
      ctx.fillText(el.text ?? '', el.x, el.y)
      break
    }
  }

  if (selected) {
    ctx.globalAlpha = 1
    ctx.save()
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3])
    const pad = HANDLE_PAD
    ctx.strokeRect(Math.min(el.x, el.x2) - pad, Math.min(el.y, el.y2) - pad, Math.abs(el.x2 - el.x) + pad * 2, Math.abs(el.y2 - el.y) + pad * 2)
    ctx.restore()

    if (showHandles) {
      ctx.save()
      ctx.setLineDash([])
      const hs = 7 / scale
      const points = getHandlePoints(el)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1.5 / scale
      for (const name of Object.keys(points) as HandleName[]) {
        const p = points[name]; if (!p) continue
        ctx.beginPath()
        ctx.rect(p.x - hs / 2, p.y - hs / 2, hs, hs)
        ctx.fill(); ctx.stroke()
      }
      ctx.restore()
    }
  }
  ctx.restore()
}

// ─── Hit testing ──────────────────────────────────────────────────────────────

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t  = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function hitEl(el: DrawElement, px: number, py: number, ctx: CanvasRenderingContext2D): boolean {
  const t = Math.max(el.strokeWidth, 8)
  switch (el.type) {
    case 'freedraw': {
      const pts = el.points ?? []
      return pts.some((p, i) => i < pts.length - 1 && segDist(px, py, p.x, p.y, pts[i + 1].x, pts[i + 1].y) < t)
    }
    case 'rect': {
      const x1 = Math.min(el.x, el.x2), y1 = Math.min(el.y, el.y2)
      const x2 = Math.max(el.x, el.x2), y2 = Math.max(el.y, el.y2)
      if (el.filled) return px >= x1 && px <= x2 && py >= y1 && py <= y2
      return (Math.abs(px - x1) < t && py >= y1 && py <= y2) || (Math.abs(px - x2) < t && py >= y1 && py <= y2) ||
             (Math.abs(py - y1) < t && px >= x1 && px <= x2) || (Math.abs(py - y2) < t && px >= x1 && px <= x2)
    }
    case 'ellipse': {
      const cx = (el.x + el.x2) / 2, cy = (el.y + el.y2) / 2
      const rx = Math.abs(el.x2 - el.x) / 2, ry = Math.abs(el.y2 - el.y) / 2
      if (!rx || !ry) return false
      const d = Math.hypot((px - cx) / rx, (py - cy) / ry)
      return el.filled ? d <= 1 : Math.abs(d - 1) < t / Math.max(rx, ry)
    }
    case 'triangle': {
      const x1 = Math.min(el.x, el.x2), y1 = Math.min(el.y, el.y2)
      const x2 = Math.max(el.x, el.x2), y2 = Math.max(el.y, el.y2)
      const tx = (x1 + x2) / 2
      return segDist(px, py, tx, y1, x2, y2) < t || segDist(px, py, x2, y2, x1, y2) < t || segDist(px, py, x1, y2, tx, y1) < t
    }
    case 'line': case 'arrow': return segDist(px, py, el.x, el.y, el.x2, el.y2) < t
    case 'text': {
      ctx.font = `${el.fontSize ?? 16}px sans-serif`
      const w = ctx.measureText(el.text ?? '').width
      const h = el.fontSize ?? 16
      return px >= el.x && px <= el.x + w && py >= el.y - h && py <= el.y + 4
    }
    case 'fill': return false
  }
}

// ─── Flood fill ───────────────────────────────────────────────────────────────

function applyFloodFill(imageData: ImageData, startX: number, startY: number, fillHex: string): ImageData {
  const { data, width, height } = imageData
  // Nur die neu gefüllten Pixel werden zurückgegeben (sonst überall
  // transparent) statt eines vollen Kanvas-Schnappschusses — sonst würde
  // jeder bereits vorhandene Inhalt dauerhaft in dieses eine Fill-Element
  // eingebacken, und die Original-Elemente blieben unsichtbar darunter statt
  // weiterhin einzeln auswähl-/verschiebbar zu sein (s. Aufrufstelle unten).
  const out = new Uint8ClampedArray(data.length)
  const hex = fillHex.startsWith('#') && fillHex.length >= 7 ? fillHex : '#000000'
  const fr = parseInt(hex.slice(1, 3), 16)
  const fg = parseInt(hex.slice(3, 5), 16)
  const fb = parseInt(hex.slice(5, 7), 16)
  const si = (startY * width + startX) * 4
  const tr = data[si], tg = data[si + 1], tb = data[si + 2], ta = data[si + 3]
  if (tr === fr && tg === fg && tb === fb) return new ImageData(width, height)
  const TOL = 25
  function matches(pos: number) {
    return Math.abs(data[pos] - tr) + Math.abs(data[pos + 1] - tg) + Math.abs(data[pos + 2] - tb) + Math.abs(data[pos + 3] - ta) <= TOL * 4
  }
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

// ─── Slider component ─────────────────────────────────────────────────────────

function Slider({ label, value, onChange, onCommit, unit = '%' }: { label: string; value: number; onChange: (v: number) => void; onCommit?: () => void; unit?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <input
            type="number" min={0} max={100} value={value}
            onChange={e => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
            onBlur={onCommit}
            style={{ width: 36, fontSize: 10, textAlign: 'right', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', color: 'var(--text1)' }}
          />
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{unit}</span>
        </div>
      </div>
      <input type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onMouseUp={onCommit} onTouchEnd={onCommit}
        style={{ width: '100%', cursor: 'pointer' }}
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

const BTN: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0, padding: 0,
}

// Zoom-HUD-Buttons — kein eigener Rahmen (die HUD-Pille selbst hat schon
// einen), gleiches Muster wie das Board-Zoom-HUD (InfiniteCanvas.tsx).
const HUD_BTN: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: 'none',
  background: 'transparent', color: 'var(--text2)',
  cursor: 'pointer', fontSize: 15, display: 'flex',
  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

export default function DrawboardWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateWidget      = useBoardStore(s => s.updateWidget)
  const updateWidgetQuiet = useBoardStore(s => s.updateWidgetQuiet)
  const mode         = useUIStore(s => s.mode)
  const isEdit       = mode === 'edit'
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── UI state ──
  const [tool,        setTool]        = useState<DrawTool>('pen')
  const [color,       setColor]       = useState('#111827')
  const [strokePct,   setStrokePct]   = useState(10)
  const [opacityPct,  setOpacityPct]  = useState(100)
  const [filled,      setFilled]      = useState(false)
  const [showColors,     setShowColors]     = useState(false)
  const [showFormat,     setShowFormat]     = useState(false)
  const [showPenOpts,    setShowPenOpts]    = useState(false)
  // Anker für die Portal-Popovers unten (Pinsel-/Format-/Farb-Panel) — die
  // Panels selbst rendern via createPortal in document.body, damit sie nicht
  // von den overflow:hidden-Containern des Widgets abgeschnitten werden,
  // sobald die Kachel schmaler ist als das Panel.
  const penGroupRef    = useRef<HTMLDivElement>(null)
  const formatGroupRef = useRef<HTMLDivElement>(null)
  const colorGroupRef  = useRef<HTMLDivElement>(null)
  const [zoomPct,        setZoomPct]        = useState(100)
  const [textPos,        setTextPos]        = useState<{ cx: number; cy: number; sx: number; sy: number } | null>(null)
  const [textVal,        setTextVal]        = useState('')
  const [canvasBg,       setCanvasBg]       = useState<CanvasBg>('white')
  const [fontSize,       setFontSize]       = useState(16)
  const [brushType,      setBrushType]      = useState<string>('pen')
  const [bgColor,        setBgColor]        = useState<string | undefined>(undefined)
  const [fillStyle,      setFillStyleState] = useState<'hachure' | 'cross-hatch' | 'solid'>('hachure')
  const [strokeDash,     setStrokeDash]     = useState<'solid' | 'dashed' | 'dotted'>('solid')
  const [roundCorners,   setRoundCorners]   = useState(false)

  // Selected element ids — reactive (not just a ref) so the toolbar can
  // mirror the selected element's own style back into itself (s. the
  // selection-mirror effect below), which is what makes restyling read as
  // "editing the shape" rather than "blindly overwriting the next-draw
  // defaults". `selIdsRef` mirrors it for the perf-critical mouse handlers,
  // same dual state+ref convention as `tool`/`toolRef` etc. below.
  const [selectedIds,    setSelectedIds]    = useState<string[]>([])
  const [ctxMenu,        setCtxMenu]        = useState<{ x: number; y: number; hasTarget: boolean } | null>(null)

  const textPosRef    = useRef<typeof textPos>(null)
  const textValRef    = useRef('')
  const commitTextRef = useRef<() => void>(() => {})
  textPosRef.current = textPos
  textValRef.current = textVal

  // ── Canvas refs ──
  const elsRef      = useRef<DrawElement[]>(widget.data?.elements ?? [])
  const curRef      = useRef<DrawElement | null>(null)
  const drawingRef  = useRef(false)
  const panRef      = useRef({ x: 0, y: 0 })
  const scaleRef    = useRef(1)
  const panningRef  = useRef(false)
  const panStartRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })
  const selIdsRef   = useRef<Set<string>>(new Set())
  // Group move: captures the pre-drag box/points of every currently
  // selected element, keyed by id, so dragging any one of them (when
  // multiple are selected) moves the whole group together.
  const moveRef      = useRef<{ mx: number; my: number; items: { id: string; ox: number; oy: number; ox2: number; oy2: number; pts?: Pt[] }[] } | null>(null)
  const resizeRef    = useRef<{ id: string; handle: HandleName; anchor: Pt; orig: DrawElement; origBox: { x1: number; y1: number; x2: number; y2: number } } | null>(null)
  const marqueeRef   = useRef<{ sx: number; sy: number; ex: number; ey: number; additive: boolean; active: boolean; origSel: string[] } | null>(null)
  const clipboardRef = useRef<DrawElement[]>([])
  const histRef     = useRef<DrawElement[][]>([[...(widget.data?.elements ?? [])]])
  const histIdxRef  = useRef(0)
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cursorPtRef = useRef<Pt | null>(null)

  const fillImgCacheRef      = useRef(new Map<string, HTMLImageElement>())
  const isWidgetActiveRef    = useRef(false)
  const widgetRootRef        = useRef<HTMLDivElement>(null)

  const isEditRef   = useRef(true);                isEditRef.current   = isEdit
  const toolRef     = useRef<DrawTool>('pen');    toolRef.current     = tool
  const colorRef    = useRef('#111827');           colorRef.current    = color
  const swRef            = useRef(pctToSw(10));       swRef.current            = pctToSw(strokePct)
  const opacRef          = useRef(100);               opacRef.current          = opacityPct
  const filledRef        = useRef(false);             filledRef.current        = filled
  const canvasBgRef      = useRef<CanvasBg>('white'); canvasBgRef.current      = canvasBg
  const fontSizeRef      = useRef(16);                fontSizeRef.current      = fontSize
  const brushTypeRef     = useRef<string>('pen');     brushTypeRef.current     = brushType
  const bgColorRef       = useRef<string | undefined>(undefined); bgColorRef.current = bgColor
  const fillStyleRef     = useRef(fillStyle);         fillStyleRef.current     = fillStyle
  const strokeDashRef    = useRef(strokeDash);        strokeDashRef.current    = strokeDash
  const roundCornersRef  = useRef(false);             roundCornersRef.current  = roundCorners
  selIdsRef.current = new Set(selectedIds)

  // ── Render ────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const bg = canvasBgRef.current

    ctx.fillStyle = bg === 'dark' ? '#1e1e2e' : '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (bg === 'grid') {
      const gridPx = Math.max(8, 20 * scaleRef.current)
      const offX = ((panRef.current.x % gridPx) + gridPx) % gridPx
      const offY = ((panRef.current.y % gridPx) + gridPx) % gridPx
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let x = offX - gridPx; x <= canvas.width + gridPx; x += gridPx) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height) }
      for (let y = offY - gridPx; y <= canvas.height + gridPx; y += gridPx) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y) }
      ctx.stroke()
    }

    ctx.save()
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(scaleRef.current, scaleRef.current)

    // Fill elements: the image is a raster snapshot of the canvas AS
    // DISPLAYED at whatever pan/zoom was active when it was created (s.
    // DrawElement.fillPanX/Y/Scale in types/index.ts) — screen pixel (sx,sy)
    // back then was logical point ((sx-fillPanX)/fillScale, (sy-fillPanY)/
    // fillScale). Drawing it at that same logical rect, inside this same
    // translate+scale block every other element already uses, is what makes
    // it track pan/zoom instead of staying stamped at a fixed screen spot —
    // previously drawn with ctx.drawImage(img,0,0) OUTSIDE this transform
    // entirely, which is why filling then panning visibly slid it out of
    // place relative to everything else.
    for (const el of elsRef.current) {
      if (el.type !== 'fill' || !el.fillImageUrl) continue
      let img = fillImgCacheRef.current.get(el.id)
      if (!img) {
        img = new Image()
        fillImgCacheRef.current.set(el.id, img)
        img.onload = () => render()
        img.src = el.fillImageUrl
      }
      if (img.complete && img.naturalWidth > 0) {
        const fPanX = el.fillPanX ?? 0, fPanY = el.fillPanY ?? 0, fScale = el.fillScale ?? 1
        ctx.drawImage(img, -fPanX / fScale, -fPanY / fScale, img.naturalWidth / fScale, img.naturalHeight / fScale)
      }
    }

    const showHandles = toolRef.current === 'select' && selIdsRef.current.size === 1
    for (const el of elsRef.current) {
      if (el.type !== 'fill') renderEl(ctx, el, selIdsRef.current.has(el.id), scaleRef.current, showHandles && selIdsRef.current.has(el.id))
    }
    if (curRef.current) renderEl(ctx, curRef.current, false, scaleRef.current)

    // Marquee (rubber-band) selection rectangle — drawn in the same
    // transformed logical space as everything else so it tracks pan/zoom
    // like the rest of the canvas instead of needing a separate DOM overlay.
    const mq = marqueeRef.current
    if (mq?.active) {
      const x = Math.min(mq.sx, mq.ex), y = Math.min(mq.sy, mq.ey)
      const w = Math.abs(mq.ex - mq.sx), h = Math.abs(mq.ey - mq.sy)
      ctx.save()
      ctx.fillStyle = 'rgba(59,130,246,0.10)'
      ctx.strokeStyle = 'rgba(59,130,246,0.7)'
      ctx.lineWidth = 1 / scaleRef.current
      ctx.setLineDash([4 / scaleRef.current, 3 / scaleRef.current])
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      ctx.restore()
    }

    ctx.restore()
  }, [])

  // Pen cursor dot lives on its own overlay canvas so hovering with the pen
  // tool (no stroke in progress) only repaints a single small circle instead
  // of re-running the full render() over every element on every mousemove.
  const renderCursor = useCallback(() => {
    const canvas = cursorCanvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!cursorPtRef.current) return
    ctx.save()
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(scaleRef.current, scaleRef.current)
    const { x, y } = cursorPtRef.current
    const r = 4 / scaleRef.current
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = colorRef.current
    ctx.globalAlpha = 1
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1.5 / scaleRef.current
    ctx.stroke()
    ctx.restore()
  }, [])

  useEffect(() => { elsRef.current = widget.data?.elements ?? []; render() }, []) // eslint-disable-line
  useEffect(() => { cursorPtRef.current = null; renderCursor() }, [tool, renderCursor])

  // Externe Änderungen übernehmen (z. B. Zeichnen im Fokus-Modus, während die
  // Kachel weiter gemountet ist). Eigene Saves schreiben elsRef.current selbst
  // in den Store — der Referenzvergleich lässt sie unangetastet durch.
  useEffect(() => {
    const ext = widget.data?.elements ?? []
    if (ext !== elsRef.current) {
      elsRef.current = ext
      histRef.current = [[...ext]]
      histIdxRef.current = 0
      setSelectedIds([])
      render()
    }
  }, [widget.data?.elements, render])

  useEffect(() => {
    const container = containerRef.current; if (!container) return
    const obs = new ResizeObserver(() => {
      const c = canvasRef.current; if (!c) return
      c.width = container.clientWidth; c.height = container.clientHeight
      const cc = cursorCanvasRef.current
      if (cc) { cc.width = container.clientWidth; cc.height = container.clientHeight }
      render(); renderCursor()
    })
    obs.observe(container); return () => obs.disconnect()
  }, [render, renderCursor])

  // Ansichtsmodus ist rein lesend: schwebende Popover/Text-Eingabe schließen,
  // Auswahl & Stift-Cursor zurücksetzen, sobald der Bearbeitungsmodus verlassen wird.
  useEffect(() => {
    if (isEdit) return
    setShowColors(false); setShowFormat(false); setShowPenOpts(false)
    if (textPosRef.current) { setTextPos(null); setTextVal('') }
    setSelectedIds([])
    setCtxMenu(null)
    cursorPtRef.current = null
    render(); renderCursor()
  }, [isEdit, render, renderCursor])

  // ── Persist ───────────────────────────────────────────────────────────────

  // save() and saveView() are two INDEPENDENT debounced timers (elements at
  // 600ms, view/tool state at 400ms) that can easily both be in flight at
  // once — e.g. drawing a shape then immediately switching tools. Each used
  // to spread the `widget.data` PROP closed over at schedule time; since
  // updateWidget/updateWidgetQuiet replace `data` wholesale (no deep merge,
  // s. boardStore.ts), whichever one fired with the STALER snapshot would
  // silently wipe out whatever the other had just written — including
  // wiping `elements` back to an earlier (sometimes empty) state. Reading
  // the LIVE store data at fire time instead of the stale prop closes that
  // race — same fix TaskWidget.tsx's weekly-reset effect already uses for
  // exactly this "read fresh state instead of trusting a stale closure"
  // reason.
  function getLiveData(): Record<string, unknown> {
    const boards = useBoardStore.getState().boards
    const boardId = Object.keys(boards).find(bid => boards[bid]?.widgets[widget.id])
    const live = boardId ? boards[boardId].widgets[widget.id]?.data : undefined
    return (live ?? widget.data ?? {}) as Record<string, unknown>
  }

  const save = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateWidget(widget.id, { data: { ...getLiveData(), elements: elsRef.current } })
    }, 600)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, updateWidget])

  // ── View state (zoom/pan/tool/color/…) sync ─────────────────────────────────
  // Same "two simultaneous mounts" issue as `elements` above, but for the
  // toolbar/viewport state instead of the drawing itself: zooming or panning
  // in Focus Mode while the board tile is still mounted (or vice versa) left
  // the two completely out of sync, since none of this was ever written back
  // to widget.data at all. updateWidgetQuiet (not updateWidget): panning/
  // zooming/switching tools is a pure view change, same category as the
  // calendar's month navigation — no undo step, no lastEdited bump.
  const saveViewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveView = useCallback(() => {
    clearTimeout(saveViewTimer.current)
    saveViewTimer.current = setTimeout(() => {
      updateWidgetQuiet(widget.id, { data: {
        ...getLiveData(),
        zoom: scaleRef.current, panX: panRef.current.x, panY: panRef.current.y,
        tool, color, strokePct, opacityPct, filled, canvasBg, brushType,
        bgColor, fillStyle, strokeStyle: strokeDash, roundCorners,
      } })
    }, 400)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id, updateWidgetQuiet, tool, color, strokePct, opacityPct, filled, canvasBg, brushType, bgColor, fillStyle, strokeDash, roundCorners])
  useEffect(() => () => clearTimeout(saveViewTimer.current), [])
  // Fires whenever any of the "plain state" toolbar fields change — the
  // zoom/pan refs are saved from their own call sites instead (zoomBy,
  // resetZoom, onWheel, end-of-pan in onMouseUp), since changing them doesn't
  // touch any of this state and wouldn't otherwise trigger this effect.
  useEffect(() => { saveView() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, color, strokePct, opacityPct, filled, canvasBg, brushType, bgColor, fillStyle, strokeDash, roundCorners])

  // Re-sync from the store whenever this widget's OTHER simultaneous mount
  // (board tile vs. Focus Mode) changes the view — plain value checks, no
  // write-back here, so this can't ping-pong with saveView() above (see the
  // `elements` sync effect's own comment for the same reasoning).
  useEffect(() => {
    const z  = widget.data?.zoom as number | undefined
    const px = widget.data?.panX as number | undefined
    const py = widget.data?.panY as number | undefined
    let changed = false
    if (typeof z === 'number' && z !== scaleRef.current) { scaleRef.current = z; setZoomPct(Math.round(z * 100)); changed = true }
    if (typeof px === 'number' && typeof py === 'number' && (px !== panRef.current.x || py !== panRef.current.y)) {
      panRef.current = { x: px, y: py }; changed = true
    }
    if (changed) { render(); renderCursor() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.zoom, widget.data?.panX, widget.data?.panY])
  useEffect(() => {
    const dTool = widget.data?.tool as DrawTool | undefined
    if (dTool && dTool !== tool) setTool(dTool)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.tool])
  useEffect(() => {
    const dColor = widget.data?.color as string | undefined
    if (dColor && dColor !== color) setColor(dColor)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.color])
  useEffect(() => {
    const v = widget.data?.strokePct as number | undefined
    if (typeof v === 'number' && v !== strokePct) setStrokePct(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.strokePct])
  useEffect(() => {
    const v = widget.data?.opacityPct as number | undefined
    if (typeof v === 'number' && v !== opacityPct) setOpacityPct(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.opacityPct])
  useEffect(() => {
    const v = widget.data?.filled as boolean | undefined
    if (typeof v === 'boolean' && v !== filled) setFilled(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.filled])
  useEffect(() => {
    const v = widget.data?.canvasBg as CanvasBg | undefined
    if (v && v !== canvasBg) setCanvasBg(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.canvasBg])
  useEffect(() => {
    const v = widget.data?.brushType as string | undefined
    if (v && v !== brushType) setBrushType(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.brushType])
  useEffect(() => {
    const v = widget.data?.bgColor as string | undefined
    if (v !== bgColor) setBgColor(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.bgColor])
  useEffect(() => {
    const v = widget.data?.fillStyle as 'hachure' | 'cross-hatch' | 'solid' | undefined
    if (v && v !== fillStyle) setFillStyleState(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.fillStyle])
  useEffect(() => {
    const v = widget.data?.strokeStyle as 'solid' | 'dashed' | 'dotted' | undefined
    if (v && v !== strokeDash) setStrokeDash(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.strokeStyle])
  useEffect(() => {
    const v = widget.data?.roundCorners as boolean | undefined
    if (typeof v === 'boolean' && v !== roundCorners) setRoundCorners(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.data?.roundCorners])

  // Selecting a single element pulls ITS style back into the toolbar
  // (mirrors Excalidraw's left panel reflecting the selected shape) — this,
  // together with applyToSelection() further down, is what makes changing a
  // toolbar control read as "editing the selected shape" instead of just
  // "setting what the next new shape will look like". Deliberately a no-op
  // for an empty or multi-element selection: there's no single style to
  // mirror, so the toolbar just keeps showing whatever was last active.
  useEffect(() => {
    if (selectedIds.length !== 1) return
    const el = elsRef.current.find(x => x.id === selectedIds[0])
    if (!el) return
    setColor(el.color)
    setStrokePct(Math.max(1, Math.round((el.strokeWidth / MAX_SW) * 100)))
    setOpacityPct(el.opacity ?? 100)
    setFilled(!!el.filled)
    setBgColor(el.bgColor)
    if (el.fillStyle) setFillStyleState(el.fillStyle)
    setStrokeDash(el.strokeStyle ?? 'solid')
    setRoundCorners(!!el.roundCorners)
    if (el.type === 'freedraw' && el.brushType) setBrushType(el.brushType)
    if (el.type === 'text' && el.fontSize) setFontSize(el.fontSize)
  }, [selectedIds])

  // ── History ───────────────────────────────────────────────────────────────

  function pushHist(els: DrawElement[]) {
    histRef.current = histRef.current.slice(0, histIdxRef.current + 1)
    histRef.current.push([...els]); histIdxRef.current = histRef.current.length - 1
  }
  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--; elsRef.current = [...histRef.current[histIdxRef.current]]
    setSelectedIds([]); render(); save()
  }, [render, save])
  const redo = useCallback(() => {
    if (histIdxRef.current >= histRef.current.length - 1) return
    histIdxRef.current++; elsRef.current = [...histRef.current[histIdxRef.current]]
    setSelectedIds([]); render(); save()
  }, [render, save])

  // Für die +/- Zoom-Buttons im schwebenden HUD: dieselbe Zentrums-Zoom-
  // Mathematik wie beim Ctrl+Wheel-Zoom (s. onWheel unten), nur um die Mitte
  // des sichtbaren Canvas statt um die Mausposition (Buttons haben keine
  // Mauskoordinate, an der gezoomt werden könnte).
  const zoomBy = useCallback((factor: number) => {
    const r = canvasRef.current?.getBoundingClientRect()
    if (!r) return
    const mx = r.width / 2, my = r.height / 2
    const ns = Math.max(0.1, Math.min(10, scaleRef.current * factor))
    panRef.current = { x: mx - (mx - panRef.current.x) * (ns / scaleRef.current), y: my - (my - panRef.current.y) * (ns / scaleRef.current) }
    scaleRef.current = ns
    setZoomPct(Math.round(ns * 100))
    render(); renderCursor(); saveView()
  }, [render, renderCursor, saveView])

  const resetZoom = useCallback(() => {
    panRef.current = { x: 0, y: 0 }; scaleRef.current = 1; setZoomPct(100); render(); renderCursor(); saveView()
  }, [render, renderCursor, saveView])

  const zoomToFit = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const els = elsRef.current
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const el of els) {
      if (el.type === 'fill') continue
      const pts = el.points?.length ? el.points : [{ x: el.x, y: el.y }, { x: el.x2, y: el.y2 }]
      for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y) }
    }
    if (!isFinite(x1)) { resetZoom(); return }
    const w = Math.max(1, x2 - x1), h = Math.max(1, y2 - y1)
    const ns = Math.max(0.1, Math.min(10, Math.min(canvas.width / w, canvas.height / h) * 0.9))
    scaleRef.current = ns
    panRef.current = { x: canvas.width / 2 - (x1 + w / 2) * ns, y: canvas.height / 2 - (y1 + h / 2) * ns }
    setZoomPct(Math.round(ns * 100))
    render(); renderCursor(); saveView()
  }, [render, renderCursor, saveView, resetZoom])

  // ── Selection ops ────────────────────────────────────────────────────────
  // Unifies "set the next-draw default" and "restyle what's selected": every
  // toolbar control that calls setColor/setFilled/etc. for the former also
  // calls this for the latter — see the selection-mirror effect further
  // down for the other half (selecting something pulls ITS style back into
  // the toolbar), which together make this read as "editing the shape"
  // instead of two disconnected behaviors.
  function applyToSelection(patch: Partial<DrawElement> | ((el: DrawElement) => Partial<DrawElement>)) {
    if (!selIdsRef.current.size) return
    elsRef.current = elsRef.current.map(el =>
      selIdsRef.current.has(el.id) ? { ...el, ...(typeof patch === 'function' ? patch(el) : patch) } : el)
    pushHist(elsRef.current); render(); save()
  }
  // For sliders being dragged: applies every tick for instant feedback
  // WITHOUT pushing history (that would spam one entry per pixel of drag) —
  // pair with commitSelectionEdit() on the input's release.
  function liveApplyToSelection(patch: Partial<DrawElement>) {
    if (!selIdsRef.current.size) return
    elsRef.current = elsRef.current.map(el => selIdsRef.current.has(el.id) ? { ...el, ...patch } : el)
    render()
  }
  function commitSelectionEdit() {
    if (!selIdsRef.current.size) return
    pushHist(elsRef.current); save()
  }

  const duplicateSelection = useCallback(() => {
    if (!selIdsRef.current.size) return
    const dups = elsRef.current.filter(el => selIdsRef.current.has(el.id)).map(src => ({
      ...src, id: uid(),
      x: src.x + 12, y: src.y + 12, x2: src.x2 + 12, y2: src.y2 + 12,
      points: src.points?.map(p => ({ x: p.x + 12, y: p.y + 12 })),
    }))
    elsRef.current = [...elsRef.current, ...dups]
    setSelectedIds(dups.map(d => d.id))
    pushHist(elsRef.current); render(); save()
  }, [render, save])

  const deleteSelection = useCallback(() => {
    if (!selIdsRef.current.size) return
    elsRef.current = elsRef.current.filter(el => !selIdsRef.current.has(el.id))
    setSelectedIds([]); pushHist(elsRef.current); render(); save()
  }, [render, save])

  const copySelection = useCallback(() => {
    if (!selIdsRef.current.size) return
    clipboardRef.current = elsRef.current
      .filter(el => selIdsRef.current.has(el.id))
      .map(el => ({ ...el, points: el.points?.map(p => ({ ...p })) }))
  }, [])

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current.length) return
    const pastes = clipboardRef.current.map(src => ({
      ...src, id: uid(),
      x: src.x + 24, y: src.y + 24, x2: src.x2 + 24, y2: src.y2 + 24,
      points: src.points?.map(p => ({ x: p.x + 24, y: p.y + 24 })),
    }))
    elsRef.current = [...elsRef.current, ...pastes]
    setSelectedIds(pastes.map(p => p.id))
    pushHist(elsRef.current); render(); save()
  }, [render, save])

  // Array order = paint order (render()'s loop already draws elsRef.current
  // front-to-back in array order) — "reorder" just means reordering the
  // array. front/back move the whole selection to one end (preserving its
  // relative order); forward/backward swap each selected element past its
  // one non-selected neighbor, iterating from the appropriate end so a
  // multi-selection moves as a block instead of elements leapfrogging
  // each other one at a time.
  const reorderSelection = useCallback((dir: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selIdsRef.current.size) return
    const isSel = (el: DrawElement) => selIdsRef.current.has(el.id)
    const arr = elsRef.current
    let next: DrawElement[]
    if (dir === 'front') next = [...arr.filter(el => !isSel(el)), ...arr.filter(isSel)]
    else if (dir === 'back') next = [...arr.filter(isSel), ...arr.filter(el => !isSel(el))]
    else if (dir === 'forward') {
      next = [...arr]
      for (let i = next.length - 2; i >= 0; i--) {
        if (isSel(next[i]) && !isSel(next[i + 1])) { const tmp = next[i]; next[i] = next[i + 1]; next[i + 1] = tmp }
      }
    } else {
      next = [...arr]
      for (let i = 1; i < next.length; i++) {
        if (isSel(next[i]) && !isSel(next[i - 1])) { const tmp = next[i]; next[i] = next[i - 1]; next[i - 1] = tmp }
      }
    }
    elsRef.current = next
    pushHist(elsRef.current); render(); save()
  }, [render, save])

  // ── Keyboard ─────────────────────────────────────────────────────────────

  // Deactivate widget focus when clicking outside
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (widgetRootRef.current && !widgetRootRef.current.contains(e.target as Node)) {
        isWidgetActiveRef.current = false
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  // Close the right-click context menu on an outside click or Escape.
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [ctxMenu])

  // Block wheel events from reaching the board (native listeners) when widget is active
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const onNativeWheel = (e: WheelEvent) => {
      if (isWidgetActiveRef.current) e.stopPropagation()
    }
    canvas.addEventListener('wheel', onNativeWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onNativeWheel)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isWidgetActiveRef.current || !isEditRef.current) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault(); e.stopPropagation(); undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault(); e.stopPropagation(); redo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault(); resetZoom()
      }
      if (e.shiftKey && e.key === '!') {   // Shift+1 — Excalidraw's own zoom-to-fit shortcut
        e.preventDefault(); zoomToFit()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault(); duplicateSelection()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        copySelection()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboardRef.current.length) { e.preventDefault(); pasteClipboard() }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIdsRef.current.size) {
        e.preventDefault(); deleteSelection()
      }
      if (e.key === 'Escape' && selIdsRef.current.size) {
        setSelectedIds([])
      }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, render, save, resetZoom, zoomToFit, duplicateSelection, deleteSelection, copySelection, pasteClipboard])

  // ── Coords ───────────────────────────────────────────────────────────────

  function toCanvas(sx: number, sy: number): Pt {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    // Account for any parent CSS transform (e.g. InfiniteCanvas scale)
    const kx = c.width  / r.width
    const ky = c.height / r.height
    return {
      x: ((sx - r.left) * kx - panRef.current.x) / scaleRef.current,
      y: ((sy - r.top)  * ky - panRef.current.y) / scaleRef.current,
    }
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    setShowColors(false); setShowFormat(false)
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panningRef.current = true
      panStartRef.current = { mx: e.clientX, my: e.clientY, ox: panRef.current.x, oy: panRef.current.y }
      e.preventDefault(); return
    }
    if (e.button !== 0) return
    const pos = toCanvas(e.clientX, e.clientY)

    if (toolRef.current === 'select') {
      setCtxMenu(null)
      // 1. Resize-handle hit test, only meaningful with exactly one element
      // selected — checked before the general hit-test below so grabbing a
      // handle on the selected shape always wins over re-selecting it.
      if (selIdsRef.current.size === 1) {
        const id = Array.from(selIdsRef.current)[0]
        const el = elsRef.current.find(x => x.id === id)
        if (el) {
          const handles = getHandlePoints(el)
          const hitR = 9 / scaleRef.current
          let hit: HandleName | null = null
          for (const name of Object.keys(handles) as HandleName[]) {
            const hp = handles[name]; if (!hp) continue
            if (Math.hypot(pos.x - hp.x, pos.y - hp.y) <= hitR) { hit = name; break }
          }
          if (hit) {
            const x1 = Math.min(el.x, el.x2), y1 = Math.min(el.y, el.y2)
            const x2 = Math.max(el.x, el.x2), y2 = Math.max(el.y, el.y2)
            const anchors: Partial<Record<HandleName, Pt>> = {
              nw: { x: x2, y: y2 }, n: { x: x1, y: y2 }, ne: { x: x1, y: y2 },
              w:  { x: x2, y: y1 },                       e:  { x: x1, y: y1 },
              sw: { x: x2, y: y1 }, s: { x: x1, y: y1 }, se: { x: x1, y: y1 },
              start: { x: el.x2, y: el.y2 }, end: { x: el.x, y: el.y },
            }
            resizeRef.current = {
              id, handle: hit,
              orig: { ...el, points: el.points?.map(p => ({ ...p })) },
              anchor: anchors[hit]!,
              origBox: { x1, y1, x2, y2 },
            }
            drawingRef.current = true
            render(); return
          }
        }
      }
      const ctx = canvasRef.current!.getContext('2d')!
      let found: string | null = null
      for (let i = elsRef.current.length - 1; i >= 0; i--) {
        if (hitEl(elsRef.current[i], pos.x, pos.y, ctx)) { found = elsRef.current[i].id; break }
      }
      if (found) {
        let nextSel: string[]
        if (e.shiftKey) {
          nextSel = selIdsRef.current.has(found)
            ? Array.from(selIdsRef.current).filter(id => id !== found)
            : [...selIdsRef.current, found]
        } else if (selIdsRef.current.has(found)) {
          nextSel = Array.from(selIdsRef.current)   // clicked an already-selected element → group move, keep selection as-is
        } else {
          nextSel = [found]
        }
        setSelectedIds(nextSel)
        selIdsRef.current = new Set(nextSel)
        if (!e.shiftKey || nextSel.includes(found)) {
          drawingRef.current = true
          const items = elsRef.current.filter(el => nextSel.includes(el.id)).map(el => ({
            id: el.id, ox: el.x, oy: el.y, ox2: el.x2, oy2: el.y2, pts: el.points?.map(p => ({ ...p })),
          }))
          moveRef.current = { mx: pos.x, my: pos.y, items }
        }
      } else if (!e.shiftKey) {
        setSelectedIds([])
        marqueeRef.current = { sx: pos.x, sy: pos.y, ex: pos.x, ey: pos.y, additive: false, active: false, origSel: [] }
        drawingRef.current = true
      } else {
        marqueeRef.current = { sx: pos.x, sy: pos.y, ex: pos.x, ey: pos.y, additive: true, active: false, origSel: Array.from(selIdsRef.current) }
        drawingRef.current = true
      }
      render(); return
    }
    if (toolRef.current === 'fill') {
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      const r = canvas.getBoundingClientRect()
      const kx = canvas.width / r.width, ky = canvas.height / r.height
      const px = Math.min(canvas.width - 1, Math.max(0, Math.round((e.clientX - r.left) * kx)))
      const py = Math.min(canvas.height - 1, Math.max(0, Math.round((e.clientY - r.top) * ky)))
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const filledData = applyFloodFill(imageData, px, py, colorRef.current)
      ctx.putImageData(filledData, 0, 0)
      const fillUrl = canvas.toDataURL()
      const fillEl: DrawElement = {
        id: uid(), type: 'fill', fillImageUrl: fillUrl,
        x: 0, y: 0, x2: canvas.width, y2: canvas.height,
        color: colorRef.current, strokeWidth: 0, opacity: 100, filled: true,
        // Pan/zoom active right now, so render() can redraw this raster
        // snapshot at the correct logical position/scale later instead of
        // always stamping it back at a fixed screen position (s. DrawElement
        // in types/index.ts for why this only applies to 'fill').
        fillPanX: panRef.current.x, fillPanY: panRef.current.y, fillScale: scaleRef.current,
      }
      const img = new Image()
      img.src = fillUrl
      fillImgCacheRef.current.set(fillEl.id, img)
      elsRef.current = [...elsRef.current, fillEl]
      pushHist(elsRef.current); save(); render()
      return
    }
    if (toolRef.current === 'eraser') {
      const ctx = canvasRef.current!.getContext('2d')!
      const before = elsRef.current.length
      elsRef.current = elsRef.current.filter(el => !hitEl(el, pos.x, pos.y, ctx))
      if (elsRef.current.length !== before) { pushHist(elsRef.current); render(); save() }
      drawingRef.current = true; return
    }
    if (toolRef.current === 'text') {
      const r = canvasRef.current!.getBoundingClientRect()
      setTextPos({ cx: pos.x, cy: pos.y, sx: e.clientX - r.left, sy: e.clientY - r.top })
      setTextVal(''); return
    }
    drawingRef.current = true
    curRef.current = {
      id: uid(),
      type: toolRef.current === 'pen' ? 'freedraw' : toolRef.current as DrawElement['type'],
      x: pos.x, y: pos.y, x2: pos.x, y2: pos.y,
      points: toolRef.current === 'pen' ? [pos] : undefined,
      color: colorRef.current, strokeWidth: swRef.current, opacity: opacRef.current, filled: filledRef.current,
      brushType: toolRef.current === 'pen' ? brushTypeRef.current : undefined,
      // These were only ever being applied via applyToSelection() (restyling
      // an EXISTING shape) — a newly drawn shape never picked up the current
      // fill/stroke-style/corner defaults at all, so "Fill style" appeared
      // to do nothing until you went back and reselected what you'd just
      // drawn. Every new shape needs to start with the current defaults too.
      bgColor: bgColorRef.current,
      fillStyle: fillStyleRef.current,
      strokeStyle: strokeDashRef.current,
      roundCorners: toolRef.current === 'rect' ? roundCornersRef.current : undefined,
    }
    render()
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (toolRef.current === 'pen') {
      cursorPtRef.current = toCanvas(e.clientX, e.clientY)
    }
    if (panningRef.current) {
      panRef.current = { x: panStartRef.current.ox + e.clientX - panStartRef.current.mx, y: panStartRef.current.oy + e.clientY - panStartRef.current.my }
      render(); renderCursor(); return
    }
    if (!drawingRef.current) { if (toolRef.current === 'pen') renderCursor(); return }
    const pos = toCanvas(e.clientX, e.clientY)

    if (toolRef.current === 'select' && resizeRef.current) {
      const { id, handle, orig, origBox, anchor } = resizeRef.current
      if (handle === 'start' || handle === 'end') {
        let ex = pos.x, ey = pos.y
        if (e.shiftKey) {
          const dx = ex - anchor.x, dy = ey - anchor.y
          const snapAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
          const dist = Math.hypot(dx, dy)
          ex = anchor.x + dist * Math.cos(snapAngle); ey = anchor.y + dist * Math.sin(snapAngle)
        }
        elsRef.current = elsRef.current.map(el => el.id !== id ? el : (handle === 'start' ? { ...el, x: ex, y: ey } : { ...el, x2: ex, y2: ey }))
        render(); return
      }
      let { x1, y1, x2, y2 } = origBox
      if (handle === 'nw' || handle === 'n' || handle === 'ne') y1 = pos.y
      if (handle === 'sw' || handle === 's' || handle === 'se') y2 = pos.y
      if (handle === 'nw' || handle === 'w' || handle === 'sw') x1 = pos.x
      if (handle === 'ne' || handle === 'e' || handle === 'se') x2 = pos.x
      const isCorner = handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se'
      if (e.shiftKey && isCorner) {
        const origW = origBox.x2 - origBox.x1 || 1, origH = origBox.y2 - origBox.y1 || 1
        const ratio = origW / origH
        const newW = x2 - x1, newH = y2 - y1
        if (Math.abs(newW) > Math.abs(newH) * ratio) {
          const targetH = Math.sign(newH || 1) * Math.abs(newW) / ratio
          if (handle === 'nw' || handle === 'ne') y1 = y2 - targetH; else y2 = y1 + targetH
        } else {
          const targetW = Math.sign(newW || 1) * Math.abs(newH) * ratio
          if (handle === 'nw' || handle === 'sw') x1 = x2 - targetW; else x2 = x1 + targetW
        }
      }
      elsRef.current = elsRef.current.map(el => {
        if (el.id !== id) return el
        if (orig.type === 'freedraw') {
          const scaleX = (x2 - x1) / (origBox.x2 - origBox.x1 || 1), scaleY = (y2 - y1) / (origBox.y2 - origBox.y1 || 1)
          return { ...el, x: x1, y: y1, x2, y2, points: orig.points?.map(p => ({ x: x1 + (p.x - origBox.x1) * scaleX, y: y1 + (p.y - origBox.y1) * scaleY })) }
        }
        if (orig.type === 'text') {
          const scaleX = (x2 - x1) / (origBox.x2 - origBox.x1 || 1), scaleY = (y2 - y1) / (origBox.y2 - origBox.y1 || 1)
          const avg = (Math.abs(scaleX) + Math.abs(scaleY)) / 2
          return { ...el, x: x1, y: y1, x2, y2, fontSize: Math.max(6, Math.round((orig.fontSize ?? 16) * avg)) }
        }
        return { ...el, x: x1, y: y1, x2, y2 }
      })
      render(); return
    }
    if (toolRef.current === 'select' && marqueeRef.current) {
      const mq = marqueeRef.current
      mq.ex = pos.x; mq.ey = pos.y
      if (!mq.active && Math.hypot(mq.ex - mq.sx, mq.ey - mq.sy) > 4 / scaleRef.current) mq.active = true
      if (mq.active) {
        const x1 = Math.min(mq.sx, mq.ex), y1 = Math.min(mq.sy, mq.ey)
        const x2 = Math.max(mq.sx, mq.ex), y2 = Math.max(mq.sy, mq.ey)
        const hitIds = elsRef.current.filter(el => {
          if (el.type === 'fill') return false
          const ex1 = Math.min(el.x, el.x2), ey1 = Math.min(el.y, el.y2)
          const ex2 = Math.max(el.x, el.x2), ey2 = Math.max(el.y, el.y2)
          return ex2 >= x1 && ex1 <= x2 && ey2 >= y1 && ey1 <= y2
        }).map(el => el.id)
        const next = mq.additive ? Array.from(new Set([...mq.origSel, ...hitIds])) : hitIds
        setSelectedIds(next); selIdsRef.current = new Set(next)
      }
      render(); return
    }
    if (toolRef.current === 'select' && moveRef.current) {
      const dx = pos.x - moveRef.current.mx, dy = pos.y - moveRef.current.my
      const map = new Map(moveRef.current.items.map(it => [it.id, it]))
      elsRef.current = elsRef.current.map(el => {
        const it = map.get(el.id); if (!it) return el
        return { ...el, x: it.ox + dx, y: it.oy + dy, x2: it.ox2 + dx, y2: it.oy2 + dy, points: it.pts?.map(p => ({ x: p.x + dx, y: p.y + dy })) }
      })
      render(); return
    }
    if (toolRef.current === 'eraser') {
      const ctx = canvasRef.current!.getContext('2d')!
      const before = elsRef.current.length
      elsRef.current = elsRef.current.filter(el => !hitEl(el, pos.x, pos.y, ctx))
      if (elsRef.current.length !== before) render(); return
    }
    const el = curRef.current; if (!el) return
    if (el.type === 'freedraw') {
      el.points = [...(el.points ?? []), pos]
      const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y)
      el.x = Math.min(...xs); el.y = Math.min(...ys); el.x2 = Math.max(...xs); el.y2 = Math.max(...ys)
    } else if (e.shiftKey && (el.type === 'line' || el.type === 'arrow')) {
      // Snap to 0° / 45° / 90° increments when Shift held
      const dx = pos.x - el.x, dy = pos.y - el.y
      const snapAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      const dist = Math.hypot(dx, dy)
      el.x2 = el.x + dist * Math.cos(snapAngle)
      el.y2 = el.y + dist * Math.sin(snapAngle)
    } else {
      const sq = e.shiftKey && (el.type === 'rect' || el.type === 'ellipse')
      const dx = pos.x - el.x, dy = pos.y - el.y
      el.x2 = sq ? el.x + Math.sign(dx) * Math.max(Math.abs(dx), Math.abs(dy)) : pos.x
      el.y2 = sq ? el.y + Math.sign(dy) * Math.max(Math.abs(dx), Math.abs(dy)) : pos.y
    }
    render(); renderCursor()
  }

  function onMouseUp() {
    if (panningRef.current) { panningRef.current = false; saveView(); return }
    if (toolRef.current === 'select') {
      if (resizeRef.current) { pushHist(elsRef.current); save(); resizeRef.current = null; drawingRef.current = false; return }
      if (marqueeRef.current) { marqueeRef.current = null; drawingRef.current = false; render(); return }
      if (moveRef.current) { pushHist(elsRef.current); save() }
      moveRef.current = null; drawingRef.current = false; return
    }
    if (toolRef.current === 'eraser') { pushHist(elsRef.current); save(); drawingRef.current = false; return }
    const el = curRef.current
    if (el) {
      const ok = el.type === 'freedraw' ? (el.points?.length ?? 0) > 1 : Math.abs(el.x2 - el.x) > 2 || Math.abs(el.y2 - el.y) > 2
      if (ok) { elsRef.current = [...elsRef.current, el]; pushHist(elsRef.current); save() }
    }
    curRef.current = null; drawingRef.current = false; render()
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.stopPropagation()   // keep scroll/zoom inside the widget, don't pan the board
    const r = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    if (e.ctrlKey || e.metaKey) {
      const f = e.deltaY < 0 ? 1.1 : 0.9
      const ns = Math.max(0.1, Math.min(10, scaleRef.current * f))
      panRef.current = { x: mx - (mx - panRef.current.x) * (ns / scaleRef.current), y: my - (my - panRef.current.y) * (ns / scaleRef.current) }
      scaleRef.current = ns; setZoomPct(Math.round(ns * 100))
    } else {
      panRef.current = { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY }
    }
    render(); saveView()
  }

  // Right-click menu — follows the same ad-hoc shape TableWidget.tsx already
  // uses for its own per-cell context menu (local {x,y} state → a
  // position:fixed div → its own outside-click/Escape close effect below):
  // no shared context-menu component exists elsewhere in the app to reuse.
  function onContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (toolRef.current !== 'select') setTool('select')
    const pos = toCanvas(e.clientX, e.clientY)
    const ctx = canvasRef.current!.getContext('2d')!
    let found: string | null = null
    for (let i = elsRef.current.length - 1; i >= 0; i--) {
      if (hitEl(elsRef.current[i], pos.x, pos.y, ctx)) { found = elsRef.current[i].id; break }
    }
    if (found && !selIdsRef.current.has(found)) {
      setSelectedIds([found]); selIdsRef.current = new Set([found])
    } else if (!found) {
      setSelectedIds([]); selIdsRef.current = new Set()
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, hasTarget: !!found })
    render()
  }

  // ── Text commit ───────────────────────────────────────────────────────────

  function commitText() {
    const pos = textPosRef.current
    const val = textValRef.current.trim()
    if (pos && val) {
      const fs = fontSizeRef.current
      const ctx = canvasRef.current?.getContext('2d')
      let textW = 100
      if (ctx) {
        ctx.save()
        ctx.font = `${fs}px sans-serif`
        textW = ctx.measureText(val).width / scaleRef.current
        ctx.restore()
      }
      elsRef.current = [...elsRef.current, {
        id: uid(), type: 'text',
        x: pos.cx, y: pos.cy,
        x2: pos.cx + textW, y2: pos.cy + fs,
        color: colorRef.current, strokeWidth: swRef.current,
        opacity: opacRef.current, filled: false, text: val, fontSize: fs,
      }]
      pushHist(elsRef.current); render(); save()
    }
    setTextPos(null); setTextVal('')
  }
  commitTextRef.current = commitText

  useEffect(() => {
    if (!textPos) return
    let handler: ((e: MouseEvent) => void) | null = null
    const timer = setTimeout(() => {
      handler = (e: MouseEvent) => {
        if ((e.target as HTMLElement).dataset.textInput) return
        commitTextRef.current()
      }
      document.addEventListener('mousedown', handler)
    }, 100)
    return () => {
      clearTimeout(timer)
      if (handler) document.removeEventListener('mousedown', handler)
    }
  }, [!!textPos]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export as PNG ─────────────────────────────────────────────────────────

  function exportPng() {
    const canvas = canvasRef.current; if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${t('drawing')}.png`
    a.click()
  }

  function clearAll() {
    elsRef.current = []; curRef.current = null; setSelectedIds([])
    pushHist(elsRef.current); render(); save()
  }


  // ── Helpers ───────────────────────────────────────────────────────────────

  const isShape = SHAPE_TOOLS.includes(tool)
  const cursor  = tool === 'pen' ? 'none' : tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : tool === 'fill' ? 'crosshair' : 'crosshair'

  function tb(active: boolean) {
    return { ...BTN, background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? 'var(--on-accent, white)' : 'var(--text2)' }
  }

  // ── Format panels ─────────────────────────────────────────────────────────

  const liveSwPx = pctToSw(strokePct)

  const activeBrushLabel = BRUSH_DEFS.find(b => b.id === brushType)?.label ?? brushType

  // Inlined directly (not a nested component): PenPanel/FormatPanel are each
  // used exactly once and hold no state of their own — every value they
  // show comes from this component's own state/closures. A nested
  // component defined in the render body would get a new type identity on
  // every render (remount instead of update); since there's no separate
  // component here at all, that concern doesn't apply.
  const penPanel = (
    <div style={{ background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, width: 220, boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 10 }}
      onPointerDown={e => e.stopPropagation()}>

      {/* ── Brush type selector ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Brush type')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {BRUSH_DEFS.map(b => (
          <button key={b.id} onClick={() => { setBrushType(b.id); applyToSelection(el => el.type === 'freedraw' ? { brushType: b.id } : {}) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: brushType === b.id ? 'var(--accent)' : 'var(--surface2)',
              color: brushType === b.id ? 'var(--on-accent, white)' : 'var(--text2)',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>{b.preview}</div>
            <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{t(b.label)}</span>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* ── Stroke style ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Stroke style')}</div>
      <div style={{ display: 'flex', gap: 5 }}>
        {(['solid', 'dashed', 'dotted'] as const).map(s => (
          <button key={s} title={t(STROKE_STYLE_LABELS[s])} onClick={() => { setStrokeDash(s); applyToSelection({ strokeStyle: s }) }}
            style={{ ...BTN, flex: 1, background: strokeDash === s ? 'var(--accent)' : 'var(--surface2)', color: strokeDash === s ? 'var(--on-accent, white)' : 'var(--text2)' }}>
            {s === 'solid' ? <IcoStrokeSolid /> : s === 'dashed' ? <IcoStrokeDashed /> : <IcoStrokeDotted />}
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* ── Stroke width ── */}
      <div>
        <Slider label={t('Stroke width')} value={strokePct}
          onChange={v => { setStrokePct(v); liveApplyToSelection({ strokeWidth: pctToSw(v) }) }}
          onCommit={commitSelectionEdit} />
        <div style={{ marginTop: 6, height: 28, background: 'var(--surface2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ width: '80%', height: Math.max(1, liveSwPx), background: color, opacity: opacityPct / 100, borderRadius: 999, transition: 'height 0.1s' }} />
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--border)' }} />
      <div>
        <Slider label={t('Opacity')} value={opacityPct}
          onChange={v => { setOpacityPct(v); liveApplyToSelection({ opacity: v }) }}
          onCommit={commitSelectionEdit} />
        <div style={{ marginTop: 6, height: 28, borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden', background: 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 10px 10px' }}>
          <div style={{ width: '100%', height: '100%', background: color, opacity: opacityPct / 100, transition: 'opacity 0.1s' }} />
        </div>
      </div>
    </div>
  )

  const formatPanel = (
    <div style={{ background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, width: 210, boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 8 }}
      onPointerDown={e => e.stopPropagation()}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Shapes')}</div>
      <div style={{ display: 'flex', gap: 5 }}>
        {(Object.entries(SHAPE_LABELS) as [ShapeTool, string][]).map(([st, label]) => (
          <button key={st} title={t(label)} onClick={() => { setTool(st); setShowFormat(false) }}
            style={{ ...BTN, flex: 1, background: tool === st ? 'var(--accent)' : 'var(--surface2)', color: tool === st ? 'var(--on-accent, white)' : 'var(--text2)' }}>
            {SHAPE_ICONS[st]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button onClick={() => {
          const v = !filled; setFilled(v)
          // Also (re-)apply the currently-shown fill style/color when turning
          // fill ON — otherwise an existing shape with no fillStyle of its
          // own falls back to the legacy plain look regardless of which
          // style button is highlighted here, which reads as "fill style
          // does nothing".
          applyToSelection(v ? { filled: v, fillStyle, bgColor } : { filled: v })
        }}
          style={{ ...BTN, flex: 1, width: 'auto', padding: '0 8px', gap: 5, fontSize: 10, fontWeight: 600, background: filled ? 'var(--accent)' : 'var(--surface2)', color: filled ? 'var(--on-accent, white)' : 'var(--text2)' }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg>
          {t('Fill on/off')}
        </button>
        <button title={t('Rounded corners (rectangle)')} onClick={() => { const v = !roundCorners; setRoundCorners(v); applyToSelection(el => el.type === 'rect' ? { roundCorners: v } : {}) }}
          style={{ ...BTN, background: roundCorners ? 'var(--accent)' : 'var(--surface2)', color: roundCorners ? 'var(--on-accent, white)' : 'var(--text2)' }}>
          <IcoRoundCorner />
        </button>
      </div>

      {filled && (<>
        <div style={{ height: 1, background: 'var(--border)' }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Fill style')}</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {(['hachure', 'cross-hatch', 'solid'] as const).map(fs => (
            <button key={fs} title={t(FILL_STYLE_LABELS[fs])} onClick={() => { setFillStyleState(fs); applyToSelection({ fillStyle: fs }) }}
              style={{ ...BTN, flex: 1, background: fillStyle === fs ? 'var(--accent)' : 'var(--surface2)', color: fillStyle === fs ? 'var(--on-accent, white)' : 'var(--text2)' }}>
              {fs === 'hachure' ? <IcoFillHachure /> : fs === 'cross-hatch' ? <IcoFillCrossHatch /> : <IcoFillSolid />}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)' }}>{t('Fill color')}</span>
          <ColorSwatch value={bgColor ?? color} onChange={v => { setBgColor(v); applyToSelection({ bgColor: v }) }}
            trigger={onClick => (
              <button onClick={onClick} title={t('Fill color')}
                style={{ width: 22, height: 22, borderRadius: 5, background: bgColor ?? color, border: '1px solid var(--border)', cursor: 'pointer', marginLeft: 'auto' }} />
            )}
          />
        </div>
      </>)}
    </div>
  )

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div ref={widgetRootRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4, overflow: 'hidden' }}
      onPointerDown={e => { e.stopPropagation(); isWidgetActiveRef.current = true }}
      onWheel={e => { if (isWidgetActiveRef.current) { e.stopPropagation() } }}>

      {/* ── Toolbar — nur im Bearbeitungsmodus, im Ansichtsmodus rein lesend ── */}
      {isEdit && (
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', position: 'relative' }}>

        {/* Select */}
        <button title={t('Select')} onClick={() => { setTool('select'); setSelectedIds([]); render() }} style={tb(tool === 'select')}>
          <IcoSelect />
        </button>

        {/* Pen + options ▾ */}
        <div ref={penGroupRef} style={{ position: 'relative', display: 'flex', gap: 0 }}>
          <button title={`${t('Freehand')} — ${t(activeBrushLabel)}`}
            onClick={() => { setTool('pen'); setShowPenOpts(false); setShowFormat(false); setShowColors(false) }}
            style={{ ...tb(tool === 'pen'), borderRadius: '6px 0 0 6px', borderRight: 'none' }}>
            <IcoPen />
          </button>
          <button title={t('Pen options')} onClick={() => { setShowPenOpts(s => !s); setShowFormat(false); setShowColors(false) }}
            style={{ ...tb(showPenOpts), borderRadius: '0 6px 6px 0', width: 14, padding: 0 }}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2l3 4 3-4z"/></svg>
          </button>
          <PortalPopover open={showPenOpts} anchorRef={penGroupRef} onClose={() => setShowPenOpts(false)}>
            {penPanel}
          </PortalPopover>
        </div>

        {/* Shapes ▾ */}
        <div ref={formatGroupRef} style={{ position: 'relative' }}>
          <button title={t('Shapes (Shift+drag: snap to angle)')} onClick={() => { setShowFormat(s => !s); setShowPenOpts(false); setShowColors(false) }}
            style={{ ...tb(isShape || showFormat), gap: 3, width: 'auto', padding: '0 6px' }}>
            {isShape ? SHAPE_ICONS[tool as ShapeTool] : <IcoShapes />}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2l3 4 3-4z"/></svg>
          </button>
          <PortalPopover open={showFormat} anchorRef={formatGroupRef} onClose={() => setShowFormat(false)}>
            {formatPanel}
          </PortalPopover>
        </div>

        {/* Text */}
        <button title={t('Text')} onClick={() => setTool('text')} style={tb(tool === 'text')}>
          <IcoText />
        </button>

        {/* Font size — only shown when text tool is active */}
        {tool === 'text' && (
          <select
            value={fontSize}
            onChange={e => setFontSize(+e.target.value)}
            title={t('Font size')}
            style={{ fontSize: 11, background: 'var(--surface)', color: 'var(--text1)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 4px', height: 28, cursor: 'pointer' }}
          >
            {[10, 12, 14, 16, 20, 24, 32, 48].map(s => <option key={s} value={s}>{s}px</option>)}
          </select>
        )}

        {/* Eraser */}
        <button title={t('Eraser')} onClick={() => setTool('eraser')} style={tb(tool === 'eraser')}>
          <IcoEraser />
        </button>

        {/* Fill bucket */}
        <button title={t('Fill bucket (fill area with color)')} onClick={() => setTool('fill')} style={tb(tool === 'fill')}>
          <IcoBucket />
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 1px' }} />

        {/* Color */}
        <div ref={colorGroupRef} style={{ position: 'relative' }}>
          <button title={t('Color')} onClick={() => { setShowColors(s => !s); setShowFormat(false); setShowPenOpts(false) }}
            style={{ ...BTN, background: color, border: showColors ? '2px solid var(--accent)' : '2px solid rgba(0,0,0,0.4)' }} />
          <PortalPopover open={showColors} anchorRef={colorGroupRef} onClose={() => setShowColors(false)}>
            <div style={{ background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
              onPointerDown={e => e.stopPropagation()}>
              {COLORS.map(c => (
                <button key={c} onClick={() => { setColor(c); setShowColors(false); applyToSelection({ color: c }) }}
                  title={`${t('Color')} ${c}`}
                  style={{ width: 24, height: 24, borderRadius: 5, background: c, border: c === color ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.25)', cursor: 'pointer' }} />
              ))}
              <ColorSwatch value={color} onChange={v => { setColor(v); setShowColors(false); applyToSelection({ color: v }) }}
                trigger={(onClick) => (
                  <div onClick={onClick} title={t('Custom color')} style={{
                    width: 24, height: 24, borderRadius: 5, cursor: 'pointer',
                    background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)',
                    border: '1px solid var(--border)',
                  }} />
                )}
              />
            </div>
          </PortalPopover>
        </div>

        {/* Canvas background toggle — cycles white → grid → dark */}
        <button
          title={`${t('Background')}: ${t(BG_LABELS[canvasBg])} — ${t('click to switch')}`}
          onClick={() => {
            setCanvasBg(b => BG_CYCLE[(BG_CYCLE.indexOf(b) + 1) % BG_CYCLE.length])
            requestAnimationFrame(render)
          }}
          style={{ ...BTN, gap: 3, width: 'auto', padding: '0 5px', fontSize: 9, fontWeight: 700 }}
        >
          <IcoGrid />
          <span style={{ fontSize: 8, letterSpacing: -0.2 }}>{t(BG_LABELS[canvasBg]).slice(0, 3)}</span>
        </button>

        {/* Layer order — only meaningful with a selection */}
        {selectedIds.length > 0 && (<>
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 1px' }} />
          <button title={t('Bring to front')} onClick={() => reorderSelection('front')} style={BTN}><IcoToFront /></button>
          <button title={t('Bring forward')} onClick={() => reorderSelection('forward')} style={BTN}><IcoForward /></button>
          <button title={t('Send backward')} onClick={() => reorderSelection('backward')} style={BTN}><IcoBackward /></button>
          <button title={t('Send to back')} onClick={() => reorderSelection('back')} style={BTN}><IcoToBack /></button>
        </>)}

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 1px', marginLeft: 'auto' }} />

        {/* Undo / Redo */}
        <button title={t('Undo (Ctrl+Z)')} onClick={undo} style={BTN}><IcoUndo /></button>
        <button title={t('Redo (Ctrl+Y)')} onClick={redo} style={BTN}><IcoRedo /></button>

        {/* Export PNG */}
        <button title={t('Export as PNG')} onClick={exportPng} style={BTN}><IcoDownload /></button>

        {/* Clear */}
        <button title={t('Clear all')} onClick={clearAll} style={{ ...BTN, color: '#ef4444' }}><IcoTrash /></button>
      </div>
      )}

      {/* ── Canvas ── */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 6, border: '1px solid var(--border)' }}
        onClick={isEdit ? () => { setShowColors(false); setShowFormat(false); setShowPenOpts(false) } : undefined}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: isEdit ? cursor : 'default' }}
          onMouseDown={isEdit ? onMouseDown : undefined}
          onMouseMove={isEdit ? onMouseMove : undefined}
          onMouseUp={isEdit ? onMouseUp : undefined}
          onMouseLeave={isEdit ? () => { onMouseUp(); cursorPtRef.current = null; renderCursor() } : undefined}
          onWheel={isEdit ? onWheel : undefined}
          onContextMenu={isEdit ? onContextMenu : undefined}
        />
        <canvas
          ref={cursorCanvasRef}
          style={{ display: 'block', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />

        {/* Zoom-HUD — schwebt über dem Canvas statt in der Werkzeugleiste
            oben (die schon mit Werkzeugen/Farbe/Verlauf/Undo/Export voll ist),
            gleiches Muster wie das Zoom-HUD des Boards (InfiniteCanvas.tsx). */}
        {isEdit && (
          <div
            style={{
              position: 'absolute', bottom: 8, right: 8, zIndex: 5,
              display: 'flex', alignItems: 'center', gap: 2,
              background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid var(--border)', borderRadius: 9,
              boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
              padding: '3px 4px',
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            <button title={t('Zoom out')} onClick={() => zoomBy(1 / 1.15)} style={HUD_BTN}>−</button>
            <button title={t('Reset zoom (Ctrl+0)')} onClick={resetZoom}
              style={{ ...HUD_BTN, width: 'auto', padding: '0 6px', fontSize: 10.5, fontWeight: 700 }}>
              {zoomPct}%
            </button>
            <button title={t('Zoom in')} onClick={() => zoomBy(1.15)} style={HUD_BTN}>+</button>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 1px' }} />
            <button title={t('Zoom to fit (Shift+1)')} onClick={zoomToFit} style={HUD_BTN}><IcoZoomFit /></button>
          </div>
        )}

        {ctxMenu && createPortal(
          <div
            style={{
              position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 50,
              background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid var(--border)', borderRadius: 9, padding: 4,
              boxShadow: '0 8px 28px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 168,
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            {([
              ...(ctxMenu.hasTarget ? [
                { icon: <IcoDuplicate />, label: 'Duplicate', key: 'Ctrl+D', fn: duplicateSelection },
                { icon: <IcoCopy />,      label: 'Copy',      key: 'Ctrl+C', fn: copySelection },
              ] : []),
              ...(!ctxMenu.hasTarget && clipboardRef.current.length ? [
                { icon: <IcoPaste />, label: 'Paste', key: 'Ctrl+V', fn: pasteClipboard },
              ] : []),
              ...(ctxMenu.hasTarget ? [
                { icon: <IcoTrash />,     label: 'Delete',        key: 'Del',  fn: deleteSelection },
                { icon: <IcoToFront />,   label: 'Bring to front', fn: () => reorderSelection('front') },
                { icon: <IcoForward />,   label: 'Bring forward',  fn: () => reorderSelection('forward') },
                { icon: <IcoBackward />,  label: 'Send backward',  fn: () => reorderSelection('backward') },
                { icon: <IcoToBack />,    label: 'Send to back',   fn: () => reorderSelection('back') },
              ] : []),
            ] as { icon: React.ReactNode; label: string; key?: string; fn: () => void }[]).map(item => (
              <button key={item.label} onClick={() => { item.fn(); setCtxMenu(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                  border: 'none', background: 'none', color: 'var(--text1)', cursor: 'pointer', fontSize: 11.5,
                  textAlign: 'left', width: '100%',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                <span style={{ color: 'var(--text2)', display: 'flex', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{t(item.label)}</span>
                {item.key && <span style={{ fontSize: 9.5, color: 'var(--text3)' }}>{item.key}</span>}
              </button>
            ))}
          </div>,
          document.body
        )}

        {textPos && (
          <input
            autoFocus
            data-text-input="true"
            value={textVal}
            placeholder={t('Text… ↵ Enter')}
            onChange={e => setTextVal(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); commitText() }
              if (e.key === 'Escape') { setTextPos(null); setTextVal('') }
            }}
            style={{
              position: 'absolute',
              left: textPos.sx,
              top: textPos.sy - Math.round(fontSize * scaleRef.current * 0.8),
              fontSize: fontSize * scaleRef.current,
              fontFamily: 'sans-serif',
              background: 'rgba(59,130,246,0.08)',
              border: 'none',
              outline: '1.5px dashed #3b82f6',
              borderRadius: 3,
              color,
              minWidth: 100,
              padding: '1px 4px',
              zIndex: 10,
            }}
          />
        )}
      </div>
    </div>
  )
}
