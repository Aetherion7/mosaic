'use client'
import { useRef, useState } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { DEFAULT_BG } from '@/lib/defaults'
import { THEMES, LIGHT_THEME_IDS, resolveCustomTheme, findTheme } from '@/lib/themes'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import SlidingTabs from '@/components/ui/SlidingTabs'
import ThemeEditorModal from '@/components/ui/settings/ThemeEditorModal'
import type { BoardBg, GradientDir, PatternType } from '@/types'

// Theme & Hintergrund — aufgebaut in drei Schritten statt einer langen Liste:
//   1. Live-Vorschau oben (Mini-Board mit aktuellem Hintergrund, Muster und
//      zwei Widgets im aktiven Theme) — jede Änderung ist sofort sichtbar.
//   2. Reiter "Theme" | "Hintergrund" | "Muster" — immer nur eine Aufgabe.
//   3. Im Theme-Reiter: Dunkel/Hell/Eigene als Umschalter, Themes als kleine
//      Fenster-Vorschauen, darunter "Eigenes Theme erstellen".

const desktopMotion = {
  initial:    { opacity: 0, y: -10, scale: 0.97 },
  animate:    { opacity: 1, y: 0,   scale: 1    },
  exit:       { opacity: 0, y: -10, scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
}

const DIR_DEG: Record<GradientDir, number> = {
  'to-t': 0, 'to-tr': 45, 'to-r': 90, 'to-br': 135, 'to-b': 180, 'to-bl': 225, 'to-l': 270, 'to-tl': 315,
}
// 3×3-Richtungsfeld: Pfeile außen, Verlaufsvorschau in der Mitte
const DIR_PAD: (GradientDir | null)[] = ['to-tl', 'to-t', 'to-tr', 'to-l', null, 'to-r', 'to-bl', 'to-b', 'to-br']

type Tab = 'theme' | 'background' | 'pattern'
type Group = 'dark' | 'light' | 'custom'

function bgCss(bg: BoardBg): React.CSSProperties {
  if (bg.type === 'gradient') return { background: `linear-gradient(${DIR_DEG[bg.gradientDir] ?? 135}deg, ${bg.gradient[0]}, ${bg.gradient[1]})` }
  if (bg.type === 'image' && bg.imageUrl) return { backgroundImage: `url(${bg.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  return { background: bg.color }
}

function patternCss(bg: BoardBg, scale = 1): React.CSSProperties {
  const c = `color-mix(in srgb, ${bg.patternColor} ${Math.round(bg.patternOpacity * 100 * 1.4)}%, transparent)`
  if (bg.pattern === 'dots') return { backgroundImage: `radial-gradient(circle, ${c} 1px, transparent 1px)`, backgroundSize: `${10 * scale}px ${10 * scale}px` }
  if (bg.pattern === 'grid') return { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: `${12 * scale}px ${12 * scale}px` }
  return {}
}

export default function ThemePanel() {
  const t = useT()
  const panel = useUIStore(s => s.panel)
  const openPanel = useUIStore(s => s.openPanel)
  const themeId = useBoardStore(s => selectBoard(s)?.themeId ?? 'ocean')
  const [tab, setTab] = useState<Tab>('theme')

  const panelStyle: React.CSSProperties = {
    position: 'fixed', top: 60, right: 16, zIndex: 900,
    width: 340,
    background: 'var(--popover-bg)',
    backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
    border: '1px solid var(--border)',
    borderRadius: 22, padding: 12,
    boxShadow: '0 24px 64px color-mix(in srgb, var(--shadow-color, #000) 55%, transparent)',
    maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 12,
  }

  return (
    <AnimatePresence>
      {panel === 'theme' && (
        <motion.div {...desktopMotion} onClick={e => e.stopPropagation()} style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px 0 6px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text1)' }}>{t('Theme & background')}</span>
            <button onClick={() => openPanel(null)} aria-label={t('Close')} style={roundBtn}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
            </button>
          </div>

          <LivePreview themeName={findTheme(themeId)?.name ?? ''} />

          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: 3 }}>
            <SlidingTabs<Tab>
              value={tab} onChange={setTab} slotH={28} fontSize={11.5}
              options={[
                { value: 'theme',      label: t('Theme') },
                { value: 'background', label: t('Background') },
                { value: 'pattern',    label: t('Pattern') },
              ]}
            />
          </div>

          <div style={{ padding: '0 2px' }}>
            {tab === 'theme' && <ThemeTab themeId={themeId} />}
            {tab === 'background' && <BackgroundTab themeId={themeId} />}
            {tab === 'pattern' && <PatternTab />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Live-Vorschau ─────────────────────────────────────────────────────────────
// Nutzt die CSS-Variablen des aktiven Themes direkt — zeigt also exakt das, was
// das Board gerade zeigt, nur verkleinert.
function LivePreview({ themeName }: { themeName: string }) {
  const bg = useBoardStore(s => selectBoard(s)?.bg ?? DEFAULT_BG)
  const tile = (w: string, h: number, accentBar: boolean) => (
    <div style={{
      width: w, height: h, borderRadius: 10, background: 'var(--surface)',
      border: '1px solid var(--border)', padding: 5, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ width: 34, height: 8, borderRadius: 999, background: 'var(--surface2)', border: '1px solid var(--border)' }} />
      <div style={{ height: 4, width: '70%', borderRadius: 2, background: 'var(--text3)', opacity: 0.5 }} />
      <div style={{ height: 4, width: '45%', borderRadius: 2, background: 'var(--text3)', opacity: 0.35 }} />
      {accentBar && <div style={{ marginTop: 'auto', height: 6, borderRadius: 999, background: 'linear-gradient(90deg, var(--accent), var(--accent2))' }} />}
    </div>
  )
  return (
    <div style={{ position: 'relative', height: 132, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{
        position: 'absolute', inset: bg.type === 'image' ? -10 : 0, ...bgCss(bg),
        filter: bg.type === 'image' ? `brightness(${bg.imageBrightness}) blur(${bg.imageBlur / 3}px)` : undefined,
      }} />
      <div style={{ position: 'absolute', inset: 0, ...patternCss(bg, 0.8) }} />
      {/* Mini-TopBar als Inseln */}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ height: 14, width: 64, borderRadius: 999, background: 'var(--popover-bg)', border: '1px solid var(--border)' }} />
        <div style={{ height: 14, width: 40, borderRadius: 999, background: 'var(--popover-bg)', border: '1px solid var(--border)' }} />
      </div>
      <div style={{ position: 'absolute', left: 10, right: 10, top: 30, bottom: 10, display: 'flex', gap: 8 }}>
        {tile('58%', 92, true)}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tile('100%', 42, false)}
          {tile('100%', 42, false)}
        </div>
      </div>
      <span style={{
        position: 'absolute', right: 10, bottom: 10, padding: '2px 8px', borderRadius: 999,
        fontSize: 10, fontWeight: 600, color: 'var(--text1)',
        background: 'var(--popover-bg)', border: '1px solid var(--border)',
      }}>{themeName}</span>
    </div>
  )
}

// ── Reiter: Theme ─────────────────────────────────────────────────────────────
function ThemeTab({ themeId }: { themeId: string }) {
  const t = useT()
  const applyTheme = useBoardStore(s => s.applyTheme)
  const customThemes = useSettings(s => s.customThemes)
  const [editorOpen, setEditorOpen] = useState(false)
  const isCustom = customThemes.some(c => c.id === themeId)
  const [group, setGroup] = useState<Group>(isCustom ? 'custom' : LIGHT_THEME_IDS.includes(themeId) ? 'light' : 'dark')

  const list = group === 'custom'
    ? customThemes.map(resolveCustomTheme)
    : THEMES.filter(th => (group === 'light') === LIGHT_THEME_IDS.includes(th.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SlidingTabs<Group>
        value={group} onChange={setGroup} slotH={26} fontSize={11} soft
        options={[
          { value: 'dark',   label: t('Dark') },
          { value: 'light',  label: t('Light') },
          { value: 'custom', label: `${t('Custom')}${customThemes.length ? ` · ${customThemes.length}` : ''}` },
        ]}
      />
      {list.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {list.map(th => <ThemeCard key={th.id} theme={th} active={th.id === themeId} onPick={() => applyTheme(th.id)} />)}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--text3)', textAlign: 'center', padding: '14px 8px', lineHeight: 1.5 }}>
          {t('No custom themes yet.')}
        </div>
      )}
      <button onClick={() => setEditorOpen(true)} style={{
        height: 32, borderRadius: 999, border: '1px dashed var(--border)', background: 'transparent',
        color: 'var(--text2)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        {t('Create your own theme')}
      </button>
      {editorOpen && <ThemeEditorModal onClose={() => setEditorOpen(false)} />}
    </div>
  )
}

// Theme als kleines Fenster: eigener Hintergrund, Insel-Leiste, zwei Kacheln
function ThemeCard({ theme, active, onPick }: {
  theme: { id: string; name: string; cssVars: Record<string, string> }; active: boolean; onPick: () => void
}) {
  const v = (k: string, f: string) => theme.cssVars[k] ?? f
  const bg = v('--bg', '#0d0d14'), surface = v('--surface', '#16192b'), border = v('--border', '#2a2a3a')
  const accent = v('--accent', '#8b74f0'), accent2 = v('--accent2', '#5eead4')
  return (
    <button onClick={onPick} title={theme.name} style={{
      padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{
        position: 'relative', height: 58, borderRadius: 12, background: bg, overflow: 'hidden',
        boxShadow: active ? `0 0 0 2px ${accent}` : `inset 0 0 0 1px ${border}`,
        transition: 'box-shadow 0.15s',
      }}>
        <div style={{ position: 'absolute', top: 5, left: 5, width: 22, height: 6, borderRadius: 999, background: surface, border: `1px solid ${border}` }} />
        <div style={{ position: 'absolute', top: 15, left: 5, right: '46%', bottom: 5, borderRadius: 5, background: surface, border: `1px solid ${border}` }}>
          <div style={{ position: 'absolute', left: 4, right: 4, bottom: 4, height: 4, borderRadius: 999, background: `linear-gradient(90deg, ${accent}, ${accent2})` }} />
        </div>
        <div style={{ position: 'absolute', top: 15, left: '58%', right: 5, bottom: 5, borderRadius: 5, background: surface, border: `1px solid ${border}` }}>
          <div style={{ position: 'absolute', left: 4, top: 4, width: 8, height: 8, borderRadius: '50%', background: accent }} />
        </div>
        {active && (
          <span style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={bg} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12 10 17 19 7"/></svg>
          </span>
        )}
      </div>
      <span style={{
        fontSize: 10.5, fontWeight: active ? 650 : 500, paddingLeft: 2,
        color: active ? 'var(--text1)' : 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{theme.name}</span>
    </button>
  )
}

// ── Reiter: Hintergrund ───────────────────────────────────────────────────────
function BackgroundTab({ themeId }: { themeId: string }) {
  const t = useT()
  const setBackground = useBoardStore(s => s.setBackground)
  const bg = useBoardStore(s => selectBoard(s)?.bg ?? DEFAULT_BG)
  const fileRef = useRef<HTMLInputElement>(null)
  const themeBg = findTheme(themeId)?.bg

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setBackground({ type: 'image', imageUrl: ev.target?.result as string, imageName: file.name })
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {(['color', 'gradient', 'image'] as const).map(bt => {
          const on = bg.type === bt
          const sample: React.CSSProperties = bt === 'color' ? { background: bg.color }
            : bt === 'gradient' ? { background: `linear-gradient(${DIR_DEG[bg.gradientDir] ?? 135}deg, ${bg.gradient[0]}, ${bg.gradient[1]})` }
            : bg.imageUrl ? { backgroundImage: `url(${bg.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: 'var(--surface2)' }
          return (
            <button key={bt} onClick={() => setBackground({ type: bt })} style={{
              padding: 4, borderRadius: 14, cursor: 'pointer', textAlign: 'left',
              border: 'none', background: on ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface2)',
              boxShadow: on ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--border)',
              display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <div style={{ height: 34, borderRadius: 10, ...sample, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                {bt === 'image' && !bg.imageUrl && <BgTypeIcon type="image" />}
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '0 4px 2px', color: on ? 'var(--accent)' : 'var(--text2)' }}>
                <BgTypeIcon type={bt} />{{ color: t('Color'), gradient: t('Gradient'), image: t('Image') }[bt]}
              </span>
            </button>
          )
        })}
      </div>

      {bg.type === 'color' && (
        <Row label={t('Color')}><ColorSwatch value={bg.color} onChange={v => setBackground({ color: v })} /></Row>
      )}

      {bg.type === 'gradient' && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 26px)', gridTemplateRows: 'repeat(3, 26px)', gap: 3, flexShrink: 0 }}>
            {DIR_PAD.map((d, i) => d === null ? (
              <div key={i} style={{ borderRadius: 8, background: `linear-gradient(${DIR_DEG[bg.gradientDir] ?? 135}deg, ${bg.gradient[0]}, ${bg.gradient[1]})`, border: '1px solid var(--border)' }} />
            ) : (
              <button key={i} onClick={() => setBackground({ gradientDir: d })} title={t('Direction')} style={{
                borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0,
                background: bg.gradientDir === d ? 'var(--accent)' : 'var(--surface2)',
                color: bg.gradientDir === d ? 'var(--on-accent, white)' : 'var(--text3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${DIR_DEG[d]}deg)` }}>
                  <path d="M12 19V5M6 11l6-6 6 6"/>
                </svg>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <Row label={t('From')} narrow><ColorSwatch value={bg.gradient[0]} onChange={v => setBackground({ gradient: [v, bg.gradient[1]] })} /></Row>
            <Row label={t('To')} narrow><ColorSwatch value={bg.gradient[1]} onChange={v => setBackground({ gradient: [bg.gradient[0], v] })} /></Row>
          </div>
        </div>
      )}

      {bg.type === 'image' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => fileRef.current?.click()} style={{
            height: 34, padding: '0 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 999,
            border: '1px dashed var(--border)', background: 'var(--surface2)', color: 'var(--text2)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden',
          }}>
            <BgTypeIcon type="image" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {bg.imageName ?? t('Upload image')}
            </span>
            {bg.imageName && <span style={{ color: 'var(--accent)' }}>{t('Change')}</span>}
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

      {themeBg && (
        <button onClick={() => setBackground({ ...themeBg })} style={{
          alignSelf: 'flex-start', height: 28, padding: '0 12px', borderRadius: 999,
          border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)',
          fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          {t('Reset to theme background')}
        </button>
      )}
    </div>
  )
}

// ── Reiter: Muster ────────────────────────────────────────────────────────────
function PatternTab() {
  const t = useT()
  const setBackground = useBoardStore(s => s.setBackground)
  const bg = useBoardStore(s => selectBoard(s)?.bg ?? DEFAULT_BG)
  const patterns: { id: PatternType; label: string }[] = [
    { id: 'dots', label: t('Dots') }, { id: 'grid', label: t('Grid') }, { id: 'none', label: t('None') },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {patterns.map(p => {
          const on = bg.pattern === p.id
          return (
            <button key={p.id} onClick={() => setBackground({ pattern: p.id })} style={{
              padding: 4, borderRadius: 14, cursor: 'pointer', border: 'none',
              background: on ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface2)',
              boxShadow: on ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--border)',
              display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <div style={{ position: 'relative', height: 40, borderRadius: 10, overflow: 'hidden', ...bgCss(bg) }}>
                <div style={{ position: 'absolute', inset: 0, ...patternCss({ ...bg, pattern: p.id, patternOpacity: Math.max(bg.patternOpacity, 0.12) }) }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--accent)' : 'var(--text2)', paddingBottom: 2 }}>{p.label}</span>
            </button>
          )
        })}
      </div>
      {(bg.pattern === 'dots' || bg.pattern === 'grid') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row label={t('Color')}><ColorSwatch value={bg.patternColor} onChange={v => setBackground({ patternColor: v })} /></Row>
          <SliderRow label={t('Strength')} min={0.01} max={0.3} step={0.01}
            value={bg.patternOpacity} onChange={v => setBackground({ patternOpacity: v })}
            display={`${Math.round(bg.patternOpacity * 100)}%`} />
        </div>
      )}
    </div>
  )
}

// ── Kleinteile ────────────────────────────────────────────────────────────────
const roundBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 999, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function Row({ label, children, narrow }: { label: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11.5, color: 'var(--text2)', minWidth: narrow ? 34 : 80, flexShrink: 0 }}>{label}</span>
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
