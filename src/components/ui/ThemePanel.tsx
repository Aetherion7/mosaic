'use client'
import { useRef, useState } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { DEFAULT_BG } from '@/lib/defaults'
import { THEMES, LIGHT_THEME_IDS, resolveCustomTheme } from '@/lib/themes'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { GradientDir, PatternType } from '@/types'

const desktopMotion = {
  initial:    { opacity: 0, y: -10, scale: 0.97 },
  animate:    { opacity: 1, y: 0,   scale: 1    },
  exit:       { opacity: 0, y: -10, scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
}

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

export default function ThemePanel() {
  const t = useT()
  const applyTheme = useBoardStore(s => s.applyTheme)
  const setBackground = useBoardStore(s => s.setBackground)
  const panel = useUIStore(s => s.panel)
  const openPanel = useUIStore(s => s.openPanel)
  const bg         = useBoardStore(s => selectBoard(s)?.bg ?? DEFAULT_BG)
  const themeId    = useBoardStore(s => selectBoard(s)?.themeId ?? 'dark')
  const fileRef   = useRef<HTMLInputElement>(null)
  const customThemes = useSettings(s => s.customThemes)
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null)

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setBackground({ type: 'image', imageUrl: ev.target?.result as string, imageName: file.name })
    reader.readAsDataURL(file)
  }

  const panelBg = 'color-mix(in srgb, var(--surface) 75%, var(--bg))'
  const panelStyle: React.CSSProperties = {
    position: 'fixed', top: 60, right: 16, zIndex: 900,
    width: 320,
    background: panelBg,
    backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
    border: '1px solid var(--border)',
    borderRadius: 20, padding: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,0.04)',
    maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
  }

  return (
    <AnimatePresence>
      {panel === 'theme' && (
        <motion.div
          {...desktopMotion}
          onClick={e => e.stopPropagation()}
          style={panelStyle}
        >
          <PanelHeader title={t('Theme & background')} onClose={() => openPanel(null)} />

          {/* ── Theme grid ── */}
          <div style={{ marginBottom: 16 }}>
            <ThemeGroup
              label={t('Dark')}
              icon={<IconMoon />}
              themes={THEMES.filter(t => !LIGHT_THEME_IDS.includes(t.id))}
              themeId={themeId}
              hoveredTheme={hoveredTheme}
              setHoveredTheme={setHoveredTheme}
              applyTheme={applyTheme}
            />
            <div style={{ height: 12 }} />
            <ThemeGroup
              label={t('Light')}
              icon={<IconSun />}
              themes={THEMES.filter(t => LIGHT_THEME_IDS.includes(t.id))}
              themeId={themeId}
              hoveredTheme={hoveredTheme}
              setHoveredTheme={setHoveredTheme}
              applyTheme={applyTheme}
            />
            {customThemes.length > 0 && (
              <>
                <div style={{ height: 12 }} />
                <ThemeGroup
                  label={t('Custom')}
                  icon={<IconPen />}
                  themes={customThemes.map(resolveCustomTheme)}
                  themeId={themeId}
                  hoveredTheme={hoveredTheme}
                  setHoveredTheme={setHoveredTheme}
                  applyTheme={applyTheme}
                />
              </>
            )}
          </div>

          <Divider />

          {/* ── Background type ── */}
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>{t('Background')}</SectionLabel>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['color', 'gradient', 'image'] as const).map(bt => (
                <button key={bt} onClick={() => setBackground({ type: bt })} style={tabBtn(bg.type === bt)}>
                  <BgTypeIcon type={bt} />
                  {{ color: t('Color'), gradient: t('Gradient'), image: t('Image') }[bt]}
                </button>
              ))}
            </div>

            {bg.type === 'color' && (
              <Row label={t('Color')}>
                <ColorSwatch value={bg.color} onChange={v => setBackground({ color: v })} />
              </Row>
            )}

            {bg.type === 'gradient' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label={t('From / To')}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <ColorSwatch value={bg.gradient[0]} onChange={v => setBackground({ gradient: [v, bg.gradient[1]] })} />
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>→</span>
                    <ColorSwatch value={bg.gradient[1]} onChange={v => setBackground({ gradient: [bg.gradient[0], v] })} />
                  </div>
                </Row>
                <Row label={t('Direction')}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {DIR_OPTIONS.map(d => (
                      <button key={d.value} onClick={() => setBackground({ gradientDir: d.value })} style={{
                        width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)',
                        background: bg.gradientDir === d.value ? 'var(--accent)' : 'var(--surface2)',
                        color: bg.gradientDir === d.value ? 'white' : 'var(--text2)',
                        fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{d.label}</button>
                    ))}
                  </div>
                </Row>
              </div>
            )}

            {bg.type === 'image' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '9px 12px', fontSize: 11, borderRadius: 10,
                    border: '1.5px dashed var(--text3)',
                    background: 'var(--surface2)', color: bg.imageName ? 'var(--text1)' : 'var(--text3)',
                    cursor: 'pointer', transition: 'border-color 0.12s, color 0.12s',
                    display: 'flex', alignItems: 'center', gap: 7,
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text1)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--text3)'; e.currentTarget.style.color = bg.imageName ? 'var(--text1)' : 'var(--text3)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                    {bg.imageName ?? t('Upload image')}
                  </span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                {bg.imageUrl && (
                  <>
                    <SliderRow label={t('Brightness')} min={0.2} max={1.5} step={0.05}
                      value={bg.imageBrightness} onChange={v => setBackground({ imageBrightness: v })}
                      display={`${Math.round(bg.imageBrightness * 100)}%`} />
                    <SliderRow label={t('Blur')} min={0} max={20} step={1}
                      value={bg.imageBlur} onChange={v => setBackground({ imageBlur: v })}
                      display={`${bg.imageBlur}px`} />
                  </>
                )}
              </div>
            )}
          </div>

          <Divider />

          {/* ── Board pattern ── */}
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>{t('Grid pattern')}</SectionLabel>
            <BoardPatternSection />
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Board pattern ────────────────────────────────────────────────────────────

function BoardPatternSection() {
  const t = useT()
  const setBackground = useBoardStore(s => s.setBackground)
  const bg = useBoardStore(s => selectBoard(s)?.bg)
  if (!bg) return null

  const patterns: { id: PatternType; label: string; preview: React.ReactNode }[] = [
    {
      id: 'dots', label: t('Dots'),
      preview: (
        <div style={{ width: '100%', height: '100%', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
      ),
    },
    {
      id: 'grid', label: t('Grid'),
      preview: (
        <div style={{ width: '100%', height: '100%', backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
      ),
    },
    {
      id: 'none', label: t('None'),
      preview: <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 16, opacity: 0.3 }}>—</span></div>,
    },
  ]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {patterns.map(p => (
          <button
            key={p.id}
            onClick={() => setBackground({ pattern: p.id })}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '8px 6px 10px',
              borderRadius: 10, border: `2px solid ${bg.pattern === p.id ? 'var(--accent)' : 'var(--border)'}`,
              background: bg.pattern === p.id ? 'color-mix(in srgb, var(--accent) 8%, var(--surface2))' : 'var(--surface2)',
              cursor: 'pointer', transition: 'all 0.14s',
            }}
          >
            <div style={{ width: '100%', height: 38, borderRadius: 6, background: '#1a1a2e', overflow: 'hidden', border: '1px solid var(--border)' }}>
              {p.preview}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: bg.pattern === p.id ? 'var(--accent)' : 'var(--text2)' }}>{p.label}</span>
          </button>
        ))}
      </div>

      {(bg.pattern === 'dots' || bg.pattern === 'grid') && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row label={t('Color')}>
            <ColorSwatch value={bg.patternColor} onChange={v => setBackground({ patternColor: v })} />
          </Row>
          <SliderRow label={t('Strength')} min={0.01} max={0.3} step={0.01}
            value={bg.patternOpacity} onChange={v => setBackground({ patternOpacity: v })}
            display={`${Math.round(bg.patternOpacity * 100)}%`} />
        </div>
      )}
    </>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ThemeGroup({ label, icon, themes, themeId, hoveredTheme, setHoveredTheme, applyTheme }: {
  label: string
  icon: React.ReactNode
  themes: { id: string; name: string; cssVars: Record<string, string> }[]
  themeId: string
  hoveredTheme: string | null
  setHoveredTheme: (id: string | null) => void
  applyTheme: (id: string) => void
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8,
        fontSize: 10, fontWeight: 700, color: 'var(--text3)',
        letterSpacing: '0.07em', textTransform: 'uppercase',
      }}>
        {icon}
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {themes.map(t => {
          const isActive = themeId === t.id
          const isHov    = hoveredTheme === t.id
          const bgColor  = t.cssVars['--bg']      ?? '#0d0d14'
          const accent   = t.cssVars['--accent']  ?? '#8b74f0'
          const accent2  = t.cssVars['--accent2'] ?? '#5eead4'
          const surface  = t.cssVars['--surface'] ?? '#16192b'
          const text1    = t.cssVars['--text1']   ?? '#ffffff'
          return (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              onMouseEnter={() => setHoveredTheme(t.id)}
              onMouseLeave={() => setHoveredTheme(null)}
              style={{
                padding: '10px 8px 8px', borderRadius: 12,
                border: `2px solid ${isActive ? accent : isHov ? accent + '66' : 'rgba(128,128,128,0.2)'}`,
                background: bgColor,
                cursor: 'pointer',
                transition: 'border-color 0.15s, transform 0.15s',
                transform: isHov && !isActive ? 'scale(1.03)' : 'scale(1)',
                outline: 'none',
              }}
            >
              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 6 }}>
                {[surface, accent, accent2].map((c, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                ))}
              </div>
              <div style={{
                height: 3, borderRadius: 2, marginBottom: 6,
                background: `linear-gradient(to right, ${accent}, ${accent2})`,
              }} />
              <span style={{
                fontSize: 9, fontWeight: 700, display: 'block', textAlign: 'center',
                color: text1, opacity: 0.85, letterSpacing: '0.02em',
              }}>{t.name}</span>
              {isActive && (
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: accent, margin: '5px auto 0',
                }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
      <span style={valStyle}>{display}</span>
    </Row>
  )
}


function IconMoon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function IconSun() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  )
}

function IconPen() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>
      <path d="M15 5l4 4"/>
    </svg>
  )
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 50,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent)' : 'var(--surface2)',
  color: active ? 'white' : 'var(--text2)',
  cursor: 'pointer', transition: 'all 0.12s',
})

// Icon je Hintergrund-Art: Farbpalette, Verlaufs-Rechteck, Bild
function BgTypeIcon({ type }: { type: 'color' | 'gradient' | 'image' }) {
  const common = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (type === 'color') {
    return (
      <svg {...common}>
        <circle cx="13.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
        <circle cx="17.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
        <circle cx="8.5" cy="7.5" r="1" fill="currentColor" stroke="none"/>
        <circle cx="6.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.68-.75 1.68-1.68 0-.44-.17-.83-.44-1.13-.27-.29-.43-.68-.43-1.11 0-.93.75-1.68 1.68-1.68H16c3.31 0 6-2.69 6-6 0-4.97-4.5-8.4-10-8.4z"/>
      </svg>
    )
  }
  if (type === 'gradient') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="4"/>
        <path d="M4.5 19.5L19.5 4.5"/>
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  )
}

const valStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--text3)', minWidth: 32, textAlign: 'right',
}
