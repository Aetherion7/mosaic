'use client'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import SlidingTabs from '@/components/ui/SlidingTabs'
import { useT } from '@/hooks/useT'
import { useSettings, type CustomTheme } from '@/store/settingsStore'
import { DEFAULT_THEME } from '@/lib/themes'
import { DEFAULT_BG } from '@/lib/defaults'
import { todayStr } from '@/lib/dates'
import { TileContent, buildStyle, widgetTypeIcon, TYPE_LABELS } from '@/components/board/TileWrapper'
import WidgetErrorBoundary from '@/components/board/WidgetErrorBoundary'
import type { BoardBg, WidgetStyle, GradientDir, PatternType, Widget, NoteData, TaskData, WaterData, TimerData } from '@/types'

// Interaktiver Theme-Editor: ersetzt die vorherige "JSON einfügen"-Fläche in
// ErscheinungsbildPanel.tsx durch ein eigenes Fenster mit echten Reglern für
// jede Farbe/Transparenz/Schatten/Eigenschaft, die auch WidgetStylePanel.tsx
// (pro Widget) und ThemePanel.tsx (Board-Hintergrund) anbieten — plus einer
// Live-Vorschau, die bei jeder Änderung sofort mitzieht. Lokaler Komponenten-
// State bis zum Klick auf "Speichern" (kein Live-Anwenden aufs echte Board,
// wie schon beim vorherigen JSON-Formular) — erst dann landet das Ergebnis
// per addCustomTheme() in der Liste, exakt wie zuvor.

const DIR_OPTIONS: { value: GradientDir; label: string }[] = [
  { value: 'to-r',  label: '→' }, { value: 'to-br', label: '↘' },
  { value: 'to-b',  label: '↓' }, { value: 'to-bl', label: '↙' },
  { value: 'to-l',  label: '←' }, { value: 'to-tl', label: '↖' },
  { value: 'to-t',  label: '↑' }, { value: 'to-tr', label: '↗' },
]
const SHADOW_OPTS = ['none', 'sm', 'md', 'lg', 'xl'] as const

// `desc` shown as a hover tooltip (native `title`) on each row — a short,
// accurate pointer to where that variable actually shows up in the app, so
// picking colors here isn't a guessing game about what each name means.
const COLOR_FIELDS: { key: string; label: string; desc: string }[] = [
  { key: '--bg',           label: 'Background',       desc: 'The page canvas behind every widget' },
  { key: '--surface',      label: 'Surface',           desc: 'Default widget card background' },
  { key: '--surface2',     label: 'Surface 2',         desc: 'Inputs, hover states, popovers' },
  { key: '--surface3',     label: 'Surface 3',         desc: 'Pressed/active states, nested panels' },
  { key: '--border',       label: 'Border',            desc: 'Card, input and divider outlines' },
  { key: '--accent',       label: 'Accent',            desc: 'Buttons, active tabs, highlights' },
  { key: '--accent2',      label: 'Accent 2',          desc: 'Secondary highlights, tags, charts' },
  // Neu seit dem Dark-Noir-Kontrastfix: die Textfarbe AUF einer akzentfarbenen
  // Fläche (aktive Buttons/Pillen) — ohne dieses Feld könnte ein eigenes
  // Theme mit hellem Akzent genau denselben "weißes Icon auf weiß"-Bug haben,
  // den dieses Feld für die eingebauten Themes behebt.
  { key: '--on-accent',    label: 'Text on accent',    desc: 'Icon/text color drawn on top of Accent' },
  { key: '--text1',        label: 'Text (primary)',    desc: 'Headings and primary body text' },
  { key: '--text2',        label: 'Text (secondary)',  desc: 'Secondary text, labels' },
  { key: '--text3',        label: 'Text (muted)',      desc: 'Placeholders, muted hints' },
  { key: '--danger',       label: 'Danger',            desc: 'Delete actions, errors, overdue' },
  { key: '--success',      label: 'Success',           desc: 'Completed states, confirmations' },
  { key: '--amber',        label: 'Amber',             desc: 'Warnings, pending/in-progress states' },
  { key: '--shadow-color', label: 'Shadow color',      desc: 'Tint of every widget\'s drop shadow' },
]

function dirToCss(d: GradientDir): string {
  return {
    'to-r': 'to right', 'to-br': 'to bottom right', 'to-b': 'to bottom', 'to-bl': 'to bottom left',
    'to-l': 'to left', 'to-tl': 'to top left', 'to-t': 'to top', 'to-tr': 'to top right',
  }[d]
}

// Duplicated from TaskWidget.tsx (not exported there) purely to build a fake
// HabitEntry whose `lastWeek`/`weekDays` match what TaskWidget itself would
// consider "this week" — otherwise its own mount-time "week rolled over"
// effect would treat the fake habit as stale and immediately reset it.
function previewWeekKey(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() || 7
  d.setDate(d.getDate() + 4 - day)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`
}
function previewTodayDayKey(): string {
  return ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][new Date().getDay()]
}

export default function ThemeEditorModal({ initial, onClose }: { initial?: CustomTheme; onClose: () => void }) {
  const addCustomTheme = useSettings(s => s.addCustomTheme)
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, true)

  const [name, setName] = useState(initial?.name ?? '')
  const [cssVars, setCssVars] = useState<Record<string, string>>(() => ({ ...DEFAULT_THEME.cssVars, ...initial?.cssVars }))
  const [bg, setBgState] = useState<BoardBg>(() => ({ ...DEFAULT_BG, ...initial?.bg }))
  const [style, setStyleState] = useState<WidgetStyle>(() => ({ ...DEFAULT_THEME.widgetStyle, ...initial?.widgetStyle } as WidgetStyle))
  // Shared between the Colors list and the Preview so hovering either side
  // highlights the other — a swatch row on the left, or any tagged element
  // on the right (`data-color-key` + the same onHoverColorKey wiring).
  const [hoverColorKey, setHoverColorKey] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  function setVar(key: string, v: string) { setCssVars(prev => ({ ...prev, [key]: v })) }
  function setBg(patch: Partial<BoardBg>) { setBgState(prev => ({ ...prev, ...patch })) }
  function setStyle(patch: Partial<WidgetStyle>) { setStyleState(prev => ({ ...prev, ...patch })) }

  const canSave = name.trim().length > 0
  function save() {
    if (!canSave) return
    addCustomTheme({
      id: initial?.id ?? `custom_${Date.now()}`,
      name: name.trim().slice(0, 40),
      cssVars, bg, widgetStyle: style,
    })
    onClose()
  }

  // Portaled straight onto <body>: this modal is opened from inside
  // SettingsModal, whose own card is a framer-motion `motion.div` — even at
  // rest that keeps a `transform` set inline (scale(1) translateY(0)),
  // which creates a new containing block for any `position: fixed`
  // descendant. Without the portal, this modal's fixed backdrop/card would
  // be positioned and clipped relative to THAT ~960×680 card instead of the
  // viewport (same reasoning ColorSwatch.tsx's own popover already portals
  // for) — not a hypothetical, this is exactly what happened before adding
  // it: the editor rendered clipped to the settings card's bounds with its
  // header/footer cut off and half its own content unclickable.
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="theme-editor-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <motion.div
          ref={modalRef}
          key="theme-editor-modal"
          role="dialog" aria-modal="true" aria-label={t('Theme editor')}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(1200px, 95vw)', height: 'min(780px, 90vh)',
            background: 'var(--popover-bg)',
            backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid var(--border)', borderRadius: 18,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('Theme name')}
              style={{
                fontSize: 15, fontWeight: 700, color: 'var(--text1)', background: 'none',
                border: 'none', outline: 'none', minWidth: 0, flex: 1, marginRight: 12,
              }}
            />
            <button onClick={onClose} title={t('Close')} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>×</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: form */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              <FSection label={t('Colors')}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 18px' }}>
                  {COLOR_FIELDS.map(f => (
                    <FRow key={f.key} label={t(f.label)} title={t(f.desc)}
                      active={hoverColorKey === f.key}
                      onMouseEnter={() => setHoverColorKey(f.key)}
                      onMouseLeave={() => setHoverColorKey(null)}>
                      <ColorSwatch value={cssVars[f.key] ?? '#888888'} onChange={v => setVar(f.key, v)} />
                      <div style={{ flex: 1, height: 22, borderRadius: 6, background: cssVars[f.key] ?? '#888888', border: '1px solid var(--border)' }} />
                    </FRow>
                  ))}
                </div>
                <button onClick={() => setAdvancedOpen(o => !o)} style={{ alignSelf: 'flex-start', fontSize: 10.5, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' }}>
                  {advancedOpen ? t('Hide advanced field') : t('Show advanced field')}
                </button>
                {advancedOpen && (
                  <FRow label={t('Popover background')}>
                    <input
                      value={cssVars['--popover-bg'] ?? 'var(--surface)'}
                      onChange={e => setVar('--popover-bg', e.target.value)}
                      placeholder="var(--surface) / rgba(...)"
                      style={{ flex: 1, fontSize: 11.5, fontFamily: 'monospace', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text1)', outline: 'none' }}
                    />
                  </FRow>
                )}
              </FSection>

              <Divider />

              <FSection label={t('Board background')}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  {(['color', 'gradient', 'image'] as const).map(bt => (
                    <button key={bt} onClick={() => setBg({ type: bt })} style={tabBtn(bg.type === bt)}>
                      {{ color: t('Color'), gradient: t('Gradient'), image: t('Image') }[bt]}
                    </button>
                  ))}
                </div>
                {bg.type === 'color' && (
                  <FRow label={t('Color')}>
                    <ColorSwatch value={bg.color} onChange={v => setBg({ color: v })} />
                  </FRow>
                )}
                {bg.type === 'gradient' && (
                  <>
                    <FRow label={t('From / To')}>
                      <ColorSwatch value={bg.gradient[0]} onChange={v => setBg({ gradient: [v, bg.gradient[1]] })} />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>→</span>
                      <ColorSwatch value={bg.gradient[1]} onChange={v => setBg({ gradient: [bg.gradient[0], v] })} />
                    </FRow>
                    <DirPicker value={bg.gradientDir} onChange={v => setBg({ gradientDir: v })} />
                  </>
                )}
                {bg.type === 'image' && (
                  <ImagePicker
                    imageName={bg.imageName}
                    onUpload={(dataUrl, name) => setBg({ imageUrl: dataUrl, imageName: name })}
                  />
                )}
                {bg.type === 'image' && bg.imageUrl && (
                  <>
                    <FSlider label={t('Brightness')} min={0.2} max={1.5} step={0.05} value={bg.imageBrightness}
                      onChange={v => setBg({ imageBrightness: v })} display={`${Math.round(bg.imageBrightness * 100)}%`} />
                    <FSlider label={t('Blur')} min={0} max={20} step={1} value={bg.imageBlur}
                      onChange={v => setBg({ imageBlur: v })} display={`${bg.imageBlur}px`} />
                  </>
                )}

                <PatternPicker
                  value={bg.pattern}
                  onChange={v => setBg({ pattern: v })}
                  color={bg.patternColor}
                  onColorChange={v => setBg({ patternColor: v })}
                  opacity={bg.patternOpacity}
                  onOpacityChange={v => setBg({ patternOpacity: v })}
                  t={t}
                />
              </FSection>

              <Divider />

              <FSection label={t('Widget style')}>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 50, padding: 2, marginBottom: 4, maxWidth: 220 }}>
                  <SlidingTabs
                    options={[{ value: 'solid', label: t('Solid') }, { value: 'gradient', label: t('Gradient') }]}
                    value={style.gradient ? 'gradient' : 'solid'}
                    onChange={v => setStyle(v === 'gradient'
                      ? { gradient: [style.bgColor.startsWith('#') ? style.bgColor : '#16192b', '#8b74f0'] }
                      : { gradient: null })}
                    slotH={24} radius={50} fontSize={11}
                  />
                </div>
                {!style.gradient ? (
                  <FRow label={t('Color')}>
                    <ColorSwatch value={style.bgColor} onChange={v => setStyle({ bgColor: v })} />
                  </FRow>
                ) : (
                  <>
                    <FRow label={t('From / To')}>
                      <ColorSwatch value={style.gradient[0]} onChange={v => setStyle({ gradient: [v, style.gradient![1]] })} />
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>→</span>
                      <ColorSwatch value={style.gradient[1]} onChange={v => setStyle({ gradient: [style.gradient![0], v] })} />
                    </FRow>
                    <DirPicker value={style.gradientDir} onChange={v => setStyle({ gradientDir: v })} />
                  </>
                )}
                <FSlider label={t('Transparency')} min={0.05} max={1} step={0.05} value={style.opacity}
                  onChange={v => setStyle({ opacity: v })} display={`${Math.round(style.opacity * 100)}%`} />
                <FSlider label={t('Glass (blur)')} min={0} max={30} step={1} value={style.blur}
                  onChange={v => setStyle({ blur: v })} display={`${style.blur}px`} />
                <FRow label={t('Border color')}>
                  <ColorSwatch value={style.borderColor} onChange={v => setStyle({ borderColor: v })} />
                </FRow>
                <FSlider label={t('Border width')} min={0} max={4} step={0.5} value={style.borderWidth}
                  onChange={v => setStyle({ borderWidth: v })} display={`${style.borderWidth}px`} />
                <FSlider label={t('Corner radius')} min={0} max={32} step={1} value={style.borderRadius}
                  onChange={v => setStyle({ borderRadius: v, ...(style.cornerRadii ? { cornerRadii: [v, v, v, v] } : {}) })} display={`${style.borderRadius}px`} />
                <FRow label={t('Shadow')}>
                  <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                    {SHADOW_OPTS.map(sh => (
                      <button key={sh} onClick={() => setStyle({ shadow: sh })} style={{
                        flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600, borderRadius: 8,
                        border: `1px solid ${style.shadow === sh ? 'var(--accent)' : 'var(--border)'}`,
                        background: style.shadow === sh ? 'var(--accent)' : 'var(--surface2)',
                        color: style.shadow === sh ? 'var(--on-accent, white)' : 'var(--text3)',
                        cursor: 'pointer',
                      }}>{sh === 'none' ? '—' : sh.toUpperCase()}</button>
                    ))}
                  </div>
                </FRow>
                <FRow label={t('Glow')}>
                  <ColorSwatch value={style.glowColor ?? cssVars['--accent'] ?? '#8b74f0'} onChange={v => setStyle({ glowColor: v })} />
                  <button
                    onClick={() => setStyle({ glowColor: style.glowColor ? null : (cssVars['--accent'] ?? '#8b74f0'), glowSize: style.glowColor ? 0 : 12 })}
                    style={{ ...tabBtn(!!style.glowColor), fontSize: 10, padding: '4px 10px' }}
                  >{style.glowColor ? t('On') : t('Off')}</button>
                </FRow>
                {style.glowColor && (
                  <FSlider label={t('Glow intensity')} min={1} max={30} step={1} value={style.glowSize}
                    onChange={v => setStyle({ glowSize: v })} display={`${style.glowSize}px`} />
                )}
              </FSection>
            </div>

            {/* Right: live preview */}
            <div style={{ width: 420, flexShrink: 0, borderLeft: '1px solid var(--border)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10, background: 'color-mix(in srgb, var(--surface2) 40%, transparent)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('Live preview')}</span>
              <div style={{ flex: 1, minHeight: 0 }}>
                <LivePreview cssVars={cssVars} bg={bg} style={style} hoverColorKey={hoverColorKey} onHoverColorKey={setHoverColorKey} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button onClick={onClose} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
              {t('Cancel')}
            </button>
            <button onClick={save} disabled={!canSave} style={{ fontSize: 12, fontWeight: 700, padding: '8px 18px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent, white)', cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.4 }}>
              {initial ? t('Save changes') : t('Create theme')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

// ── Live preview ──────────────────────────────────────────────────────────────

// Static, computed-once sample data for three REAL widget components — not
// mockup divs. Every field here exists purely to satisfy each widget's own
// data shape so it renders its normal, real UI (TaskWidget's weekly habit
// grid, NoteWidget's rich text, WaterWidget's fill bar) instead of guessing
// at what those look like from outside. IDs are fixed, obviously-fake
// strings that can never collide with a real widget id anywhere in the
// user's boards — confirmed safe (see store's patchWidget: an id that
// matches no widget in the resolved board is always a no-op, it can never
// create an entry) even though TaskWidget/WaterWidget both do a mount-time
// "scan every board for this id" self-heal check. `lastWeek`/`weekDays`/
// `lastDate` are pre-filled to match "this week"/"today" exactly so those
// mount effects see nothing stale and never fire a reset in the first place.
function makePreviewWidgets(): Widget[] {
  const weekKey  = previewWeekKey()
  const todayKey = previewTodayDayKey()
  const basePos  = { col: 1, row: 1, colSpan: 4, rowSpan: 3 }
  const noopStyle = DEFAULT_THEME.widgetStyle as WidgetStyle // irrelevant: only `data` is read by these components, chrome comes from the wrapper below

  const note: Widget = {
    id: '__theme-preview-note__', type: 'note', pos: basePos, zIndex: 1, style: noopStyle,
    data: {
      title: '',
      content: '<h3>Sprint notes</h3><p>Ship the <strong>theme editor</strong> update and double-check contrast on every built-in theme.</p><ul><li>Live preview with real widgets</li><li>Fix shadow color accuracy</li></ul>',
    } as NoteData,
  }

  const task: Widget = {
    id: '__theme-preview-task__', type: 'task', pos: basePos, zIndex: 1, style: noopStyle,
    data: {
      viewMode: 'weekly',
      habits: [
        { id: 'h1', name: 'Morning workout', color: '#7c6fe8', weekDays: [todayKey], lastWeek: weekKey, weeklyLog: {} },
        { id: 'h2', name: 'Reply to emails',  color: '#4ecdc4', weekDays: [],         lastWeek: weekKey, weeklyLog: {} },
        { id: 'h3', name: 'Buy groceries',    color: '#ffd166', weekDays: [],         lastWeek: weekKey, weeklyLog: {} },
      ],
    } as TaskData,
  }

  const water: Widget = {
    id: '__theme-preview-water__', type: 'water', pos: basePos, zIndex: 1, style: noopStyle,
    data: { goalMl: 2000, loggedMl: 1250, mlPerSection: 250, lastDate: todayStr() } as WaterData,
  }

  // The ONLY place --success and --surface3 render anywhere in the real app
  // (TimerWidget.tsx: the ring turns --success when done, its track/Pause
  // button use --surface3) — finished (elapsed === durationMin*60) so both
  // show up without needing an invented stand-in.
  const timer: Widget = {
    id: '__theme-preview-timer__', type: 'timer', pos: basePos, zIndex: 1, style: noopStyle,
    data: { name: 'Focus session', durationMin: 5, startedAt: null, running: false, elapsed: 300 } as TimerData,
  }

  return [note, task, water, timer]
}

function LivePreview({ cssVars, bg, style, hoverColorKey, onHoverColorKey }: {
  cssVars: Record<string, string>; bg: BoardBg; style: WidgetStyle
  hoverColorKey: string | null; onHoverColorKey: (k: string | null) => void
}) {
  const t = useT()
  const v = (k: string, fallback: string) => cssVars[k] ?? fallback
  const widgets = useMemo(() => makePreviewWidgets(), [])
  // Cursor position (+ the container's own width, so the tooltip can flip
  // to the left near the right edge instead of overflowing past it) tracked
  // purely for the tooltip below — cleared on mouse-leave so it can't
  // linger at a stale spot if the pointer re-enters without moving first.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; w: number } | null>(null)
  const hoveredLabel = hoverColorKey ? t(COLOR_FIELDS.find(f => f.key === hoverColorKey)?.label ?? hoverColorKey) : null

  // Canonicalizes every Colors value to the exact string form getComputedStyle
  // hands back for a hovered element's color/backgroundColor/fill/stroke, so
  // the two can be compared directly — no manual tagging required inside the
  // real widget components themselves. Deliberately routed through a real
  // (detached-but-attached) DOM node's own computed style rather than e.g. a
  // canvas 2D context: canvas's fillStyle getter serializes opaque colors as
  // "#rrggbb" hex, while getComputedStyle always returns "rgb(r, g, b)" —
  // those never string-match even for the identical color, which silently
  // broke every lookup (detection always fell through to the background-
  // color climb) until this was caught by testing an actual hover.
  const colorKeyByRgb = useMemo(() => {
    const map = new Map<string, string>()
    if (typeof document === 'undefined') return map
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute; visibility:hidden; pointer-events:none;'
    document.body.appendChild(probe)
    for (const f of COLOR_FIELDS) {
      const raw = cssVars[f.key]
      if (!raw) continue
      probe.style.color = raw
      map.set(getComputedStyle(probe).color, f.key)
    }
    document.body.removeChild(probe)
    return map
  }, [cssVars])

  // Walks from the exact hovered element outward: a leaf node's own paint
  // (SVG fill/stroke, or text color) is the most specific answer to "what
  // color is under the cursor"; failing that, climb for the nearest
  // explicit background/border, since those don't inherit and the visible
  // color at that point comes from whichever ancestor actually painted it.
  function detectColorKey(target: Element): string | null {
    if (target.children.length === 0) {
      const cs = getComputedStyle(target)
      // fill/stroke are computed for *any* element, SVG or not — the CSS
      // spec's initial value for fill is black, so every plain non-SVG
      // text node was silently reporting "rgb(0, 0, 0)" and false-matching
      // --shadow-color (which happens to default to pure black) before
      // color was ever checked. Only trust fill/stroke on real SVG nodes.
      const paints = target instanceof SVGElement ? [cs.fill, cs.stroke, cs.color] : [cs.color]
      for (const paint of paints) {
        const key = colorKeyByRgb.get(paint)
        if (key) return key
      }
    }
    let node: Element | null = target
    for (let hops = 0; node && hops < 8; hops++, node = node.parentElement) {
      const cs = getComputedStyle(node)
      // borderTopColor resolves to *something* (often black, via the
      // currentcolor initial value) even on elements with no visible
      // border at all — only trust it once a border is actually being
      // painted, or hovering plain text picks up false "Shadow color" /
      // "Background" hits from invisible borders several ancestors up.
      const hasVisibleBorder = cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0
      const paints = hasVisibleBorder ? [cs.backgroundColor, cs.borderTopColor] : [cs.backgroundColor]
      for (const paint of paints) {
        const key = colorKeyByRgb.get(paint)
        if (key) return key
      }
    }
    return colorKeyByRgb.get(getComputedStyle(target).color) ?? null
  }

  // Kept as two mutually-exclusive branches (never both in the same style
  // object) rather than `background` + `backgroundImage`/`backgroundSize`
  // together — React warns about mixing the shorthand with its own
  // longhands on the same element (can apply out of order across
  // re-renders), and CanvasBackground.tsx already avoids this the same way
  // for the real board background.
  const containerBgStyle: React.CSSProperties = bg.type === 'image' && bg.imageUrl
    ? { backgroundImage: `url(${bg.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: bg.type === 'color' ? bg.color : `linear-gradient(${dirToCss(bg.gradientDir)}, ${bg.gradient[0]}, ${bg.gradient[1]})` }

  const patternStyle: React.CSSProperties =
    bg.pattern === 'dots' ? { backgroundImage: `radial-gradient(circle, ${bg.patternColor} 1px, transparent 1px)`, backgroundSize: '14px 14px', opacity: bg.patternOpacity }
    : bg.pattern === 'grid' ? { backgroundImage: `linear-gradient(${bg.patternColor} 1px, transparent 1px), linear-gradient(90deg, ${bg.patternColor} 1px, transparent 1px)`, backgroundSize: '16px 16px', opacity: bg.patternOpacity }
    : {}

  // The real, exported buildStyle() from TileWrapper.tsx — the exact same
  // function that styles every widget on a real board — instead of a
  // reimplementation. It reads `var(--shadow-color)`/`var(--accent)` (for
  // the selection ring, unused here) via plain CSS var() references, which
  // is why the whole tree below is wrapped in a div that redefines every
  // --xxx custom property to this in-progress theme's values (see
  // `scopedVars` below): those var() calls resolve against the nearest
  // ancestor that defines them, so this "just works" without threading
  // colors through buildStyle's return value by hand.
  const cardChrome = buildStyle(style, false)

  // Every cssVars entry as inline custom properties on the preview root —
  // this is what makes both `buildStyle()` above AND the real widget
  // components below (which read colors via the same var(--text1) etc.
  // convention as the rest of the app) render using the theme CURRENTLY
  // being edited, rather than the app's actually-active theme sitting on
  // <html> right now. Scoping via a plain inline style on a wrapper is the
  // same mechanism the real theme system uses at the document root — just
  // narrowed to this one subtree.
  const scopedVars = cssVars as React.CSSProperties

  return (
    <div
      onMouseMove={e => {
        const r = e.currentTarget.getBoundingClientRect()
        setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width })
      }}
      onMouseLeave={() => setCursorPos(null)}
      style={{
        position: 'relative', width: '100%', height: '100%', minHeight: 320, borderRadius: 14, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        ...scopedVars,
        ...containerBgStyle,
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
      {bg.type === 'image' && bg.imageUrl && (
        <div style={{ position: 'absolute', inset: 0, backdropFilter: `brightness(${bg.imageBrightness}) blur(${bg.imageBlur}px)`, WebkitBackdropFilter: `brightness(${bg.imageBrightness}) blur(${bg.imageBlur}px)` }} />
      )}
      {/* Purely decorative — pointerEvents:none matters here: as a
          position:absolute element it would otherwise paint (and intercept
          hover/click) ABOVE any static-positioned sibling below it,
          regardless of DOM order — that's a real CSS stacking rule, not a
          z-index question, and it silently broke hovering the two new rows
          added below (which don't set position:relative themselves) until
          caught via an actual Playwright hover test failing with
          "<div></div> intercepts pointer events". */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...patternStyle }} />

      {/* Mini toolbar strip — a genuine "whole board" chrome context (not
          just isolated cards) for Surface/Accent/Text1. */}
      <div
        data-color-key="--surface"
        onMouseEnter={() => onHoverColorKey('--surface')}
        onMouseLeave={() => onHoverColorKey(null)}
        style={{
          position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', background: v('--surface', '#12131e'), borderBottom: `1px solid ${v('--border', '#2c2d4a')}`,
          ...refRing(hoverColorKey === '--surface'),
        }}>
        <div
          data-color-key="--accent"
          onMouseEnter={() => onHoverColorKey('--accent')}
          onMouseLeave={() => onHoverColorKey(null)}
          style={{ width: 9, height: 9, borderRadius: '50%', background: v('--accent', '#7c6fe8'), flexShrink: 0, ...refRing(hoverColorKey === '--accent') }} />
        <span
          data-color-key="--text1"
          onMouseEnter={() => onHoverColorKey('--text1')}
          onMouseLeave={() => onHoverColorKey(null)}
          style={{ fontSize: 11, fontWeight: 700, color: v('--text1', '#eee'), borderRadius: 4, ...refRing(hoverColorKey === '--text1') }}>My board</span>
      </div>

      {/* Real interaction patterns, verbatim — not stand-ins. Each one is
          copied 1:1 (text, colors, padding) from where it actually lives:
          the "Undo" pill from ToastStack.tsx's delete-undo toast (the only
          --on-accent TEXT anywhere in the app), the "Empty trash" pill from
          BoardsPanel.tsx's Settings → Boards → Trash section (the only
          --danger TEXT anywhere — the previously-missing "red danger text"),
          and the "…" menu trigger from TileWrapper.tsx's per-widget popover
          (its exact box-shadow formula, the clearest real --shadow-color). */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 0' }}>
        <button
          data-color-key="--on-accent"
          onMouseEnter={() => onHoverColorKey('--on-accent')}
          onMouseLeave={() => onHoverColorKey(null)}
          style={{
            padding: '5px 14px', borderRadius: 9, border: 'none', cursor: 'default',
            background: v('--accent', '#7c6fe8'), color: v('--on-accent', '#fff'),
            fontSize: 12, fontWeight: 700, ...refRing(hoverColorKey === '--on-accent'),
          }}>{t('Undo')}</button>
        <button
          data-color-key="--danger"
          onMouseEnter={() => onHoverColorKey('--danger')}
          onMouseLeave={() => onHoverColorKey(null)}
          style={{
            padding: '4px 12px', borderRadius: 999, cursor: 'default',
            border: `1px solid color-mix(in srgb, ${v('--danger', '#f87171')} 40%, transparent)`,
            background: 'none', color: v('--danger', '#f87171'),
            fontSize: 11, fontWeight: 600, ...refRing(hoverColorKey === '--danger'),
          }}>{t('Empty trash')}</button>
        <div
          data-color-key="--shadow-color"
          onMouseEnter={() => onHoverColorKey('--shadow-color')}
          onMouseLeave={() => onHoverColorKey(null)}
          style={{
            marginLeft: 'auto', width: 24, height: 24, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: v('--popover-bg', v('--surface2', '#191a2c')),
            boxShadow: `0 12px 28px color-mix(in srgb, ${v('--shadow-color', 'rgba(0,0,0,0.45)')} 45%, transparent)`,
            ...refRing(hoverColorKey === '--shadow-color'),
          }}>
          <svg width="12" height="3.5" viewBox="0 0 24 6" fill={v('--text2', '#9795b5')}><circle cx="3" cy="3" r="2.4"/><circle cx="12" cy="3" r="2.4"/><circle cx="21" cy="3" r="2.4"/></svg>
        </div>
      </div>

      {/* Verbatim (truncated) from DatenschutzPanel.tsx's Privacy notice —
          the only real --amber usage in the app; it tints the box, not the
          text, which is exactly what's shown here rather than inventing an
          amber-colored label that doesn't exist anywhere for real. */}
      <div
        data-color-key="--amber"
        onMouseEnter={() => onHoverColorKey('--amber')}
        onMouseLeave={() => onHoverColorKey(null)}
        style={{
          flexShrink: 0, margin: '10px 14px 0', display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '8px 10px', borderRadius: 10,
          background: `color-mix(in srgb, ${v('--amber', '#fbbf24')} 8%, ${v('--surface2', '#1e2236')})`,
          border: `1px solid color-mix(in srgb, ${v('--amber', '#fbbf24')} 25%, transparent)`,
          ...refRing(hoverColorKey === '--amber'),
        }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={v('--amber', '#fbbf24')} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>
        <div style={{ fontSize: 10.5, color: v('--text2', '#9795b5'), lineHeight: 1.5 }}>
          <strong style={{ color: v('--text1', '#eee') }}>{t('Exception: some widgets need the internet.')}</strong>
        </div>
      </div>

      {/* Real widgets, stacked — each wrapped exactly like TileWrapper.tsx
          wraps TileContent: chrome (background/border/radius/shadow) from
          buildStyle() on the card, a header bar with the widget's real icon
          + type label, then the actual widget component inside an error
          boundary (same as the real board — a rendering bug in a widget
          shouldn't be able to blank out the whole preview). The widget's
          own internals are hoverable too (pointerEvents 'auto', not
          'none') — detectColorKey() reads whatever's actually under the
          cursor at the DOM level, so every real text/icon/fill inside
          NoteWidget/TaskWidget/WaterWidget/TimerWidget answers correctly
          with zero per-widget tagging. TimerWidget is included purely
          because it's the only place --success and --surface3 render
          anywhere in the app (its "done" ring and its track/Pause button).
          Click/keydown/pointerdown are still swallowed in capture phase so
          nothing is actually editable or draggable here — this stays a
          preview, not a mini editable board. */}
      <div
        data-color-key="--bg"
        onMouseEnter={() => onHoverColorKey('--bg')}
        onMouseLeave={() => onHoverColorKey(null)}
        style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 14px 14px', overflow: 'auto', ...refRing(hoverColorKey === '--bg') }}>
        {widgets.map(widget => (
          <div key={widget.id}
            data-color-key="--surface"
            onMouseEnter={() => onHoverColorKey('--surface')}
            onMouseLeave={() => onHoverColorKey(null)}
            style={{ ...cardChrome, height: 172, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box', ...refRing(hoverColorKey === '--surface') }}>
            <div
              data-color-key="--text3"
              onMouseEnter={() => onHoverColorKey('--text3')}
              onMouseLeave={() => onHoverColorKey(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px 5px',
                borderBottom: '1px solid var(--border)', flexShrink: 0,
                ...refRing(hoverColorKey === '--text3'),
              }}>
              <span style={{ opacity: 0.55, color: 'var(--text2)', display: 'flex' }}>{widgetTypeIcon(widget)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t(TYPE_LABELS[widget.type])}
              </span>
            </div>
            <div
              style={{ flex: 1, padding: '10px 12px', overflow: 'hidden', minHeight: 0 }}
              onMouseMove={e => {
                const key = detectColorKey(e.target as Element)
                if (key) onHoverColorKey(key)
              }}
              onMouseLeave={() => onHoverColorKey(null)}
              onClickCapture={e => e.preventDefault()}
              onMouseDownCapture={e => e.preventDefault()}
              onPointerDownCapture={e => e.preventDefault()}
              onKeyDownCapture={e => e.preventDefault()}
            >
              <WidgetErrorBoundary><TileContent widget={widget} /></WidgetErrorBoundary>
            </div>
          </div>
        ))}
      </div>

      {/* Cursor-following tooltip — only while actually hovering something
          tagged inside this preview (Colors-list hover highlights the same
          elements via hoverColorKey, but never sets cursorPos, so it never
          shows this). */}
      {cursorPos && hoveredLabel && (() => {
        // Flip to the cursor's left once past the container's midpoint —
        // otherwise cells near the right edge push the tooltip straight off
        // the panel, clipped by its own overflow:hidden.
        const nearRightEdge = cursorPos.x > cursorPos.w / 2
        return (
          <div style={{
            position: 'absolute', top: cursorPos.y + 16, zIndex: 40,
            ...(nearRightEdge ? { right: cursorPos.w - cursorPos.x + 16 } : { left: cursorPos.x + 16 }),
            pointerEvents: 'none', background: 'rgba(15,15,25,0.94)', color: '#fff',
            fontSize: 10.5, fontWeight: 600, padding: '4px 9px', borderRadius: 6,
            whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          }}>
            {hoveredLabel}
          </div>
        )
      })()}
    </div>
  )
}

// ── Small shared form pieces (local to this file — mirrors the same private
// pattern WidgetStylePanel.tsx/ThemePanel.tsx each already use on their own,
// rather than reaching into either of those for now-private helpers) ────────

function FSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)' }} />
}

// `active`/`onMouseEnter`/`onMouseLeave` are only passed by the Colors rows
// (to link up with the matching Preview element on hover) — every other
// FRow call site (sliders, pickers, etc.) just omits them and gets the
// exact same row it always has.
function FRow({ label, title, children, active, onMouseEnter, onMouseLeave }: {
  label: string; title?: string; children: React.ReactNode
  active?: boolean; onMouseEnter?: () => void; onMouseLeave?: () => void
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6,
        padding: '2px 4px', margin: '-2px -4px',
        background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
        transition: 'background 0.12s',
      }}
      title={title}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span style={{ fontSize: 11.5, color: 'var(--text2)', minWidth: 110, flexShrink: 0, borderBottom: title ? '1px dotted var(--text3)' : 'none', width: 'fit-content' }}>{label}</span>
      {children}
    </div>
  )
}

// Shared "hover ring" style for any tagged Preview element — a fixed,
// theme-independent blue so it stays visible regardless of which colors are
// currently being edited (an accent-colored ring would be invisible/wrong
// while hovering the Accent row itself). Matches the selection-ring
// convention already used for Drawboard shape selection.
function refRing(active: boolean): React.CSSProperties {
  return {
    boxShadow: active ? '0 0 0 2px #3b82f6, 0 0 10px 1px rgba(59,130,246,0.5)' : 'none',
    transition: 'box-shadow 0.12s',
  }
}

function FSlider({ label, min, max, step, value, onChange, display }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; display: string
}) {
  return (
    <FRow label={label}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--accent)' }} />
      <span style={{ fontSize: 10, color: 'var(--text3)', minWidth: 36, textAlign: 'right' }}>{display}</span>
    </FRow>
  )
}

function DirPicker({ value, onChange }: { value: GradientDir; onChange: (v: GradientDir) => void }) {
  return (
    <FRow label="">
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {DIR_OPTIONS.map(d => (
          <button key={d.value} onClick={() => onChange(d.value)} style={{
            width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)',
            background: value === d.value ? 'var(--accent)' : 'var(--surface2)',
            color: value === d.value ? 'var(--on-accent, white)' : 'var(--text2)',
            fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{d.label}</button>
        ))}
      </div>
    </FRow>
  )
}

function ImagePicker({ imageName, onUpload }: { imageName: string | null; onUpload: (dataUrl: string, name: string) => void }) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onUpload(ev.target?.result as string, file.name)
    reader.readAsDataURL(file)
  }
  return (
    <>
      <button onClick={() => fileRef.current?.click()} style={{
        padding: '9px 12px', fontSize: 11, borderRadius: 10, border: '1.5px dashed var(--text3)',
        background: 'var(--surface2)', color: imageName ? 'var(--text1)' : 'var(--text3)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
          {imageName ?? t('Upload image')}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
    </>
  )
}

function PatternPicker({ value, onChange, color, onColorChange, opacity, onOpacityChange, t }: {
  value: PatternType; onChange: (v: PatternType) => void
  color: string; onColorChange: (v: string) => void
  opacity: number; onOpacityChange: (v: number) => void
  t: (s: string) => string
}) {
  const patterns: { id: PatternType; label: string; preview: React.ReactNode }[] = [
    { id: 'dots', label: t('Dots'), preview: <div style={{ width: '100%', height: '100%', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '10px 10px' }} /> },
    { id: 'grid', label: t('Grid'), preview: <div style={{ width: '100%', height: '100%', backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '12px 12px' }} /> },
    { id: 'none', label: t('None'), preview: <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 16, opacity: 0.3 }}>—</span></div> },
  ]
  return (
    <FSection label={t('Grid pattern')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {patterns.map(p => (
          <button key={p.id} onClick={() => onChange(p.id)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '6px 4px 8px',
            borderRadius: 9, border: `2px solid ${value === p.id ? 'var(--accent)' : 'var(--border)'}`,
            background: value === p.id ? 'color-mix(in srgb, var(--accent) 8%, var(--surface2))' : 'var(--surface2)',
            cursor: 'pointer',
          }}>
            <div style={{ width: '100%', height: 30, borderRadius: 5, background: '#1a1a2e', overflow: 'hidden', border: '1px solid var(--border)' }}>{p.preview}</div>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: value === p.id ? 'var(--accent)' : 'var(--text2)' }}>{p.label}</span>
          </button>
        ))}
      </div>
      {(value === 'dots' || value === 'grid') && (
        <>
          <FRow label={t('Color')}>
            <ColorSwatch value={color} onChange={onColorChange} />
          </FRow>
          <FSlider label={t('Strength')} min={0.01} max={0.3} step={0.01} value={opacity}
            onChange={onOpacityChange} display={`${Math.round(opacity * 100)}%`} />
        </>
      )}
    </FSection>
  )
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 50,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent)' : 'var(--surface2)',
  color: active ? 'var(--on-accent, white)' : 'var(--text2)',
  cursor: 'pointer', transition: 'all 0.12s',
})
