'use client'
import { cloneElement, isValidElement, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // AnimatePresence kept for panel open/close
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useT } from '@/hooks/useT'
import { defaultWidget, findNextPos, findPosNear, DEFAULT_SPANS } from '@/lib/defaults'
import { INFINITE_COL_W, INFINITE_GRID_COLS, GRID_GAP } from './TileWrapper'
import { getTheme } from '@/lib/themes'
import type { WidgetType } from '@/types'
import {
  IconTask, IconNote, IconTimer, IconWater, IconImage, IconCalendar, IconChart, IconTable, IconDraw, IconClock, IconWeather, IconMap, IconReader,
  IconSleep, IconAgenda, IconLinks, IconHtml,
} from '@/components/ui/Icons'

// label/desc sind englische Quelltexte (Default-Sprache) — TileCard übersetzt sie selbst mit t()
//
// ⚠️ Jeder Eintrag hier braucht ein Gegenstück in BUILT_IN_WIDGETS
// (src/components/ui/settings/widgetCatalog.tsx) — sonst fehlt dem Widget
// eine eigene Settings-Seite (De-/Aktivierbarkeit etc.). Ist bereits einmal
// auseinandergelaufen (Reader fehlte in BUILT_IN_WIDGETS). Siehe auch
// KONZEPT.md §5.2, Schritt 7.
export const TILES: { type: WidgetType; icon: React.ReactNode; label: string; desc: string }[] = [
  { type: 'weather',     icon: <IconWeather />,    label: 'Weather',    desc: 'Location & forecast' },
  { type: 'map',         icon: <IconMap />,        label: 'Map',        desc: 'OpenStreetMap, markers & routes' },
  { type: 'task',        icon: <IconTask />,       label: 'Task',       desc: 'Tasks & habit tracking' },
  { type: 'note',        icon: <IconNote />,       label: 'Note',       desc: 'Markdown notes with custom fonts, color, shadow & outline' },
  { type: 'timer',       icon: <IconTimer />,      label: 'Timer',      desc: 'Countdown & time tracking' },
  { type: 'water',       icon: <IconWater />,      label: 'Water',      desc: 'Track daily water intake' },
  { type: 'image',       icon: <IconImage />,      label: 'Image',      desc: 'Embed a photo or graphic' },
  { type: 'calendar',    icon: <IconCalendar />,   label: 'Calendar',   desc: 'Month view with events' },
  { type: 'spreadsheet', icon: <IconTable />,      label: 'Table',      desc: 'Spreadsheet with formulas' },
  { type: 'drawboard',   icon: <IconDraw />,       label: 'Drawboard',  desc: 'Draw sketches & diagrams' },
  { type: 'clock',       icon: <IconClock />,      label: 'Clock',      desc: 'Digital, analog & more' },
  { type: 'chart',       icon: <IconChart />,      label: 'Chart',      desc: 'Bar, line, pie & more' },
  { type: 'reader',      icon: <IconReader />,     label: 'Reader',     desc: 'A library of PDFs and EPUBs, with highlights' },
  { type: 'sleep',       icon: <IconSleep />,      label: 'Sleep',      desc: 'Track daily sleep duration' },
  { type: 'agenda',      icon: <IconAgenda />,     label: 'Agenda',     desc: 'Upcoming events at a glance' },
  { type: 'quicklinks',  icon: <IconLinks />,      label: 'Quicklinks', desc: 'Quick access to websites' },
  { type: 'html',        icon: <IconHtml />,       label: 'HTML',       desc: 'Paste your own HTML page — rendered live' },
]

// Gruppen für die Navigation links — jede Widget-Art genau einer Gruppe
// zugeordnet. label = englischer Quelltext, mit t() übersetzt.
type Cat = 'plan' | 'notes' | 'health' | 'data' | 'world' | 'media'
const CATS: { id: Cat; label: string; types: WidgetType[] }[] = [
  { id: 'plan',   label: 'Plan & organize',  types: ['task', 'calendar', 'agenda', 'timer'] },
  { id: 'notes',  label: 'Notes & reading',  types: ['note', 'reader', 'drawboard'] },
  { id: 'health', label: 'Health',           types: ['water', 'sleep'] },
  { id: 'data',   label: 'Data',             types: ['spreadsheet', 'chart'] },
  { id: 'world',  label: 'World & time',     types: ['weather', 'map', 'clock'] },
  { id: 'media',  label: 'Media & web',      types: ['image', 'quicklinks', 'html'] },
]

type Tile = (typeof TILES)[number]

function TileCard({ tile, onClick, id }: { tile: Tile; onClick: () => void; id?: string }) {
  const t = useT()
  const [hover, setHover] = useState(false)
  const span = DEFAULT_SPANS[tile.type]
  return (
    <button
      id={id}
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      aria-label={`${t('Add')}: ${t(tile.label)}`}
      style={{
        position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: 14, minHeight: 96, width: '100%', textAlign: 'left',
        borderRadius: 18, border: 'none', cursor: 'pointer',
        background: hover ? 'color-mix(in srgb, var(--accent) 9%, var(--surface2))' : 'color-mix(in srgb, var(--surface2) 70%, transparent)',
        boxShadow: hover ? 'inset 0 0 0 1.5px var(--accent)' : 'none',
        transition: 'background 0.14s, box-shadow 0.14s',
      }}
    >
      <div style={{
        flexShrink: 0, width: 52, height: 52, borderRadius: 16,
        background: hover ? 'color-mix(in srgb, var(--accent) 20%, var(--surface3))' : 'var(--surface3)',
        color: hover ? 'var(--accent)' : 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.14s',
      }}>
        {isValidElement(tile.icon)
          ? cloneElement(tile.icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: 28, strokeWidth: 1.2 })
          : tile.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 26 }}>
        <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text1)', lineHeight: 1.25 }}>{t(tile.label)}</span>
        <span style={{
          fontSize: 12, color: 'var(--text3)', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{t(tile.desc)}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', opacity: 0.8, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {span.colSpan} × {span.rowSpan}
        </span>
      </div>
      {/* Hinzufügen-Knopf: ruhig im Ruhezustand, Akzent beim Hover */}
      <span aria-hidden style={{
        position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'var(--accent)' : 'color-mix(in srgb, var(--text1) 7%, transparent)',
        color: hover ? 'var(--on-accent, white)' : 'var(--text3)',
        transition: 'all 0.14s',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </span>
    </button>
  )
}

export default function TilePicker() {
  const t = useT()
  const addWidget        = useBoardStore(s => s.addWidget)
  const board            = useBoardStore(selectBoard)
  const panel            = useUIStore(s => s.panel)
  const openPanel        = useUIStore(s => s.openPanel)
  const disabledTypes    = useSettings(s => s.disabledWidgetTypes)

  const [search, setSearch] = useState('')
  const [cat, setCat]       = useState<Cat | 'all'>('all')
  const desktopRef = useRef<HTMLDivElement>(null)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const isOpen = panel === 'addWidget'

  useEffect(() => { if (!isOpen) { setSearch(''); setCat('all') } }, [isOpen])
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [cat, search])
  useFocusTrap(desktopRef, isOpen)

  const allTiles = TILES.filter(tile => !disabledTypes.includes(tile.type))
  const q = search.trim().toLowerCase()
  const matches = (tile: Tile) =>
    // Sucht sowohl im englischen Quelltext als auch in der aktuell angezeigten Übersetzung
    tile.label.toLowerCase().includes(q) || t(tile.label).toLowerCase().includes(q) ||
    tile.desc.toLowerCase().includes(q)  || t(tile.desc).toLowerCase().includes(q)
  const inCat = (c: Cat) => (tile: Tile) => CATS.find(x => x.id === c)!.types.includes(tile.type)

  // Suche gilt immer über alle Widgets (unabhängig vom gewählten Bereich)
  const searchResults = q ? allTiles.filter(matches) : []
  const sections = q
    ? []
    : (cat === 'all' ? CATS : CATS.filter(c => c.id === cat))
        .map(c => ({ ...c, tiles: allTiles.filter(inCat(c.id)) }))
        .filter(c => c.tiles.length > 0)

  function add(type: WidgetType) {
    const b = board ?? useBoardStore.getState().boards[useBoardStore.getState().currentBoardId]
    if (!b) return
    const theme = getTheme(b.themeId)

    let pos
    if ((b.layoutMode ?? 'infinite') === 'infinite') {
      // Immer in der Mitte der aktuellen Ansicht platzieren — unabhängig davon,
      // wohin man im unendlichen Board gepannt/gezoomt hat und wie viele
      // Widgets schon existieren (vorher landeten neue Widgets immer neben dem
      // ERSTEN Widget, unabhängig vom aktuellen Ausschnitt).
      const cv   = useUIStore.getState().canvasView
      const step = INFINITE_COL_W + GRID_GAP
      const cx   = (window.innerWidth  / 2 - cv.x) / cv.zoom
      const cy   = (window.innerHeight / 2 - cv.y) / cv.zoom
      pos = findPosNear(b.widgets, type, Math.round(cx / step) + 1, Math.round(cy / step) + 1, INFINITE_GRID_COLS)
    } else {
      pos = findNextPos(b.widgets, type)
    }
    const w = defaultWidget(type, pos, theme.widgetStyle)
    addWidget(w)
    useUIStore.getState().setLastAddedWidget(w.id)
    openPanel(null)
  }

  const grid = (tiles: Tile[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
      {tiles.map(tile => (
        <TileCard key={tile.type} tile={tile} onClick={() => add(tile.type)}
          id={tile.type === 'task' ? 'tour-tile-task' : undefined} />
      ))}
    </div>
  )

  return (
    <AnimatePresence>
      {panel === 'addWidget' && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => openPanel(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 900,
              background: 'rgba(0,0,0,0.32)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          />

          {/* Fade-only overlay, inner div centered via flex (no transform conflict) */}
          <motion.div
            key="panel-desktop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => openPanel(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 901, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div
              ref={desktopRef}
              role="dialog"
              aria-modal="true"
              aria-label={t('Add widget')}
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.97, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              style={{
                width: 'min(1100px, calc(100vw - 48px))',
                height: 'min(740px, calc(100vh - 64px))',
                display: 'flex',
                background: 'var(--popover-bg)',
                backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                border: '1px solid var(--border)',
                borderRadius: 24,
                // Clips the scrollable grid's native scrollbar to the rounded corners
                overflow: 'hidden',
                boxShadow: '0 32px 80px color-mix(in srgb, var(--shadow-color, #000) 55%, transparent)',
              }}
            >
              {/* Navigation links: Bereiche */}
              <nav style={{
                width: 220, flexShrink: 0, padding: '22px 12px', display: 'flex', flexDirection: 'column', gap: 4,
                background: 'color-mix(in srgb, var(--surface2) 45%, transparent)', overflowY: 'auto',
              }}>
                <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text1)', padding: '0 10px 14px' }}>{t('Add widget')}</div>
                {([{ id: 'all' as const, label: 'All', count: allTiles.length },
                   ...CATS.map(c => ({ id: c.id, label: c.label, count: allTiles.filter(inCat(c.id)).length }))])
                  .filter(c => c.count > 0)
                  .map(c => {
                    const on = !q && cat === c.id
                    return (
                      <button key={c.id} onClick={() => { setSearch(''); setCat(c.id) }} style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 36, padding: '0 8px 0 14px',
                        borderRadius: 999, border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: on ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                        color: on ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: on ? 600 : 500,
                      }}>
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(c.label)}</span>
                        <span style={{
                          minWidth: 22, height: 20, padding: '0 6px', borderRadius: 999, boxSizing: 'border-box',
                          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: on ? 'var(--accent)' : 'color-mix(in srgb, var(--text1) 7%, transparent)',
                          color: on ? 'var(--on-accent, white)' : 'var(--text3)',
                        }}>{c.count}</span>
                      </button>
                    )
                  })}
              </nav>

              {/* Rechts: Suche + Karten */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 22px 6px' }}>
                  <SearchBar search={search} setSearch={setSearch} autoFocus
                    onEnter={() => { const first = (q ? searchResults : sections[0]?.tiles)?.[0]; if (first) add(first.type) }} />
                  <button onClick={() => openPanel(null)} aria-label={t('Close')} title={t('Close')} style={{
                    width: 34, height: 34, flexShrink: 0, borderRadius: 999, border: '1px solid var(--border)',
                    background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                  </button>
                </div>

                {/* Scrollbereich — oberer Rand blendet weich aus statt hart abzuschneiden */}
                <div ref={scrollRef} style={{
                  flex: 1, overflowY: 'auto', padding: '16px 22px 24px',
                  maskImage: 'linear-gradient(to bottom, transparent, black 16px)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 16px)',
                }}>
                  {q ? (
                    searchResults.length > 0 ? grid(searchResults) : <EmptySearch query={search} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                      {sections.map(sec => (
                        <section key={sec.id}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 4px 12px' }}>
                            <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text1)' }}>{t(sec.label)}</span>
                            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{sec.tiles.length}</span>
                          </div>
                          {grid(sec.tiles)}
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function SearchBar({ search, setSearch, autoFocus, onEnter }: { search: string; setSearch: (v: string) => void; autoFocus: boolean; onEnter: () => void }) {
  const t = useT()
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
        placeholder={t('Search widgets…')}
        aria-label={t('Search widgets')}
        autoFocus={autoFocus}
        onPointerDown={e => e.stopPropagation()}
        style={{
          width: '100%', height: 40, padding: '0 40px', fontSize: 14,
          background: 'color-mix(in srgb, var(--surface2) 80%, transparent)', border: '1px solid var(--border)',
          borderRadius: 999, color: 'var(--text1)', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {search && (
        <button onClick={() => setSearch('')} aria-label={t('Clear')} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          width: 24, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: 'color-mix(in srgb, var(--text1) 8%, transparent)', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        </button>
      )}
    </div>
  )
}

function EmptySearch({ query }: { query: string }) {
  const t = useT()
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text3)', fontSize: 13 }}>
      {t('No widget found for')} “{query}”
    </div>
  )
}
