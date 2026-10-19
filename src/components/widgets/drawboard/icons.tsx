import type { DrawArrowHead } from '@/types'
import { shapeSvgPath } from './svgExport'
import { SHAPE_LIBRARY } from './geometry'

const I = ({ children, size = 15, strokeWidth = '1.6' }: { children: React.ReactNode; size?: number; strokeWidth?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const IcoSelect   = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M3.5 2.2l9.2 5.6-4 .9 2.3 4.3-1.6.8-2.3-4.3-3 2.9z"/>
  </svg>
)
export const IcoHand     = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L6 15"/>
  </svg>
)
export const IcoPen      = () => <I><path d="M11 2l3 3-8 8-3.5.5.5-3.5z"/><line x1="9.5" y1="3.5" x2="12.5" y2="6.5"/></I>
export const IcoText     = () => <I strokeWidth="1.8"><line x1="2" y1="4" x2="14" y2="4"/><line x1="8" y1="4" x2="8" y2="14"/></I>
export const IcoEraser   = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
    <path d="M22 21H7"/><path d="m5 11 8 8"/>
  </svg>
)
export const IcoBucket   = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/>
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" fill="currentColor"/>
  </svg>
)
export const IcoLine     = () => <I strokeWidth="1.7"><line x1="3" y1="13" x2="13" y2="3"/><circle cx="3" cy="13" r="1.3" fill="currentColor"/><circle cx="13" cy="3" r="1.3" fill="currentColor"/></I>
export const IcoArrow    = () => <I strokeWidth="1.7"><line x1="3" y1="13" x2="12.5" y2="3.5"/><polyline points="6.5 3 13 3 13 9.5"/></I>
export const IcoUndo     = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
)
export const IcoRedo     = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
)
export const IcoTrash    = () => <I><polyline points="3,5 13,5"/><path d="M5 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><rect x="4" y="5" width="8" height="9" rx="1"/></I>
export const IcoDownload = () => <I><line x1="8" y1="2" x2="8" y2="11"/><polyline points="5,8 8,11 11,8"/><polyline points="2,13 2,14 14,14 14,13"/></I>
export const IcoShapes   = () => <I strokeWidth="1.4"><rect x="2" y="3" width="5" height="5" rx="0.5"/><ellipse cx="11.5" cy="5.5" rx="2.5" ry="2"/><path d="M4.5 10l2.5 2.5-2.5 2.5L2 12.5z"/><path d="M9 14l2.5-4 2.5 4z"/></I>
export const IcoFormat   = () => <I strokeWidth="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="10" y1="2.5" x2="10" y2="13.5"/><line x1="11.6" y1="5.5" x2="13" y2="5.5"/><line x1="11.6" y1="8" x2="13" y2="8"/><line x1="11.6" y1="10.5" x2="13" y2="10.5"/></I>
export const IcoMore     = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>
export const IcoChevron  = () => <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2l3 4 3-4z"/></svg>
export const IcoClose    = () => <I strokeWidth="1.8"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></I>

// Fill-style previews
export const IcoFillSolid      = () => <I strokeWidth="1.3"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity="0.35"/></I>
const HACHURE_LINES: [number, number, number, number][] = [
  [2.5, 6, 6, 2.5], [2.5, 9.5, 9.5, 2.5], [2.5, 13, 13, 2.5], [6, 13.5, 13.5, 6], [9.5, 13.5, 13.5, 9.5],
]
export const IcoFillHachure    = () => (
  <I strokeWidth="0.9"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/>
    {HACHURE_LINES.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>)}
  </I>
)
export const IcoFillCrossHatch = () => (
  <I strokeWidth="0.9"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/>
    {HACHURE_LINES.map(([x1, y1, x2, y2], i) => <line key={`a${i}`} x1={x1} y1={y1} x2={x2} y2={y2}/>)}
    {HACHURE_LINES.map(([x1, y1, x2, y2], i) => <line key={`b${i}`} x1={16 - x1} y1={y1} x2={16 - x2} y2={y2}/>)}
  </I>
)
// Stroke-style previews
export const IcoStrokeSolid  = () => <I strokeWidth="1.8"><line x1="2" y1="8" x2="14" y2="8"/></I>
export const IcoStrokeDashed = () => <I strokeWidth="1.8"><line x1="2" y1="8" x2="14" y2="8" strokeDasharray="3.5 2.5"/></I>
export const IcoStrokeDotted = () => <I strokeWidth="1.8"><line x1="2" y1="8" x2="14" y2="8" strokeDasharray="0.5 2.5" strokeLinecap="round"/></I>
// Layer ordering
export const IcoToFront  = () => <I strokeWidth="1.3"><rect x="2" y="5" width="7" height="7" rx="1" opacity="0.4"/><rect x="6" y="2" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M9 2V.8M9 .8l-1.4 1.4M9 .8l1.4 1.4" strokeWidth="1.1"/></I>
export const IcoToBack   = () => <I strokeWidth="1.3"><rect x="6" y="2" width="8" height="8" rx="1" opacity="0.4"/><rect x="2" y="5" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M5.5 14v1.2M5.5 15.2l-1.4-1.4M5.5 15.2l1.4-1.4" strokeWidth="1.1"/></I>
export const IcoForward  = () => <I strokeWidth="1.3"><rect x="2" y="5" width="7" height="7" rx="1" opacity="0.4"/><rect x="6" y="2" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M9 3.5l1.6-1.6M10.6 1.9v1.6M10.6 1.9H9" strokeWidth="1.1"/></I>
export const IcoBackward = () => <I strokeWidth="1.3"><rect x="6" y="2" width="8" height="8" rx="1" opacity="0.4"/><rect x="2" y="5" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.15"/><path d="M6.5 12.5l-1.6 1.6M4.9 14.1v-1.6M4.9 14.1h1.6" strokeWidth="1.1"/></I>
export const IcoZoomFit  = () => (
  <I strokeWidth="1.5"><path d="M2 5V3a1 1 0 0 1 1-1h2"/><path d="M14 5V3a1 1 0 0 0-1-1h-2"/><path d="M2 11v2a1 1 0 0 0 1 1h2"/><path d="M14 11v2a1 1 0 0 1-1 1h-2"/><rect x="5" y="5" width="6" height="6" rx="0.5"/></I>
)
export const IcoCopy      = () => <I strokeWidth="1.4"><rect x="5" y="5" width="8" height="9" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h7"/></I>
export const IcoCut       = () => <I strokeWidth="1.4"><circle cx="4.5" cy="12" r="2"/><circle cx="11.5" cy="12" r="2"/><path d="M6 10.5L12 2M10 10.5L4 2"/></I>
export const IcoPaste     = () => <I strokeWidth="1.4"><rect x="3" y="4" width="10" height="10" rx="1"/><path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/></I>
export const IcoDuplicate = () => <I strokeWidth="1.4"><rect x="2" y="2" width="8" height="8" rx="1"/><path d="M6 10v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2"/></I>
export const IcoEditText  = () => <I strokeWidth="1.4"><path d="M2 13h4"/><path d="M10.5 2.5l3 3L7 12H4V9z"/></I>
export const IcoSelectAll = () => <I strokeWidth="1.4"><rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2 2"/><rect x="5" y="5" width="6" height="6" rx="0.5" fill="currentColor" fillOpacity="0.3"/></I>

// Arrange
export const IcoAlignLeft    = () => <I strokeWidth="1.4"><line x1="2" y1="1.5" x2="2" y2="14.5"/><rect x="4" y="3" width="9" height="3.5" rx="0.8"/><rect x="4" y="9.5" width="5.5" height="3.5" rx="0.8"/></I>
export const IcoAlignCenter  = () => <I strokeWidth="1.4"><line x1="8" y1="1.5" x2="8" y2="14.5"/><rect x="3" y="3" width="10" height="3.5" rx="0.8"/><rect x="5" y="9.5" width="6" height="3.5" rx="0.8"/></I>
export const IcoAlignRight   = () => <I strokeWidth="1.4"><line x1="14" y1="1.5" x2="14" y2="14.5"/><rect x="3" y="3" width="9" height="3.5" rx="0.8"/><rect x="6.5" y="9.5" width="5.5" height="3.5" rx="0.8"/></I>
export const IcoAlignTop     = () => <I strokeWidth="1.4"><line x1="1.5" y1="2" x2="14.5" y2="2"/><rect x="3" y="4" width="3.5" height="9" rx="0.8"/><rect x="9.5" y="4" width="3.5" height="5.5" rx="0.8"/></I>
export const IcoAlignMiddle  = () => <I strokeWidth="1.4"><line x1="1.5" y1="8" x2="14.5" y2="8"/><rect x="3" y="3" width="3.5" height="10" rx="0.8"/><rect x="9.5" y="5" width="3.5" height="6" rx="0.8"/></I>
export const IcoAlignBottom  = () => <I strokeWidth="1.4"><line x1="1.5" y1="14" x2="14.5" y2="14"/><rect x="3" y="3" width="3.5" height="9" rx="0.8"/><rect x="9.5" y="6.5" width="3.5" height="5.5" rx="0.8"/></I>
export const IcoDistH        = () => <I strokeWidth="1.4"><line x1="1.5" y1="2" x2="1.5" y2="14"/><line x1="14.5" y1="2" x2="14.5" y2="14"/><rect x="5.5" y="4.5" width="5" height="7" rx="0.8"/></I>
export const IcoDistV        = () => <I strokeWidth="1.4"><line x1="2" y1="1.5" x2="14" y2="1.5"/><line x1="2" y1="14.5" x2="14" y2="14.5"/><rect x="4.5" y="5.5" width="7" height="5" rx="0.8"/></I>
export const IcoGroup        = () => <I strokeWidth="1.3"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" strokeDasharray="2 1.6"/><rect x="4" y="4" width="4.5" height="4.5" rx="0.6"/><rect x="7.5" y="7.5" width="4.5" height="4.5" rx="0.6"/></I>
export const IcoUngroup      = () => <I strokeWidth="1.3"><rect x="1.5" y="1.5" width="6" height="6" rx="0.8"/><rect x="8.5" y="8.5" width="6" height="6" rx="0.8"/></I>
export const IcoLock         = () => <I strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="1.3"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></I>
export const IcoUnlock       = () => <I strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="1.3"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/></I>

// Connector waypoint styles (draw.io: straight / orthogonal / curved)
export const IcoEdgeStraight = () => <I strokeWidth="1.5"><line x1="2.5" y1="13.5" x2="13.5" y2="2.5"/><circle cx="2.5" cy="13.5" r="1.2" fill="currentColor"/><circle cx="13.5" cy="2.5" r="1.2" fill="currentColor"/></I>
export const IcoEdgeOrtho    = () => <I strokeWidth="1.5"><path d="M2.5 13.5H8V2.5h5.5"/><circle cx="2.5" cy="13.5" r="1.2" fill="currentColor"/><circle cx="13.5" cy="2.5" r="1.2" fill="currentColor"/></I>
export const IcoEdgeCurved   = () => <I strokeWidth="1.5"><path d="M2.5 13.5C8 13.5 8 2.5 13.5 2.5"/><circle cx="2.5" cy="13.5" r="1.2" fill="currentColor"/><circle cx="13.5" cy="2.5" r="1.2" fill="currentColor"/></I>

// Text
export const IcoBold       = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4.5 2.5h4.2a2.8 2.8 0 0 1 0 5.6H4.5zM4.5 8.1h5a2.7 2.7 0 0 1 0 5.4h-5z"/></svg>
export const IcoItalic     = () => <I strokeWidth="1.6"><line x1="6.5" y1="2.5" x2="12" y2="2.5"/><line x1="4" y1="13.5" x2="9.5" y2="13.5"/><line x1="9.6" y1="2.5" x2="6.4" y2="13.5"/></I>
export const IcoTextLeft   = () => <I strokeWidth="1.6"><line x1="2" y1="3.5" x2="14" y2="3.5"/><line x1="2" y1="6.5" x2="10" y2="6.5"/><line x1="2" y1="9.5" x2="14" y2="9.5"/><line x1="2" y1="12.5" x2="9" y2="12.5"/></I>
export const IcoTextCenter = () => <I strokeWidth="1.6"><line x1="2" y1="3.5" x2="14" y2="3.5"/><line x1="4" y1="6.5" x2="12" y2="6.5"/><line x1="2" y1="9.5" x2="14" y2="9.5"/><line x1="4.5" y1="12.5" x2="11.5" y2="12.5"/></I>
export const IcoTextRight  = () => <I strokeWidth="1.6"><line x1="2" y1="3.5" x2="14" y2="3.5"/><line x1="6" y1="6.5" x2="14" y2="6.5"/><line x1="2" y1="9.5" x2="14" y2="9.5"/><line x1="7" y1="12.5" x2="14" y2="12.5"/></I>

// Small rendered preview of a library shape, from the same outline code the
// canvas uses (so the palette can never show a different shape than you get).
export function ShapePreview({ id, size = 26 }: { id: string; size?: number }) {
  const preset = SHAPE_LIBRARY.find(p => p.id === id) ?? SHAPE_LIBRARY[0]
  const r = preset.w / preset.h
  const w = r >= 1 ? size - 4 : (size - 4) * r
  const h = r >= 1 ? (size - 4) / r : size - 4
  const b = { x1: (size - w) / 2, y1: (size - h) / 2, x2: (size + w) / 2, y2: (size + h) / 2 }
  const { outline, deco } = shapeSvgPath(preset.type, b, preset.round)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d={outline} fill="currentColor" fillOpacity="0.12"/>
      {deco && <path d={deco}/>}
    </svg>
  )
}

export function ArrowHeadPreview({ head, flip }: { head: DrawArrowHead; flip?: boolean }) {
  const tip = (() => {
    switch (head) {
      case 'arrow': return <path d="M22 6l-6-3.5v7z" fill="currentColor" stroke="none"/>
      case 'open': return <path d="M17 2.5l5 3.5-5 3.5" fill="none"/>
      case 'diamond': return <path d="M22 6l-4 -2.6-4 2.6 4 2.6z" fill="currentColor" stroke="none"/>
      case 'circle': return <circle cx="19.5" cy="6" r="2.6" fill="currentColor" stroke="none"/>
      default: return null
    }
  })()
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <line x1="2" y1="6" x2={head === 'none' || head === 'open' ? 22 : 16} y2="6"/>
      {tip}
    </svg>
  )
}
