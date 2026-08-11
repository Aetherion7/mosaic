'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'

// Kleines eigenständiges Tutorial für die Board-Übersicht (Startseite) —
// bewusst NICHT auf TutorialTour.tsx (Board-internes Tutorial) aufgebaut:
// dessen Schritte sind hart an Board-spezifische waitFor-Interaktionen
// gekoppelt (Task-Widget anlegen, Stil-Panel öffnen, Statistik aufklappen).
// Hier reicht die einfachere Variante — jeder Schritt ist reines
// Spotlight+Weiter, ohne dass der Nutzer etwas tatsächlich ausführen muss.
// Übernimmt aber dieselbe Optik/Positionierungslogik (Spotlight-Ausschnitt,
// verankerte Karte, Tastatur-Navigation, Fortschritts-Punkte).

function StepIcon({ d, extra }: { d: string; extra?: React.ReactNode }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />{extra}
    </svg>
  )
}

const ICONS = {
  // eslint-disable-next-line @next/next/no-img-element
  welcome: <img src="/mosaiclogo.png" alt="mosaic" width={44} height={44} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />,
  add:     <StepIcon d="M12 5v14M5 12h14" />,
  folder:  <StepIcon d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  search:  <StepIcon d="M21 21l-4.35-4.35" extra={<circle cx="11" cy="11" r="8"/>} />,
  done:    <StepIcon d="M8 12l3 3 5.5-6" extra={<circle cx="12" cy="12" r="10"/>} />,
}

interface Step {
  target?: string
  icon:    React.ReactNode
  title:   string
  text:    string
}

const STEPS: Step[] = [
  {
    icon:  ICONS.welcome,
    title: 'Welcome to mosaic',
    text:  'This is your board overview — every board you create shows up here. A short tour: how to create a board, organize with folders, and find things again.',
  },
  {
    target: '#tour-new-board-btn',
    icon:   ICONS.add,
    title:  'Create a board',
    text:   'Give it a name and start from a template — a ready-made layout for a specific use case — or from a blank board and build your own.',
  },
  {
    target: '#tour-add-folder-btn',
    icon:   ICONS.folder,
    title:  'Organize with folders',
    text:   'Group related boards into a folder — drag any board onto one to file it away, or pull it back out onto the main grid.',
  },
  {
    target: '#tour-search-input',
    icon:   ICONS.search,
    title:  'Search & sort',
    text:   'Search finds a board by name instantly. The sort menu next to it reorders the whole overview — by last edited, name, or creation date.',
  },
  {
    icon:  ICONS.done,
    title: 'Ready to start',
    text:  'Let’s open a board — the next short tour picks up right there and covers the board editor itself.',
  },
]

const CARD_W = 440
const CARD_EST_H = 260
const PAD = 10

export default function HomeTutorialTour({
  onOpenCreateBoard, onCloseCreateBoard, onEnterBoard,
}: {
  onOpenCreateBoard: () => void
  onCloseCreateBoard: () => void
  onEnterBoard: () => void
}) {
  const t = useT()
  const hasSeenHomeTutorial = useSettings(s => s.hasSeenHomeTutorial)
  const setSetting = useSettings(s => s.setSetting)

  const [visible, setVisible] = useState(false)
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [spotRadius, setSpotRadius] = useState(14)

  const step = STEPS[idx]
  const isLast = idx === STEPS.length - 1

  useEffect(() => {
    if (hasSeenHomeTutorial) { setVisible(false); return }
    setIdx(0)
    const timer = setTimeout(() => setVisible(true), 500)
    return () => clearTimeout(timer)
  }, [hasSeenHomeTutorial])

  const finish = useCallback(() => {
    setVisible(false)
    setSetting({ hasSeenHomeTutorial: true })
  }, [setSetting])

  // Schritt 2 (Board erstellen): zeigt die Vorlagen-Übersicht tatsächlich an,
  // statt nur den Button zu markieren — öffnet beim Betreten, schließt beim
  // Verlassen (Weiter/Zurück/Skip/Unmount — alles läuft über die Cleanup-Fn).
  useEffect(() => {
    if (!visible || idx !== 1) return
    onOpenCreateBoard()
    return () => onCloseCreateBoard()
  }, [visible, idx, onOpenCreateBoard, onCloseCreateBoard])

  useEffect(() => {
    if (!visible) return
    function measure() {
      const el = step.target ? document.querySelector(step.target) : null
      if (el) {
        setRect(el.getBoundingClientRect())
        const r = parseFloat(getComputedStyle(el).borderRadius) || 12
        setSpotRadius(r + PAD)
      } else {
        setRect(null)
      }
    }
    const timer = setTimeout(measure, 120)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure) }
  }, [visible, idx, step.target])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish() }
      if (e.key === 'Enter' || e.key === 'ArrowRight') setIdx(i => Math.min(STEPS.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [visible, finish])

  if (!visible) return null

  const cardInner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {idx === 0 ? (
          <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            {step.icon}
          </div>
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

      <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.75, marginBottom: 18 }}>
        {t(step.text)}
      </div>

      <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
        {STEPS.map((_, i) => (
          <motion.div key={i}
            animate={{ width: i === idx ? 22 : 6, opacity: i === idx ? 1 : i < idx ? 0.7 : 0.3 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{ height: 6, borderRadius: 3, background: 'var(--accent)' }}
          />
        ))}
      </div>

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
        {idx > 0 && (
          <button onClick={() => setIdx(i => i - 1)} style={{
            fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 999,
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text2)', cursor: 'pointer',
          }}>
            {t('Back')}
          </button>
        )}
        <button
          onClick={() => {
            if (isLast) { finish(); onEnterBoard() }
            else setIdx(i => i + 1)
          }}
          style={{
            fontSize: 13, fontWeight: 700, padding: '9px 22px', borderRadius: 999,
            border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
            boxShadow: '0 4px 18px color-mix(in srgb, var(--accent) 45%, transparent)',
          }}>
          {idx === 0 ? t('Let’s go') : isLast ? t('Open a board') : t('Next')}
        </button>
      </div>
    </>
  )

  const cardBaseStyle: React.CSSProperties = {
    width: CARD_W,
    maxWidth: 'calc(100vw - 24px)',
    background: 'var(--popover-bg)',
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

  const anchored = rect != null
  const anchoredTop = anchored
    ? (rect.bottom + PAD + CARD_EST_H < window.innerHeight ? rect.bottom + PAD + 8 : Math.max(12, rect.top - PAD - CARD_EST_H))
    : 0
  const anchoredLeft = anchored
    ? Math.min(Math.max(12, rect.left + rect.width / 2 - CARD_W / 2), window.innerWidth - CARD_W - 12)
    : 0

  return (
    <div role="dialog" aria-modal="true" aria-label={t('Overview tour')}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onClick={e => e.stopPropagation()} />

      {rect != null ? (
        <motion.div
          key="spotlight"
          initial={false}
          animate={{
            left: rect.left - PAD, top: rect.top - PAD,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(4,4,10,0.72)',
          }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{ position: 'fixed', borderRadius: spotRadius, pointerEvents: 'none', border: '2px solid var(--accent)' }}
        >
          <motion.div
            animate={{ opacity: [0.55, 0], scale: [1, 1.12] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: spotRadius, border: '2px solid var(--accent)' }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="dim"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(4,4,10,0.72)', backdropFilter: 'blur(1.5px)', WebkitBackdropFilter: 'blur(1.5px)', pointerEvents: 'auto' }}
        />
      )}

      <AnimatePresence mode="wait">
        {anchored ? (
          <motion.div key={idx} {...cardMotion}
            style={{ ...cardBaseStyle, position: 'fixed', top: anchoredTop, left: anchoredLeft }}>
            {cardInner}
          </motion.div>
        ) : (
          <div key="center-wrap" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <motion.div key={idx} {...cardMotion} style={{ ...cardBaseStyle, pointerEvents: 'auto' }}>
              {cardInner}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
