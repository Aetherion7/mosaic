'use client'
import { useEffect, useState } from 'react'
import type { DrawArrowHead, DrawEdgeStyle, DrawElement } from '@/types'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { Dropdown } from '@/components/ui/Dropdown'
import type { AlignKind, Box } from './geometry'
import {
  IcoFillSolid, IcoFillHachure, IcoFillCrossHatch, IcoStrokeSolid, IcoStrokeDashed, IcoStrokeDotted,
  IcoToFront, IcoToBack, IcoForward, IcoBackward, IcoAlignLeft, IcoAlignCenter, IcoAlignRight,
  IcoAlignTop, IcoAlignMiddle, IcoAlignBottom, IcoDistH, IcoDistV, IcoGroup, IcoUngroup, IcoLock,
  IcoUnlock, IcoDuplicate, IcoTrash, IcoEdgeStraight, IcoEdgeOrtho, IcoEdgeCurved, IcoBold, IcoItalic,
  IcoTextLeft, IcoTextCenter, IcoTextRight, ArrowHeadPreview,
} from './icons'

export type CanvasBg = 'white' | 'grid' | 'dark'
export type FontFamily = NonNullable<DrawElement['fontFamily']>
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid'
export type StrokeDash = 'solid' | 'dashed' | 'dotted'
export type TextAlign = 'left' | 'center' | 'right'

export interface StyleState {
  color: string
  strokePct: number
  opacityPct: number
  filled: boolean
  bgColor?: string
  fillStyle: FillStyle
  strokeDash: StrokeDash
  roundCorners: boolean
  shadow: boolean
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  textAlign: TextAlign
  fontColor?: string
  edgeStyle: DrawEdgeStyle
  startArrow: DrawArrowHead
  endArrow: DrawArrowHead
}

export interface Kinds { shape: boolean; edge: boolean; free: boolean; text: boolean; rect: boolean }

export interface FormatPanelProps {
  t: (s: string) => string
  hasSelection: boolean
  kinds: Kinds
  style: StyleState
  setStyle: (patch: Partial<StyleState>, live?: boolean) => void
  commitLive: () => void
  diagram: { canvasBg: CanvasBg; snap: boolean; guides: boolean; count: number }
  setDiagram: (patch: Partial<{ canvasBg: CanvasBg; snap: boolean; guides: boolean }>) => void
  arrange: { units: number; canGroup: boolean; canUngroup: boolean; allLocked: boolean; geometry: Box | null }
  // What the panel is editing right now ("Rectangle", "3 elements", "New shapes"…).
  subject: string
  // Text of the single selected shape/line/text element, editable in place.
  content: { value: string; placeholder: string } | null
  setContent: (v: string) => void
  commitContent: () => void
  actions: {
    reorder: (dir: 'front' | 'back' | 'forward' | 'backward') => void
    align: (kind: AlignKind) => void
    distribute: (axis: 'h' | 'v') => void
    group: () => void
    ungroup: () => void
    toggleLock: () => void
    duplicate: () => void
    remove: () => void
    setGeometry: (b: Box) => void
  }
}

// ─── Small building blocks ────────────────────────────────────────────────────

export const PANEL_WIDTH = 184

const LABEL: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '7px 9px', borderTop: '1px solid var(--border)' }}>
      <div style={LABEL}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 20 }}>
      <span style={{ fontSize: 10.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{children}</div>
    </div>
  )
}

const ICON_BTN: React.CSSProperties = {
  width: 23, height: 22, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
}
function iconBtn(active: boolean, disabled?: boolean): React.CSSProperties {
  return {
    ...ICON_BTN,
    background: active ? 'color-mix(in srgb, var(--accent) 18%, var(--surface2))' : 'var(--surface2)',
    borderColor: active ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--border)',
    color: active ? 'var(--accent)' : 'var(--text2)',
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? 'default' : 'pointer',
  }
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; icon: React.ReactNode; title: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {options.map(o => (
        <button key={o.value} type="button" title={o.title} onClick={() => onChange(o.value)} style={iconBtn(value === o.value)}>{o.icon}</button>
      ))}
    </div>
  )
}

function MiniToggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}
      style={{ width: 30, height: 17, borderRadius: 9, border: 'none', padding: 0, position: 'relative', cursor: 'pointer', flexShrink: 0, background: value ? 'var(--accent)' : 'rgba(150,150,150,0.3)', transition: 'background 0.15s' }}>
      <span style={{ position: 'absolute', top: 2.5, left: value ? 15.5 : 2.5, width: 12, height: 12, borderRadius: '50%', background: 'white', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
    </button>
  )
}

function Swatch({ value, onChange, title, none }: { value: string | undefined; onChange: (v: string) => void; title: string; none?: boolean }) {
  return (
    <ColorSwatch value={value ?? '#000000'} onChange={onChange}
      trigger={onClick => (
        <button type="button" onClick={onClick} title={title}
          style={{
            width: 22, height: 22, borderRadius: 6, cursor: 'pointer', padding: 0,
            border: '1px solid var(--border)',
            background: none ? 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 8px 8px' : value,
          }} />
      )}
    />
  )
}

export function Slider({ label, value, onChange, onCommit, min = 0, max = 100, unit = '%' }: {
  label: string; value: number; onChange: (v: number) => void; onCommit?: () => void; min?: number; max?: number; unit?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <input type="number" min={min} max={max} value={value}
            onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
            onBlur={onCommit}
            style={{ width: 38, fontSize: 10.5, textAlign: 'right', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 4px', color: 'var(--text1)' }} />
          <span style={{ fontSize: 10, color: 'var(--text3)', width: 10 }}>{unit}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onMouseUp={onCommit} onTouchEnd={onCommit} onKeyUp={onCommit}
        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }} />
    </div>
  )
}

function NumField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(Math.round(value)))
  useEffect(() => { setDraft(String(Math.round(value))) }, [value])
  const commit = () => {
    const v = Number(draft)
    if (Number.isFinite(v) && Math.round(v) !== Math.round(value)) onCommit(v)
    else setDraft(String(Math.round(value)))
  }
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)', fontWeight: 700 }}>
      <span style={{ width: 10 }}>{label}</span>
      <input value={draft} disabled={disabled} inputMode="numeric"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        style={{ width: '100%', minWidth: 0, fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 5px', color: 'var(--text1)', opacity: disabled ? 0.5 : 1 }} />
    </label>
  )
}

export const PALETTE = [
  '#111827', '#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#e5e7eb', '#ffffff',
]

const ARROW_HEADS: DrawArrowHead[] = ['none', 'arrow', 'open', 'diamond', 'circle']
const HEAD_LABELS: Record<DrawArrowHead, string> = { none: 'None', arrow: 'Arrow', open: 'Open arrow', diamond: 'Diamond', circle: 'Circle' }
const FONT_LABELS: Record<FontFamily, string> = { sans: 'Sans-serif', serif: 'Serif', mono: 'Monospace', hand: 'Handwritten' }
const FONT_SIZES = [10, 12, 14, 16, 20, 24, 32, 48, 64]

// Line / fill / connector / appearance controls — shared by the format
// panel's Style tab and the shape library popover.
export function StyleSections({ t, style: s, setStyle, commitLive, kinds }: {
  t: (s: string) => string
  style: StyleState
  setStyle: (patch: Partial<StyleState>, live?: boolean) => void
  commitLive: () => void
  kinds: Kinds
}) {
  const showStroke = kinds.shape || kinds.edge || kinds.free
  return (<>
    {showStroke && (
      <Section title={t('Line')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {PALETTE.map(c => (
            <button key={c} type="button" title={c} onClick={() => setStyle({ color: c })}
              style={{
                aspectRatio: '1', borderRadius: 5, background: c, cursor: 'pointer', padding: 0,
                border: s.color.toLowerCase() === c ? '2px solid var(--accent)' : '1px solid rgba(127,127,127,0.35)',
              }} />
          ))}
          <ColorSwatch value={s.color} onChange={v => setStyle({ color: v })}
            trigger={onClick => (
              <button type="button" onClick={onClick} title={t('Custom color')}
                style={{ aspectRatio: '1', borderRadius: 5, cursor: 'pointer', padding: 0, border: '1px solid var(--border)', background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }} />
            )} />
        </div>
        <Slider label={t('Width')} value={s.strokePct} min={1} unit="%"
          onChange={v => setStyle({ strokePct: v }, true)} onCommit={commitLive} />
        <Row label={t('Pattern')}>
          <Seg value={s.strokeDash} onChange={v => setStyle({ strokeDash: v })} options={[
            { value: 'solid', icon: <IcoStrokeSolid />, title: t('Solid') },
            { value: 'dashed', icon: <IcoStrokeDashed />, title: t('Dashed') },
            { value: 'dotted', icon: <IcoStrokeDotted />, title: t('Dotted') },
          ]} />
        </Row>
      </Section>
    )}
    {kinds.shape && (
      <Section title={t('Fill')}>
        <Row label={t('Filled')}><MiniToggle value={s.filled} onChange={v => setStyle({ filled: v })} label={t('Filled')} /></Row>
        {s.filled && (<>
          <Row label={t('Fill color')}><Swatch value={s.bgColor ?? s.color} onChange={v => setStyle({ bgColor: v })} title={t('Fill color')} /></Row>
          <Row label={t('Fill style')}>
            <Seg value={s.fillStyle} onChange={v => setStyle({ fillStyle: v })} options={[
              { value: 'hachure', icon: <IcoFillHachure />, title: t('Hachure') },
              { value: 'cross-hatch', icon: <IcoFillCrossHatch />, title: t('Cross-hatch') },
              { value: 'solid', icon: <IcoFillSolid />, title: t('Solid') },
            ]} />
          </Row>
        </>)}
      </Section>
    )}
    {kinds.edge && (
      <Section title={t('Connector')}>
        <Row label={t('Waypoints')}>
          <Seg value={s.edgeStyle} onChange={v => setStyle({ edgeStyle: v })} options={[
            { value: 'straight', icon: <IcoEdgeStraight />, title: t('Straight') },
            { value: 'orthogonal', icon: <IcoEdgeOrtho />, title: t('Orthogonal') },
            { value: 'curved', icon: <IcoEdgeCurved />, title: t('Curved') },
          ]} />
        </Row>
        {/* fontSize 0 hides the trigger's text label (the arrow preview
            says it all); the option list keeps its names. */}
        <Row label={t('Line start')}>
          <Dropdown value={s.startArrow} onChange={v => setStyle({ startArrow: v as DrawArrowHead })} title={`${t('Line start')}: ${t(HEAD_LABELS[s.startArrow])}`} popoverWidth={150}
            buttonStyle={{ padding: '3px 7px', fontSize: 0, gap: 6 }}
            options={ARROW_HEADS.map(h => ({ value: h, label: t(HEAD_LABELS[h]), icon: <ArrowHeadPreview head={h} flip /> }))} />
        </Row>
        <Row label={t('Line end')}>
          <Dropdown value={s.endArrow} onChange={v => setStyle({ endArrow: v as DrawArrowHead })} title={`${t('Line end')}: ${t(HEAD_LABELS[s.endArrow])}`} popoverWidth={150}
            buttonStyle={{ padding: '3px 7px', fontSize: 0, gap: 6 }}
            options={ARROW_HEADS.map(h => ({ value: h, label: t(HEAD_LABELS[h]), icon: <ArrowHeadPreview head={h} /> }))} />
        </Row>
      </Section>
    )}
    <Section title={t('Appearance')}>
      <Slider label={t('Opacity')} value={s.opacityPct}
        onChange={v => setStyle({ opacityPct: v }, true)} onCommit={commitLive} />
      {kinds.rect && <Row label={t('Rounded')}><MiniToggle value={s.roundCorners} onChange={v => setStyle({ roundCorners: v })} label={t('Rounded')} /></Row>}
      {(kinds.shape || kinds.edge || kinds.text) && <Row label={t('Shadow')}><MiniToggle value={s.shadow} onChange={v => setStyle({ shadow: v })} label={t('Shadow')} /></Row>}
    </Section>
  </>)
}

// ─── Panel ────────────────────────────────────────────────────────────────────

type Tab = 'canvas' | 'style' | 'text' | 'arrange'

export function FormatPanel(p: FormatPanelProps) {
  const { t, style: s, setStyle, kinds } = p
  const tabs: Tab[] = p.hasSelection ? ['style', 'text', 'arrange'] : ['style', 'canvas']
  const [tabPick, setTabPick] = useState<Tab>('style')
  const tab = tabs.includes(tabPick) ? tabPick : tabs[0]
  const TAB_LABELS: Record<Tab, string> = { canvas: 'Canvas', style: 'Style', text: 'Text', arrange: 'Arrange' }
  const showText = kinds.text || kinds.shape || kinds.edge

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 8, left: 8, bottom: 8, width: PANEL_WIDTH, zIndex: 6,
        display: 'flex', flexDirection: 'column',
        background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 6px 22px rgba(0,0,0,0.22)', overflow: 'hidden',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px 0', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.subject}>
          {p.subject}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flex: 1, gap: 2, background: 'var(--surface2)', borderRadius: 7, padding: 2, border: '1px solid var(--border)' }}>
          {tabs.map(tb => (
            <button key={tb} type="button" onClick={() => setTabPick(tb)}
              style={{
                flex: 1, fontSize: 10, fontWeight: 700, padding: '3px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: tab === tb ? 'var(--surface)' : 'transparent',
                color: tab === tb ? 'var(--text1)' : 'var(--text3)',
                boxShadow: tab === tb ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
              }}>
              {t(TAB_LABELS[tb])}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {tab === 'canvas' && (<>
          <Section title={t('Background')}>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['white', 'grid', 'dark'] as CanvasBg[]).map(bg => (
                <button key={bg} type="button" onClick={() => p.setDiagram({ canvasBg: bg })}
                  style={{ ...iconBtn(p.diagram.canvasBg === bg), flex: 1, width: 'auto', fontSize: 10.5, fontWeight: 600, gap: 5 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: 3, border: '1px solid var(--border)',
                    background: bg === 'dark' ? '#1e1e2e' : bg === 'grid'
                      ? 'linear-gradient(#cbd5e1 1px, transparent 1px) 0 0 / 4px 4px, linear-gradient(90deg, #cbd5e1 1px, #fff 1px) 0 0 / 4px 4px'
                      : '#fff',
                  }} />
                  {t(bg === 'white' ? 'White' : bg === 'grid' ? 'Grid' : 'Dark')}
                </button>
              ))}
            </div>
          </Section>
          <Section title={t('Snapping')}>
            <Row label={t('Snap to grid')}><MiniToggle value={p.diagram.snap} onChange={v => p.setDiagram({ snap: v })} label={t('Snap to grid')} /></Row>
            <Row label={t('Alignment guides')}><MiniToggle value={p.diagram.guides} onChange={v => p.setDiagram({ guides: v })} label={t('Alignment guides')} /></Row>
            <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{t('Hold Alt while dragging to place freely.')}</div>
          </Section>
          <Section title={t('Drawing')}>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{p.diagram.count} {t(p.diagram.count === 1 ? 'element' : 'elements')}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{t('Select an element to edit its style, text and arrangement.')}</div>
          </Section>
        </>)}

        {tab === 'style' && (<>
          <StyleSections t={t} style={s} setStyle={setStyle} commitLive={p.commitLive} kinds={kinds} />
        </>)}

        {tab === 'text' && (<>
          {!showText ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--text3)' }}>{t('Freehand strokes have no text.')}</div>
          ) : (<>
            {p.content && (
              <Section title={t('Content')}>
                <textarea value={p.content.value} placeholder={p.content.placeholder} rows={3}
                  onChange={e => p.setContent(e.target.value)} onBlur={p.commitContent}
                  onKeyDown={e => e.stopPropagation()}
                  style={{
                    width: '100%', resize: 'vertical', minHeight: 54, fontSize: 12, lineHeight: 1.4, fontFamily: 'inherit',
                    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px',
                    color: 'var(--text1)', outline: 'none',
                  }} />
              </Section>
            )}
            <Section title={t('Font')}>
              <Dropdown value={s.fontFamily} onChange={v => setStyle({ fontFamily: v as FontFamily })} title={t('Font')}
                buttonStyle={{ width: '100%' }}
                options={(Object.keys(FONT_LABELS) as FontFamily[]).map(f => ({ value: f, label: t(FONT_LABELS[f]) }))} />
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <Dropdown value={String(s.fontSize)} onChange={v => setStyle({ fontSize: +v })} title={t('Font size')}
                  buttonStyle={{ width: 70 }}
                  options={(FONT_SIZES.includes(s.fontSize) ? FONT_SIZES : [...FONT_SIZES, s.fontSize].sort((a, b) => a - b)).map(n => ({ value: String(n), label: `${n}px` }))} />
                <div style={{ flex: 1 }} />
                <button type="button" title={t('Bold')} onClick={() => setStyle({ bold: !s.bold })} style={iconBtn(s.bold)}><IcoBold /></button>
                <button type="button" title={t('Italic')} onClick={() => setStyle({ italic: !s.italic })} style={iconBtn(s.italic)}><IcoItalic /></button>
              </div>
              <Row label={t('Alignment')}>
                <Seg value={s.textAlign} onChange={v => setStyle({ textAlign: v })} options={[
                  { value: 'left', icon: <IcoTextLeft />, title: t('Left') },
                  { value: 'center', icon: <IcoTextCenter />, title: t('Center') },
                  { value: 'right', icon: <IcoTextRight />, title: t('Right') },
                ]} />
              </Row>
              <Row label={t('Font color')}>
                <Swatch value={kinds.text && !kinds.shape && !kinds.edge ? s.color : (s.fontColor ?? s.color)}
                  onChange={v => setStyle({ fontColor: v })} title={t('Font color')} />
              </Row>
            </Section>
          </>)}
        </>)}

        {tab === 'arrange' && (<>
          <Section title={t('Order')}>
            <div style={{ display: 'flex', gap: 3 }}>
              <button type="button" title={t('Bring to front')} onClick={() => p.actions.reorder('front')} style={{ ...ICON_BTN, flex: 1 }}><IcoToFront /></button>
              <button type="button" title={t('Bring forward')} onClick={() => p.actions.reorder('forward')} style={{ ...ICON_BTN, flex: 1 }}><IcoForward /></button>
              <button type="button" title={t('Send backward')} onClick={() => p.actions.reorder('backward')} style={{ ...ICON_BTN, flex: 1 }}><IcoBackward /></button>
              <button type="button" title={t('Send to back')} onClick={() => p.actions.reorder('back')} style={{ ...ICON_BTN, flex: 1 }}><IcoToBack /></button>
            </div>
          </Section>
          {p.arrange.units >= 2 && (
            <Section title={t('Align')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
                {([
                  ['left', <IcoAlignLeft key="l" />, 'Align left'], ['center', <IcoAlignCenter key="c" />, 'Center horizontally'], ['right', <IcoAlignRight key="r" />, 'Align right'],
                  ['top', <IcoAlignTop key="t" />, 'Align top'], ['middle', <IcoAlignMiddle key="m" />, 'Center vertically'], ['bottom', <IcoAlignBottom key="b" />, 'Align bottom'],
                ] as [AlignKind, React.ReactNode, string][]).map(([k, icon, label]) => (
                  <button key={k} type="button" title={t(label)} onClick={() => p.actions.align(k)} style={{ ...ICON_BTN, width: 'auto' }}>{icon}</button>
                ))}
              </div>
              {p.arrange.units >= 3 && (
                <div style={{ display: 'flex', gap: 3 }}>
                  <button type="button" onClick={() => p.actions.distribute('h')} style={{ ...ICON_BTN, flex: 1, gap: 5, fontSize: 10.5, fontWeight: 600 }}><IcoDistH />{t('Horizontal')}</button>
                  <button type="button" onClick={() => p.actions.distribute('v')} style={{ ...ICON_BTN, flex: 1, gap: 5, fontSize: 10.5, fontWeight: 600 }}><IcoDistV />{t('Vertical')}</button>
                </div>
              )}
            </Section>
          )}
          {p.arrange.geometry && (
            <Section title={t('Position & size')}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {(() => {
                  const g = p.arrange.geometry!
                  const w = g.x2 - g.x1, h = g.y2 - g.y1
                  const set = (b: Box) => p.actions.setGeometry(b)
                  return (<>
                    <NumField label="X" value={g.x1} disabled={p.arrange.allLocked} onCommit={v => set({ x1: v, y1: g.y1, x2: v + w, y2: g.y2 })} />
                    <NumField label="Y" value={g.y1} disabled={p.arrange.allLocked} onCommit={v => set({ x1: g.x1, y1: v, x2: g.x2, y2: v + h })} />
                    <NumField label="W" value={w} disabled={p.arrange.allLocked || kinds.text} onCommit={v => set({ ...g, x2: g.x1 + Math.max(2, v) })} />
                    <NumField label="H" value={h} disabled={p.arrange.allLocked || kinds.text} onCommit={v => set({ ...g, y2: g.y1 + Math.max(2, v) })} />
                  </>)
                })()}
              </div>
            </Section>
          )}
          <Section title={t('Edit')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <button type="button" disabled={!p.arrange.canGroup} onClick={p.actions.group}
                style={{ ...iconBtn(false, !p.arrange.canGroup), width: 'auto', gap: 5, fontSize: 10.5, fontWeight: 600, height: 26 }}><IcoGroup />{t('Group')}</button>
              <button type="button" disabled={!p.arrange.canUngroup} onClick={p.actions.ungroup}
                style={{ ...iconBtn(false, !p.arrange.canUngroup), width: 'auto', gap: 5, fontSize: 10.5, fontWeight: 600, height: 26 }}><IcoUngroup />{t('Ungroup')}</button>
              <button type="button" onClick={p.actions.toggleLock}
                style={{ ...iconBtn(p.arrange.allLocked), width: 'auto', gap: 5, fontSize: 10.5, fontWeight: 600, height: 26 }}>
                {p.arrange.allLocked ? <IcoUnlock /> : <IcoLock />}{t(p.arrange.allLocked ? 'Unlock' : 'Lock')}
              </button>
              <button type="button" onClick={p.actions.duplicate}
                style={{ ...ICON_BTN, width: 'auto', gap: 5, fontSize: 10.5, fontWeight: 600, height: 26 }}><IcoDuplicate />{t('Duplicate')}</button>
              <button type="button" onClick={p.actions.remove} disabled={p.arrange.allLocked}
                style={{ ...iconBtn(false, p.arrange.allLocked), width: 'auto', gap: 5, fontSize: 10.5, fontWeight: 600, height: 26, color: 'var(--danger, #ef4444)', gridColumn: 'span 2' }}><IcoTrash />{t('Delete')}</button>
            </div>
          </Section>
        </>)}
      </div>
    </div>
  )
}
