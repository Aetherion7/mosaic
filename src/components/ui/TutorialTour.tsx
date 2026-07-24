'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { useBoardStore } from '@/store/boardStore'
import { useT } from '@/hooks/useT'
import { TILES } from '@/components/board/TilePicker'

// ── Schritt-Icons (App-Stil: Stroke-SVGs, keine Emojis) ───────────────────────

function StepIcon({ d, extra }: { d: string; extra?: React.ReactNode }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />{extra}
    </svg>
  )
}

// Schritt 2: Mini-Nachbildung des Modus-Umschalters aus der TopBar — der
// Akzent-Kreis wandert animiert zwischen Stift (Bearbeiten) und Auge (Ansicht)
function MiniModeToggle() {
  const animations = useSettings(s => s.animations)
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (!animations) { setActive(0); return }
    const id = setInterval(() => setActive(a => 1 - a), 1500)
    return () => clearInterval(id)
  }, [animations])
  const icons = [
    <svg key="pencil" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>,
    <svg key="eye" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>,
  ]
  return (
    <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 999, padding: 3, border: '1px solid var(--border)', position: 'relative', flexShrink: 0 }}>
      <motion.div
        animate={{ x: active * 28 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{ position: 'absolute', top: 3, left: 3, width: 28, height: 28, borderRadius: 999, background: 'var(--accent)' }}
      />
      {icons.map((icon, i) => (
        <div key={i} style={{
          width: 28, height: 28, borderRadius: 999, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: active === i ? 'white' : 'var(--text3)', transition: 'color 0.25s',
        }}>
          {icon}
        </div>
      ))}
    </div>
  )
}

const ICONS = {
  // eslint-disable-next-line @next/next/no-img-element
  welcome:  <img src="/mosaiclogo.png" alt="mosaic" width={44} height={44} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />,
  add:      <StepIcon d="M12 5v14M5 12h14" />,
  task:     <StepIcon d="M9 11l3 3 8-8" extra={<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>} />,
  // 1:1 das Regler-Symbol des Widget-Stil-Buttons (IconSliders, ui/Icons.tsx)
  sliders: (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <line x1="2" y1="5" x2="14" y2="5"/>
      <line x1="2" y1="11" x2="14" y2="11"/>
      <circle cx="6" cy="5" r="2.2" fill="var(--surface2)"/>
      <circle cx="10" cy="11" r="2.2" fill="var(--surface2)"/>
    </svg>
  ),
  stats:    <StepIcon d="M3 21h18" extra={<><rect x="5" y="12" width="3" height="6" rx="1"/><rect x="10.5" y="8" width="3" height="10" rx="1"/><rect x="16" y="4" width="3" height="14" rx="1"/></>} />,
  board:    <StepIcon d="M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7v3h-7z" />,
  ai:       <StepIcon d="M12 3l1.8 4.9L19 9.5l-5.2 1.6L12 16l-1.8-4.9L5 9.5l5.2-1.6L12 3z" extra={<path d="M19 15l.9 2.4L22 18l-2.1.6L19 21l-.9-2.4L16 18l2.1-.6L19 15z"/>} />,
  theme:    <StepIcon d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" extra={<path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>} />,
  search:   <StepIcon d="M21 21l-4.35-4.35" extra={<circle cx="11" cy="11" r="8"/>} />,
  settings: <StepIcon d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" extra={<circle cx="12" cy="12" r="3"/>} />,
  done:     <StepIcon d="M8 12l3 3 5.5-6" extra={<circle cx="12" cy="12" r="10"/>} />,
}

// ── Schritte ──────────────────────────────────────────────────────────────────

// waitFor macht einen Schritt interaktiv: Die Tour wartet, bis der Nutzer die
// Aktion in der echten UI ausgeführt hat, und springt dann selbst weiter.
// 'task-widget' als target wird zur Laufzeit auf das in der Tour angelegte
// Aufgaben-Widget aufgelöst.
type WaitFor = 'addTask' | 'openStyle' | 'showStats'

interface Step {
  target?:  string | 'task-widget'  // CSS-Selektor; ohne target: zentrierte Karte
  waitFor?: WaitFor
  icon:     React.ReactNode
  rawIcon?: boolean         // Icon ohne runde Akzent-Kachel rendern (z. B. Modus-Pille)
  dim?:     boolean         // interaktiver Schritt MIT Abdunkelung + Klick-Sperre außerhalb des Visiers
  title:    string
  text:     string
  kbd?:     string          // Tastatur-Hinweis-Pill
  mode?:    'edit' | 'view' // Modus, den dieser Schritt setzt
}

// title/text/kbd sind englische Quelltexte (Default-Sprache) — im Component mit t() übersetzt
const STEPS: Step[] = [
  {
    icon:  ICONS.welcome,
    title: 'Welcome to mosaic',
    text:  'Your personal dashboard — 100% local in your browser, no account needed. This short tour covers everything important in a minute.',
  },
  {
    target:  '#tour-mode-toggle',
    mode:    'edit',
    icon:    <MiniModeToggle />,
    rawIcon: true,
    title:   'Two modes',
    text:    'In edit mode (pencil) you design your board, in view mode (eye) you use it day to day. We’re in edit mode right now.',
    kbd:     'E',
  },
  {
    target:  '#add-widget-btn',
    mode:    'edit',
    waitFor: 'addTask',
    dim:     true,
    icon:    ICONS.task,
    title:   'Try it: add a task widget',
    text:    'Open the catalog of {n} widgets with the + button and pick “Task” — the tour continues by itself.',
    kbd:     'A',
  },
  {
    target:  'task-widget',
    mode:    'edit',
    waitFor: 'openStyle',
    icon:    ICONS.sliders,
    title:   'Style your widget',
    text:    'Select the new task widget and click the sliders icon in its toolbar: it opens the style panel — background, border, shadow and more, per widget.',
  },
  {
    target:  'task-widget',
    mode:    'edit',
    waitFor: 'showStats',
    icon:    ICONS.stats,
    title:   'Show the statistics',
    text:    'Click “Statistik” at the bottom edge of the task widget to expand the weekly chart. Whether this section exists at all can be toggled per widget type under Settings → Widgets.',
  },
  {
    icon:  ICONS.board,
    title: 'Your board',
    text:  'Drag widgets by their header to place them, and resize using the handles on the edges. Pan the canvas with Space + drag, zoom with Ctrl + scroll wheel.',
    kbd:   'Space · Ctrl+Wheel',
  },
  {
    target: '#tour-ai',
    icon:   ICONS.ai,
    title:  'Your AI assistant',
    text:   'Connect your own API key and the assistant builds and manages the board with you — every widget also gets its own mini chat. No AI wanted? Disable it completely under Settings → AI assistant.',
    kbd:    'I',
  },
  {
    target: '#tour-theme',
    icon:   ICONS.theme,
    title:  'Your look',
    text:   'Choose from 18 themes — from Deep Space to Pastel. Every widget can also be styled individually: color, border, transparency, glow.',
    kbd:    'T',
  },
  {
    target: '#tour-search',
    icon:   ICONS.search,
    title:  'Find anything',
    text:   'Search finds any widget on your current board and jumps straight to it.',
    kbd:    'Ctrl+K',
  },
  {
    target: '#tour-settings',
    icon:   ICONS.settings,
    title:  'Settings',
    text:   'This is where you tailor mosaic to yourself: header style and appearance, enable or hide widgets, add custom themes, look up every shortcut — and restart this tour anytime.',
    kbd:    'S',
  },
  {
    icon:  ICONS.done,
    title: 'All set!',
    text:  'Jump right in and make the board yours. Good starting points: tasks, water, or the agenda — they make your board useful right away.',
  },
]

// ── Abschluss-Bildschirm: Spenden-Hinweis nach der letzten Tour-Karte ────────
// Bewusst getrennt von den STEPS (kein regulärer Tour-Schritt mit Zielvisier),
// damit er nur einmal am natürlichen Ende erscheint — "Skip" während der Tour
// überspringt ihn, dafür beendet er selbst über denselben finish()-Callback.

// glow: schwache Marken-Tönung im Hintergrund je Karte — macht die drei
// Support-Optionen selbst zum auffälligsten, "anklickbarsten" Element im
// Fenster, während der Schließen-Button bewusst zurücktritt (s. unten).
function DonateCard({ href, icon, label, sub, glow }: { href: string; icon: React.ReactNode; label?: string; sub: string; glow: string }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        gap: 6, padding: '16px 10px', borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${glow} 35%, var(--border))`,
        background: `color-mix(in srgb, ${glow} 10%, var(--surface2))`,
        textDecoration: 'none', transition: 'background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s',
        boxShadow: `0 2px 10px color-mix(in srgb, ${glow} 12%, transparent)`,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.background = `color-mix(in srgb, ${glow} 20%, var(--surface2))`
        el.style.borderColor = `color-mix(in srgb, ${glow} 60%, var(--border))`
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = `0 8px 20px color-mix(in srgb, ${glow} 25%, transparent)`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.background = `color-mix(in srgb, ${glow} 10%, var(--surface2))`
        el.style.borderColor = `color-mix(in srgb, ${glow} 35%, var(--border))`
        el.style.transform = 'none'
        el.style.boxShadow = `0 2px 10px color-mix(in srgb, ${glow} 12%, transparent)`
      }}
    >
      <span style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {/* minHeight statt nur bedingtem Rendern: ein leeres {undefined} erzeugt
          keinen Textknoten, wodurch der Block in manchen Browsern auf 0px
          kollabiert — das ließ den Ko-fi-Text (keine label-Prop) höher sitzen
          als bei den anderen beiden Karten. */}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text1)', minHeight: 16 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sub}</div>
    </a>
  )
}

function DonateOverlay({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <div role="dialog" aria-modal="true" aria-label={t('Support mosaic')}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,10,0.72)', backdropFilter: 'blur(1.5px)', WebkitBackdropFilter: 'blur(1.5px)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        style={{
          position: 'relative', width: 640, maxWidth: 'calc(100vw - 24px)',
          background: 'color-mix(in srgb, var(--surface) 45%, var(--bg))',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)', borderRadius: 20,
          padding: '26px 30px 24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent)',
        }}
      >
        {/* Links: Logo + Schriftzug (kompakt) — Trennstrich — rechts: Anliegen
            zweizeilig mit Herz-Icon. Als Gruppe zentriert statt über die volle
            Kartenbreite verteilt. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <div style={{ width: 58, height: 58, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mosaiclogo.png" alt="" width={58} height={58} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <span style={{ fontFamily: 'Guavine, serif', fontSize: 36, fontWeight: 400, color: 'var(--text1)' }}>mosaic</span>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="var(--accent)" style={{ flexShrink: 0 }}>
              <path d="M12 21s-7.5-4.6-10.2-9.3C.3 8.9 1.4 5.4 4.6 4.2c2.2-.8 4.4 0 5.7 1.8L12 8l1.7-2c1.3-1.8 3.5-2.6 5.7-1.8 3.2 1.2 4.3 4.7 2.8 7.5C19.5 16.4 12 21 12 21z"/>
            </svg>
            <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--text1)', lineHeight: 1.25 }}>
              {t('Asking for')}<br/>{t('your support')}
            </span>
          </div>
        </div>

        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.75, marginBottom: 20 }}>
          {t('mosaic is a solo project, built and maintained by one student in their free time. A donation would be genuinely appreciated — it helps keep this project, and future ones, alive and free for everyone.')}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <DonateCard
            href="https://ko-fi.com/mosaicboard"
            sub={t('One-time or monthly support')}
            glow="#ff6154"
            // eslint-disable-next-line @next/next/no-img-element
            icon={<img src="/badges/kofi.png" alt="Ko-fi" style={{ height: 34, width: 'auto', position: 'relative', top: 8 }} />}
          />
          <DonateCard
            href="https://github.com/sponsors/Aetherion7"
            label="GitHub Sponsors"
            sub={t('Sponsor development directly on GitHub')}
            glow="#db61a2"
            // github.png ist ein weißer Kreis mit transparent ausgeschnittenem
            // Octocat — braucht einen FEST dunklen Hintergrund (nicht vom
            // Theme abhängig), sonst verschwindet er auf hellen Themes.
            icon={
              <span style={{ background: '#0d1117', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/github.png" alt="GitHub" style={{ width: '78%', height: '78%' }} />
              </span>
            }
          />
          <DonateCard
            href="https://github.com/Aetherion7/mosaic"
            label={t('Star on GitHub')}
            sub={t('Costs nothing, helps a lot')}
            glow="#eac54f"
            // eslint-disable-next-line @next/next/no-img-element
            icon={<img src="/badges/github-star.webp" alt="" style={{ height: '100%', width: 'auto' }} />}
          />
        </div>

        {/* Bewusst als leiser Text-Button statt großem Accent-Button: die drei
            Support-Karten oben sollen die auffälligsten, "anklickbarsten"
            Elemente im Fenster bleiben — nicht das Wegklicken. */}
        <button onClick={onClose} style={{
          display: 'block', margin: '0 auto', fontSize: 12.5, fontWeight: 600,
          padding: '8px 16px', borderRadius: 8,
          border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer',
          transition: 'color 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text1)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)' }}
        >
          {t('Maybe later')}
        </button>
      </motion.div>
    </div>
  )
}

// ── Komponente ────────────────────────────────────────────────────────────────

const CARD_W = 460
const CARD_EST_H = 280
const PAD = 10   // Spot-Ausschnitt um das Ziel

export default function TutorialTour() {
  const t = useT()
  const hasSeenTutorial = useSettings(s => s.hasSeenTutorial)
  const setSetting      = useSettings(s => s.setSetting)

  const [visible, setVisible] = useState(false)
  const [idx,     setIdx]     = useState(0)
  const [rect,    setRect]    = useState<DOMRect | null>(null)
  const [spotRadius, setSpotRadius] = useState(14)
  // Das in Schritt 3 angelegte Aufgaben-Widget (Ziel der Folgeschritte)
  const [taskWidgetId, setTaskWidgetId] = useState<string | null>(null)
  const taskIdRef = useRef(taskWidgetId); taskIdRef.current = taskWidgetId
  // Spenden-Hinweis nach der letzten Schritt-Karte — kein eigener STEPS-Eintrag,
  // da er kein Zielvisier hat und nur beim natürlichen Tour-Ende erscheinen soll
  const [showDonate, setShowDonate] = useState(false)

  const step        = STEPS[idx]
  const isLast      = idx === STEPS.length - 1
  const interactive = !!step.waitFor

  // Start verzögert, damit die Board-UI fertig gerendert ist
  useEffect(() => {
    if (hasSeenTutorial) { setVisible(false); return }
    setIdx(0)
    setTaskWidgetId(null)
    setShowDonate(false)
    const t = setTimeout(() => setVisible(true), 700)
    return () => clearTimeout(t)
  }, [hasSeenTutorial])

  const finish = useCallback(() => {
    setVisible(false)
    setSetting({ hasSeenTutorial: true })
  }, [setSetting])

  // Ziel-Selektoren je Phase auflösen: Interaktive Schritte führen das Visier
  // in Etappen weiter — erst der +-Button, nach Öffnen des Katalogs die
  // Aufgaben-Kachel; erst das Widget, nach Auswahl der konkrete Button.
  // Der erste existierende Selektor gewinnt (measure).
  const uiPanel = useUIStore(s => s.panel)
  const taskSel = taskWidgetId ? `#widget-${taskWidgetId}` : null
  const candidates: string[] = (() => {
    if (step.waitFor === 'addTask')   return uiPanel === 'addWidget' ? ['#tour-tile-task', '#add-widget-btn'] : ['#add-widget-btn']
    if (step.waitFor === 'openStyle') return ['#tour-widget-style-btn', ...(taskSel ? [taskSel] : [])]
    if (step.waitFor === 'showStats') return taskSel ? [`${taskSel} [data-stats-toggle]`, taskSel] : []
    if (step.target === 'task-widget') return taskSel ? [taskSel] : []
    return step.target ? [step.target] : []
  })()
  const candidatesKey = candidates.join('|')

  // Modus setzen + Ziel vermessen (nach dem Modus-Wechsel kurz warten).
  // Interaktive Schritte messen periodisch nach — der Nutzer bewegt dort
  // echte UI (Widget anlegen/verschieben, Panels öffnen).
  useEffect(() => {
    if (!visible) return
    // setMode nur bei echtem Wechsel: es setzt panel auf null und würde sonst
    // bei jedem Kandidaten-Wechsel (Effekt-Re-Run) das gerade vom Nutzer
    // geöffnete Katalog-Panel sofort wieder schließen
    if (step.mode && useUIStore.getState().mode !== step.mode) useUIStore.getState().setMode(step.mode)

    function measure() {
      for (const sel of candidates) {
        const el = document.querySelector(sel)
        if (el) {
          setRect(el.getBoundingClientRect())
          // Spotlight übernimmt die Rundung des Ziels (Pille → runde Auswahl):
          // Innenradius + PAD hält die Rundung konzentrisch; der Browser kappt
          // überschüssige Werte (z. B. 999px) automatisch auf die Pillenform.
          const r = parseFloat(getComputedStyle(el).borderRadius) || 12
          setSpotRadius(r + PAD)
          return
        }
      }
      setRect(null)
    }
    const t = setTimeout(measure, step.mode ? 380 : 60)
    const iv = interactive ? setInterval(measure, 300) : null
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(t)
      if (iv) clearInterval(iv)
      window.removeEventListener('resize', measure)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, idx, candidatesKey, step.mode, interactive])

  // ── Interaktive Schritte: auf die Nutzer-Aktion warten, dann weiter ────────
  useEffect(() => {
    if (!visible || !step.waitFor) return
    let done = false
    const advance = () => {
      if (done) return
      done = true
      // Kurze Pause, damit der Haken-Moment sichtbar ist, bevor es weitergeht
      setTimeout(() => setIdx(i => Math.min(STEPS.length - 1, i + 1)), 750)
    }

    if (step.waitFor === 'addTask') {
      // Neu hinzukommendes Aufgaben-Widget erkennen (Bestand als Baseline)
      const bs = useBoardStore.getState()
      const board = bs.boards[bs.currentBoardId]
      const baseline = new Set(Object.values(board?.widgets ?? {}).filter(w => w.type === 'task').map(w => w.id))
      return useBoardStore.subscribe(s => {
        const b = s.boards[s.currentBoardId]
        const fresh = Object.values(b?.widgets ?? {}).find(w => w.type === 'task' && !baseline.has(w.id))
        if (fresh) {
          setTaskWidgetId(fresh.id)
          // Katalog-Panel schließen, damit das neue Widget frei sichtbar ist
          setTimeout(() => useUIStore.getState().openPanel(null), 350)
          advance()
        }
      })
    }

    if (step.waitFor === 'openStyle') {
      const check = (panel: string | null) => { if (panel === 'widgetStyle') advance() }
      check(useUIStore.getState().panel)
      return useUIStore.subscribe(s => check(s.panel))
    }

    if (step.waitFor === 'showStats') {
      // Das im vorigen Schritt geöffnete Stil-Panel nach kurzem Moment
      // schließen: Sein unsichtbarer Backdrop (z 800, board/[id]/page.tsx)
      // würde sonst den ersten Klick auf den Statistik-Button schlucken.
      const closeT = setTimeout(() => useUIStore.getState().openPanel(null), 1100)
      const check = (s: ReturnType<typeof useBoardStore.getState>) => {
        const b = s.boards[s.currentBoardId]
        const id = taskIdRef.current
        const w = id ? b?.widgets[id] : Object.values(b?.widgets ?? {}).find(x => x.type === 'task')
        if (w?.data.statsOpen) advance()
      }
      check(useBoardStore.getState())
      const unsub = useBoardStore.subscribe(check)
      return () => { clearTimeout(closeT); unsub() }
    }
  }, [visible, idx, step.waitFor])

  // Tastatur: Esc beendet, Pfeile/Enter navigieren. In interaktiven Schritten
  // gehört Escape der App (Panels schließen) und beendet die Tour NICHT —
  // sonst killt ein reflexhaftes Esc beim Ausprobieren die ganze Tour.
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      const waiting = !!STEPS[idx].waitFor
      if (e.key === 'Escape' && !waiting) { e.stopPropagation(); finish() }
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && !waiting) {
        setIdx(i => Math.min(STEPS.length - 1, i + 1))
      }
      if (e.key === 'ArrowLeft' && !waiting) setIdx(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [visible, finish, idx])

  if (!visible) return null
  if (showDonate) return <DonateOverlay onClose={finish} />

  // ── Karteninhalt (für beide Positionsvarianten identisch) ──────────────────
  const cardInner = (
    <>
      {/* Kopf: Icon-Kachel + Schrittzähler + Titel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {idx === 0 ? (
          // Willkommens-Schritt: das mosaic-Logo einfach normal zeigen (wie im
          // Header/TopBar) — ohne die Akzent-Kachel der übrigen Schritt-Icons,
          // dafür etwas größer.
          <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            {step.icon}
          </div>
        ) : step.rawIcon ? (
          // Icon in Originalform (z. B. animierte Modus-Pille) — keine Kachel
          <motion.div
            key={`icon-${idx}`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            style={{ flexShrink: 0 }}>
            {step.icon}
          </motion.div>
        ) : (
          <motion.div
            key={`icon-${idx}`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 22%, transparent)',
              color: 'var(--accent)',
            }}>
            {step.icon}
          </motion.div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em' }}>
            {t('STEP')} {idx + 1} / {STEPS.length}
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text1)', lineHeight: 1.25 }}>
            {t(step.title)}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.75, marginBottom: step.kbd ? 12 : 18 }}>
        {/* {n} = aktuelle Widget-Anzahl aus dem Katalog — nie wieder eine
            hartkodierte Zahl, die beim Entfernen eines Widgets veraltet */}
        {t(step.text).replace('{n}', String(TILES.length))}
      </div>

      {step.kbd && (
        <div style={{ marginBottom: 18 }}>
          <span style={{
            fontSize: 11.5, fontWeight: 700, color: 'var(--accent)',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
            borderRadius: 6, padding: '4px 10px', letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {t(step.kbd)}
          </span>
        </div>
      )}

      {/* Fortschritts-Punkte */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
        {STEPS.map((_, i) => (
          <motion.div key={i}
            animate={{ width: i === idx ? 22 : 6, opacity: i === idx ? 1 : i < idx ? 0.7 : 0.3 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{ height: 6, borderRadius: 3, background: 'var(--accent)' }}
          />
        ))}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!isLast && (
          <button onClick={finish} style={{
            fontSize: 12.5, color: 'var(--text3)', background: 'none', border: 'none',
            cursor: 'pointer', padding: '6px 2px',
          }}>
            {t('Skip')}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {idx > 0 && !interactive && (
          <button onClick={() => setIdx(i => i - 1)} style={{
            fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 9,
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text2)', cursor: 'pointer',
          }}>
            {t('Back')}
          </button>
        )}
        {interactive ? (
          // Warte-Pille statt Weiter-Button: Der Nutzer führt die Aktion in
          // der echten UI aus, die Tour springt dann von selbst weiter.
          <span style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, fontWeight: 600, color: 'var(--accent)',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            borderRadius: 999, padding: '8px 14px',
          }}>
            <motion.span
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
            />
            {t('The tour continues automatically')}
          </span>
        ) : (
          <button onClick={() => isLast ? setShowDonate(true) : setIdx(i => i + 1)} style={{
            fontSize: 13, fontWeight: 700, padding: '9px 22px', borderRadius: 9,
            border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
            boxShadow: '0 4px 18px color-mix(in srgb, var(--accent) 45%, transparent)',
          }}>
            {idx === 0 ? t('Let’s go') : isLast ? t('Finish tour') : t('Next')}
          </button>
        )}
      </div>
    </>
  )

  const cardBaseStyle: React.CSSProperties = {
    width: CARD_W,
    maxWidth: 'calc(100vw - 24px)',
    // Mit --bg gemischt + Blur: bleibt in jedem Theme deckend (Glass-Fix)
    background: 'color-mix(in srgb, var(--surface) 45%, var(--bg))',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: '22px 26px 20px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent)',
  }

  const cardMotion = {
    initial:    { opacity: 0, y: 14, scale: 0.96 },
    animate:    { opacity: 1, y: 0, scale: 1 },
    exit:       { opacity: 0, y: -8, scale: 0.98 },
    transition: { type: 'spring' as const, stiffness: 340, damping: 30 },
  }

  // Position bei verankerten Schritten (unter/über dem Ziel, im Viewport geklemmt).
  // Interaktive Schritte parken die Karte unten rechts — der Nutzer braucht
  // die Fläche, um wirklich mit Widgets und Panels zu arbeiten.
  const anchored = rect != null && !interactive
  const anchoredTop  = anchored
    ? (rect.bottom + PAD + CARD_EST_H < window.innerHeight
        ? rect.bottom + PAD + 8
        : Math.max(12, rect.top - PAD - CARD_EST_H))
    : 0
  const anchoredLeft = anchored
    ? Math.min(Math.max(12, rect.left + rect.width / 2 - CARD_W / 2), window.innerWidth - CARD_W - 12)
    : 0

  return (
    <div role="dialog" aria-modal={!interactive} aria-label={t('Intro tour')}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, pointerEvents: interactive ? 'none' : 'auto' }}>
      {/* Klick-Blocker — bei erklärenden Schritten; interaktive Schritte mit
          dim bekommen stattdessen die Sperr-Flächen ums Visier (unten) */}
      {!interactive && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onClick={e => e.stopPropagation()} />
      )}

      {/* Interaktiv + dim: alles außerhalb des Visiers abdunkeln UND sperren —
          nur das anvisierte Element (z. B. die Aufgaben-Kachel) ist klickbar */}
      {interactive && step.dim && rect != null && ([
        { top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) },
        { top: rect.bottom + PAD, left: 0, right: 0, bottom: 0 },
        { top: Math.max(0, rect.top - PAD), left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 },
        { top: Math.max(0, rect.top - PAD), left: rect.right + PAD, right: 0, height: rect.height + PAD * 2 },
      ] as React.CSSProperties[]).map((pos, i) => (
        <div key={`guard-${i}`} style={{ position: 'fixed', ...pos, pointerEvents: 'auto', zIndex: 1 }}
          onClick={e => { e.stopPropagation(); e.preventDefault() }}
          onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
        />
      ))}

      {/* Abdunkelung: ohne Ziel als Vollfläche, mit Ziel als Spotlight-Loch.
          Interaktiv ohne dim: nur der Puls-Ring, keine Abdunkelung im Weg. */}
      {rect != null ? (
        <motion.div
          key="spotlight"
          initial={false}
          animate={{
            left:   rect.left - PAD,
            top:    rect.top - PAD,
            width:  rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: interactive && !step.dim
              ? '0 0 0 9999px rgba(4,4,10,0)'
              : '0 0 0 9999px rgba(4,4,10,0.72)',
          }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{
            position: 'fixed', borderRadius: spotRadius, pointerEvents: 'none',
            border: '2px solid var(--accent)',
          }}
        >
          {/* Puls-Ring */}
          <motion.div
            animate={{ opacity: [0.55, 0], scale: [1, 1.12] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: spotRadius, border: '2px solid var(--accent)' }}
          />
        </motion.div>
      ) : (!interactive || step.dim) ? (
        <motion.div
          key="dim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(4,4,10,0.72)', backdropFilter: 'blur(1.5px)', WebkitBackdropFilter: 'blur(1.5px)', pointerEvents: 'auto' }}
        />
      ) : null}

      {/* Erklär-Karte — zentriert per Flex-Container (framer-motion nutzt den
          transform selbst, daher kein translate(-50%,-50%) am Element!) */}
      <AnimatePresence mode="wait">
        {interactive ? (
          <motion.div key={idx} {...cardMotion}
            style={{ ...cardBaseStyle, position: 'fixed', right: 16, bottom: 16, pointerEvents: 'auto', zIndex: 2 }}>
            {cardInner}
          </motion.div>
        ) : anchored ? (
          <motion.div key={idx} {...cardMotion}
            style={{ ...cardBaseStyle, position: 'fixed', top: anchoredTop, left: anchoredLeft }}>
            {cardInner}
          </motion.div>
        ) : (
          <div key="center-wrap" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}>
            <motion.div key={idx} {...cardMotion} style={{ ...cardBaseStyle, pointerEvents: 'auto' }}>
              {cardInner}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
