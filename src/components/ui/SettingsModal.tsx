'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useT } from '@/hooks/useT'
import { TYPE_ICONS, TYPE_LABELS } from '@/components/board/TileWrapper'
import type { WidgetType } from '@/types'
import GeneralPanel          from './settings/GeneralPanel'
import ErscheinungsbildPanel from './settings/ErscheinungsbildPanel'
import BoardsPanel           from './settings/BoardsPanel'
import TastenkürzelPanel     from './settings/TastenkuerzelPanel'
import DatenPanel            from './settings/DatenPanel'
import AiSettingsPanel       from './settings/AiSettingsPanel'
import DatenschutzPanel      from './settings/DatenschutzPanel'
import ÜberPanel             from './settings/UeberPanel'
import WidgetSettingsPage    from './settings/WidgetSettingsPage'
import { BUILT_IN_WIDGETS }  from './settings/widgetCatalog'

// ─── Types ────────────────────────────────────────────────────────────────────

type BaseCat = 'general' | 'erscheinungsbild' | 'boards' | 'ki' | 'tastenkürzel' | 'daten' | 'datenschutz' | 'über'
type Cat = BaseCat | `widget:${WidgetType}`

type SidebarEntry =
  | { kind: 'cat'; id: Cat; label: string; icon: React.ReactNode }
  | { kind: 'divider'; label: string }

// ─── Sidebar icons ────────────────────────────────────────────────────────────

const Ico = ({ d, vb = '0 0 24 24' }: { d: string; vb?: string }) => (
  <svg width="15" height="15" viewBox={vb} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

// label ist der englische Quelltext (Default-Sprache) — an Verwendungsstellen mit t() übersetzen
const BASE_CATS: { id: BaseCat; label: string; icon: React.ReactNode }[] = [
  { id: 'general',          label: 'General',          icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2.2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2.2" fill="currentColor" stroke="none"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="7" cy="18" r="2.2" fill="currentColor" stroke="none"/></svg> },
  { id: 'erscheinungsbild', label: 'Appearance', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7" r="1.5" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/></svg> },
  { id: 'boards',           label: 'Boards',           icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="11" y1="5" x2="11" y2="19"/><line x1="2" y1="13.5" x2="11" y2="13.5"/></svg> },
  { id: 'ki',               label: 'AI assistant',     icon: <Ico d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/> },
  { id: 'tastenkürzel',    label: 'Shortcuts',     icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h4M18 14h.01"/></svg> },
  { id: 'daten',           label: 'Data',            icon: <Ico d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/> },
  { id: 'datenschutz',     label: 'Privacy',      icon: <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> },
  { id: 'über',            label: 'About mosaic',      icon: <Ico d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01"/> },
]

// Jedes Widget bekommt einen eigenen Sidebar-Eintrag (eigene Unterseite mit
// Ein/Aus-Schalter + typ-spezifischen Einstellungen), gruppiert unter einem
// "WIDGETS"-Trennstrich. Drittanbieter-Add-ons leben inline in "General".
const WIDGET_CATS: { id: Cat; label: string; icon: React.ReactNode }[] = BUILT_IN_WIDGETS.map(w => ({
  id:    `widget:${w.type}` as Cat,
  label: TYPE_LABELS[w.type] ?? w.type,
  icon:  TYPE_ICONS[w.type],
}))

const SIDEBAR: SidebarEntry[] = [
  ...BASE_CATS.map(c => ({ kind: 'cat' as const, ...c })),
  { kind: 'divider', label: 'Widgets' },
  ...WIDGET_CATS.map(c => ({ kind: 'cat' as const, ...c })),
]

const CAT_LOOKUP = new Map<Cat, string>(
  SIDEBAR
    .filter((e): e is Extract<SidebarEntry, { kind: 'cat' }> => e.kind === 'cat')
    .map(e => [e.id, e.label] as const)
)

// `isHome`: true, wenn die Board-Auswahl (page.tsx) das Modal mit einem
// `categories`-Filter öffnet — dort bekommt "General" eine bewusst knappe
// Variante (nur Theme + Sprache), unabhängig von den vollen board-internen
// Einstellungen (TopBar.tsx öffnet ohne Filter, also isHome=false).
function renderPanel(active: Cat, onClose: () => void, isHome: boolean): React.ReactNode {
  if (active.startsWith('widget:')) {
    return <WidgetSettingsPage type={active.slice('widget:'.length) as WidgetType} />
  }
  switch (active) {
    case 'general':          return <GeneralPanel onClose={onClose} home={isHome} />
    case 'erscheinungsbild': return <ErscheinungsbildPanel />
    case 'boards':           return <BoardsPanel />
    case 'ki':               return <AiSettingsPanel />
    case 'tastenkürzel':     return <TastenkürzelPanel home={isHome} />
    case 'daten':            return <DatenPanel />
    case 'datenschutz':      return <DatenschutzPanel />
    case 'über':             return <ÜberPanel />
    default:                 return null
  }
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function SettingsModal({ onClose, categories, initialCat }: { onClose: () => void; categories?: Cat[]; initialCat?: Cat }) {
  const visibleSidebar: SidebarEntry[] = categories
    ? SIDEBAR.filter((e): e is Extract<SidebarEntry, { kind: 'cat' }> => e.kind === 'cat' && categories.includes(e.id))
    : SIDEBAR
  const visibleCats = visibleSidebar.filter((e): e is Extract<SidebarEntry, { kind: 'cat' }> => e.kind === 'cat')
  const [active, setActive] = useState<Cat>(initialCat ?? visibleCats[0]?.id ?? 'erscheinungsbild')
  const modalRef = useRef<HTMLDivElement>(null)
  const t = useT()

  useFocusTrap(modalRef, true)

  // onClose über einen stets aktuellen Ref, damit der Listener genau EINMAL
  // registriert wird: Hängt er an [onClose] und gibt der Aufrufer eine inline-
  // Funktion mit, wird der Listener bei jedem Eltern-Re-Render ab- und wieder
  // angemeldet. Löst ein anderer Escape-Handler (TopBar) während des Dispatches
  // synchron einen Re-Render aus (zustand/useSyncExternalStore), verpasst der
  // frisch registrierte Listener genau dieses Escape — das Modal blieb offen.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeLabel = CAT_LOOKUP.get(active) ?? ''

  return (
    <AnimatePresence>
      <motion.div
        key="settings-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
      >
        <motion.div
          ref={modalRef}
          key="settings-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('Settings')}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(960px, 92vw)', height: 'min(680px, 88vh)',
            background: 'color-mix(in srgb, var(--surface) 75%, var(--bg))',
            backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid var(--border)',
            borderRadius: 18, overflow: 'hidden', display: 'flex',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Left sidebar */}
          <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 8px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, background: 'color-mix(in srgb, var(--surface2) 60%, var(--surface))' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.09em', padding: '0 10px 12px' }}>{t('Settings')}</div>
            {visibleSidebar.map((entry, i) =>
              entry.kind === 'divider' ? (
                <div key={`divider-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 10px 6px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.09em', flexShrink: 0 }}>
                    {t(entry.label)}
                  </span>
                  <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              ) : (
                <button
                  key={entry.id}
                  onClick={() => setActive(entry.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 8, border: 'none', width: '100%',
                    background: active === entry.id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
                    color: active === entry.id ? 'var(--accent)' : 'var(--text2)',
                    fontWeight: active === entry.id ? 600 : 400,
                    fontSize: 13, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.12s',
                  }}
                >
                  {entry.icon}
                  {t(entry.label)}
                </button>
              )
            )}
          </div>

          {/* Right content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>
                {t(activeLabel)}
              </span>
              <button onClick={onClose} title={t('Close')} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {renderPanel(active, onClose, !!categories)}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
