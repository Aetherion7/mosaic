'use client'
import { cloneElement, isValidElement, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // AnimatePresence kept for panel open/close
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useT } from '@/hooks/useT'
import { defaultWidget, findNextPos, findPosNear, findNextMobileOrder } from '@/lib/defaults'
import { INFINITE_COL_W, INFINITE_GRID_COLS, GRID_GAP, GRID_ROW_H } from './TileWrapper'
import { MOBILE_FORCE_FULL } from '@/lib/constants'
import { getTheme } from '@/lib/themes'
import type { WidgetType } from '@/types'
import {
  IconTask, IconNote, IconTimer, IconWater, IconImage, IconCalendar, IconChart, IconText, IconTable, IconDraw, IconClock, IconWeather, IconMap, IconReader,
  IconSleep, IconAgenda, IconLinks,
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
  { type: 'note',        icon: <IconNote />,       label: 'Note',       desc: 'Markdown notes & thoughts' },
  { type: 'timer',       icon: <IconTimer />,      label: 'Timer',      desc: 'Countdown & time tracking' },
  { type: 'water',       icon: <IconWater />,      label: 'Water',      desc: 'Track daily water intake' },
  { type: 'image',       icon: <IconImage />,      label: 'Image',      desc: 'Embed a photo or graphic' },
  { type: 'calendar',    icon: <IconCalendar />,   label: 'Calendar',   desc: 'Month view with events' },
  { type: 'text',        icon: <IconText />,       label: 'Text',       desc: 'Free-form formatted text' },
  { type: 'spreadsheet', icon: <IconTable />,      label: 'Table',      desc: 'Spreadsheet with formulas' },
  { type: 'drawboard',   icon: <IconDraw />,       label: 'Drawboard',  desc: 'Draw sketches & diagrams' },
  { type: 'clock',       icon: <IconClock />,      label: 'Clock',      desc: 'Digital, analog & more' },
  { type: 'chart',       icon: <IconChart />,      label: 'Chart',      desc: 'Bar, line, pie & more' },
  { type: 'reader',      icon: <IconReader />,     label: 'Reader',     desc: 'Read & highlight PDFs and EPUBs' },
  { type: 'sleep',       icon: <IconSleep />,      label: 'Sleep',      desc: 'Track daily sleep duration' },
  { type: 'agenda',      icon: <IconAgenda />,     label: 'Agenda',     desc: 'Upcoming events at a glance' },
  { type: 'quicklinks',  icon: <IconLinks />,      label: 'Quicklinks', desc: 'Quick access to websites' },
]

const desktopMotion = {
  initial:    { opacity: 0, scale: 0.96 },
  animate:    { opacity: 1, scale: 1    },
  exit:       { opacity: 0, scale: 0.96 },
  transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
}
const mobileMotion = {
  initial:    { opacity: 0, y: '100%' },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: '100%' },
  transition: { type: 'spring' as const, stiffness: 380, damping: 40 },
}

function TileCard({
  icon, label, desc, hovered, onHover, onLeave, onClick, compact, id,
}: {
  icon: React.ReactNode; label: string; desc: string
  hovered: boolean; onHover: () => void; onLeave: () => void; onClick: () => void
  compact?: boolean
  id?: string
}) {
  const t = useT()
  const iconSize = compact ? 28 : 36
  const boxSize  = compact ? 44 : 60

  return (
    <button
      id={id}
      onClick={onClick} onMouseEnter={onHover} onMouseLeave={onLeave}
      aria-label={t(label)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 5 : 6,
        padding: compact ? '10px 6px' : '20px 10px',
        borderRadius: 12,
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
        background: hovered ? 'color-mix(in srgb, var(--accent) 8%, var(--surface2))' : 'var(--surface2)',
        cursor: 'pointer', transition: 'all 0.14s',
        textAlign: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      <div style={{
        flexShrink: 0,
        width: boxSize, height: boxSize, borderRadius: compact ? 10 : 14,
        background: hovered ? 'color-mix(in srgb, var(--accent) 18%, var(--surface3))' : 'var(--surface3)',
        border: `1px solid ${hovered ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: hovered ? 'var(--accent)' : 'var(--text2)',
        transform: hovered ? 'scale(1.06)' : 'scale(1)', transition: 'all 0.14s',
      }}>
        {isValidElement(icon)
          ? cloneElement(icon as React.ReactElement<{ size?: number; strokeWidth?: number }>, { size: iconSize, strokeWidth: 1.1 })
          : icon}
      </div>

      <span style={{
        fontSize: compact ? 10 : 12, fontWeight: 700,
        color: hovered ? 'var(--accent)' : 'var(--text1)',
        transition: 'color 0.14s', lineHeight: 1.2,
      }}>{t(label)}</span>

      {!compact && (
        <span style={{
          fontSize: 10.5, color: hovered ? 'color-mix(in srgb, var(--accent) 70%, var(--text2))' : 'var(--text3)',
          lineHeight: 1.35, transition: 'color 0.14s',
        }}>{t(desc)}</span>
      )}
    </button>
  )
}

const RECENT_KEY = 'planboard-recent-widgets'
const RECENT_MAX = 5

function getRecentTypes(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
}
function pushRecentType(type: string) {
  try {
    const prev = getRecentTypes().filter(t => t !== type)
    localStorage.setItem(RECENT_KEY, JSON.stringify([type, ...prev].slice(0, RECENT_MAX)))
  } catch {}
}

export default function TilePicker() {
  const t = useT()
  const addWidget        = useBoardStore(s => s.addWidget)
  const board            = useBoardStore(selectBoard)
  const panel            = useUIStore(s => s.panel)
  const openPanel        = useUIStore(s => s.openPanel)
  const isMobile         = useIsMobile()
  const disabledTypes    = useSettings(s => s.disabledWidgetTypes)
  const installedPlugins = useSettings(s => s.installedPlugins)

  const [hovered,     setHovered]     = useState<string | null>(null)
  const [search,      setSearch]      = useState('')
  // Lazy statt leerem Array: sonst ist die „Zuletzt verwendet"-Zeile beim
  // allerersten Panel-Öffnen für einen Frame leer und poppt erst danach rein
  // (Layout-Sprung, kurz zweizeilig durch die Öffnungs-Animation). Das
  // Effekt unten hält die Liste bei jedem weiteren Öffnen aktuell.
  const [recentTypes, setRecentTypes] = useState<string[]>(() => getRecentTypes())
  const desktopRef = useRef<HTMLDivElement>(null)
  const mobileRef  = useRef<HTMLDivElement>(null)
  const isOpen = panel === 'addWidget'

  useEffect(() => { if (isOpen) setRecentTypes(getRecentTypes()) }, [isOpen])

  useEffect(() => { if (!isOpen) setSearch('') }, [isOpen])
  useFocusTrap(isMobile ? mobileRef : desktopRef, isOpen)

  const pluginTiles = installedPlugins.map(p => ({
    type: 'plugin' as WidgetType,
    icon: <span style={{ fontSize: 28 }}>{p.icon}</span>,
    label: p.name,
    desc: p.desc,
    pluginId: p.id,
  }))

  const allTiles = [
    ...TILES.filter(tile => !disabledTypes.includes(tile.type)),
    ...pluginTiles,
  ]

  const q = search.toLowerCase()
  const filteredTiles = q.trim()
    ? allTiles.filter(tile =>
        // Sucht sowohl im englischen Quelltext als auch in der aktuell angezeigten Übersetzung
        tile.label.toLowerCase().includes(q) || t(tile.label).toLowerCase().includes(q) ||
        tile.desc.toLowerCase().includes(q)  || t(tile.desc).toLowerCase().includes(q)
      )
    : allTiles

  function add(type: WidgetType, pluginId?: string) {
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
    const mobileOrder = findNextMobileOrder(b.widgets)
    const isForceFullType = MOBILE_FORCE_FULL.has(type)
    const halfCount   = isForceFullType ? 0 : Object.values(b.widgets).filter(w =>
      !MOBILE_FORCE_FULL.has(w.type) && (w.mobilePos?.span ?? 1) === 1
    ).length
    const mobileCol: 1|2 = isForceFullType ? 1 : (halfCount % 2 === 0 ? 1 : 2)
    const w = defaultWidget(type, pos, theme.widgetStyle, mobileOrder, mobileCol)
    if (pluginId) {
      const plugin = useSettings.getState().installedPlugins.find(p => p.id === pluginId)
      if (plugin) w.data = { pluginId: plugin.id, pluginName: plugin.name, pluginIcon: plugin.icon, pluginDesc: plugin.desc, embedUrl: plugin.embedUrl }
    }
    pushRecentType(pluginId ? `plugin-${pluginId}` : type)
    addWidget(w)
    useUIStore.getState().setLastAddedWidget(w.id)
    openPanel(null)
  }


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
              background: isMobile ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.22)',
              backdropFilter: isMobile ? undefined : 'blur(4px)',
              WebkitBackdropFilter: isMobile ? undefined : 'blur(4px)',
            }}
          />

          {/* Desktop — fade-only overlay, inner div centered via flex (no transform conflict) */}
          {!isMobile && (
            <motion.div
              key="panel-desktop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => openPanel(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 901, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <div
                ref={desktopRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('Add widget')}
                onClick={e => e.stopPropagation()}
                style={{
                  width: 'min(960px, calc(100vw - 48px))',
                  height: 'min(640px, calc(100vh - 80px))',
                  display: 'flex', flexDirection: 'column',
                  background: 'color-mix(in srgb, var(--surface) 75%, var(--bg))',
                  backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  boxShadow: '0 32px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
              >
                {/* Sticky header + search */}
                <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
                  <PanelHeader title={t('Add widget')} onClose={() => openPanel(null)} />
                  <SearchBar search={search} setSearch={setSearch} autoFocus />
                </div>

                {/* Scrollable grid area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
                  {/* Zuletzt benutzt */}
                  {!search && recentTypes.length > 0 && (() => {
                    const recentTiles = recentTypes
                      .map(key => allTiles.find(t => (key.startsWith('plugin-') ? `plugin-${'pluginId' in t ? (t as {pluginId:string}).pluginId : ''}` : t.type) === key))
                      .filter(Boolean) as typeof allTiles
                    if (!recentTiles.length) return null
                    return (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('Recently used')}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, overflow: 'hidden' }}>
                          <AnimatePresence>
                            {recentTiles.map((t, i) => {
                              const pid = 'pluginId' in t ? (t as {pluginId:string}).pluginId : undefined
                              const key = pid ? `plugin-${pid}` : t.type
                              const hvr = `recent-${key}`
                              return (
                                <motion.div
                                  key={`recent-${key}`}
                                  initial={{ x: -24, opacity: 0 }}
                                  animate={{ x: 0, opacity: 1 }}
                                  exit={{ x: 24, opacity: 0 }}
                                  transition={{ type: 'spring', stiffness: 380, damping: 32, delay: i * 0.05 }}
                                  style={{ minWidth: 0, height: '100%' }}
                                >
                                  <TileCard icon={t.icon} label={t.label} desc={t.desc}
                                    hovered={hovered === hvr} onHover={() => setHovered(hvr)} onLeave={() => setHovered(null)}
                                    onClick={() => add(t.type, pid)} />
                                </motion.div>
                              )
                            })}
                          </AnimatePresence>
                        </div>
                        <div style={{ height: 1, background: 'var(--border)', margin: '14px 0 10px' }} />
                      </div>
                    )
                  })()}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                    {filteredTiles.map(t => {
                      const pid = 'pluginId' in t ? (t as { pluginId: string }).pluginId : undefined
                      const key = pid ? `plugin-${pid}` : t.type
                      const hvr = pid ? `plugin-${pid}` : t.type
                      return (
                        <TileCard key={key} icon={t.icon} label={t.label} desc={t.desc}
                          id={!pid && t.type === 'task' ? 'tour-tile-task' : undefined}
                          hovered={hovered === hvr} onHover={() => setHovered(hvr)} onLeave={() => setHovered(null)}
                          onClick={() => add(t.type, pid)} />
                      )
                    })}
                  </div>
                  {filteredTiles.length === 0 && <EmptySearch query={search} />}
                </div>
              </div>
            </motion.div>
          )}

          {/* Mobile — bottom sheet */}
          {isMobile && (
            <motion.div
              ref={mobileRef}
              key="panel-mobile"
              role="dialog"
              aria-modal="true"
              aria-label={t('Add widget')}
              {...mobileMotion}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 901,
                background: 'color-mix(in srgb, var(--surface) 75%, var(--bg))',
                backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                border: '1px solid var(--border)',
                borderRadius: '20px 20px 0 0', padding: '8px 14px 40px',
                boxShadow: '0 -8px 40px rgba(0,0,0,.5)',
                maxHeight: '85vh', overflowY: 'scroll',
                WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
                overscrollBehavior: 'contain', touchAction: 'pan-y',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
              </div>
              <PanelHeader title={t('Add widget')} onClose={() => openPanel(null)} />
              <SearchBar search={search} setSearch={setSearch} autoFocus={false} />

              {/* Zuletzt benutzt (Mobile) */}
              {!search && recentTypes.length > 0 && (() => {
                const recentTiles = recentTypes
                  .map(key => allTiles.find(t => (key.startsWith('plugin-') ? `plugin-${'pluginId' in t ? (t as {pluginId:string}).pluginId : ''}` : t.type) === key))
                  .filter(Boolean) as typeof allTiles
                if (!recentTiles.length) return null
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('Recently used')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, overflow: 'hidden' }}>
                      <AnimatePresence>
                        {recentTiles.map((t, i) => {
                          const pid = 'pluginId' in t ? (t as {pluginId:string}).pluginId : undefined
                          const key = pid ? `plugin-${pid}` : t.type
                          const hvr = `recent-m-${key}`
                          return (
                            <motion.div
                              key={`recent-m-${key}`}
                              initial={{ x: -24, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              exit={{ x: 24, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: i * 0.05 }}
                              style={{ minWidth: 0, height: '100%' }}
                            >
                              <TileCard icon={t.icon} label={t.label} desc={t.desc}
                                hovered={hovered === hvr} onHover={() => setHovered(hvr)} onLeave={() => setHovered(null)}
                                onClick={() => add(t.type, pid)} compact />
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
                    </div>
                    <div style={{ height: 1, background: 'var(--border)', margin: '12px 0 8px' }} />
                  </div>
                )
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {filteredTiles.map(t => {
                  const pid = 'pluginId' in t ? (t as { pluginId: string }).pluginId : undefined
                  const key = pid ? `plugin-${pid}` : t.type
                  const hvr = pid ? `plugin-${pid}` : t.type
                  return (
                    <TileCard key={key} icon={t.icon} label={t.label} desc={t.desc}
                      id={!pid && t.type === 'task' ? 'tour-tile-task' : undefined}
                      hovered={hovered === hvr} onHover={() => setHovered(hvr)} onLeave={() => setHovered(null)}
                      onClick={() => add(t.type, pid)} compact />
                  )
                })}
              </div>
              {filteredTiles.length === 0 && <EmptySearch query={search} />}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  )
}

function SearchBar({ search, setSearch, autoFocus }: { search: string; setSearch: (v: string) => void; autoFocus: boolean }) {
  const t = useT()
  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('Search widgets…')}
        aria-label={t('Search widgets')}
        autoFocus={autoFocus}
        onPointerDown={e => e.stopPropagation()}
        style={{
          width: '100%', padding: '9px 34px 9px 34px', fontSize: 13,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 10, color: 'var(--text1)', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {search && (
        <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}>×</button>
      )}
    </div>
  )
}

function EmptySearch({ query }: { query: string }) {
  const t = useT()
  return (
    <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text3)', fontSize: 12 }}>
      {t('No widget found for')} “{query}”
    </div>
  )
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </span>
      <button onClick={onClose} style={{
        width: 24, height: 24, borderRadius: 8, border: 'none',
        background: 'var(--surface2)', color: 'var(--text2)',
        fontSize: 16, lineHeight: 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.12s',
      }}>×</button>
    </div>
  )
}
