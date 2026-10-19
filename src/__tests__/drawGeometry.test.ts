import { describe, it, expect } from 'vitest'
import type { DrawElement } from '@/types'
import {
  perimeterPoint, resolveEdge, detachEdgesFrom, cloneElements, snapBox, alignDeltas,
  distributeDeltas, hitShape, edgeArrows, elBox,
} from '@/components/widgets/drawboard/geometry'

const base = { color: '#111827', strokeWidth: 2, opacity: 100, filled: false }
const shape = (id: string, type: DrawElement['type'], x: number, y: number, w: number, h: number, extra: Partial<DrawElement> = {}): DrawElement =>
  ({ id, type, x, y, x2: x + w, y2: y + h, ...base, ...extra })
const edge = (id: string, extra: Partial<DrawElement>): DrawElement =>
  ({ id, type: 'arrow', x: 0, y: 0, x2: 0, y2: 0, ...base, ...extra })
const byId = (els: DrawElement[]) => new Map(els.map(e => [e.id, e]))

describe('perimeterPoint', () => {
  it('rect: Strahl Richtung rechts trifft die rechte Kante mittig', () => {
    const p = perimeterPoint(shape('a', 'rect', 0, 0, 100, 50), { x: 500, y: 25 })
    expect(p.x).toBeCloseTo(100); expect(p.y).toBeCloseTo(25)
  })
  it('ellipse: Punkt liegt auf der Ellipse', () => {
    const p = perimeterPoint(shape('a', 'ellipse', 0, 0, 100, 50), { x: 300, y: 300 })
    expect(((p.x - 50) / 50) ** 2 + ((p.y - 25) / 25) ** 2).toBeCloseTo(1)
  })
  it('diamond: Strahl nach oben endet in der oberen Spitze', () => {
    const p = perimeterPoint(shape('a', 'diamond', 0, 0, 80, 80), { x: 40, y: -500 })
    expect(p.x).toBeCloseTo(40); expect(p.y).toBeCloseTo(0)
  })
})

describe('resolveEdge', () => {
  const a = shape('a', 'rect', 0, 0, 100, 50)
  const b = shape('b', 'rect', 300, 0, 100, 50)

  it('gerade Verbindung dockt an den zugewandten Kanten an', () => {
    const e = edge('e', { startId: 'a', endId: 'b' })
    const { pts } = resolveEdge(e, byId([a, b, e]))
    expect(pts[0]).toEqual({ x: 100, y: 25 })
    expect(pts[pts.length - 1]).toEqual({ x: 300, y: 25 })
  })

  it('folgt einer verschobenen Form ohne gespeicherte Koordinaten anzupassen', () => {
    const moved = { ...b, y: 200, y2: 250 }
    const e = edge('e', { startId: 'a', endId: 'b', edgeStyle: 'orthogonal' })
    const { pts } = resolveEdge(e, byId([a, moved, e]))
    // horizontal dominant → exits right side of a, enters left side of b, elbow in the middle
    expect(pts[0]).toEqual({ x: 100, y: 25 })
    expect(pts[pts.length - 1]).toEqual({ x: 300, y: 225 })
    for (let i = 1; i < pts.length; i++) {
      const horiz = pts[i].y === pts[i - 1].y, vert = pts[i].x === pts[i - 1].x
      expect(horiz || vert).toBe(true)
    }
  })

  it('freie Enden nutzen die gespeicherten Koordinaten', () => {
    const e = edge('e', { x: 5, y: 6, x2: 50, y2: 60 })
    expect(resolveEdge(e, new Map()).pts).toEqual([{ x: 5, y: 6 }, { x: 50, y: 60 }])
  })

  it('Pfeilspitzen: arrow-Element hat standardmäßig Spitze am Ende', () => {
    expect(edgeArrows(edge('e', {}))).toEqual({ start: 'none', end: 'arrow' })
    expect(edgeArrows({ ...edge('e', {}), type: 'line' })).toEqual({ start: 'none', end: 'none' })
  })
})

describe('detachEdgesFrom', () => {
  it('friert das Ende an seiner aktuellen Position ein und löst die Bindung', () => {
    const a = shape('a', 'rect', 0, 0, 100, 50)
    const b = shape('b', 'rect', 300, 0, 100, 50)
    const e = edge('e', { startId: 'a', endId: 'b' })
    const [out] = detachEdgesFrom([e], new Set(['b']), byId([a, b, e]))
    expect(out.startId).toBe('a')
    expect(out.endId).toBeUndefined()
    expect({ x: out.x2, y: out.y2 }).toEqual({ x: 300, y: 25 })
  })
})

describe('cloneElements', () => {
  it('Kopie einer verbundenen Gruppe bleibt untereinander verbunden, aber getrennt vom Original', () => {
    const a = shape('a', 'rect', 0, 0, 100, 50, { groupId: 'g' })
    const b = shape('b', 'rect', 300, 0, 100, 50, { groupId: 'g' })
    const e = edge('e', { startId: 'a', endId: 'b' })
    let n = 0
    const copies = cloneElements([a, b, e], byId([a, b, e]), 10, 10, () => `n${n++}`)
    const [ca, cb, ce] = copies
    expect(ce.startId).toBe(ca.id)
    expect(ce.endId).toBe(cb.id)
    expect(ca.groupId).toBe(cb.groupId)
    expect(ca.groupId).not.toBe('g')
    expect(ca.x).toBe(10)
  })

  it('Bindung an eine nicht mitkopierte Form wird zu festen Koordinaten', () => {
    const a = shape('a', 'rect', 0, 0, 100, 50)
    const e = edge('e', { startId: 'a', x2: 400, y2: 25 })
    const [ce] = cloneElements([e], byId([a, e]), 0, 0, () => 'x')
    expect(ce.startId).toBeUndefined()
    expect({ x: ce.x, y: ce.y }).toEqual({ x: 100, y: 25 })
  })
})

describe('snapBox', () => {
  const lines = { xs: [100, 150, 200], ys: [0, 25, 50] }
  it('rastet an Hilfslinie innerhalb der Schwelle ein und meldet die Linie', () => {
    const r = snapBox({ x1: 103, y1: 300, x2: 133, y2: 330 }, lines, 6, false)
    expect(r.dx).toBe(-3); expect(r.gx).toBe(100)
    expect(r.dy).toBe(0); expect(r.gy).toBeNull()
  })
  it('Raster greift nur auf Achsen ohne Hilfslinien-Treffer', () => {
    const r = snapBox({ x1: 103, y1: 307, x2: 133, y2: 337 }, lines, 6, true)
    expect(r.dx).toBe(-3)
    expect(r.dy).toBe(-7)  // nearest grid line is 300
  })
})

describe('align / distribute', () => {
  const units = [
    { key: 'a', box: { x1: 0, y1: 0, x2: 10, y2: 10 } },
    { key: 'b', box: { x1: 40, y1: 5, x2: 60, y2: 25 } },
    { key: 'c', box: { x1: 100, y1: 0, x2: 110, y2: 10 } },
  ]
  it('links ausrichten schiebt alle auf die kleinste x-Kante', () => {
    const d = alignDeltas(units, 'left')
    expect(d.get('b')).toEqual({ x: -40, y: 0 })
    expect(d.get('a')).toEqual({ x: 0, y: 0 })
  })
  it('horizontal verteilen erzeugt gleiche Abstände', () => {
    const d = distributeDeltas(units, 'h')
    // span 110, widths 40 → gaps (110-40)/2 = 35 → b starts at 10+35 = 45
    expect(d.get('b')!.x).toBeCloseTo(5)
    expect(d.get('a')!.x).toBeCloseTo(0)
    expect(d.get('c')!.x).toBeCloseTo(0)
  })
})

describe('hitShape', () => {
  it('leeres Inneres einer ungefüllten Form ist ein schwacher Treffer, Rand ein starker', () => {
    const r = shape('r', 'rect', 0, 0, 100, 100)
    expect(hitShape(r, { x: 50, y: 50 }, 4)).toBe('weak')
    expect(hitShape(r, { x: 1, y: 50 }, 4)).toBe('strong')
    expect(hitShape(r, { x: 200, y: 50 }, 4)).toBeNull()
    expect(hitShape({ ...r, filled: true }, { x: 50, y: 50 }, 4)).toBe('strong')
    expect(hitShape({ ...r, label: 'Start' }, { x: 50, y: 50 }, 4)).toBe('strong')
  })
  it('Raute: Ecke der Bounding-Box liegt außerhalb', () => {
    const d = shape('d', 'diamond', 0, 0, 100, 100)
    expect(hitShape(d, { x: 5, y: 5 }, 2)).toBeNull()
  })
})

describe('elBox', () => {
  it('Box einer gebundenen Linie folgt der aufgelösten Route', () => {
    const a = shape('a', 'rect', 0, 0, 100, 50)
    const b = shape('b', 'rect', 300, 0, 100, 50)
    const e = edge('e', { startId: 'a', endId: 'b' })
    expect(elBox(e, byId([a, b, e]))).toEqual({ x1: 100, y1: 25, x2: 300, y2: 25 })
  })
})

describe('normalizeElements (alte Zeichenbretter)', () => {
  it('lässt das Array unangetastet, wenn nichts zu migrieren ist', async () => {
    const { normalizeElements } = await import('@/components/widgets/drawboard/render')
    const els = [shape('a', 'rect', 0, 0, 10, 10)]
    expect(normalizeElements(els)).toBe(els)
  })
  it('alter Text (y = Grundlinie) wird auf Oberkante umgestellt, Box passt sich an', async () => {
    const { normalizeElements } = await import('@/components/widgets/drawboard/render')
    const old: DrawElement = { id: 't', type: 'text', x: 10, y: 100, x2: 60, y2: 116, text: 'Hallo', fontSize: 20, ...base }
    const [n] = normalizeElements([old])
    expect(n.textTop).toBe(true)
    expect(n.y).toBeCloseTo(84)
    expect(n.y2).toBeCloseTo(84 + 20 * 1.25)
    expect(n.x2).toBeGreaterThan(n.x)
  })
})
