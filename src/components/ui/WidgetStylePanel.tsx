'use client'
import { useEffect, useRef, useState } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import SlidingTabs from '@/components/ui/SlidingTabs'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useT } from '@/hooks/useT'
import type { GradientDir, WidgetStyle } from '@/types'

const PANEL_W = 320
const MARGIN  = 10
const mobileMotion = {
  initial:    { opacity: 0, y: '100%' },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: '100%' },
  transition: { type: 'spring' as const, stiffness: 380, damping: 40 },
}

const SHADOW_OPTS = ['none', 'sm', 'md', 'lg', 'xl'] as const

const DIR_OPTIONS: { value: GradientDir; label: string }[] = [
  { value: 'to-r',  label: '→' },
  { value: 'to-br', label: '↘' },
  { value: 'to-b',  label: '↓' },
  { value: 'to-bl', label: '↙' },
  { value: 'to-l',  label: '←' },
  { value: 'to-tl', label: '↖' },
  { value: 'to-t',  label: '↑' },
  { value: 'to-tr', label: '↗' },
]

export default function WidgetStylePanel() {
  const t = useT()
  const panel = useUIStore(s => s.panel)
  const openPanel = useUIStore(s => s.openPanel)
  const selectedId = useUIStore(s => s.selectedId)
  const isMobile   = useIsMobile()
  const widget = useBoardStore(s => {
    const board = selectBoard(s)
    return selectedId && board ? board.widgets[selectedId] : null
  })
  const updateStyle = useBoardStore(s => s.updateStyle)

  // Calculate panel position next to the selected widget
  const [pos, setPos] = useState<{ top: number; left: number; onLeft: boolean }>({
    top: 60, left: 0, onLeft: false,
  })

  useEffect(() => {
    if (isMobile || !selectedId) return
    const el = document.getElementById(`widget-${selectedId}`)
    if (!el) return

    const rect = el.getBoundingClientRect()
    const viewW = window.innerWidth
    const viewH = window.innerHeight

    const spaceRight = viewW - rect.right - MARGIN
    const onLeft = spaceRight < PANEL_W + MARGIN

    const left = onLeft
      ? Math.max(MARGIN, rect.left - PANEL_W - MARGIN)
      : rect.right + MARGIN

    const top = Math.max(60, Math.min(rect.top, viewH - 200))

    setPos({ top, left, onLeft })

    // Bei Widgets nahe dem unteren Seitenrand ragt das Panel sonst aus dem
    // Viewport: nach dem Rendern die echte Höhe messen und top so weit
    // anheben, dass die Unterkante oberhalb des Bildschirmrands bleibt.
    const raf = requestAnimationFrame(() => {
      const p = panelRef.current
      if (!p) return
      const maxTop = window.innerHeight - p.offsetHeight - MARGIN
      if (top > maxTop) setPos({ top: Math.max(MARGIN, maxTop), left, onLeft })
    })
    return () => cancelAnimationFrame(raf)
  }, [selectedId, panel, isMobile])

  const panelRef = useRef<HTMLDivElement>(null)

  if (!widget) return null
  const s = widget.style

  function set(patch: Partial<WidgetStyle>) { updateStyle(widget!.id, patch) }

  const accentHex = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b74f0')
    : '#8b74f0'

  const isGradient = !!s.gradient
  const g0 = s.gradient?.[0] ?? s.bgColor
  const g1 = s.gradient?.[1] ?? s.bgColor

  const desktopMotion = {
    initial:    { opacity: 0, x: pos.onLeft ? -8 : 8, scale: 0.97 },
    animate:    { opacity: 1, x: 0, scale: 1 },
    exit:       { opacity: 0, x: pos.onLeft ? -8 : 8, scale: 0.97 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
  }

  const panelBg = 'color-mix(in srgb, var(--surface) 75%, var(--bg))'
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
        background: panelBg,
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid var(--border)',
        borderRadius: '20px 20px 0 0', padding: '8px 16px 32px',
        boxShadow: '0 -8px 40px rgba(0,0,0,.5)',
        maxHeight: '80vh', overflowY: 'auto',
      }
    : {
        position: 'fixed', top: pos.top, left: pos.left, zIndex: 900,
        width: PANEL_W,
        background: panelBg,
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid var(--border)',
        borderRadius: 20, padding: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,0.04)',
        maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
      }

  return (
    <AnimatePresence>
      {panel === 'widgetStyle' && (
        <motion.div
          ref={panelRef}
          {...(isMobile ? mobileMotion : desktopMotion)}
          onClick={e => e.stopPropagation()}
          style={panelStyle}
        >
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
          )}
          <PanelHeader title={t('Widget style')} onClose={() => openPanel(null)} />

          {/* ── Background ── */}
          <Section label={t('Background')}>
            {/* Solid / Gradient toggle — gleitende Pille (SlidingTabs) */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 50, padding: 2, marginBottom: 10 }}>
              <SlidingTabs
                options={[
                  { value: 'solid',    label: t('Solid') },
                  { value: 'gradient', label: t('Gradient') },
                ]}
                value={isGradient ? 'gradient' : 'solid'}
                onChange={v => set(v === 'gradient'
                  ? { gradient: [s.bgColor.startsWith('#') ? s.bgColor : '#16192b', '#8b74f0'] }
                  : { gradient: null })}
                slotH={24} radius={50} fontSize={11}
              />
            </div>

            {!isGradient ? (
              <Row label={t('Color')}>
                <ColorSwatch value={s.bgColor} onChange={v => set({ bgColor: v })} />
                <div style={{
                  flex: 1, height: 24, borderRadius: 7,
                  background: s.bgColor, border: '1px solid var(--border)',
                }} />
              </Row>
            ) : (
              <>
                <Row label={t('From / To')}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                    <ColorSwatch value={g0.startsWith('#') ? g0 : '#16192b'} onChange={v => set({ gradient: [v, g1] })} />
                    <div style={{
                      flex: 1, height: 24, borderRadius: 7,
                      background: `linear-gradient(to right, ${g0}, ${g1})`,
                      border: '1px solid var(--border)',
                    }} />
                    <ColorSwatch value={g1.startsWith('#') ? g1 : '#8b74f0'} onChange={v => set({ gradient: [g0, v] })} />
                  </div>
                </Row>
                <Row label={t('Direction')}>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1 }}>
                    {DIR_OPTIONS.map(d => (
                      <button key={d.value} onClick={() => set({ gradientDir: d.value })} style={{
                        width: 24, height: 24, borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: s.gradientDir === d.value ? 'var(--accent)' : 'var(--surface2)',
                        color: s.gradientDir === d.value ? 'white' : 'var(--text2)',
                        fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{d.label}</button>
                    ))}
                  </div>
                </Row>
              </>
            )}

            <SliderRow label={t('Transparency')} min={0.05} max={1} step={0.05} value={s.opacity}
              onChange={v => set({ opacity: v })} display={`${Math.round(s.opacity * 100)}%`} />
            <SliderRow label={t('Glass (blur)')} min={0} max={30} step={1} value={s.blur}
              onChange={v => set({ blur: v })} display={`${s.blur}px`} />
          </Section>

          <Divider />

          {/* ── Shape ── */}
          <Section label={t('Shape')}>
            <CornerRadiusSection s={s} set={set} t={t} />
          </Section>

          <Divider />

          {/* ── Border ── */}
          <Section label={t('Border')}>
            <Row label={t('Color')}>
              <ColorSwatch value={s.borderColor.startsWith('#') ? s.borderColor : '#2a2d45'} onChange={v => set({ borderColor: v })} />
              {/* Lebt mit der Breite unten mit — echte Vorschau der Strichstärke statt einer festen 2px-Linie */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', height: 24 }}>
                <div style={{ width: '100%', height: Math.max(1, s.borderWidth * 2), borderRadius: 1, background: s.borderColor, transition: 'height 0.08s' }} />
              </div>
            </Row>
            <SliderRow label={t('Width')} min={0} max={4} step={0.5} value={s.borderWidth}
              onChange={v => set({ borderWidth: v })} display={`${s.borderWidth}px`} />
          </Section>

          <Divider />

          {/* ── Shadow ── */}
          <Section label={t('Shadow')}>
            <div style={{ display: 'flex', gap: 5 }}>
              {SHADOW_OPTS.map(sh => (
                <button key={sh} onClick={() => set({ shadow: sh })} style={{
                  flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600, borderRadius: 8,
                  border: `1px solid ${s.shadow === sh ? 'var(--accent)' : 'var(--border)'}`,
                  background: s.shadow === sh ? 'var(--accent)' : 'var(--surface2)',
                  color: s.shadow === sh ? 'white' : 'var(--text3)',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}>{sh === 'none' ? '—' : sh.toUpperCase()}</button>
              ))}
            </div>
          </Section>

          <Divider />

          {/* ── Glow ── */}
          <Section label={t('Glow')}>
            <Row label={t('Color')}>
              <ColorSwatch
                value={s.glowColor?.startsWith('#') ? s.glowColor : accentHex}
                onChange={v => set({ glowColor: v })}
              />
              <button
                onClick={() => set({
                  glowColor: s.glowColor ? null : accentHex,
                  glowSize:  s.glowColor ? 0 : 12,
                })}
                style={{
                  ...tabBtn(!!s.glowColor),
                  fontSize: 10, padding: '4px 10px',
                }}
              >{s.glowColor ? t('On') : t('Off')}</button>
            </Row>
            {s.glowColor && (
              <SliderRow label={t('Intensity')} min={1} max={30} step={1} value={s.glowSize}
                onChange={v => set({ glowSize: v })} display={`${s.glowSize}px`} />
            )}
          </Section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </span>
      <button onClick={onClose} style={{
        width: 24, height: 24, borderRadius: 8, border: 'none',
        background: 'var(--surface2)', color: 'var(--text2)',
        fontSize: 16, lineHeight: 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text2)', minWidth: 80, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}

function SliderRow({ label, min, max, step, value, onChange, display }: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; display: string;
}) {
  return (
    <Row label={label}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--accent)' }} />
      <span style={{ fontSize: 10, color: 'var(--text3)', minWidth: 34, textAlign: 'right' }}>{display}</span>
    </Row>
  )
}

// Uniform-Regler + Ein-/Ausklapp-Button für den detaillierten Ecken-Editor
// darunter — der ist standardmäßig zugeklappt, damit das Panel kompakt
// bleibt, und öffnet sich per Klick auf den Zahnrad-Button.
function CornerRadiusSection({ s, set, t }: {
  s: WidgetStyle
  set: (patch: Partial<WidgetStyle>) => void
  t: (s: string) => string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1 }}>
          <SliderRow label={t('Corner radius')} min={0} max={32} step={1} value={s.borderRadius}
            onChange={v => set({
              borderRadius: v,
              // Solange einzelne Ecken aktiv sind, gemeinsam mitziehen —
              // sonst würde der Uniform-Regler wirkungslos wirken
              ...(s.cornerRadii ? { cornerRadii: [v, v, v, v] } : {}),
            })} display={`${s.borderRadius}px`} />
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          title={open ? t('Hide per-corner settings') : t('Show per-corner settings')}
          style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
            background: open ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface2)',
            color: open ? 'var(--accent)' : 'var(--text3)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {open && <CornerRadiusEditor s={s} set={set} t={t} />}
    </>
  )
}

// Ecken-Editor im Stil der Photoshop-Formeigenschaften: eine Vorschau-Kachel
// mit vier Zahlenfeldern an den Ecken + einem Verknüpfen/Trennen-Symbol in
// der Mitte, statt der vorherigen simplen 2×2-Regler-Liste. Die Vorschau
// zeigt live die tatsächlichen (ggf. unterschiedlichen) Eckenradien.
function CornerRadiusEditor({ s, set, t }: {
  s: WidgetStyle
  set: (patch: Partial<WidgetStyle>) => void
  t: (s: string) => string
}) {
  const linked = !s.cornerRadii
  // Reihenfolge: 0=oben-links, 1=oben-rechts, 2=unten-rechts, 3=unten-links
  const radii = s.cornerRadii ?? [s.borderRadius, s.borderRadius, s.borderRadius, s.borderRadius]

  function updateCorner(idx: number, raw: number) {
    const v = Math.max(0, Math.min(32, Number.isFinite(raw) ? raw : 0))
    if (linked) {
      // Verknüpft: ein Eckenfeld tippen wirkt wie der Uniform-Regler oben —
      // erst das Kettensymbol trennt die Ecken voneinander
      set({ borderRadius: v, cornerRadii: undefined })
      return
    }
    const next = [...radii] as [number, number, number, number]
    next[idx] = v
    set({ cornerRadii: next })
  }

  function toggleLink() {
    set(linked
      ? { cornerRadii: [s.borderRadius, s.borderRadius, s.borderRadius, s.borderRadius] }
      : { cornerRadii: undefined, borderRadius: radii[0] })
  }

  const cornerInputStyle = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', ...pos,
    width: 34, padding: '2px 3px', fontSize: 10.5, textAlign: 'center',
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text1)', outline: 'none', MozAppearance: 'textfield',
  })

  // Vorschau-Maße bewusst so gewählt, dass die halbe Höhe (36) über dem
  // Radius-Maximum (32) liegt — sonst rundet der Browser bei hohen Werten
  // stärker ab, als der Regler suggeriert (CSS begrenzt border-radius immer
  // auf höchstens die halbe Kantenlänge). Die Eckenfelder sitzen dadurch
  // automatisch mit Abstand außerhalb der Vorschau statt sie zu berühren.
  const PREVIEW_W = 120, PREVIEW_H = 72, MARGIN_X = 44, MARGIN_Y = 32

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px' }}>
      <div style={{ position: 'relative', width: PREVIEW_W + MARGIN_X * 2, height: PREVIEW_H + MARGIN_Y * 2 }}>
        {/* Vorschau-Kachel — spiegelt die vier Radien live und maßstabsgetreu wider */}
        <div style={{
          position: 'absolute', top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN_X, right: MARGIN_X,
          background: 'var(--surface3)', border: '1.5px solid var(--border)',
          borderTopLeftRadius: radii[0], borderTopRightRadius: radii[1],
          borderBottomRightRadius: radii[2], borderBottomLeftRadius: radii[3],
        }} />

        <button
          onClick={toggleLink}
          title={linked ? t('Adjust each corner individually') : t('Use one radius for all corners')}
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 22, height: 22, borderRadius: 6, zIndex: 1,
            border: `1px solid ${linked ? 'var(--accent)' : 'var(--border)'}`,
            background: linked ? 'color-mix(in srgb, var(--accent) 18%, var(--surface))' : 'var(--surface2)',
            color: linked ? 'var(--accent)' : 'var(--text3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          {linked ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 17H7A5 5 0 0 1 7 7h1"/><path d="M16 7h1a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="16" y2="12"/>
            </svg>
          )}
        </button>

        <input type="number" min={0} max={32} value={radii[0]}
          onChange={e => updateCorner(0, parseFloat(e.target.value))}
          title={t('Top left')} style={cornerInputStyle({ top: 0, left: 0 })} />
        <input type="number" min={0} max={32} value={radii[1]}
          onChange={e => updateCorner(1, parseFloat(e.target.value))}
          title={t('Top right')} style={cornerInputStyle({ top: 0, right: 0 })} />
        <input type="number" min={0} max={32} value={radii[3]}
          onChange={e => updateCorner(3, parseFloat(e.target.value))}
          title={t('Bottom left')} style={cornerInputStyle({ bottom: 0, left: 0 })} />
        <input type="number" min={0} max={32} value={radii[2]}
          onChange={e => updateCorner(2, parseFloat(e.target.value))}
          title={t('Bottom right')} style={cornerInputStyle({ bottom: 0, right: 0 })} />
      </div>
    </div>
  )
}


const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 50,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent)' : 'var(--surface2)',
  color: active ? 'white' : 'var(--text2)',
  cursor: 'pointer', transition: 'all 0.12s',
})
