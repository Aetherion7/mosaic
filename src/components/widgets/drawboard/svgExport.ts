import type { DrawElement } from '@/types'
import {
  type Box, type ById, type PathSink, type EdgePath,
  normBox, boxW, isShape, isEdge, labelBox, traceOutline, traceDecorations,
  resolveEdge, edgeArrows, edgeEndAngles, arrowSize,
} from './geometry'
import { FONT_FAMILIES, LINE_HEIGHT, labelLayout, edgeLabelBox, shaftPath, srand, adaptInk } from './render'

const f = (n: number) => Math.round(n * 100) / 100

class SvgPath implements PathSink {
  d = ''
  moveTo(x: number, y: number) { this.d += `M${f(x)} ${f(y)}` }
  lineTo(x: number, y: number) { this.d += `L${f(x)} ${f(y)}` }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.d += `Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}` }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) { this.d += `C${f(a)} ${f(b)} ${f(c)} ${f(d)} ${f(x)} ${f(y)}` }
  closePath() { this.d += 'Z' }
}

export function shapeSvgPath(type: string, b: Box, roundCorners?: boolean): { outline: string; deco: string } {
  const o = new SvgPath(); traceOutline(o, { type, roundCorners }, b)
  const d = new SvgPath(); traceDecorations(d, { type }, b)
  return { outline: o.d, deco: d.d }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function dashAttr(el: DrawElement) {
  if (el.strokeStyle === 'dashed') return ` stroke-dasharray="${f(el.strokeWidth * 2.5 + 5)} ${f(el.strokeWidth * 1.8 + 3)}"`
  if (el.strokeStyle === 'dotted') return ` stroke-dasharray="0.1 ${f(el.strokeWidth * 1.8 + 4)}"`
  return ''
}

function edgeD(path: EdgePath) {
  const p = path.pts
  let d = `M${f(p[0].x)} ${f(p[0].y)}`
  if (path.curved) d += `C${f(p[1].x)} ${f(p[1].y)} ${f(p[2].x)} ${f(p[2].y)} ${f(p[3].x)} ${f(p[3].y)}`
  else for (let i = 1; i < p.length; i++) d += `L${f(p[i].x)} ${f(p[i].y)}`
  return d
}

function headSvg(tip: { x: number; y: number }, a: number, head: string, sw: number, color: string): string {
  const h = arrowSize(sw), cos = Math.cos(a), sin = Math.sin(a)
  const P = (x: number, y: number) => `${f(x)} ${f(y)}`
  if (head === 'arrow') {
    return `<path d="M${P(tip.x, tip.y)}L${P(tip.x - h * Math.cos(a - Math.PI / 6), tip.y - h * Math.sin(a - Math.PI / 6))}L${P(tip.x - h * Math.cos(a + Math.PI / 6), tip.y - h * Math.sin(a + Math.PI / 6))}Z" fill="${color}"/>`
  }
  if (head === 'open') {
    return `<path d="M${P(tip.x - h * Math.cos(a - 0.5), tip.y - h * Math.sin(a - 0.5))}L${P(tip.x, tip.y)}L${P(tip.x - h * Math.cos(a + 0.5), tip.y - h * Math.sin(a + 0.5))}" fill="none" stroke="${color}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  if (head === 'diamond') {
    const mx = tip.x - cos * h / 2, my = tip.y - sin * h / 2, w = h * 0.32
    return `<path d="M${P(tip.x, tip.y)}L${P(mx - sin * w, my + cos * w)}L${P(tip.x - cos * h, tip.y - sin * h)}L${P(mx + sin * w, my - cos * w)}Z" fill="${color}"/>`
  }
  if (head === 'circle') {
    const r = h * 0.3
    return `<circle cx="${f(tip.x - cos * r)}" cy="${f(tip.y - sin * r)}" r="${f(r)}" fill="${color}"/>`
  }
  return ''
}

function fontAttrs(el: DrawElement, size: number) {
  return `font-family="${esc(FONT_FAMILIES[el.fontFamily ?? 'sans'])}" font-size="${f(size)}"${el.bold ? ' font-weight="bold"' : ''}${el.italic ? ' font-style="italic"' : ''}`
}

function labelSvg(el: DrawElement, box: Box, bg: string | null): string {
  const { fs, lines, lh } = labelLayout(el, box)
  const align = el.textAlign ?? 'center'
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'
  const x = align === 'left' ? box.x1 + 6 : align === 'right' ? box.x2 - 6 : (box.x1 + box.x2) / 2
  const top = (box.y1 + box.y2) / 2 - (lines.length * lh) / 2
  const back = bg ? `<rect x="${f(box.x1)}" y="${f(top - 2)}" width="${f(boxW(box))}" height="${f(lines.length * lh + 4)}" fill="${bg}" opacity="0.9"/>` : ''
  const spans = lines.map((l, i) => `<tspan x="${f(x)}" y="${f(top + i * lh + lh / 2)}">${esc(l)}</tspan>`).join('')
  return `${back}<text ${fontAttrs(el, fs)} fill="${el.fontColor ?? el.color}" text-anchor="${anchor}" dominant-baseline="central">${spans}</text>`
}

function freehandSvg(el: DrawElement): string {
  const pts = el.points ?? []
  if (!pts.length) return ''
  const bt = el.brushType ?? 'pen'
  if (bt === 'spray') {
    const r = Math.max(4, el.strokeWidth * 5), dotR = Math.max(0.4, el.strokeWidth * 0.35)
    let out = ''
    pts.forEach((pt, pi) => {
      for (let i = 0; i < 14; i++) {
        const seed = pi * 200 + i
        const a = srand(seed) * Math.PI * 2, dist = srand(seed + 100) * r
        out += `<circle cx="${f(pt.x + Math.cos(a) * dist)}" cy="${f(pt.y + Math.sin(a) * dist)}" r="${f(dotR)}"/>`
      }
    })
    return `<g fill="${el.color}">${out}</g>`
  }
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    d += `Q${f(pts[i].x)} ${f(pts[i].y)} ${f((pts[i].x + pts[i + 1].x) / 2)} ${f((pts[i].y + pts[i + 1].y) / 2)}`
  }
  if (pts.length > 1) d += `L${f(pts[pts.length - 1].x)} ${f(pts[pts.length - 1].y)}`
  let w = el.strokeWidth, op = 1, cap = 'round'
  if (bt === 'marker') { w *= 3; op = 0.5 }
  else if (bt === 'highlighter') { w *= 9; op = 0.22; cap = 'square' }
  else if (bt === 'chalk') op = 0.6
  else if (bt === 'calligraphy') w *= 1.4
  return `<path d="${d}" fill="none" stroke="${el.color}" stroke-width="${f(w)}" stroke-linecap="${cap}" stroke-linejoin="round"${op < 1 ? ` opacity="${op}"` : ''}${dashAttr(el)}/>`
}

export function buildSvg(source: DrawElement[], byId: ById, bounds: Box, background: string, dark = false): string {
  const els = dark ? source.map(adaptInk) : source
  const defs: string[] = []
  let hasShadow = false
  const body: string[] = []

  for (const el of els) {
    const op = (el.opacity ?? 100) / 100
    const opAttr = op < 1 ? ` opacity="${op}"` : ''
    const shadow = el.shadow ? ' filter="url(#shadow)"' : ''
    if (el.shadow) hasShadow = true

    if (el.type === 'fill' && el.fillImageUrl) {
      const s = el.fillScale ?? 1
      body.push(`<image href="${el.fillImageUrl}" x="${f(-(el.fillPanX ?? 0) / s)}" y="${f(-(el.fillPanY ?? 0) / s)}" width="${f(el.x2 / s)}" height="${f(el.y2 / s)}"${opAttr}/>`)
    } else if (el.type === 'freedraw') {
      body.push(`<g${opAttr}>${freehandSvg(el)}</g>`)
    } else if (isShape(el)) {
      const b = normBox(el.x, el.y, el.x2, el.y2)
      const { outline, deco } = shapeSvgPath(el.type, b, el.roundCorners)
      let fill = 'none'
      if (el.filled) {
        const bg = el.bgColor ?? el.color
        if (!el.fillStyle) fill = el.color + '33'
        else if (el.fillStyle === 'solid') fill = bg
        else {
          const pid = `h${defs.length}`
          const lw = f(Math.max(1, el.strokeWidth * 0.35))
          const cross = el.fillStyle === 'cross-hatch' ? `<path d="M0 0L6 6" stroke="${bg}" stroke-width="${lw}"/>` : ''
          defs.push(`<pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${el.fillStyle === 'cross-hatch' ? 0 : 45})">${el.fillStyle === 'cross-hatch' ? `<path d="M0 6L6 0" stroke="${bg}" stroke-width="${lw}"/>${cross}` : `<path d="M3 0L3 6" stroke="${bg}" stroke-width="${lw}"/>`}</pattern>`)
          fill = `url(#${pid})`
        }
      }
      const sw = f(el.strokeWidth)
      body.push(`<g${opAttr}><path d="${outline}" fill="${fill}" stroke="${el.strokeWidth > 0 ? el.color : 'none'}" stroke-width="${sw}" stroke-linejoin="round"${dashAttr(el)}${shadow}/>${deco ? `<path d="${deco}" fill="none" stroke="${el.color}" stroke-width="${sw}"/>` : ''}${el.label ? labelSvg(el, labelBox(el, b), null) : ''}</g>`)
    } else if (isEdge(el)) {
      const path = resolveEdge(el, byId)
      const { start, end } = edgeArrows(el)
      const ang = edgeEndAngles(path)
      body.push(`<g${opAttr}${shadow}><path d="${edgeD(shaftPath(path, el))}" fill="none" stroke="${el.color}" stroke-width="${f(el.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dashAttr(el)}/>${headSvg(path.pts[path.pts.length - 1], ang.end, end, el.strokeWidth, el.color)}${headSvg(path.pts[0], ang.start, start, el.strokeWidth, el.color)}${el.label ? labelSvg(el, edgeLabelBox(el, byId), background) : ''}</g>`)
    } else if (el.type === 'text') {
      const fs = el.fontSize ?? 16, lh = fs * LINE_HEIGHT
      const align = el.textAlign ?? 'left'
      const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'
      const x = align === 'left' ? el.x : align === 'right' ? el.x2 : (el.x + el.x2) / 2
      const spans = (el.text ?? '').split('\n').map((l, i) => `<tspan x="${f(x)}" y="${f(el.y + i * lh + lh / 2)}">${esc(l)}</tspan>`).join('')
      body.push(`<text ${fontAttrs(el, fs)} fill="${el.color}" text-anchor="${anchor}" dominant-baseline="central"${opAttr}${shadow}>${spans}</text>`)
    }
  }

  if (hasShadow) defs.push('<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.28"/></filter>')
  const w = bounds.x2 - bounds.x1, h = bounds.y2 - bounds.y1
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="${f(bounds.x1)} ${f(bounds.y1)} ${f(w)} ${f(h)}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<rect x="${f(bounds.x1)}" y="${f(bounds.y1)}" width="${f(w)}" height="${f(h)}" fill="${background}"/>${body.join('')}</svg>`
}
