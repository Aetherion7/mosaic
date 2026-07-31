'use client'
import { useRef, useState, useMemo, useCallback, useEffect, useLayoutEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDraggable } from '@dnd-kit/core'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { Widget, WidgetStyle } from '@/types'
import TaskWidget      from '@/components/widgets/TaskWidget'
import NoteWidget      from '@/components/widgets/NoteWidget'
import TimerWidget     from '@/components/widgets/TimerWidget'
import WaterWidget     from '@/components/widgets/WaterWidget'
import ImageWidget     from '@/components/widgets/ImageWidget'
import CalendarWidget  from '@/components/widgets/CalendarWidget'
import ChartWidget     from '@/components/widgets/ChartWidget'
import TableWidget     from '@/components/widgets/TableWidget'
import DrawboardWidget from '@/components/widgets/DrawboardWidget'
import ClockWidget     from '@/components/widgets/ClockWidget'
import WeatherWidget   from '@/components/widgets/WeatherWidget'
import MapWidget       from '@/components/widgets/MapWidget'
import HtmlWidget      from '@/components/widgets/HtmlWidget'
import SleepWidget      from '@/components/widgets/SleepWidget'
import AgendaWidget     from '@/components/widgets/AgendaWidget'
import QuicklinksWidget from '@/components/widgets/QuicklinksWidget'
import dynamic         from 'next/dynamic'
const ReaderWidget = dynamic(() => import('@/components/widgets/ReaderWidget'), { ssr: false })
import {
  IconTask, IconNote, IconTimer, IconWater, IconImage, IconCalendar, IconChart, IconTable, IconDraw, IconClock, IconWeather, IconMap, IconReader,
  IconSleep, IconAgenda, IconLinks, IconHtml,
  IconDrag, IconDuplicate, IconSliders, IconX, IconExpand,
} from '@/components/ui/Icons'
import WidgetErrorBoundary from './WidgetErrorBoundary'
import { getTheme } from '@/lib/themes'
import { extractNoteTitle, renderNoteTitleHtml } from '@/lib/noteTitle'
import SlidingTabs from '@/components/ui/SlidingTabs'
import WidgetAiChat from './WidgetAiChat'
import { useWidgetAiStore } from '@/store/aiStore'

// Re-exported so existing imports from './TileWrapper' keep working;
// the values live in @/lib/constants (single source of truth).
export { GRID_GAP, GRID_ROW_H, GRID_COLS, INFINITE_COL_W, INFINITE_GRID_COLS } from '@/lib/constants'
import { GRID_GAP, GRID_ROW_H, GRID_COLS, INFINITE_COL_W, INFINITE_GRID_COLS } from '@/lib/constants'

export const TYPE_ICONS: Record<string, React.ReactNode> = {
  task:        <IconTask size={13} />,
  note:        <IconNote size={13} />,
  timer:       <IconTimer size={13} />,
  water:       <IconWater size={13} />,
  image:       <IconImage size={13} />,
  calendar:    <IconCalendar size={13} />,
  chart:       <IconChart size={13} />,
  spreadsheet: <IconTable size={13} />,
  drawboard:   <IconDraw size={13} />,
  clock:       <IconClock size={13} />,
  weather:     <IconWeather size={13} />,
  map:         <IconMap size={13} />,
  reader:      <IconReader size={13} />,
  sleep:       <IconSleep size={13} />,
  agenda:      <IconAgenda size={13} />,
  quicklinks:  <IconLinks size={13} />,
  html:        <IconHtml size={13} />,
}
// Werte sind englische Quelltexte (Default-Sprache) — an Verwendungsstellen mit t() übersetzen
export const TYPE_LABELS: Record<string, string> = { task:'Task', note:'Note', timer:'Timer', water:'Water', image:'Image', calendar:'Calendar', chart:'Chart', spreadsheet:'Table', drawboard:'Drawboard', clock:'Clock', weather:'Weather', map:'Map', html:'HTML', reader:'Reader', sleep:'Sleep', agenda:'Agenda', quicklinks:'Quicklinks' }

export function widgetTypeIcon(widget: Widget): React.ReactNode {
  return TYPE_ICONS[widget.type]
}

// Kleines Pill-Abzeichen (Icon + Typ in Caps) — dieselbe Optik wie die Kachel-Kopfzeile,
// zum Einbetten in Fließtext (z. B. Toast-Meldungen), statt "Kalender-Widget" auszuschreiben.
export function WidgetTypeBadge({ type }: { type: string }) {
  const t = useT()
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px 2px 7px', borderRadius: 20,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      verticalAlign: 'middle',
    }}>
      <span style={{ display: 'flex', color: 'var(--text2)', opacity: 0.75 }}>{TYPE_ICONS[type]}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t(TYPE_LABELS[type] ?? type)}
      </span>
    </span>
  )
}

// Einheitlicher Radius ODER — falls gesetzt — die 4 Einzel-Ecken (Reihenfolge
// wie CSS border-radius: oben-links, oben-rechts, unten-rechts, unten-links).
export function radiusCSS(s: WidgetStyle): string {
  const c = s.cornerRadii
  return c ? `${c[0]}px ${c[1]}px ${c[2]}px ${c[3]}px` : `${s.borderRadius}px`
}
// Für die Kopfzeile bei transparentem Stil: nur die beiden oberen Ecken runden
function topRadiusCSS(s: WidgetStyle): string {
  const c = s.cornerRadii
  return `${c ? c[0] : s.borderRadius}px ${c ? c[1] : s.borderRadius}px 0 0`
}

export function buildStyle(s: WidgetStyle, selected: boolean): React.CSSProperties {
  const glow   = s.glowColor && s.glowSize ? `0 0 ${s.glowSize}px ${s.glowColor}` : ''
  // Schattenfarbe kommt aus dem Theme (--shadow-color): dunkle Themes = Schwarz
  // (unverändert), helle Themes = weicher getönter Schatten statt hartem Grau
  const shadow = {
    none: '',
    sm: '0 1px 4px color-mix(in srgb, var(--shadow-color, #000) 35%, transparent)',
    md: '0 4px 16px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
    lg: '0 8px 30px color-mix(in srgb, var(--shadow-color, #000) 50%, transparent)',
    xl: '0 16px 48px color-mix(in srgb, var(--shadow-color, #000) 60%, transparent)',
  }[s.shadow]
  const ring   = selected ? '0 0 0 2px var(--accent)' : ''
  const boxShadow = [glow, shadow, ring].filter(Boolean).join(', ')

  const alpha = Math.round(s.opacity * 100)
  const mix = (color: string) =>
    s.opacity < 1 ? `color-mix(in srgb, ${color} ${alpha}%, transparent)` : color

  let background: string
  if (s.gradient) {
    const dir: Record<string, string> = { 'to-r':'90deg','to-br':'135deg','to-b':'180deg','to-bl':'225deg','to-l':'270deg','to-tl':'315deg','to-t':'0deg','to-tr':'45deg' }
    background = `linear-gradient(${dir[s.gradientDir]}, ${mix(s.gradient[0])}, ${mix(s.gradient[1])})`
  } else {
    background = mix(s.bgColor)
  }

  return {
    background,
    backdropFilter:       s.blur ? `blur(${s.blur}px)` : undefined,
    WebkitBackdropFilter: s.blur ? `blur(${s.blur}px)` : undefined,
    border:               `${s.borderWidth}px solid ${s.borderColor}`,
    borderRadius:         radiusCSS(s),
    boxShadow:            boxShadow || undefined,
  }
}

export function TileContent({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'task':      return <TaskWidget      widget={widget} />
    case 'note':      return <NoteWidget      widget={widget} />
    case 'timer':     return <TimerWidget     widget={widget} />
    case 'water':     return <WaterWidget     widget={widget} />
    case 'image':     return <ImageWidget     widget={widget} />
    case 'calendar':  return <CalendarWidget  widget={widget} />
    case 'chart':     return <ChartWidget     widget={widget} />
    case 'spreadsheet': return <TableWidget     widget={widget} />
    case 'drawboard':   return <DrawboardWidget widget={widget} />
    case 'clock':       return <ClockWidget     widget={widget} />
    case 'weather':     return <WeatherWidget   widget={widget} />
    case 'map':         return <MapWidget        widget={widget} />
    case 'html':        return <HtmlWidget       widget={widget} />
    case 'sleep':       return <SleepWidget      widget={widget} />
    case 'agenda':      return <AgendaWidget     widget={widget} />
    case 'quicklinks':  return <QuicklinksWidget widget={widget} />
    case 'reader':      return <ReaderWidget     widget={widget} />
    default: return null
  }
}

interface Props {
  widget:             Widget
  gridRef:            React.RefObject<HTMLDivElement | null>
}

interface HeaderAction {
  key: string
  id?: string
  title: string
  danger?: boolean
  active?: boolean
  onClick: (e: React.MouseEvent) => void
  icon: React.ReactNode
}

function TileWrapperInner({ widget, gridRef }: Props) {
  const deleteWidget    = useBoardStore(s => s.deleteWidget)
  const duplicateWidget = useBoardStore(s => s.duplicateWidget)
  const setWidgetLocked = useBoardStore(s => s.setWidgetLocked)
  const moveWidget      = useBoardStore(s => s.moveWidget)
  const currentBoardId  = useBoardStore(s => s.currentBoardId)
  const isInfinite      = useBoardStore(s => (selectBoard(s)?.layoutMode ?? 'infinite') === 'infinite')
  const canvasZoom      = useUIStore(s => isInfinite ? s.canvasView.zoom : 1)
  const mode            = useUIStore(s => s.mode)
  const t                = useT()
  const selectedId      = useUIStore(s => s.selectedId)
  const selectWidget    = useUIStore(s => s.selectWidget)
  const openPanel       = useUIStore(s => s.openPanel)
  const showUndoToast   = useUIStore(s => s.showUndoToast)
  const showActionToast = useUIStore(s => s.showActionToast)
  const isSelected     = selectedId === widget.id
  const isMultiSelected = useUIStore(s => s.multiSelectedIds.includes(widget.id))
  const isLocked       = !!widget.locked

  const cachedStyle = useMemo(() => buildStyle(widget.style, isSelected), [widget.style, isSelected])

  const aiEnabled            = useSettings(s => s.aiEnabled)
  // Läuft für dieses Widget gerade ein KI-Auftrag? (Indikator am ✨-Knopf,
  // auch bei geschlossenem Popover sichtbar)
  const widgetAiRunning      = useWidgetAiStore(s => !!s.running[widget.id])

  // „Zu Board…" — Widget auf ein anderes Board verschieben oder kopieren
  const transferWidget = useBoardStore(s => s.transferWidget)
  const boardCount     = useBoardStore(s => Object.keys(s.boards).length)
  const [transferOpen, setTransferOpen] = useState(false)

  // Header-Container-Ref fürs responsive Kebab-Menü (WidgetHeaderActions
  // beobachtet dessen Breite, um zwischen Button-Reihe und ⋮-Menü umzuschalten)
  const headerRef = useRef<HTMLDivElement>(null)

  // Widget-gepinnter KI-Chat: öffnet neben dem Widget; Seite hängt vom
  // freien Platz rechts im Viewport ab (sonst links), und vertikal wird so
  // verschoben, dass das Fenster nicht unten aus dem Viewport ragt
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [aiChatSide, setAiChatSide] = useState<'left' | 'right'>('right')
  const [aiChatTop,  setAiChatTop]  = useState(0)
  useEffect(() => { if (!isSelected) setAiChatOpen(false) }, [isSelected])
  // Öffnet sich ein Panel (Widget-Stil, Theme, Haupt-KI …), schließt das
  // Widget-Popup — sonst überlappen sich beide Fenster
  const uiPanel = useUIStore(s => s.panel)
  useEffect(() => { if (uiPanel) setAiChatOpen(false) }, [uiPanel])
  function toggleAiChat(e: React.MouseEvent) {
    if (!aiChatOpen) {
      const tile = (e.currentTarget as HTMLElement).closest('[data-widget-tile]')
      const r = tile?.getBoundingClientRect()
      setAiChatSide(r && r.right + 590 > window.innerWidth ? 'left' : 'right')
      // Überstand unten in Viewport-Pixeln → in Canvas-Einheiten umrechnen.
      // Das Popup ist gegenskaliert (WidgetAiChat) und damit immer 440
      // Viewport-Pixel hoch; nur der top-Versatz lebt in Canvas-Einheiten.
      if (r) {
        const isInfinite = (selectBoard(useBoardStore.getState())?.layoutMode ?? 'infinite') === 'infinite'
        const zoom = isInfinite ? useUIStore.getState().canvasView.zoom : 1
        const overflowPx = r.top + 440 - (window.innerHeight - 12)
        setAiChatTop(overflowPx > 0 ? -overflowPx / zoom : 0)
      }
    }
    setAiChatOpen(o => !o)
  }
  const [transferMode,  setTransferMode]  = useState<'move' | 'copy'>('move')
  const [transferQuery, setTransferQuery] = useState('')
  useEffect(() => { if (transferOpen) setTransferQuery('') }, [transferOpen])
  const hasOtherBoards = boardCount > 1
  // Board-Liste erst beim Oeffnen lesen - kein Re-Render bei fremden Board-Aenderungen.
  // Akzentfarbe + Widget-Anzahl je Board machen die Ziele auf einen Blick unterscheidbar.
  const otherBoards = transferOpen
    ? Object.values(useBoardStore.getState().boards).filter(b => b.id !== currentBoardId).map(b => ({
        id: b.id, name: b.name,
        count: Object.keys(b.widgets).length,
        accent: getTheme(b.themeId).cssVars['--accent'] ?? '#8b74f0',
      }))
    : []
  const visibleBoards = transferQuery.trim()
    ? otherBoards.filter(b => b.name.toLowerCase().includes(transferQuery.trim().toLowerCase()))
    : otherBoards

  function doTransfer(targetId: string) {
    const copy = transferMode === 'copy'
    transferWidget(widget.id, targetId, copy)
    setTransferOpen(false)
    const targetName = otherBoards.find(b => b.id === targetId)?.name ?? t('Board')
    showActionToast(
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <WidgetTypeBadge type={widget.type} /> {t('in')} “<strong style={{ color: 'var(--text1)' }}>{targetName}</strong>” {copy ? t('copied') : t('moved')}
      </span>
    )
  }

  // Fokus-Modus: Doppelklick (in Ansichts- UND Bearbeitungsmodus) oeffnet das
  // Widget als Vollbild-Overlay. Interaktive Bereiche (Editoren, Karten,
  // Zeichenflaeche, Eingaben) bleiben ausgenommen. Ein stehender Doppelklick
  // startet kein Dragging (dnd-kit braucht 8px Bewegung, siehe BoardGrid).
  const setFocusedWidget = useUIStore(s => s.setFocusedWidget)
  function handleFocusDblClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, button, a, select, [contenteditable="true"], .ProseMirror, canvas, .leaflet-container')) return
    setFocusedWidget(widget.id)
  }

  useEffect(() => {
    if (!transferOpen) return
    const fn = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[data-transfer-menu]'))) setTransferOpen(false)
    }
    document.addEventListener('pointerdown', fn)
    return () => document.removeEventListener('pointerdown', fn)
  }, [transferOpen])

  const transferMenu = transferOpen ? (
    <motion.div data-transfer-menu onPointerDown={e => e.stopPropagation()}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        position: 'absolute', top: 34, right: 8, zIndex: 40, width: 228,
        background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 12px 40px color-mix(in srgb, var(--shadow-color, #000) 45%, transparent)',
        padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
      {/* Modus-Umschalter: gleitende Akzent-Pille (SlidingTabs) */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
        <SlidingTabs<'move' | 'copy'>
          options={[
            {
              value: 'move', label: t('Move'),
              icon: (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
                </svg>
              ),
            },
            {
              value: 'copy', label: t('Copy'),
              icon: (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
                </svg>
              ),
            },
          ]}
          value={transferMode}
          onChange={setTransferMode}
          slotH={24} radius={6}
        />
      </div>

      {/* Suchfeld erst, wenn die Liste unübersichtlich wird */}
      {otherBoards.length > 5 && (
        <input
          autoFocus
          value={transferQuery}
          onChange={e => setTransferQuery(e.target.value)}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setTransferOpen(false) }}
          placeholder={t('Search boards…')}
          style={{
            fontSize: 11, padding: '5px 9px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text1)', outline: 'none', width: '100%',
          }}
        />
      )}

      <div style={{ maxHeight: 208, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleBoards.map(b => (
          <button key={b.id} onClick={() => doTransfer(b.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 12%, transparent)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            {/* Theme-Akzentpunkt des Zielboards — Wiedererkennung auf einen Blick */}
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.accent, boxShadow: `0 0 6px ${b.accent}`, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text1)' }}>{b.name}</span>
            <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>
              {b.count} {b.count === 1 ? t('Widget') : t('Widgets')}
            </span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        ))}
        {visibleBoards.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '10px 0' }}>
            {t('No results for')} „{transferQuery.trim()}“
          </div>
        )}
      </div>
    </motion.div>
  ) : null

  const IconToBoard = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
    </svg>
  )

  const resizeStart = useRef<{ dir: string; ox: number; oy: number; col: number; row: number; colSpan: number; rowSpan: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<{ col: number; row: number; colSpan: number; rowSpan: number } | null>(null)

  const contentRefCallback = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    function onWheel(e: WheelEvent) {
      const target = e.target as HTMLElement
      let node: HTMLElement | null = target
      while (node && node !== el) {
        const style = window.getComputedStyle(node)
        const factor = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? node.clientHeight : 1
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight + 1) {
          node.scrollTop += e.deltaY * factor
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if ((style.overflowX === 'auto' || style.overflowX === 'scroll') &&
            node.scrollWidth > node.clientWidth + 1) {
          node.scrollLeft += e.deltaX * factor
          e.preventDefault()
          e.stopPropagation()
          return
        }
        node = node.parentElement
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function handleDelete() {
    openPanel(null)
    showUndoToast({ widget, boardId: currentBoardId })
    deleteWidget(widget.id)
    selectWidget(null)
  }

  // Gemeinsame Aktions-Liste für Desktop-/Mobil-Header — einmal berechnet,
  // dreifach verwendet (normale Reihe, unsichtbarer Mess-Klon, Kebab-Dropdown)
  const headerActions: HeaderAction[] = [
    ...(aiEnabled ? [{ key: 'ai', title: t('Edit with AI'), onClick: toggleAiChat, active: aiChatOpen || widgetAiRunning, icon: <IconSparkleTile spinning={widgetAiRunning} /> }] : []),
    { key: 'focus', title: t('Focus mode'), onClick: () => setFocusedWidget(widget.id), icon: <IconExpand /> },
    {
      key: 'lock', title: isLocked ? t('Unlock') : t('Lock'), onClick: () => setWidgetLocked(widget.id, !isLocked),
      icon: isLocked
        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    },
    ...(!isLocked ? [{ key: 'duplicate', title: t('Duplicate'), onClick: () => duplicateWidget(widget.id), icon: <IconDuplicate /> }] : []),
    ...(!isLocked && hasOtherBoards ? [{ key: 'transfer', title: t('Move/copy to board'), onClick: () => setTransferOpen(o => !o), icon: IconToBoard }] : []),
    ...(!isLocked ? [{ key: 'style', id: 'tour-widget-style-btn', title: t('Style'), onClick: () => openPanel('widgetStyle'), icon: <IconSliders /> }] : []),
    ...(!isLocked ? [{ key: 'delete', title: t('Delete'), danger: true, onClick: handleDelete, icon: <IconX /> }] : []),
  ]

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id:       widget.id,
    disabled: mode !== 'edit' || isLocked,
    data:     { widgetType: widget.type },
  })

  const effCol     = resizePreview?.col     ?? widget.pos.col
  const effRow     = resizePreview?.row     ?? widget.pos.row
  const effColSpan = resizePreview?.colSpan ?? widget.pos.colSpan
  const effRowSpan = resizePreview?.rowSpan ?? widget.pos.rowSpan

  function onResizePointerDown(e: React.PointerEvent, dir: string) {
    e.stopPropagation()
    e.preventDefault()
    resizeStart.current = {
      dir, ox: e.clientX, oy: e.clientY,
      col: widget.pos.col, row: widget.pos.row,
      colSpan: widget.pos.colSpan, rowSpan: widget.pos.rowSpan,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const MIN_SPANS: Partial<Record<string, { colSpan: number; rowSpan: number }>> = {
    task:        { colSpan: 3, rowSpan: 2 },
    calendar:    { colSpan: 4, rowSpan: 2 },
    chart:       { colSpan: 3, rowSpan: 2 },
    spreadsheet: { colSpan: 4, rowSpan: 2 },
    drawboard:   { colSpan: 3, rowSpan: 2 },
    map:         { colSpan: 3, rowSpan: 2 },
    // rowSpan war 1 — bei nur 112px Höhe wurde entweder die Stats-Zeile
    // (gefühlt/Feuchtigkeit/Wind) oder die Hero-Temperatur abgeschnitten,
    // weil beide plus die Stadt-Zeile nicht in eine Grid-Reihe passen.
    weather:     { colSpan: 3, rowSpan: 2 },
    clock:       { colSpan: 2, rowSpan: 1 },
    // War 2×1 — seit der Note-Widget-Erweiterung um die Text-Widget-
    // Funktionen (Schrift/Größe/B/I/U/Ausrichtung/Farbe/Schatten/Kontur/
    // Zeilenhöhe) trägt Note dieselbe mehrzeilige Toolbar wie früher das
    // Text-Widget — braucht also auch dessen Mindestgröße.
    note:        { colSpan: 4, rowSpan: 2 },
    water:       { colSpan: 2, rowSpan: 1 },
    image:       { colSpan: 2, rowSpan: 1 },
    sleep:       { colSpan: 3, rowSpan: 2 },
    agenda:      { colSpan: 2, rowSpan: 2 },
    quicklinks:  { colSpan: 2, rowSpan: 1 },
    // Fehlte komplett — ließ sich auf 1×1 schrumpfen und quetschte den fixen
    // 160px-Ring samt Start/Pause/Reset-Buttons unbenutzbar zusammen.
    timer:       { colSpan: 2, rowSpan: 2 },
    // Toolbar + Seiten-/Highlight-Sidebar brauchen spürbar mehr Platz als
    // andere Widgets, um nicht komplett unbedienbar zu werden.
    reader:      { colSpan: 4, rowSpan: 3 },
  }

  function onResizePointerMove(e: React.PointerEvent) {
    const rs = resizeStart.current
    if (!rs || !gridRef.current) return

    // In infinite mode: fixed cell size scaled by canvas zoom; in grid mode: fraction of grid width
    const colW = isInfinite
      ? (INFINITE_COL_W + GRID_GAP) * canvasZoom
      : (gridRef.current.clientWidth - 2 * GRID_GAP + GRID_GAP) / GRID_COLS
    const rowH  = (GRID_ROW_H + GRID_GAP) * (isInfinite ? canvasZoom : 1)
    const maxCols = isInfinite ? INFINITE_GRID_COLS : GRID_COLS

    const minCS = MIN_SPANS[widget.type]?.colSpan ?? 1
    const minRS = MIN_SPANS[widget.type]?.rowSpan ?? 1

    let newCol     = rs.col
    let newRow     = rs.row
    let newColSpan = rs.colSpan
    let newRowSpan = rs.rowSpan

    if (rs.dir.includes('e')) {
      const maxCS = maxCols - rs.col + 1
      newColSpan = Math.max(minCS, Math.min(maxCS, rs.colSpan + Math.round((e.clientX - rs.ox) / colW)))
    }
    if (rs.dir.includes('s')) {
      newRowSpan = Math.max(minRS, rs.rowSpan + Math.round((e.clientY - rs.oy) / rowH))
    }
    if (rs.dir.includes('w')) {
      const delta = Math.round((e.clientX - rs.ox) / colW)
      newCol     = Math.max(1, rs.col + delta)
      newColSpan = Math.max(minCS, rs.colSpan - (newCol - rs.col))
      if (newColSpan !== rs.colSpan - (newCol - rs.col)) newCol = rs.col + rs.colSpan - newColSpan
    }
    if (rs.dir.includes('n')) {
      const delta = Math.round((e.clientY - rs.oy) / rowH)
      newRow     = Math.max(1, rs.row + delta)
      newRowSpan = Math.max(minRS, rs.rowSpan - (newRow - rs.row))
      if (newRowSpan !== rs.rowSpan - (newRow - rs.row)) newRow = rs.row + rs.rowSpan - newRowSpan
    }

    setResizePreview({ col: newCol, row: newRow, colSpan: newColSpan, rowSpan: newRowSpan })
  }

  function onResizePointerUp() {
    if (resizePreview) {
      moveWidget(widget.id, {
        col:     resizePreview.col,
        row:     resizePreview.row,
        colSpan: resizePreview.colSpan,
        rowSpan: resizePreview.rowSpan,
      })
    }
    resizeStart.current = null
    setResizePreview(null)
  }

  const handleStyle: React.CSSProperties = {
    position: 'absolute', zIndex: 20, background: 'var(--accent)',
    border: '2px solid var(--bg)', borderRadius: 4, touchAction: 'none',
  }

  const isTransparent = (widget.type === 'note' && !!widget.data?.noBg) ||
    (widget.type === 'image' && !!widget.data?.noBar) ||
    (widget.type === 'clock' && !!widget.data?.noBg)

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && mode === 'edit' && !isLocked) {
      const ui = useUIStore.getState()
      if (ui.multiSelectedIds.length === 0 && ui.selectedId && ui.selectedId !== widget.id) {
        ui.setMultiSelectedIds([ui.selectedId, widget.id])
      } else {
        ui.toggleMultiSelect(widget.id)
      }
      ui.selectWidget(null)
      return
    }
    useUIStore.getState().clearMultiSelect()
    selectWidget(widget.id)
  }

  // ── Desktop card ──────────────────────────────────────────────────────────────
  return (
    <motion.div
      id={`widget-${widget.id}`}
      data-widget-tile={widget.id}
      onDoubleClick={handleFocusDblClick}
      style={{
        gridColumn: `${effCol} / span ${effColSpan}`,
        gridRow:    `${effRow} / span ${effRowSpan}`,
        position:   'relative',
        opacity:    isDragging ? 0 : 1,
        transition: isDragging ? 'none' : undefined,
        // Offener Widget-KI-Chat: Kachel über ALLE anderen Widgets heben —
        // der Chat rendert absolut innerhalb der Kachel und wäre sonst im
        // Stacking-Context von Nachbarn mit höherem (gebumptem) zIndex gefangen
        zIndex:     aiChatOpen ? 700 : isSelected ? (widget.zIndex ?? 1) + 10 : (widget.zIndex ?? 1),
        pointerEvents: isDragging ? 'none' : undefined,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: isDragging ? 0 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ opacity: { duration: isDragging ? 0 : 0.18 }, scale: { duration: 0.18 } }}
    >
      {/* Resize handles — all 4 sides centered + corner */}
      {mode === 'edit' && isSelected && !isLocked && (
        <>
          {/* Top */}
          <div style={{ ...handleStyle, top: -7, left: 'calc(50% - 20px)', width: 40, height: 14, cursor: 'n-resize', borderRadius: 7 }}
            onPointerDown={e => onResizePointerDown(e, 'n')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
          {/* Right */}
          <div style={{ ...handleStyle, right: -7, top: 'calc(50% - 20px)', width: 14, height: 40, cursor: 'e-resize', borderRadius: 7 }}
            onPointerDown={e => onResizePointerDown(e, 'e')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
          {/* Bottom */}
          <div style={{ ...handleStyle, bottom: -7, left: 'calc(50% - 20px)', width: 40, height: 14, cursor: 's-resize', borderRadius: 7 }}
            onPointerDown={e => onResizePointerDown(e, 's')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
          {/* Left */}
          <div style={{ ...handleStyle, left: -7, top: 'calc(50% - 20px)', width: 14, height: 40, cursor: 'w-resize', borderRadius: 7 }}
            onPointerDown={e => onResizePointerDown(e, 'w')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
          {/* Corner */}
          <div style={{ ...handleStyle, right: -7, bottom: -7, width: 18, height: 18, cursor: 'se-resize' }}
            onPointerDown={e => onResizePointerDown(e, 'se')}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
        </>
      )}

      <div
        onClick={handleClick}
        style={{
          ...(isTransparent
            ? {
                background:           'transparent',
                backdropFilter:       undefined,
                WebkitBackdropFilter: undefined,
                border:               isSelected ? '1px dashed var(--accent)' : isMultiSelected ? '1px dashed #ef4444' : '1px dashed transparent',
                borderRadius:         radiusCSS(widget.style),
                boxShadow:            isSelected ? '0 0 0 1px var(--accent)' : isMultiSelected ? '0 0 0 2px #ef4444, 0 0 12px rgba(239,68,68,0.5)' : 'none',
              }
            : {
                ...cachedStyle,
                boxShadow: isMultiSelected && !isSelected
                  ? [
                      '0 0 0 2px #ef4444',
                      '0 0 14px rgba(239,68,68,0.55)',
                      widget.style.glowColor && widget.style.glowSize ? `0 0 ${widget.style.glowSize}px ${widget.style.glowColor}` : '',
                      { none:'', sm:'0 1px 4px rgba(0,0,0,.35)', md:'0 4px 16px rgba(0,0,0,.4)', lg:'0 8px 30px rgba(0,0,0,.5)', xl:'0 16px 48px rgba(0,0,0,.6)' }[widget.style.shadow],
                    ].filter(Boolean).join(', ')
                  : cachedStyle.boxShadow,
              }
          ),
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Header: always in edit mode; hidden in view mode when transparent */}
        {(!isTransparent || mode === 'edit') && (
          <div
            ref={el => { setDragRef(el); headerRef.current = el }}
            {...(mode === 'edit' && !isLocked ? { ...attributes, ...listeners } : {})}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px 5px',
              borderBottom: isTransparent ? 'none' : '1px solid var(--border)',
              background: isTransparent ? 'rgba(0,0,0,0.25)' : undefined,
              backdropFilter: isTransparent ? 'blur(4px)' : undefined,
              borderRadius: isTransparent ? topRadiusCSS(widget.style) : undefined,
              cursor: mode === 'edit' && !isLocked ? 'grab' : 'default',
              flexShrink: 0, userSelect: 'none',
            }}
          >
            {mode === 'edit' && !isLocked && <span style={{ opacity: 0.35, color: 'var(--text2)', display:'flex' }}><IconDrag /></span>}
            {mode === 'edit' && isLocked && (
              <span style={{ opacity: 0.5, color: 'var(--accent)', display:'flex', flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
            )}
            <span style={{ opacity: 0.55, color: 'var(--text2)', display:'flex' }}>{widgetTypeIcon(widget)}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {t(TYPE_LABELS[widget.type])}
              {/* Notiz-Name = erste Markdown-Überschrift im Inhalt (s. lib/noteTitle.ts) —
                  steht neben dem Typ, ersetzt ihn nicht */}
              {widget.type === 'note' && (() => {
                const title = extractNoteTitle(widget.data.content as string | undefined)
                return title && (
                  <span style={{ textTransform: 'none', fontWeight: 600, color: 'var(--text2)' }}>
                    {' · '}
                    <span dangerouslySetInnerHTML={{ __html: renderNoteTitleHtml(title) }} />
                  </span>
                )
              })()}
            </span>
            {mode === 'edit' && isSelected && (
              <WidgetHeaderActions actions={headerActions} headerRef={headerRef} canvasZoom={canvasZoom} />
            )}
          </div>
        )}

        <div ref={contentRefCallback} data-widget-content style={{ flex: 1, padding: widget.type === 'image' || widget.type === 'spreadsheet' || widget.type === 'map' ? 0 : '10px 12px', overflow: 'hidden', minHeight: 0 }}>
          <WidgetErrorBoundary><TileContent widget={widget} /></WidgetErrorBoundary>
        </div>
      </div>

      {transferMenu}
      {aiChatOpen && <WidgetAiChat widget={widget} label={t(TYPE_LABELS[widget.type] ?? widget.type)} side={aiChatSide} top={aiChatTop} onClose={() => setAiChatOpen(false)} />}
    </motion.div>
  )
}

const TileWrapper = memo(TileWrapperInner, (prev, next) => prev.widget === next.widget)
export default TileWrapper

// Responsive Header-Aktionen: normale Button-Reihe, solange genug Platz ist —
// sobald der Header (Widget-Titel + Aktionen) nicht mehr in den verfügbaren
// Platz passt, klappt die Reihe animiert zu einem einzelnen ⋮-Button zusammen,
// der beim Klick dieselben Aktionen als vertikales Dropdown zeigt (bleibt
// offen bis Outside-Click — gleiches Muster wie das "Zu Board…"-Menü oben).
// Die Breitenmessung nutzt einen unsichtbaren Klon der vollen Reihe
// (position:absolute, visibility:hidden) statt fester Pixel-Budgets pro
// Button, damit sie automatisch mit der jeweils sichtbaren Aktionsmenge
// (isLocked/hasOtherBoards/aiEnabled…) mitgeht.
function WidgetHeaderActions({
  actions, headerRef, canvasZoom,
}: {
  actions: HeaderAction[]
  headerRef: React.RefObject<HTMLDivElement | null>
  canvasZoom: number
}) {
  const t = useT()
  const measureRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const gap = 2
  // Platz, der dem Icon + einem minimal lesbaren Titel-Rest links im Header
  // vorbehalten bleibt, bevor die Aktionen kollabieren dürfen.
  const minLeftReserve = 70

  useLayoutEffect(() => {
    const header = headerRef.current
    const measure = measureRef.current
    if (!header || !measure) { setCollapsed(false); return }
    // clientWidth/scrollWidth are pre-transform LAYOUT sizes — ResizeObserver
    // and clientWidth are both spec'd to ignore CSS transforms entirely, so
    // they stay exactly the same no matter how far the infinite canvas is
    // zoomed out (InfiniteCanvas applies zoom via transform: scale() on an
    // ancestor). A widget rendered at 20% zoom could still measure "482px
    // available" in layout space while actually occupying ~80 real screen
    // pixels — the row would never collapse no matter how visually tiny it
    // got. getBoundingClientRect() reports the actual on-screen (post-
    // transform) size instead, so both sides of this comparison scale down
    // together with zoom the way they visually do; minLeftReserve is left
    // un-scaled on purpose since it represents a genuine minimum number of
    // real screen pixels we want reserved, not a fraction of layout space.
    const check = () => setCollapsed(measure.getBoundingClientRect().width + minLeftReserve > header.getBoundingClientRect().width)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(header)
    return () => ro.disconnect()
  }, [headerRef, minLeftReserve, actions.length, canvasZoom])

  useEffect(() => {
    if (!menuOpen) return
    const fn = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[data-header-kebab-menu]'))) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', fn)
    return () => document.removeEventListener('pointerdown', fn)
  }, [menuOpen])

  useEffect(() => { if (collapsed === false) setMenuOpen(false) }, [collapsed])

  return (
    <div style={{ position: 'relative', display: 'flex' }} onPointerDown={e => e.stopPropagation()}>
      {/* Unsichtbarer Mess-Klon — nie sichtbar, nimmt keinen Platz im Layout ein */}
      <div ref={measureRef} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', top: 0, left: 0, display: 'flex', gap, whiteSpace: 'nowrap' }} aria-hidden>
        {actions.map(a => (
          <IconBtn key={a.key} title={a.title} onClick={() => {}} danger={a.danger} active={a.active}>{a.icon}</IconBtn>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          <motion.div key="kebab" data-header-kebab-menu
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12 }}
            style={{ position: 'relative' }}
          >
            <IconBtn title={t('More actions')} onClick={() => setMenuOpen(o => !o)} active={menuOpen}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              </svg>
            </IconBtn>
            {menuOpen && (
              <motion.div data-header-kebab-menu
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, minWidth: 176,
                  background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                  backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--border)', borderRadius: 12,
                  boxShadow: '0 12px 40px color-mix(in srgb, var(--shadow-color, #000) 45%, transparent)',
                  padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                {actions.map(a => (
                  <button key={a.key} id={a.id}
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); a.onClick(e) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      width: '100%', padding: '7px 10px', textAlign: 'left',
                      border: 'none', cursor: 'pointer', borderRadius: 8,
                      background: 'transparent',
                      color: a.danger ? 'var(--danger)' : a.active ? 'var(--accent)' : 'var(--text1)',
                      fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = a.danger ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'color-mix(in srgb, var(--text1) 6%, transparent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ display: 'flex', flexShrink: 0, opacity: 0.85 }}>{a.icon}</span>
                    {a.title}
                  </button>
                ))}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div key="row"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12 }}
            style={{ display: 'flex', gap }}
          >
            {actions.map(a => (
              <IconBtn key={a.key} id={a.id} title={a.title} onClick={a.onClick} danger={a.danger} active={a.active}>{a.icon}</IconBtn>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function IconBtn({ children, onClick, title, danger, active, id }: {
  children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title?: string; danger?: boolean; active?: boolean; id?: string
}) {
  return (
    <button
      id={id}
      title={title}
      aria-label={title}
      onClick={e => { e.stopPropagation(); onClick(e) }}
      style={{
        width: 24, height: 24, borderRadius: 8, border: 'none', fontSize: 12,
        background: active ? 'var(--accent)' : 'var(--surface2)',
        color: danger ? 'var(--danger)' : active ? 'white' : 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >{children}</button>
  )
}

function IconSparkleTile({ spinning }: { spinning?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'pulse-ring 1.2s ease-in-out infinite' } : undefined}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>
    </svg>
  )
}
