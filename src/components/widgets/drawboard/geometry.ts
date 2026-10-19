import type { DrawElement, DrawPoint as Pt, DrawShapeType, DrawArrowHead, DrawEdgeStyle } from '@/types'

// Pure geometry for the drawboard — no React, no canvas state. Shared by the
// canvas renderer, the SVG exporter and the widget's pointer handling, so a
// shape's outline, its hit area and its connector anchor points can never
// disagree with each other.

export type Box = { x1: number; y1: number; x2: number; y2: number }
export type ById = Map<string, DrawElement>

export const GRID = 20

export const SHAPE_TYPES: readonly DrawShapeType[] = [
  'rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'parallelogram',
  'cylinder', 'document', 'cloud', 'note', 'callout', 'process', 'star',
]

export function isShape(el: DrawElement): boolean {
  return (SHAPE_TYPES as readonly string[]).includes(el.type)
}
export function isEdge(el: DrawElement): boolean {
  return el.type === 'line' || el.type === 'arrow'
}
// Things a connector end may attach to.
export function isBindable(el: DrawElement): boolean {
  return isShape(el) || el.type === 'text'
}

export interface ShapePreset {
  id: string
  label: string
  type: DrawShapeType
  w: number
  h: number
  round?: boolean
  aspect?: boolean
}

// Modeled on draw.io's "General" sidebar palette (Sidebar.addGeneralPalette).
export const SHAPE_LIBRARY: ShapePreset[] = [
  { id: 'rect',          label: 'Rectangle',         type: 'rect',          w: 120, h: 60 },
  { id: 'roundRect',     label: 'Rounded rectangle', type: 'rect',          w: 120, h: 60, round: true },
  { id: 'square',        label: 'Square shape',            type: 'rect',          w: 80,  h: 80, aspect: true },
  { id: 'ellipse',       label: 'Ellipse',           type: 'ellipse',       w: 120, h: 80 },
  { id: 'circle',        label: 'Circle',            type: 'ellipse',       w: 80,  h: 80, aspect: true },
  { id: 'diamond',       label: 'Diamond',           type: 'diamond',       w: 80,  h: 80 },
  { id: 'triangle',      label: 'Triangle',          type: 'triangle',      w: 60,  h: 80 },
  { id: 'hexagon',       label: 'Hexagon',           type: 'hexagon',       w: 120, h: 80 },
  { id: 'parallelogram', label: 'Parallelogram',     type: 'parallelogram', w: 120, h: 60 },
  { id: 'process',       label: 'Process',           type: 'process',       w: 120, h: 60 },
  { id: 'cylinder',      label: 'Cylinder',          type: 'cylinder',      w: 60,  h: 80 },
  { id: 'document',      label: 'Document',          type: 'document',      w: 120, h: 80 },
  { id: 'cloud',         label: 'Cloud',             type: 'cloud',         w: 120, h: 80 },
  { id: 'note',          label: 'Note',              type: 'note',          w: 80,  h: 100 },
  { id: 'callout',       label: 'Callout',           type: 'callout',       w: 120, h: 80 },
  { id: 'star',          label: 'Star',              type: 'star',          w: 80,  h: 80, aspect: true },
]

// ─── Boxes ────────────────────────────────────────────────────────────────────

export function normBox(x1: number, y1: number, x2: number, y2: number): Box {
  return { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) }
}
export const boxW = (b: Box) => b.x2 - b.x1
export const boxH = (b: Box) => b.y2 - b.y1
export const boxCenter = (b: Box): Pt => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 })

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const b of boxes) { x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2) }
  return { x1, y1, x2, y2 }
}
export function boxContains(b: Box, p: Pt, pad = 0): boolean {
  return p.x >= b.x1 - pad && p.x <= b.x2 + pad && p.y >= b.y1 - pad && p.y <= b.y2 + pad
}
export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x2 >= b.x1 && a.x1 <= b.x2 && a.y2 >= b.y1 && a.y1 <= b.y2
}

// Logical rect of a flood-fill raster (s. DrawElement.fillPanX in types).
export function fillBox(el: DrawElement): Box {
  const px = el.fillPanX ?? 0, py = el.fillPanY ?? 0, s = el.fillScale ?? 1
  return { x1: -px / s, y1: -py / s, x2: (el.x2 - px) / s, y2: (el.y2 - py) / s }
}

export function elBox(el: DrawElement, byId?: ById): Box {
  if (el.type === 'fill') return fillBox(el)
  if (isEdge(el)) {
    const samples = sampleEdge(resolveEdge(el, byId ?? new Map()))
    return unionBox(samples.map(p => ({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })))!
  }
  return normBox(el.x, el.y, el.x2, el.y2)
}

// ─── Shape outlines ───────────────────────────────────────────────────────────

// Structural subset of CanvasRenderingContext2D, so the same outline code
// drives both the canvas and the SVG exporter's path-string builder.
export interface PathSink {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  closePath(): void
}

const K = 0.5522847498

function traceEllipse(p: PathSink, cx: number, cy: number, rx: number, ry: number) {
  const kx = rx * K, ky = ry * K
  p.moveTo(cx + rx, cy)
  p.bezierCurveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
  p.bezierCurveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
  p.bezierCurveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
  p.bezierCurveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
  p.closePath()
}

function tracePolygon(p: PathSink, pts: Pt[]) {
  p.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y)
  p.closePath()
}

export function cornerRadius(b: Box) {
  const w = boxW(b), h = boxH(b)
  return Math.min(Math.min(w, h) * 0.12 + 2, w / 2, h / 2)
}
const cylCap = (b: Box) => Math.min(boxH(b) * 0.12 + 2, boxH(b) / 3, boxW(b) / 2)
const docWave = (b: Box) => boxH(b) * 0.1
const noteFold = (b: Box) => Math.min(20, Math.min(boxW(b), boxH(b)) * 0.3)
const calloutTail = (b: Box) => boxH(b) * 0.25

// Vertex list for shapes that ARE polygons — used for outline, hit testing
// and connector anchoring alike. null = curved/compound shape.
export function shapePolygon(type: string, b: Box): Pt[] | null {
  const { x1, y1, x2, y2 } = b
  const w = x2 - x1, h = y2 - y1, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
  switch (type) {
    case 'triangle': return [{ x: cx, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
    case 'diamond': return [{ x: cx, y: y1 }, { x: x2, y: cy }, { x: cx, y: y2 }, { x: x1, y: cy }]
    case 'hexagon': {
      const s = Math.min(w * 0.25, h * 0.6)
      return [{ x: x1 + s, y: y1 }, { x: x2 - s, y: y1 }, { x: x2, y: cy }, { x: x2 - s, y: y2 }, { x: x1 + s, y: y2 }, { x: x1, y: cy }]
    }
    case 'parallelogram': {
      const s = Math.min(w * 0.2, h)
      return [{ x: x1 + s, y: y1 }, { x: x2, y: y1 }, { x: x2 - s, y: y2 }, { x: x1, y: y2 }]
    }
    case 'star': {
      const pts: Pt[] = []
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? 0.45 : 1
        pts.push({ x: cx + Math.cos(a) * (w / 2) * r, y: cy + Math.sin(a) * (h / 2) * r })
      }
      return pts
    }
    default: return null
  }
}

// Normalized cloud outline (0..1 box), cubic segments after the start point.
const CLOUD: number[][] = [
  [0.25, 0.25],
  [0.05, 0.25, 0, 0.5, 0.16, 0.55],
  [0, 0.7, 0.18, 0.95, 0.32, 0.85],
  [0.42, 1, 0.72, 1, 0.8, 0.85],
  [1, 0.85, 1, 0.6, 0.88, 0.5],
  [1, 0.3, 0.85, 0.12, 0.7, 0.2],
  [0.6, 0.02, 0.3, 0.05, 0.25, 0.25],
]

export function traceOutline(p: PathSink, el: { type: string; roundCorners?: boolean }, b: Box) {
  const { x1, y1, x2, y2 } = b
  const w = x2 - x1, h = y2 - y1, cx = (x1 + x2) / 2
  const poly = shapePolygon(el.type, b)
  if (poly) { tracePolygon(p, poly); return }
  switch (el.type) {
    case 'ellipse': traceEllipse(p, cx, (y1 + y2) / 2, w / 2, h / 2); return
    case 'cylinder': {
      const e = cylCap(b), kx = (w / 2) * K, ky = e * K
      p.moveTo(x1, y1 + e)
      p.bezierCurveTo(x1, y1 + e - ky, cx - kx, y1, cx, y1)
      p.bezierCurveTo(cx + kx, y1, x2, y1 + e - ky, x2, y1 + e)
      p.lineTo(x2, y2 - e)
      p.bezierCurveTo(x2, y2 - e + ky, cx + kx, y2, cx, y2)
      p.bezierCurveTo(cx - kx, y2, x1, y2 - e + ky, x1, y2 - e)
      p.closePath()
      return
    }
    case 'document': {
      const s = docWave(b)
      p.moveTo(x1, y1); p.lineTo(x2, y1); p.lineTo(x2, y2 - s)
      p.quadraticCurveTo(x2 - w / 4, y2 - 3 * s, cx, y2 - s)
      p.quadraticCurveTo(x1 + w / 4, y2 + s, x1, y2 - s)
      p.closePath()
      return
    }
    case 'cloud': {
      const X = (v: number) => x1 + v * w, Y = (v: number) => y1 + v * h
      p.moveTo(X(CLOUD[0][0]), Y(CLOUD[0][1]))
      for (let i = 1; i < CLOUD.length; i++) {
        const c = CLOUD[i]
        p.bezierCurveTo(X(c[0]), Y(c[1]), X(c[2]), Y(c[3]), X(c[4]), Y(c[5]))
      }
      p.closePath()
      return
    }
    case 'note': {
      const f = noteFold(b)
      p.moveTo(x1, y1); p.lineTo(x2 - f, y1); p.lineTo(x2, y1 + f); p.lineTo(x2, y2); p.lineTo(x1, y2)
      p.closePath()
      return
    }
    case 'callout': {
      const yb = y2 - calloutTail(b)
      p.moveTo(x1, y1); p.lineTo(x2, y1); p.lineTo(x2, yb)
      p.lineTo(x1 + w * 0.55, yb); p.lineTo(x1 + w * 0.3, y2); p.lineTo(x1 + w * 0.35, yb)
      p.lineTo(x1, yb)
      p.closePath()
      return
    }
    default: {
      // rect, process
      if (el.type === 'rect' && el.roundCorners) {
        const r = cornerRadius(b), k = r * (1 - K)
        p.moveTo(x1 + r, y1); p.lineTo(x2 - r, y1)
        p.bezierCurveTo(x2 - k, y1, x2, y1 + k, x2, y1 + r); p.lineTo(x2, y2 - r)
        p.bezierCurveTo(x2, y2 - k, x2 - k, y2, x2 - r, y2); p.lineTo(x1 + r, y2)
        p.bezierCurveTo(x1 + k, y2, x1, y2 - k, x1, y2 - r); p.lineTo(x1, y1 + r)
        p.bezierCurveTo(x1, y1 + k, x1 + k, y1, x1 + r, y1)
        p.closePath()
        return
      }
      tracePolygon(p, [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }])
    }
  }
}

// Inner strokes that aren't part of the filled outline. Returns false when
// the shape has none (so the caller can skip an empty stroke()).
export function traceDecorations(p: PathSink, el: { type: string }, b: Box): boolean {
  const { x1, y1, x2, y2 } = b
  const w = x2 - x1, cx = (x1 + x2) / 2
  switch (el.type) {
    case 'cylinder': {
      const e = cylCap(b), kx = (w / 2) * K, ky = e * K
      p.moveTo(x1, y1 + e)
      p.bezierCurveTo(x1, y1 + e + ky, cx - kx, y1 + 2 * e, cx, y1 + 2 * e)
      p.bezierCurveTo(cx + kx, y1 + 2 * e, x2, y1 + e + ky, x2, y1 + e)
      return true
    }
    case 'note': {
      const f = noteFold(b)
      p.moveTo(x2 - f, y1); p.lineTo(x2 - f, y1 + f); p.lineTo(x2, y1 + f)
      return true
    }
    case 'process': {
      const s = Math.min(w * 0.1, 20)
      p.moveTo(x1 + s, y1); p.lineTo(x1 + s, y2)
      p.moveTo(x2 - s, y1); p.lineTo(x2 - s, y2)
      return true
    }
    default: return false
  }
}

// Where a label sits inside its shape (excludes caps/tails/waves).
export function labelBox(el: DrawElement, b: Box): Box {
  switch (el.type) {
    case 'cylinder': return { ...b, y1: b.y1 + cylCap(b) * 2 }
    case 'document': return { ...b, y2: b.y2 - docWave(b) }
    case 'callout':  return { ...b, y2: b.y2 - calloutTail(b) }
    case 'process': { const s = Math.min(boxW(b) * 0.1, 20); return { ...b, x1: b.x1 + s, x2: b.x2 - s } }
    case 'triangle': return { ...b, y1: b.y1 + boxH(b) * 0.4 }
    default: return b
  }
}

// ─── Hit testing helpers ──────────────────────────────────────────────────────

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], c = poly[j]
    if ((a.y > p.y) !== (c.y > p.y) && p.x < ((c.x - a.x) * (p.y - a.y)) / (c.y - a.y || 1e-9) + a.x) inside = !inside
  }
  return inside
}

function polylineDist(p: Pt, pts: Pt[], closed = false): number {
  let d = Infinity
  const n = pts.length
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = pts[i], c = pts[(i + 1) % n]
    d = Math.min(d, segDist(p.x, p.y, a.x, a.y, c.x, c.y))
  }
  return d
}

// 'strong' = visibly on the element (stroke, filled area, text) — wins over
// any 'weak' hit; 'weak' = the empty interior of an unfilled shape, which
// stays clickable (draw.io-style) without stealing clicks from content
// drawn underneath it.
export type HitKind = 'strong' | 'weak' | null

export function hitShape(el: DrawElement, p: Pt, tol: number): HitKind {
  const b = normBox(el.x, el.y, el.x2, el.y2)
  const t = Math.max(el.strokeWidth / 2, tol)
  const poly = shapePolygon(el.type, b)
  let inside: boolean, nearEdge: boolean
  if (poly) {
    inside = pointInPolygon(p, poly)
    nearEdge = polylineDist(p, poly, true) < t
  } else if (el.type === 'ellipse' || el.type === 'cloud') {
    const c = boxCenter(b), rx = boxW(b) / 2, ry = boxH(b) / 2
    if (rx < 0.5 || ry < 0.5) return null
    const d = Math.hypot((p.x - c.x) / rx, (p.y - c.y) / ry)
    inside = d <= 1
    nearEdge = Math.abs(d - 1) < t / Math.max(1, Math.min(rx, ry))
  } else {
    inside = boxContains(b, p)
    nearEdge = boxContains(b, p, t) && !(p.x > b.x1 + t && p.x < b.x2 - t && p.y > b.y1 + t && p.y < b.y2 - t)
  }
  if (nearEdge) return 'strong'
  if (!inside) return null
  return el.filled || el.label ? 'strong' : 'weak'
}

// ─── Connectors ───────────────────────────────────────────────────────────────

export function edgeArrows(el: DrawElement): { start: DrawArrowHead; end: DrawArrowHead } {
  return { start: el.startArrow ?? 'none', end: el.endArrow ?? (el.type === 'arrow' ? 'arrow' : 'none') }
}

function rayPolygon(c: Pt, d: Pt, poly: Pt[]): number | null {
  let best: number | null = null
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ex = b.x - a.x, ey = b.y - a.y
    const den = d.x * ey - d.y * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / den
    const u = ((a.x - c.x) * d.y - (a.y - c.y) * d.x) / den
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t
  }
  return best
}

// Floating connection point (draw.io's default perimeter): where the ray
// from the shape's center toward `toward` leaves the shape's outline.
export function perimeterPoint(el: DrawElement, toward: Pt): Pt {
  const b = normBox(el.x, el.y, el.x2, el.y2)
  const c = boxCenter(b)
  const dx = toward.x - c.x, dy = toward.y - c.y
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return c
  const hw = boxW(b) / 2, hh = boxH(b) / 2
  const poly = shapePolygon(el.type, b)
  let t: number
  if (poly) {
    t = rayPolygon(c, { x: dx, y: dy }, poly) ?? 0
  } else if (el.type === 'ellipse' || el.type === 'cloud') {
    t = 1 / Math.sqrt((dx / (hw || 1e-9)) ** 2 + (dy / (hh || 1e-9)) ** 2)
  } else {
    t = Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity)
  }
  return { x: c.x + dx * t, y: c.y + dy * t }
}

export interface EdgePath { pts: Pt[]; curved: boolean }

function dedupe(pts: Pt[]): Pt[] {
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.01)
}

export function resolveEdge(el: DrawElement, byId: ById): EdgePath {
  const s = el.startId ? byId.get(el.startId) : undefined
  const e = el.endId ? byId.get(el.endId) : undefined
  const sEl = s && !isEdge(s) ? s : undefined
  const eEl = e && !isEdge(e) ? e : undefined
  let p0: Pt = { x: el.x, y: el.y }, p3: Pt = { x: el.x2, y: el.y2 }
  const sRef = sEl ? boxCenter(normBox(sEl.x, sEl.y, sEl.x2, sEl.y2)) : p0
  const eRef = eEl ? boxCenter(normBox(eEl.x, eEl.y, eEl.x2, eEl.y2)) : p3
  const style: DrawEdgeStyle = el.edgeStyle ?? 'straight'

  if (style === 'straight') {
    if (sEl) p0 = perimeterPoint(sEl, eRef)
    if (eEl) p3 = perimeterPoint(eEl, sRef)
    return { pts: [p0, p3], curved: false }
  }

  const dx = eRef.x - sRef.x, dy = eRef.y - sRef.y
  const horiz = Math.abs(dx) >= Math.abs(dy)
  const dir = horiz ? (Math.sign(dx) || 1) : (Math.sign(dy) || 1)
  const far = (c: Pt, sgn: number): Pt => horiz ? { x: c.x + sgn * 1e6, y: c.y } : { x: c.x, y: c.y + sgn * 1e6 }
  if (sEl) p0 = perimeterPoint(sEl, far(sRef, dir))
  if (eEl) p3 = perimeterPoint(eEl, far(eRef, -dir))

  if (style === 'curved') {
    const c1 = horiz ? { x: (p0.x + p3.x) / 2, y: p0.y } : { x: p0.x, y: (p0.y + p3.y) / 2 }
    const c2 = horiz ? { x: (p0.x + p3.x) / 2, y: p3.y } : { x: p3.x, y: (p0.y + p3.y) / 2 }
    return { pts: [p0, c1, c2, p3], curved: true }
  }
  const pts = horiz
    ? [p0, { x: (p0.x + p3.x) / 2, y: p0.y }, { x: (p0.x + p3.x) / 2, y: p3.y }, p3]
    : [p0, { x: p0.x, y: (p0.y + p3.y) / 2 }, { x: p3.x, y: (p0.y + p3.y) / 2 }, p3]
  return { pts: dedupe(pts), curved: false }
}

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  }
}

export function sampleEdge(path: EdgePath, n = 24): Pt[] {
  if (!path.curved) return path.pts
  const [p0, c1, c2, p3] = path.pts
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) out.push(cubicAt(p0, c1, c2, p3, i / n))
  return out
}

export function polylineMidpoint(pts: Pt[]): Pt {
  if (pts.length === 1) return pts[0]
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let half = total / 2
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (half <= seg) {
      const t = seg ? half / seg : 0
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
    }
    half -= seg
  }
  return pts[pts.length - 1]
}

export function hitEdge(el: DrawElement, p: Pt, tol: number, byId: ById): boolean {
  return polylineDist(p, sampleEdge(resolveEdge(el, byId))) < Math.max(el.strokeWidth / 2 + 2, tol)
}

export function arrowSize(strokeWidth: number) { return Math.max(12, strokeWidth * 4) }

// How far the shaft has to stop short of the tip so it doesn't poke
// through a filled head.
export function headInset(head: DrawArrowHead, strokeWidth: number): number {
  const h = arrowSize(strokeWidth)
  switch (head) {
    case 'arrow': return h * 0.75
    case 'diamond': return h
    case 'circle': return h * 0.6
    default: return 0
  }
}

// Direction the line arrives at each end with (for orienting the heads).
export function edgeEndAngles(path: EdgePath): { start: number; end: number } {
  const pts = path.pts, n = pts.length
  const b = pts[n - 1], d = pts[0]
  let a = pts[n - 2] ?? pts[0]
  if (Math.hypot(b.x - a.x, b.y - a.y) < 0.01) a = pts[0]
  let c = pts[1] ?? pts[0]
  if (Math.hypot(d.x - c.x, d.y - c.y) < 0.01) c = pts[n - 1]
  return { end: Math.atan2(b.y - a.y, b.x - a.x), start: Math.atan2(d.y - c.y, d.x - c.x) }
}

// ─── Moving / resizing ────────────────────────────────────────────────────────

export function translateEl(el: DrawElement, dx: number, dy: number): DrawElement {
  return {
    ...el,
    x: el.x + dx, y: el.y + dy, x2: el.x2 + dx, y2: el.y2 + dy,
    points: el.points?.map(p => ({ x: p.x + dx, y: p.y + dy })),
  }
}

export function resizeEl(orig: DrawElement, origBox: Box, nb: Box): DrawElement {
  if (orig.type === 'freedraw') {
    const sx = (nb.x2 - nb.x1) / (boxW(origBox) || 1), sy = (nb.y2 - nb.y1) / (boxH(origBox) || 1)
    return { ...orig, x: nb.x1, y: nb.y1, x2: nb.x2, y2: nb.y2, points: orig.points?.map(p => ({ x: nb.x1 + (p.x - origBox.x1) * sx, y: nb.y1 + (p.y - origBox.y1) * sy })) }
  }
  return { ...orig, x: nb.x1, y: nb.y1, x2: nb.x2, y2: nb.y2 }
}

// An edge end bound to `id` keeps its current on-screen position but stops
// following — used when the shape it was attached to goes away.
export function detachEdgesFrom(els: DrawElement[], ids: Set<string>, byId: ById): DrawElement[] {
  return els.map(el => {
    if (!isEdge(el)) return el
    const s = el.startId && ids.has(el.startId), e = el.endId && ids.has(el.endId)
    if (!s && !e) return el
    const path = resolveEdge(el, byId)
    const p0 = path.pts[0], p3 = path.pts[path.pts.length - 1]
    return {
      ...el,
      ...(s ? { startId: undefined, x: p0.x, y: p0.y } : {}),
      ...(e ? { endId: undefined, x2: p3.x, y2: p3.y } : {}),
    }
  })
}

// Copies for paste/duplicate: fresh ids, bindings remapped inside the copied
// set (an edge copied together with both its shapes stays connected to the
// copies), bindings to anything outside it frozen in place, groups kept
// together but separate from the originals.
export function cloneElements(src: DrawElement[], byId: ById, dx: number, dy: number, newId: () => string): DrawElement[] {
  const idMap = new Map(src.map(el => [el.id, newId()]))
  const groupMap = new Map<string, string>()
  return src.map(el => {
    let copy: DrawElement = { ...el, points: el.points?.map(p => ({ ...p })) }
    if (isEdge(el)) {
      const path = resolveEdge(el, byId)
      const p0 = path.pts[0], p3 = path.pts[path.pts.length - 1]
      copy = {
        ...copy, x: p0.x, y: p0.y, x2: p3.x, y2: p3.y,
        startId: el.startId ? idMap.get(el.startId) : undefined,
        endId: el.endId ? idMap.get(el.endId) : undefined,
      }
    }
    if (el.groupId) {
      if (!groupMap.has(el.groupId)) groupMap.set(el.groupId, newId())
      copy.groupId = groupMap.get(el.groupId)
    }
    return { ...translateEl(copy, dx, dy), id: idMap.get(el.id)! }
  })
}

// ─── Snapping & smart guides ──────────────────────────────────────────────────

export interface SnapLines { xs: number[]; ys: number[] }

export function snapCandidates(els: DrawElement[], exclude: Set<string>, byId: ById): SnapLines {
  const xs: number[] = [], ys: number[] = []
  for (const el of els) {
    if (exclude.has(el.id) || el.type === 'fill' || isEdge(el)) continue
    const b = elBox(el, byId)
    xs.push(b.x1, (b.x1 + b.x2) / 2, b.x2)
    ys.push(b.y1, (b.y1 + b.y2) / 2, b.y2)
  }
  return { xs, ys }
}

function nearest(values: number[], cands: number[], thr: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null
  for (const v of values) for (const c of cands) {
    const d = c - v
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: c }
  }
  return best
}

export const snapToGrid = (v: number) => Math.round(v / GRID) * GRID

// Snaps a moving box: alignment guides (edge/center to edge/center of other
// elements) take precedence per axis, the grid applies where no guide hit.
export function snapBox(b: Box, lines: SnapLines | null, thr: number, grid: boolean): { dx: number; dy: number; gx: number | null; gy: number | null } {
  let dx = 0, dy = 0, gx: number | null = null, gy: number | null = null
  if (lines) {
    const sx = nearest([b.x1, (b.x1 + b.x2) / 2, b.x2], lines.xs, thr)
    const sy = nearest([b.y1, (b.y1 + b.y2) / 2, b.y2], lines.ys, thr)
    if (sx) { dx = sx.delta; gx = sx.at }
    if (sy) { dy = sy.delta; gy = sy.at }
  }
  if (grid) {
    if (gx === null) dx = snapToGrid(b.x1) - b.x1
    if (gy === null) dy = snapToGrid(b.y1) - b.y1
  }
  return { dx, dy, gx, gy }
}

export function snapPoint(p: Pt, lines: SnapLines | null, thr: number, grid: boolean): { p: Pt; gx: number | null; gy: number | null } {
  const r = snapBox({ x1: p.x, y1: p.y, x2: p.x, y2: p.y }, lines, thr, grid)
  return { p: { x: p.x + r.dx, y: p.y + r.dy }, gx: r.gx, gy: r.gy }
}

// ─── Align / distribute ───────────────────────────────────────────────────────

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export interface Unit { key: string; box: Box }

export function alignDeltas(units: Unit[], kind: AlignKind): Map<string, Pt> {
  const all = unionBox(units.map(u => u.box))
  const out = new Map<string, Pt>()
  if (!all) return out
  for (const u of units) {
    const b = u.box
    let dx = 0, dy = 0
    if (kind === 'left') dx = all.x1 - b.x1
    else if (kind === 'right') dx = all.x2 - b.x2
    else if (kind === 'center') dx = (all.x1 + all.x2) / 2 - (b.x1 + b.x2) / 2
    else if (kind === 'top') dy = all.y1 - b.y1
    else if (kind === 'bottom') dy = all.y2 - b.y2
    else dy = (all.y1 + all.y2) / 2 - (b.y1 + b.y2) / 2
    out.set(u.key, { x: dx, y: dy })
  }
  return out
}

// Equal gaps between neighbours; the outermost two stay where they are.
export function distributeDeltas(units: Unit[], axis: 'h' | 'v'): Map<string, Pt> {
  const out = new Map<string, Pt>()
  if (units.length < 3) return out
  const lo = (b: Box) => axis === 'h' ? b.x1 : b.y1
  const size = (b: Box) => axis === 'h' ? boxW(b) : boxH(b)
  const sorted = [...units].sort((a, b) => (lo(a.box) + size(a.box) / 2) - (lo(b.box) + size(b.box) / 2))
  const first = sorted[0].box, last = sorted[sorted.length - 1].box
  const span = lo(last) + size(last) - lo(first)
  const gap = (span - sorted.reduce((s, u) => s + size(u.box), 0)) / (sorted.length - 1)
  let cursor = lo(first)
  for (const u of sorted) {
    const d = cursor - lo(u.box)
    out.set(u.key, axis === 'h' ? { x: d, y: 0 } : { x: 0, y: d })
    cursor += size(u.box) + gap
  }
  return out
}
