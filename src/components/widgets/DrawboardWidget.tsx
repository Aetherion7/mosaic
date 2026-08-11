'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
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
    <path d="M6 8 Q10 2 14 8"/>
    <path d="M4 8 L6.5 18 Q10 22 13.5 18 L16 8 Z"/>
    <path d="M20 13 C20 13 23 16.5 23 18.5 A3 3 0 0 1 17 18.5 C17 16.5 20 13 20 13 Z" fill="currentColor" stroke="none"/>
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

// ─── Canvas rendering ─────────────────────────────────────────────────────────

function renderEl(ctx: CanvasRenderingContext2D, el: DrawElement, selected: boolean) {
  ctx.save()
  ctx.globalAlpha = (el.opacity ?? 100) / 100
  ctx.strokeStyle = el.color
  ctx.fillStyle   = el.color + '33'
  ctx.lineWidth   = el.strokeWidth
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'

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
      if (el.filled) ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      break
    }
    case 'ellipse': {
      const cx = (el.x + el.x2) / 2, cy = (el.y + el.y2) / 2
      const rx = Math.abs(el.x2 - el.x) / 2, ry = Math.abs(el.y2 - el.y) / 2
      if (rx < 1 || ry < 1) break
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      if (el.filled) ctx.fill()
      ctx.stroke()
      break
    }
    case 'triangle': {
      const x1 = Math.min(el.x, el.x2), y1 = Math.min(el.y, el.y2)
      const x2 = Math.max(el.x, el.x2), y2 = Math.max(el.y, el.y2)
      ctx.beginPath()
      ctx.moveTo((x1 + x2) / 2, y1)
      ctx.lineTo(x2, y2)
      ctx.lineTo(x1, y2)
      ctx.closePath()
      if (el.filled) ctx.fill()
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
    const pad = 5
    ctx.strokeRect(Math.min(el.x, el.x2) - pad, Math.min(el.y, el.y2) - pad, Math.abs(el.x2 - el.x) + pad * 2, Math.abs(el.y2 - el.y) + pad * 2)
    ctx.restore()
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

function Slider({ label, value, onChange, unit = '%' }: { label: string; value: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <input
            type="number" min={0} max={100} value={value}
            onChange={e => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
            style={{ width: 36, fontSize: 10, textAlign: 'right', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', color: 'var(--text1)' }}
          />
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{unit}</span>
        </div>
      </div>
      <input type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
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
  const updateWidget = useBoardStore(s => s.updateWidget)
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
  const selIdRef    = useRef<string | null>(null)
  const moveRef     = useRef<{ mx: number; my: number; ox: number; oy: number; ox2: number; oy2: number; pts?: Pt[] } | null>(null)
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

    // Fill elements render at screen space (identity transform)
    for (const el of elsRef.current) {
      if (el.type !== 'fill' || !el.fillImageUrl) continue
      let img = fillImgCacheRef.current.get(el.id)
      if (!img) {
        img = new Image()
        fillImgCacheRef.current.set(el.id, img)
        img.onload = () => render()
        img.src = el.fillImageUrl
      }
      if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0)
    }

    ctx.save()
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(scaleRef.current, scaleRef.current)
    for (const el of elsRef.current) {
      if (el.type !== 'fill') renderEl(ctx, el, el.id === selIdRef.current)
    }
    if (curRef.current) renderEl(ctx, curRef.current, false)

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
      selIdRef.current = null
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
    selIdRef.current = null
    cursorPtRef.current = null
    render(); renderCursor()
  }, [isEdit, render, renderCursor])

  // ── Persist ───────────────────────────────────────────────────────────────

  const save = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateWidget(widget.id, { data: { ...widget.data, elements: elsRef.current } })
    }, 600)
  }, [widget.id, widget.data, updateWidget])

  // ── History ───────────────────────────────────────────────────────────────

  function pushHist(els: DrawElement[]) {
    histRef.current = histRef.current.slice(0, histIdxRef.current + 1)
    histRef.current.push([...els]); histIdxRef.current = histRef.current.length - 1
  }
  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--; elsRef.current = [...histRef.current[histIdxRef.current]]
    selIdRef.current = null; render(); save()
  }, [render, save])
  const redo = useCallback(() => {
    if (histIdxRef.current >= histRef.current.length - 1) return
    histIdxRef.current++; elsRef.current = [...histRef.current[histIdxRef.current]]
    selIdRef.current = null; render(); save()
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
    render(); renderCursor()
  }, [render, renderCursor])

  const resetZoom = useCallback(() => {
    panRef.current = { x: 0, y: 0 }; scaleRef.current = 1; setZoomPct(100); render(); renderCursor()
  }, [render, renderCursor])

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
      // Ctrl+D: duplicate selected element
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        if (selIdRef.current) {
          const src = elsRef.current.find(el => el.id === selIdRef.current)
          if (src) {
            const dup: DrawElement = {
              ...src, id: uid(),
              x: src.x + 12, y: src.y + 12, x2: src.x2 + 12, y2: src.y2 + 12,
              points: src.points?.map(p => ({ x: p.x + 12, y: p.y + 12 })),
            }
            elsRef.current = [...elsRef.current, dup]
            selIdRef.current = dup.id
            pushHist(elsRef.current); render(); save()
          }
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIdRef.current) {
        elsRef.current = elsRef.current.filter(el => el.id !== selIdRef.current)
        selIdRef.current = null; pushHist(elsRef.current); render(); save()
      }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, render, save, resetZoom])

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
      const ctx = canvasRef.current!.getContext('2d')!
      let found: string | null = null
      for (let i = elsRef.current.length - 1; i >= 0; i--) {
        if (hitEl(elsRef.current[i], pos.x, pos.y, ctx)) { found = elsRef.current[i].id; break }
      }
      selIdRef.current = found
      if (found) {
        const el = elsRef.current.find(e => e.id === found)!
        drawingRef.current = true
        moveRef.current = { mx: pos.x, my: pos.y, ox: el.x, oy: el.y, ox2: el.x2, oy2: el.y2, pts: el.points?.map(p => ({ ...p })) }
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

    if (toolRef.current === 'select' && moveRef.current) {
      const dx = pos.x - moveRef.current.mx, dy = pos.y - moveRef.current.my
      elsRef.current = elsRef.current.map(el => {
        if (el.id !== selIdRef.current) return el
        return { ...el, x: moveRef.current!.ox + dx, y: moveRef.current!.oy + dy, x2: moveRef.current!.ox2 + dx, y2: moveRef.current!.oy2 + dy, points: moveRef.current!.pts?.map(p => ({ x: p.x + dx, y: p.y + dy })) }
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
    if (panningRef.current) { panningRef.current = false; return }
    if (toolRef.current === 'select') { if (moveRef.current && drawingRef.current) { pushHist(elsRef.current); save() }; moveRef.current = null; drawingRef.current = false; return }
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
    elsRef.current = []; curRef.current = null; selIdRef.current = null
    pushHist(elsRef.current); render(); save()
  }


  // ── Helpers ───────────────────────────────────────────────────────────────

  const isShape = SHAPE_TOOLS.includes(tool)
  const cursor  = tool === 'pen' ? 'none' : tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : tool === 'fill' ? 'crosshair' : 'crosshair'

  function tb(active: boolean) {
    return { ...BTN, background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? 'white' : 'var(--text2)' }
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
          <button key={b.id} onClick={() => setBrushType(b.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: brushType === b.id ? 'var(--accent)' : 'var(--surface2)',
              color: brushType === b.id ? 'white' : 'var(--text2)',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>{b.preview}</div>
            <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{t(b.label)}</span>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* ── Stroke width ── */}
      <div>
        <Slider label={t('Stroke width')} value={strokePct} onChange={setStrokePct} />
        <div style={{ marginTop: 6, height: 28, background: 'var(--surface2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ width: '80%', height: Math.max(1, liveSwPx), background: color, opacity: opacityPct / 100, borderRadius: 999, transition: 'height 0.1s' }} />
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--border)' }} />
      <div>
        <Slider label={t('Opacity')} value={opacityPct} onChange={setOpacityPct} />
        <div style={{ marginTop: 6, height: 28, borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden', background: 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 10px 10px' }}>
          <div style={{ width: '100%', height: '100%', background: color, opacity: opacityPct / 100, transition: 'opacity 0.1s' }} />
        </div>
      </div>
    </div>
  )

  const formatPanel = (
    <div style={{ background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, width: 200, boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 8 }}
      onPointerDown={e => e.stopPropagation()}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Shapes')}</div>
      <div style={{ display: 'flex', gap: 5 }}>
        {(Object.entries(SHAPE_LABELS) as [ShapeTool, string][]).map(([st, label]) => (
          <button key={st} title={t(label)} onClick={() => { setTool(st); setShowFormat(false) }}
            style={{ ...BTN, flex: 1, background: tool === st ? 'var(--accent)' : 'var(--surface2)', color: tool === st ? 'white' : 'var(--text2)' }}>
            {SHAPE_ICONS[st]}
          </button>
        ))}
      </div>
      <button onClick={() => setFilled(f => !f)} style={{ ...BTN, width: 'auto', padding: '0 8px', gap: 5, fontSize: 10, fontWeight: 600, background: filled ? 'var(--accent)' : 'var(--surface2)', color: filled ? 'white' : 'var(--text2)' }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg>
        {t('Fill on/off')}
      </button>
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
        <button title={t('Select')} onClick={() => { setTool('select'); selIdRef.current = null; render() }} style={tb(tool === 'select')}>
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
                <button key={c} onClick={() => { setColor(c); setShowColors(false) }}
                  title={`${t('Color')} ${c}`}
                  style={{ width: 24, height: 24, borderRadius: 5, background: c, border: c === color ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.25)', cursor: 'pointer' }} />
              ))}
              <ColorSwatch value={color} onChange={v => { setColor(v); setShowColors(false) }}
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
          </div>
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
