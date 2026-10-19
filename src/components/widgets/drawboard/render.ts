import type { DrawElement, DrawPoint as Pt, DrawArrowHead } from '@/types'
import {
  type Box, type ById, type EdgePath,
  normBox, boxW, boxH, boxCenter, isShape, isEdge, labelBox,
  traceOutline, traceDecorations, resolveEdge, sampleEdge, polylineMidpoint,
  edgeArrows, edgeEndAngles, headInset, arrowSize, elBox, unionBox,
} from './geometry'

export const SELECT_COLOR = '#3b82f6'
export const HANDLE_PAD = 5

// ─── Text ─────────────────────────────────────────────────────────────────────

export const FONT_FAMILIES: Record<NonNullable<DrawElement['fontFamily']>, string> = {
  sans:  'sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono:  'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  hand:  '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
}
export const LINE_HEIGHT = 1.25
export const DEFAULT_LABEL_SIZE = 14

export function fontOf(el: Pick<DrawElement, 'fontFamily' | 'bold' | 'italic'>, size: number) {
  return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${size}px ${FONT_FAMILIES[el.fontFamily ?? 'sans']}`
}

let measureCtx: CanvasRenderingContext2D | null | undefined
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  }
  return measureCtx
}
export function measureWidth(text: string, font: string, size: number): number {
  const ctx = getMeasureCtx()
  if (!ctx) return text.length * size * 0.55
  ctx.font = font
  return ctx.measureText(text).width
}

// Word-wraps at `maxW` (explicit newlines always break); a single word
// wider than maxW stays on its own line rather than being split.
export function wrapLines(text: string, font: string, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/)
    let line = ''
    for (const w of words) {
      const next = line + w
      if (line.trim() && measureWidth(next.trimEnd(), font, size) > maxW) {
        out.push(line.trimEnd())
        line = w.trimStart()
      } else line = next
    }
    out.push(line.trimEnd())
  }
  return out
}

// Text elements size themselves to their content (top-left anchored).
export function refitText(el: DrawElement): DrawElement {
  const fs = el.fontSize ?? 16
  const lines = (el.text ?? '').split('\n')
  const font = fontOf(el, fs)
  const w = Math.max(4, ...lines.map(l => measureWidth(l, font, fs)))
  return { ...el, x2: el.x + w, y2: el.y + lines.length * fs * LINE_HEIGHT }
}

// Boards saved before multi-line text stored `y` as the first line's
// baseline; move it to the top edge once so everything else can assume that.
export function normalizeElements(els: DrawElement[]): DrawElement[] {
  if (!els.some(el => el.type === 'text' && !el.textTop)) return els
  return els.map(el => {
    if (el.type !== 'text' || el.textTop) return el
    const fs = el.fontSize ?? 16
    return refitText({ ...el, y: el.y - fs * 0.8, textTop: true })
  })
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function srand(s: number) { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x) }
export { srand }

export function applyStrokeDash(ctx: CanvasRenderingContext2D, el: DrawElement) {
  if (el.strokeStyle === 'dashed') ctx.setLineDash([el.strokeWidth * 2.5 + 5, el.strokeWidth * 1.8 + 3])
  else if (el.strokeStyle === 'dotted') { ctx.setLineDash([0.1, el.strokeWidth * 1.8 + 4]); ctx.lineCap = 'round' }
  else ctx.setLineDash([])
}

// 'solid'/undefined keeps the original look (translucent stroke-color fill
// when no style was ever chosen, so old boards render identically);
// hachure/cross-hatch stroke parallel diagonals clipped to the outline.
function fillShape(ctx: CanvasRenderingContext2D, el: DrawElement, path: Path2D, b: Box) {
  const style = el.fillStyle
  const bg = el.bgColor ?? el.color
  if (!style || style === 'solid') {
    ctx.fillStyle = style === 'solid' ? bg : el.color + '33'
    ctx.fill(path)
    return
  }
  ctx.save()
  ctx.clip(path)
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = bg
  ctx.lineWidth = Math.max(1, el.strokeWidth * 0.35)
  ctx.setLineDash([])
  const c = boxCenter(b)
  const diag = Math.hypot(boxW(b), boxH(b)) || 1
  const drawAngle = (angle: number) => {
    const cos = Math.cos(angle), sin = Math.sin(angle)
    ctx.beginPath()
    for (let o = -diag; o <= diag; o += 6) {
      const px = c.x - sin * o, py = c.y + cos * o
      ctx.moveTo(px - cos * diag, py - sin * diag)
      ctx.lineTo(px + cos * diag, py + sin * diag)
    }
    ctx.stroke()
  }
  drawAngle(Math.PI / 4)
  if (style === 'cross-hatch') drawAngle(-Math.PI / 4)
  ctx.restore()
}

function setShadow(ctx: CanvasRenderingContext2D, scale: number) {
  ctx.shadowColor = 'rgba(0,0,0,0.28)'
  ctx.shadowBlur = 8 * scale
  ctx.shadowOffsetX = 3 * scale
  ctx.shadowOffsetY = 3 * scale
}
function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
}

// ─── Freehand brushes ─────────────────────────────────────────────────────────

function drawFreehand(ctx: CanvasRenderingContext2D, el: DrawElement) {
  const pts = el.points ?? []
  if (pts.length < 1) return
  const bt = el.brushType ?? 'pen'
  if (bt.startsWith('custom-')) return

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
        const dist = srand(seed + 100) * r
        ctx.beginPath()
        ctx.arc(pt.x + Math.cos(angle) * dist, pt.y + Math.sin(angle) * dist, dotR, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (bt === 'marker') {
    ctx.globalAlpha *= 0.5
    ctx.lineWidth *= 3
    drawBezier(); ctx.stroke()
  } else if (bt === 'highlighter') {
    ctx.globalAlpha *= 0.22
    ctx.lineWidth *= 9
    ctx.lineCap = 'square'
    drawBezier(); ctx.stroke()
  } else if (bt === 'chalk') {
    const baseAlpha = ctx.globalAlpha
    for (let pass = 0; pass < 3; pass++) {
      ctx.globalAlpha = baseAlpha * (0.25 + srand(pass * 7 + pts.length) * 0.35)
      ctx.lineWidth = el.strokeWidth * (0.8 + srand(pass * 13) * 0.5)
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
    if (pts.length < 2) return

    // Pre-smooth raw mouse points (2 passes of weighted 3-pt average)
    let spts = pts as { x: number; y: number }[]
    for (let pass = 0; pass < 2; pass++) {
      spts = spts.map((p, i) =>
        i === 0 || i === spts.length - 1 ? p
          : { x: (spts[i - 1].x + p.x * 2 + spts[i + 1].x) / 4, y: (spts[i - 1].y + p.y * 2 + spts[i + 1].y) / 4 },
      )
    }
    // Adaptive EMA on direction with a capped alpha (never responds too fast)
    const lx: number[] = [], ly: number[] = [], rx: number[] = [], ry: number[] = []
    let avgDx = spts[1].x - spts[0].x || 1
    let avgDy = spts[1].y - spts[0].y || 0
    let prevW = el.strokeWidth * 0.7
    for (let i = 0; i < spts.length; i++) {
      const rdx = i > 0 ? spts[i].x - spts[i - 1].x : avgDx
      const rdy = i > 0 ? spts[i].y - spts[i - 1].y : avgDy
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
      const dir = Math.atan2(avgDy, avgDx)
      const rawW = Math.max(0.15, el.strokeWidth * Math.abs(Math.cos(dir - nibAngle)) * 1.4 + 0.15)
      prevW = 0.10 * rawW + 0.90 * prevW
      const perp = dir + Math.PI / 2
      const cp = Math.cos(perp), sp = Math.sin(perp)
      lx.push(spts[i].x + cp * prevW); ly.push(spts[i].y + sp * prevW)
      rx.push(spts[i].x - cp * prevW); ry.push(spts[i].y - sp * prevW)
    }
    // Post-smooth the outline to remove residual jitter
    const smArr = (a: number[]) => a.map((v, i) => i === 0 || i === a.length - 1 ? v : (a[i - 1] + v * 2 + a[i + 1]) / 4)
    const slx = smArr(lx), sly = smArr(ly), srx = smArr(rx), sry = smArr(ry)
    if (slx.length < 2) return
    ctx.beginPath()
    ctx.moveTo(slx[0], sly[0])
    for (let i = 1; i < slx.length - 1; i++) {
      const mx = (slx[i] + slx[i + 1]) / 2, my = (sly[i] + sly[i + 1]) / 2
      ctx.quadraticCurveTo(slx[i], sly[i], mx, my)
    }
    ctx.lineTo(slx[slx.length - 1], sly[sly.length - 1])
    for (let i = srx.length - 1; i >= 1; i--) {
      const mx = (srx[i] + srx[i - 1]) / 2, my = (sry[i] + sry[i - 1]) / 2
      ctx.quadraticCurveTo(srx[i], sry[i], mx, my)
    }
    ctx.lineTo(srx[0], sry[0])
    ctx.closePath(); ctx.fill()
  } else {
    drawBezier(); ctx.stroke()
  }
}

// ─── Edges ────────────────────────────────────────────────────────────────────

export function drawHead(ctx: CanvasRenderingContext2D, tip: Pt, angle: number, head: DrawArrowHead, sw: number, color: string) {
  if (head === 'none') return
  const h = arrowSize(sw)
  const cos = Math.cos(angle), sin = Math.sin(angle)
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = color
  ctx.strokeStyle = color
  if (head === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x - h * Math.cos(angle - Math.PI / 6), tip.y - h * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(tip.x - h * Math.cos(angle + Math.PI / 6), tip.y - h * Math.sin(angle + Math.PI / 6))
    ctx.closePath(); ctx.fill()
  } else if (head === 'open') {
    ctx.lineWidth = sw
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(tip.x - h * Math.cos(angle - 0.5), tip.y - h * Math.sin(angle - 0.5))
    ctx.lineTo(tip.x, tip.y)
    ctx.lineTo(tip.x - h * Math.cos(angle + 0.5), tip.y - h * Math.sin(angle + 0.5))
    ctx.stroke()
  } else if (head === 'diamond') {
    const back = { x: tip.x - cos * h, y: tip.y - sin * h }
    const mid = { x: tip.x - cos * h / 2, y: tip.y - sin * h / 2 }
    const w = h * 0.32
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(mid.x - sin * w, mid.y + cos * w)
    ctx.lineTo(back.x, back.y)
    ctx.lineTo(mid.x + sin * w, mid.y - cos * w)
    ctx.closePath(); ctx.fill()
  } else if (head === 'circle') {
    const r = h * 0.3
    ctx.beginPath()
    ctx.arc(tip.x - cos * r, tip.y - sin * r, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// The visible shaft: both ends pulled back behind their heads.
export function shaftPath(path: EdgePath, el: DrawElement): EdgePath {
  const { start, end } = edgeArrows(el)
  const ang = edgeEndAngles(path)
  const pts = path.pts.map(p => ({ ...p }))
  const n = pts.length
  const si = headInset(start, el.strokeWidth), ei = headInset(end, el.strokeWidth)
  const total = Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y)
  if (si && total > si + ei) { pts[0].x -= Math.cos(ang.start) * si; pts[0].y -= Math.sin(ang.start) * si }
  if (ei && total > si + ei) { pts[n - 1].x -= Math.cos(ang.end) * ei; pts[n - 1].y -= Math.sin(ang.end) * ei }
  return { pts, curved: path.curved }
}

export function traceEdge(ctx: CanvasRenderingContext2D | Path2D, path: EdgePath) {
  const p = path.pts
  ctx.moveTo(p[0].x, p[0].y)
  if (path.curved) ctx.bezierCurveTo(p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y)
  else for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y)
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export function labelLayout(el: DrawElement, box: Box) {
  const fs = el.fontSize ?? DEFAULT_LABEL_SIZE
  const font = fontOf(el, fs)
  const maxW = Math.max(20, boxW(box) - 12)
  const lines = wrapLines(el.label ?? '', font, fs, maxW)
  return { fs, font, lines, lh: fs * LINE_HEIGHT }
}

function drawLabel(ctx: CanvasRenderingContext2D, el: DrawElement, box: Box, bgColor: string | null) {
  const { fs, font, lines, lh } = labelLayout(el, box)
  const align = el.textAlign ?? 'center'
  const totalH = lines.length * lh
  const top = (box.y1 + box.y2) / 2 - totalH / 2
  ctx.save()
  clearShadow(ctx)
  ctx.font = font
  ctx.textBaseline = 'top'
  ctx.textAlign = align
  const x = align === 'left' ? box.x1 + 6 : align === 'right' ? box.x2 - 6 : (box.x1 + box.x2) / 2
  if (bgColor) {
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 8
    const bx = align === 'left' ? x - 4 : align === 'right' ? x - w + 4 : x - w / 2
    ctx.fillStyle = bgColor
    ctx.fillRect(bx, top - 2, w, totalH + 4)
  }
  ctx.fillStyle = el.fontColor ?? el.color
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lh + (lh - fs) / 2))
  ctx.restore()
}

export function edgeLabelBox(el: DrawElement, byId: ById): Box {
  const mid = polylineMidpoint(sampleEdge(resolveEdge(el, byId)))
  return { x1: mid.x - 80, y1: mid.y - 10, x2: mid.x + 80, y2: mid.y + 10 }
}

// ─── Elements ─────────────────────────────────────────────────────────────────

export interface DrawOpts {
  scale: number
  byId: ById
  // Background behind edge labels (so a label sits ON the line, not crossed by it).
  canvasColor: string
  editingId?: string | null
  dark?: boolean
}

// Default black ink is drawn light on the dark canvas (like draw.io's dark
// mode) — display only, the stored color stays the same.
const INK = new Set(['#111827', '#000000', '#000'])
const LIGHT_INK = '#e5e7eb'
const swapInk = (c: string | undefined) => c && INK.has(c.toLowerCase()) ? LIGHT_INK : c
export function adaptInk(el: DrawElement): DrawElement {
  const color = swapInk(el.color)!
  const fontColor = swapInk(el.fontColor)
  const bgColor = swapInk(el.bgColor)
  return color === el.color && fontColor === el.fontColor && bgColor === el.bgColor ? el : { ...el, color, fontColor, bgColor }
}

export function drawElement(ctx: CanvasRenderingContext2D, el: DrawElement, o: DrawOpts) {
  if (o.dark) el = adaptInk(el)
  ctx.save()
  ctx.globalAlpha = (el.opacity ?? 100) / 100
  ctx.strokeStyle = el.color
  ctx.fillStyle = el.color + '33'
  ctx.lineWidth = el.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  applyStrokeDash(ctx, el)
  const showLabel = !!el.label && o.editingId !== el.id

  if (el.type === 'freedraw') {
    drawFreehand(ctx, el)
  } else if (isShape(el)) {
    const b = normBox(el.x, el.y, el.x2, el.y2)
    if (boxW(b) >= 1 || boxH(b) >= 1) {
      const path = new Path2D()
      traceOutline(path, el, b)
      if (el.shadow) setShadow(ctx, o.scale)
      const solid = el.filled && (!el.fillStyle || el.fillStyle === 'solid')
      if (el.filled) fillShape(ctx, el, path, b)
      if (solid) clearShadow(ctx)
      applyStrokeDash(ctx, el)
      if (el.strokeWidth > 0) ctx.stroke(path)
      clearShadow(ctx)
      const deco = new Path2D()
      if (traceDecorations(deco, el, b) && el.strokeWidth > 0) ctx.stroke(deco)
      if (showLabel) drawLabel(ctx, el, labelBox(el, b), null)
    }
  } else if (isEdge(el)) {
    const path = resolveEdge(el, o.byId)
    const shaft = shaftPath(path, el)
    if (el.shadow) setShadow(ctx, o.scale)
    ctx.beginPath(); traceEdge(ctx, shaft); ctx.stroke()
    const { start, end } = edgeArrows(el)
    const ang = edgeEndAngles(path)
    drawHead(ctx, path.pts[path.pts.length - 1], ang.end, end, el.strokeWidth, el.color)
    drawHead(ctx, path.pts[0], ang.start, start, el.strokeWidth, el.color)
    clearShadow(ctx)
    if (showLabel) drawLabel(ctx, el, edgeLabelBox(el, o.byId), o.canvasColor)
  } else if (el.type === 'text' && o.editingId !== el.id) {
    const fs = el.fontSize ?? 16
    ctx.font = fontOf(el, fs)
    ctx.fillStyle = el.color
    if (el.shadow) setShadow(ctx, o.scale)
    const lines = (el.text ?? '').split('\n')
    if (!el.textTop) {
      ctx.fillText(lines.join(' '), el.x, el.y)
    } else {
      const align = el.textAlign ?? 'left'
      const w = el.x2 - el.x
      ctx.textBaseline = 'top'
      ctx.textAlign = align
      const x = align === 'left' ? el.x : align === 'right' ? el.x + w : el.x + w / 2
      lines.forEach((line, i) => ctx.fillText(line, x, el.y + i * fs * LINE_HEIGHT + fs * (LINE_HEIGHT - 1) / 2))
    }
  }
  ctx.restore()
}

// ─── Selection overlay ────────────────────────────────────────────────────────

export type HandleName = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'start' | 'end'

export function getHandlePoints(el: DrawElement, byId: ById, pad = HANDLE_PAD): Partial<Record<HandleName, Pt>> {
  if (isEdge(el)) {
    const path = resolveEdge(el, byId)
    return { start: path.pts[0], end: path.pts[path.pts.length - 1] }
  }
  const x1 = Math.min(el.x, el.x2) - pad, y1 = Math.min(el.y, el.y2) - pad
  const x2 = Math.max(el.x, el.x2) + pad, y2 = Math.max(el.y, el.y2) + pad
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  // Text resizes proportionally (font size) — corners only.
  if (el.type === 'text') return { nw: { x: x1, y: y1 }, ne: { x: x2, y: y1 }, sw: { x: x1, y: y2 }, se: { x: x2, y: y2 } }
  return {
    nw: { x: x1, y: y1 }, n: { x: mx, y: y1 }, ne: { x: x2, y: y1 },
    w:  { x: x1, y: my },                       e:  { x: x2, y: my },
    sw: { x: x1, y: y2 }, s: { x: mx, y: y2 }, se: { x: x2, y: y2 },
  }
}

export type QuickDir = 'up' | 'right' | 'down' | 'left'
// draw.io's hover "connection arrows" — just outside each side of the shape.
export function quickArrowPoints(el: DrawElement, scale: number): { dir: QuickDir; p: Pt }[] {
  const b = normBox(el.x, el.y, el.x2, el.y2)
  const off = HANDLE_PAD + 18 / scale
  const c = boxCenter(b)
  return [
    { dir: 'up', p: { x: c.x, y: b.y1 - off } },
    { dir: 'right', p: { x: b.x2 + off, y: c.y } },
    { dir: 'down', p: { x: c.x, y: b.y2 + off } },
    { dir: 'left', p: { x: b.x1 - off, y: c.y } },
  ]
}

const DIR_ANGLE: Record<QuickDir, number> = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI }

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.fillStyle = SELECT_COLOR
  ctx.strokeStyle = SELECT_COLOR
  ctx.lineWidth = 1.4 * s
  ctx.fillRect(x - 4 * s, y - 1 * s, 8 * s, 6 * s)
  ctx.beginPath()
  ctx.arc(x, y - 1 * s, 2.6 * s, Math.PI, 0)
  ctx.stroke()
  ctx.restore()
}

export interface OverlayOpts {
  scale: number
  byId: ById
  selected: Set<string>
  showHandles: boolean
  showQuick: boolean
  bindHoverId: string | null
}

export function drawSelectionOverlay(ctx: CanvasRenderingContext2D, els: DrawElement[], o: OverlayOpts) {
  const s = 1 / o.scale
  const single = o.selected.size === 1
  const groups = new Map<string, Box[]>()

  for (const el of els) {
    if (!o.selected.has(el.id)) continue
    ctx.save()
    ctx.strokeStyle = SELECT_COLOR
    ctx.lineWidth = 1.5 * s
    if (el.groupId) {
      const list = groups.get(el.groupId) ?? []
      list.push(elBox(el, o.byId)); groups.set(el.groupId, list)
    }
    if (isEdge(el)) {
      const path = resolveEdge(el, o.byId)
      ctx.globalAlpha = 0.25
      ctx.lineWidth = el.strokeWidth + 6 * s
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath(); traceEdge(ctx, path); ctx.stroke()
      ctx.globalAlpha = 1
      if (single && o.showHandles && !el.locked) {
        const ends: [Pt, boolean][] = [[path.pts[0], !!el.startId], [path.pts[path.pts.length - 1], !!el.endId]]
        for (const [p, bound] of ends) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 5 * s, 0, Math.PI * 2)
          ctx.fillStyle = bound ? SELECT_COLOR : '#fff'
          ctx.lineWidth = 1.5 * s
          ctx.fill(); ctx.stroke()
        }
      }
    } else {
      const pad = HANDLE_PAD
      const b = normBox(el.x, el.y, el.x2, el.y2)
      ctx.setLineDash([5 * s, 3 * s])
      ctx.strokeRect(b.x1 - pad, b.y1 - pad, boxW(b) + pad * 2, boxH(b) + pad * 2)
      ctx.setLineDash([])
      if (el.locked) drawLock(ctx, b.x2 + pad, b.y1 - pad, s)
      else if (single && o.showHandles) {
        const hs = 7 * s
        ctx.fillStyle = '#fff'
        const points = getHandlePoints(el, o.byId)
        for (const name of Object.keys(points) as HandleName[]) {
          const p = points[name]; if (!p) continue
          ctx.beginPath(); ctx.rect(p.x - hs / 2, p.y - hs / 2, hs, hs); ctx.fill(); ctx.stroke()
        }
        if (o.showQuick && isShape(el)) {
          ctx.fillStyle = SELECT_COLOR
          ctx.globalAlpha = 0.75
          for (const { dir, p } of quickArrowPoints(el, o.scale)) {
            const a = DIR_ANGLE[dir], r = 6 * s
            ctx.beginPath()
            ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)
            ctx.lineTo(p.x + Math.cos(a + 2.4) * r, p.y + Math.sin(a + 2.4) * r)
            ctx.lineTo(p.x + Math.cos(a - 2.4) * r, p.y + Math.sin(a - 2.4) * r)
            ctx.closePath(); ctx.fill()
          }
          ctx.globalAlpha = 1
        }
      }
    }
    ctx.restore()
  }

  // One box around each selected group, so grouping is visible at a glance.
  for (const boxes of groups.values()) {
    if (boxes.length < 2) continue
    const g = unionBox(boxes)!
    const pad = HANDLE_PAD * 2.4
    ctx.save()
    ctx.strokeStyle = SELECT_COLOR
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1 * s
    ctx.setLineDash([2 * s, 3 * s])
    ctx.strokeRect(g.x1 - pad, g.y1 - pad, boxW(g) + pad * 2, boxH(g) + pad * 2)
    ctx.restore()
  }

  if (o.bindHoverId) {
    const t = o.byId.get(o.bindHoverId)
    if (t) {
      const b = normBox(t.x, t.y, t.x2, t.y2)
      ctx.save()
      ctx.strokeStyle = SELECT_COLOR
      ctx.lineWidth = 2.5 * s
      ctx.globalAlpha = 0.85
      if (isShape(t)) {
        const path = new Path2D(); traceOutline(path, t, b); ctx.stroke(path)
      } else ctx.strokeRect(b.x1 - 3 * s, b.y1 - 3 * s, boxW(b) + 6 * s, boxH(b) + 6 * s)
      const c = boxCenter(b)
      ctx.fillStyle = SELECT_COLOR
      ctx.beginPath(); ctx.arc(c.x, c.y, 3.5 * s, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  }
}

export function drawGuides(ctx: CanvasRenderingContext2D, gx: number | null, gy: number | null, view: Box, scale: number) {
  if (gx === null && gy === null) return
  ctx.save()
  ctx.strokeStyle = '#ec4899'
  ctx.lineWidth = 1 / scale
  ctx.setLineDash([4 / scale, 3 / scale])
  ctx.beginPath()
  if (gx !== null) { ctx.moveTo(gx, view.y1); ctx.lineTo(gx, view.y2) }
  if (gy !== null) { ctx.moveTo(view.x1, gy); ctx.lineTo(view.x2, gy) }
  ctx.stroke()
  ctx.restore()
}
