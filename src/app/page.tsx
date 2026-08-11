'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, useMotionValue, useSpring, type MotionValue } from 'framer-motion'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent, type DragMoveEvent,
} from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import { useBoardStore } from '@/store/boardStore'
import { useSettings } from '@/store/settingsStore'
import { getTheme } from '@/lib/themes'
import { defaultWidget } from '@/lib/defaults'
import { collectBlobRefs, pruneBlobs } from '@/lib/blobStore'
import { buildFullBackupPayload, buildBoardBackupPayload, downloadJson, boardExportFilename, fullBackupFilename } from '@/lib/backup'
import SettingsModal from '@/components/ui/SettingsModal'
import HomeTutorialTour from '@/components/ui/HomeTutorialTour'
import WidgetLayoutPreview from '@/components/ui/WidgetLayoutPreview'
import { TYPE_ICONS, TYPE_LABELS } from '@/components/board/TileWrapper'
import { useT } from '@/hooks/useT'
import type { Board, WidgetType } from '@/types'

// Waehlbare Ordnerfarben (Kachel-Rahmen + Tint der Ordner-Kacheln)
const FOLDER_COLORS = ['#7c6fe8', '#5b8fff', '#4ecdc4', '#5fd68a', '#f5c04b', '#f58b4b', '#ef5b6e', '#e46bd8', '#8a93a8']

// Gleiches Muster wie TopBar.tsx's kbdBadgeStyle — eigene Konstante hier, da
// TopBar sie nicht exportiert und die Board-Auswahl ein komplett anderes
// Shortcut-Set (keyboardShortcutsHome) mit eigenen Badges braucht.
const kbdBadgeStyle: React.CSSProperties = {
  position: 'absolute', top: -6, right: -4,
  fontSize: 8, fontWeight: 700, color: 'var(--text3)',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '1px 3px', pointerEvents: 'none',
  lineHeight: 1,
}

// ── Mini-Map: echte Layout-Vorschau eines Boards ──────────────────────────────
// Hintergrund = echter Board-Hintergrund; Widget-Rechtecke einfarbig
// in der Akzentfarbe des jeweiligen Board-Themes.

function BoardMiniMap({ board }: { board: Board }) {
  const t = useT()
  const items = Object.values(board.widgets).map(w => ({
    col: w.pos.col, row: w.pos.row, colSpan: w.pos.colSpan, rowSpan: w.pos.rowSpan,
  }))
  const accent = getTheme(board.themeId).cssVars['--accent'] ?? '#7c6fe8'
  return <WidgetLayoutPreview items={items} accent={accent} emptyLabel={t('Empty board')} />
}

// ── Board-Hintergrund für die Vorschau-Kachel ─────────────────────────────────

function bgPreview(board: Board): React.CSSProperties {
  const bg = board.bg
  if (bg.type === 'gradient') {
    const dirs: Record<string, string> = {
      'to-r':'90deg','to-br':'135deg','to-b':'180deg','to-bl':'225deg',
      'to-l':'270deg','to-tl':'315deg','to-t':'0deg','to-tr':'45deg',
    }
    return { backgroundImage: `linear-gradient(${dirs[bg.gradientDir]}, ${bg.gradient[0]}, ${bg.gradient[1]})` }
  }
  if (bg.type === 'image' && bg.imageUrl) {
    return { backgroundImage: `url(${bg.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { backgroundColor: bg.color }
}

function timeAgo(ts: number, t: (s: string) => string) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return t('Just now')
  if (s < 3600)  return t('{n} min ago').replace('{n}', String(Math.floor(s / 60)))
  if (s < 86400) return t('{n} hr ago').replace('{n}', String(Math.floor(s / 3600)))
  const days = Math.floor(s / 86400)
  return days === 1 ? t('1 day ago') : t('{n} days ago').replace('{n}', String(days))
}

// ── Board-Vorlagen ────────────────────────────────────────────────────────────

interface TemplateWidget { type: WidgetType; col: number; row: number; colSpan: number; rowSpan: number }
interface Template { id: string; label: string; desc: string; icon: React.ReactNode; widgets: TemplateWidget[]; custom?: boolean }

const TplIcon = ({ children }: { children: React.ReactNode }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

// label/desc sind englische Quelltexte (Default-Sprache) — an Verwendungsstellen mit t() übersetzen
const TEMPLATES: Template[] = [
  {
    id: 'empty', label: 'Empty', desc: 'Free space',
    icon: <TplIcon><rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3 3"/></TplIcon>,
    widgets: [],
  },
  {
    id: 'produktiv', label: 'Productivity', desc: 'Tasks, agenda, timer, note',
    icon: <TplIcon><circle cx="12" cy="12" r="9"/><polyline points="8,12 11,15 16,9"/></TplIcon>,
    widgets: [
      { type: 'task',   col: 46, row: 47, colSpan: 4, rowSpan: 2 },
      { type: 'agenda', col: 50, row: 47, colSpan: 3, rowSpan: 2 },
      { type: 'timer',  col: 53, row: 47, colSpan: 3, rowSpan: 3 },
      { type: 'note',   col: 46, row: 49, colSpan: 6, rowSpan: 2 },
    ],
  },
  {
    id: 'gesund', label: 'Health', desc: 'Water, sleep, habits',
    icon: <TplIcon><path d="M12 21s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 6 14.5 5 16.5 5c3.5 0 6 3.5 4.5 7-2 4.5-9 9-9 9z"/></TplIcon>,
    widgets: [
      { type: 'water', col: 46, row: 47, colSpan: 3, rowSpan: 3 },
      { type: 'sleep', col: 49, row: 47, colSpan: 4, rowSpan: 2 },
      { type: 'task',  col: 49, row: 49, colSpan: 4, rowSpan: 2 },
    ],
  },
  {
    id: 'studium', label: 'Study', desc: 'Reader, note, calendar, timer',
    icon: <TplIcon><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></TplIcon>,
    widgets: [
      { type: 'reader',   col: 46, row: 47, colSpan: 6, rowSpan: 4 },
      { type: 'note',     col: 52, row: 47, colSpan: 4, rowSpan: 2 },
      { type: 'timer',    col: 56, row: 47, colSpan: 3, rowSpan: 3 },
      { type: 'calendar', col: 52, row: 49, colSpan: 4, rowSpan: 3 },
    ],
  },
]

// ── Drag & Drop: Boards in/aus Ordnern ziehen ─────────────────────────────────

// Macht eine Board-Karte greifbar. `disabled` verhindert Drag-Start während des
// Umbenennens (sonst würde Text-Markieren im Namensfeld als Ziehen interpretiert).
function DraggableBoardCard({ board, disabled, children }: { board: Board; disabled?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: board.id, disabled })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      // dnd-kit macht dieses div per tabIndex fokussierbar — ohne outline:none
      // zeigt der Browser beim Greifen/Ziehen seinen nativen (blauen) Fokusring,
      // unabhängig vom App-Theme.
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: 'none', outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
      {children}
    </div>
  )
}

// Schwebende Vorschau, die dem Zeiger folgt, während ein Board gezogen wird —
// zeigt die Karte selbst (Mini-Map + Fußzeile), keinen abstrakten Namens-Chip.
// `rotate` ist ein federgedämpfter MotionValue (siehe handleDragMove in HomePage):
// schnelle Seitwärtsbewegung lässt die Karte wie an einem Faden mitschwingen,
// in Ruhe pendelt sie zur leichten Grund-Neigung zurück.
function DragPreviewCard({ board, rotate }: { board: Board | undefined; rotate: MotionValue<number> }) {
  const t = useT()
  if (!board) return null
  return (
    <motion.div style={{
      width: 280, borderRadius: 18, boxSizing: 'border-box',
      border: '2px solid var(--accent)',
      // Nur noch der weiche Tiefenschatten hier — der Akzentring läuft als
      // echter Border statt als zweiter box-shadow-Layer. Zwei box-shadows auf
      // einer rotierten, abgerundeten Box konnten in Chromium eine winzige
      // Subpixel-Naht an der Rundung erzeugen (die "Lücke" im Rahmen).
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      cursor: 'grabbing', scale: 1.04, rotate,
    }}>
      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ height: 140, position: 'relative', ...bgPreview(board) }}>
          <BoardMiniMap board={board} />
          {board.pinned && (
            <div style={{
              position: 'absolute', top: 10, left: 10,
              width: 22, height: 22, borderRadius: 7,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PinIcon filled />
            </div>
          )}
        </div>
        <div style={{ padding: '12px 16px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {board.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }} suppressHydrationWarning>
            {timeAgo(board.lastEdited, t)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// Eine Ordner-Sektion (Kachel/Leiste + Kopfzeile + Board-Raster) als eigene
// Komponente, damit useDroppable() korrekt pro Ordner aufgerufen wird — nicht
// direkt in der .map()-Schleife der Seite (verletzt sonst die Hook-Regeln).
function FolderSection({
  folder, list, color, collapsed, animations, menuOpen,
  onToggleFolder, onToggleMenu, onSetColor, onDuplicate, onRequestDelete, onRequestRename,
  renderBoardCard,
}: {
  folder: string
  list: Board[]
  color: string
  collapsed: boolean
  animations: boolean
  menuOpen: boolean
  onToggleFolder: () => void
  onToggleMenu: () => void
  onSetColor: (c: string) => void
  onDuplicate: () => void
  onRequestDelete: () => void
  onRequestRename: () => void
  renderBoardCard: (board: Board, i: number) => React.ReactNode
}) {
  const t = useT()
  const { isOver, setNodeRef } = useDroppable({ id: `folder:${folder}` })
  const ease: [number, number, number, number] = [0.32, 0.72, 0, 1]
  const easeCss = 'cubic-bezier(0.32, 0.72, 0, 1)'
  const dur = animations ? 0.35 : 0
  // Exakte Rasterbreite für N Karten (Karte 280 + Lücke 20 dazwischen) — dient
  // sowohl der Kachelbreite als auch als maxWidth des Rasters selbst (siehe unten).
  const gridWidth = list.length * 280 + Math.max(0, list.length - 1) * 20
  // Kachel-/Leistenbreite spiegelt die Board-Anzahl wider; wächst/schrumpft
  // animiert. Puffer 40px statt exakt padding+border (32+3=35): schon 1px zu
  // wenig ließ auf manchen Geräten/Zoomstufen (Subpixel-Rundung) die letzte
  // Spalte nicht mehr passen — das Raster brach dann fälschlich um, obwohl
  // genug Platz da war. Der zusätzliche Puffer fängt solche Rundungsfehler ab.
  const tileW = Math.max(320, gridWidth + 40)

  return (
    <div style={{ padding: '14px 36px 0', position: 'relative', zIndex: menuOpen ? 60 : undefined }}>
      {/* Breite wird NIE animiert (kein `transition: width`, auch nicht via
          Framer Motion): Egal ob CSS-Transition oder Framer-Motion-`animate`,
          beide wenden den neuen Wert erst einen Frame NACH dem Commit an, in
          dem React bereits die neue Kartenzahl ins Raster gerendert hat — für
          diesen einen Frame stand die Box dann noch auf der alten, schmaleren
          Breite, wodurch die gerade hineingezogene Karte kurz in die nächste
          Zeile rutschte (sichtbar besonders beim Reinziehen aus dem Hauptraster).
          Ein React-`setState`-während-des-Renderns-Trick, um das nur beim
          Wachsen abzuschalten, greift ebenfalls nicht: React verwirft den
          Zwischen-Render mit der abweichenden Dauer sofort wieder, bevor er
          je gemalt wird — comitted wird nur der Folge-Render mit der normalen
          (animierten) Dauer. Padding bleibt weich animiert, da es die
          Spaltenzahl des Rasters nicht beeinflusst. */}
      <div
        ref={setNodeRef}
        style={{
          width: tileW,
          paddingTop: collapsed ? 7 : 12,
          paddingBottom: collapsed ? 7 : 18,
          // Radius bleibt konstant — bei der flachen Leiste klemmt CSS ihn
          // automatisch auf die halbe Höhe (= Pillenform), ohne Ecken-Springen
          borderRadius: 18,
          maxWidth: '100%', boxSizing: 'border-box',
          // overflow bleibt sichtbar, damit das ⋯-Menü auch aus der
          // zugeklappten Leiste herausragen kann — das Höhen-Clipping
          // übernimmt das innere Raster-Element selbst
          paddingLeft: 16, paddingRight: 16, overflow: 'visible',
          border: `1.5px solid color-mix(in srgb, ${color} ${isOver ? 65 : (collapsed ? 45 : 40)}%, var(--border))`,
          background: `color-mix(in srgb, ${color} ${isOver ? 15 : (collapsed ? 10 : 6)}%, var(--surface))`,
          boxShadow: isOver ? `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` : 'none',
          transition: `padding-top ${dur}s ${easeCss}, padding-bottom ${dur}s ${easeCss}, background 0.2s, border-color 0.2s, box-shadow 0.2s`,
        }}
      >
        {/* Kopfzeile — in beiden Zuständen identisch aufgebaut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            onClick={onToggleFolder} aria-expanded={!collapsed}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text2)', padding: 0, flex: 1, minWidth: 0, textAlign: 'left',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.22s', flexShrink: 0 }}>
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{folder}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {list.length === 0 ? t('Empty') : `${list.length} ${list.length !== 1 ? t('Boards') : t('Board')}`}
            </span>
          </button>
          <div data-folder-menu style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); onToggleMenu() }}
              title={t('Folder actions')} aria-label={`${t('Folder actions for')} ${folder}`} aria-haspopup="menu"
              style={{
                width: 22, height: 22, borderRadius: 7, cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: menuOpen ? `color-mix(in srgb, ${color} 18%, var(--surface))` : 'none',
                border: 'none', color: 'var(--text2)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
              </svg>
            </button>
            {menuOpen && (
              <div role="menu" style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 150,
                minWidth: 200, overflow: 'hidden', padding: '10px 0 4px',
                background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.42)',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', padding: '0 12px 7px' }}>
                  {t('Folder color')}
                </div>
                <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px', flexWrap: 'wrap' }}>
                  {FOLDER_COLORS.map(c => (
                    <button key={c}
                      onClick={e => { e.stopPropagation(); onSetColor(c) }}
                      title={c} aria-label={`${t('Color')} ${c}`}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', padding: 0,
                        background: c,
                        border: c === color ? '2px solid var(--text1)' : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>
                {([
                  { label: t('Rename folder'), danger: false, icon: <MenuIco d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>, action: onRequestRename },
                  { label: t('Duplicate folder'), danger: false, icon: <MenuIco d="M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>, action: onDuplicate },
                  { label: t('Delete folder'), danger: true, icon: <MenuIco d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>, action: onRequestDelete },
                ]).map(item => (
                  <button key={item.label} role="menuitem"
                    onClick={e => { e.stopPropagation(); item.action() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      width: '100%', padding: '7px 12px', textAlign: 'left',
                      border: 'none', cursor: 'pointer',
                      borderTop: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
                      background: 'transparent',
                      color: item.danger ? 'var(--danger)' : 'var(--text1)',
                      fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = item.danger ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'color-mix(in srgb, var(--text1) 5%, transparent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ display: 'flex', flexShrink: 0, opacity: 0.75 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Board-Raster klappt mit Höhen-Animation auf/zu */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="grid"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: dur, ease }}
              // overflow:hidden (nötig fürs Zuklappen) schneidet an der eigenen Boxkante
              // ab — bei height:'auto' sitzt sie exakt auf den äußeren Karten, ohne
              // Puffer für deren Schatten. Minus-Margin + gleich großes Padding gibt
              // dem Schatten ringsum Platz, ohne das sichtbare Layout zu verschieben
              // (beide heben sich auf). Das vergrößert zwar diese Box selbst, aber das
              // Raster darunter bekommt via maxWidth eine feste Breite — damit füllt
              // auto-fill den zusätzlichen Rand nicht mit einer weiteren Spalte auf.
              style={{ overflow: 'hidden', margin: -28, padding: 28 }}
            >
              {list.length === 0 ? (
                <div style={{
                  marginTop: 14, padding: '20px 8px', textAlign: 'center', borderRadius: 12,
                  border: `1.5px dashed color-mix(in srgb, ${color} 35%, var(--border))`,
                  color: 'var(--text3)', fontSize: 12,
                }}>
                  {t('This folder is empty — drag a board here.')}
                </div>
              ) : (
                <div style={{ paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 280px)', gap: 20, maxWidth: gridWidth }}>
                  {list.map(renderBoardCard)}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Board-Kontextmenü (⋯) — über ein Portal direkt in <body> gerendert, damit es
// über Ordner-Kacheln hinausragen kann statt von deren Höhen-Animations-Clipping
// (overflow: hidden) verschluckt zu werden. Position wird aus der realen Lage
// des Auslöser-Buttons berechnet, nicht aus verschachtelten CSS-Koordinaten.
function BoardMenuButton({
  isOpen, onToggle, onClose, items,
}: {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  items: { label: string; icon: React.ReactNode; action: () => void; danger?: boolean }[]
}) {
  const tt = useT()
  const [pos, setPos]     = useState({ x: 0, y: 0 })
  const [ready, setReady] = useState(false)
  const btnWrapRef = useRef<HTMLDivElement>(null)
  const menuRef     = useRef<HTMLDivElement>(null)

  // Position erst nach dem Rendern messen (echte Menügröße kennen, im Viewport bleiben)
  useEffect(() => {
    if (!isOpen) { setReady(false); return }
    const id = requestAnimationFrame(() => {
      const triggerEl = (btnWrapRef.current?.firstElementChild as HTMLElement) ?? btnWrapRef.current
      const menu = menuRef.current
      if (!triggerEl || !menu) return
      const r = triggerEl.getBoundingClientRect()
      const mw = menu.offsetWidth || 190
      const mh = menu.offsetHeight || 220
      const M = 8
      let x = r.right - mw
      x = Math.min(Math.max(M, x), window.innerWidth - mw - M)
      let y = r.bottom + 6
      if (y + mh > window.innerHeight - M) y = Math.max(M, r.top - mh - 6)
      setPos({ x, y })
      setReady(true)
    })
    return () => cancelAnimationFrame(id)
  }, [isOpen])

  // Eigener Outside-Click-Handler — nötig, weil das Menü per Portal außerhalb
  // der Karte im DOM liegt und ein `closest()`-Check auf die Karte ins Leere liefe
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !btnWrapRef.current?.contains(t)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [isOpen, onClose])

  return (
    <>
      <div ref={btnWrapRef} style={{ display: 'contents' }}>
        <CardBtn title={tt('More actions')} onClick={onToggle}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
          </svg>
        </CardBtn>
      </div>
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: pos.x, top: pos.y, zIndex: 3000,
            visibility: ready ? 'visible' : 'hidden',
            minWidth: 190, overflow: 'hidden',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.42)',
          }}
        >
          {items.map((item, i) => (
            <button key={item.label}
              onClick={e => { e.stopPropagation(); e.preventDefault(); onClose(); item.action() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                width: '100%', padding: '7px 12px', textAlign: 'left',
                border: 'none', cursor: 'pointer',
                borderTop: i > 0 ? '1px solid color-mix(in srgb, var(--border) 50%, transparent)' : 'none',
                background: 'transparent',
                color: item.danger ? 'var(--danger)' : 'var(--text1)',
                fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = item.danger ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'color-mix(in srgb, var(--text1) 5%, transparent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ display: 'flex', flexShrink: 0, opacity: 0.75 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Seite ─────────────────────────────────────────────────────────────────────

type SortKey = 'edited' | 'name' | 'created'

// label ist der englische Quelltext (Default-Sprache) — an Verwendungsstellen mit t() übersetzen
const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'edited',  label: 'Last edited' },
  { id: 'name',    label: 'Name' },
  { id: 'created', label: 'Created' },
]

export default function HomePage() {
  const t = useT()
  const router = useRouter()
  const boards = useBoardStore(useShallow(s => Object.values(s.boards)))
  const trash  = useBoardStore(s => s.trash)
  const createBoard      = useBoardStore(s => s.createBoard)
  const deleteBoard      = useBoardStore(s => s.deleteBoard)
  const duplicateBoard   = useBoardStore(s => s.duplicateBoard)
  const renameBoard      = useBoardStore(s => s.renameBoard)
  const togglePinBoard   = useBoardStore(s => s.togglePinBoard)
  const setBoardFolder   = useBoardStore(s => s.setBoardFolder)
  const addWidget        = useBoardStore(s => s.addWidget)
  const restoreBoard     = useBoardStore(s => s.restoreBoard)
  const purgeBoard       = useBoardStore(s => s.purgeBoard)
  const emptyTrash       = useBoardStore(s => s.emptyTrash)
  const customTemplates      = useSettings(s => s.customTemplates)
  const addCustomTemplate    = useSettings(s => s.addCustomTemplate)
  const removeCustomTemplate = useSettings(s => s.removeCustomTemplate)

  const animations = useSettings(s => s.animations)
  const lastExportAt = useSettings(s => s.lastExportAt)
  const setSetting = useSettings(s => s.setSetting)
  const showKbdHints = useSettings(s => s.showKbdHints)
  const homeShortcuts = useSettings(s => s.keyboardShortcutsHome)

  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  // Verwaiste Blobs (gelöschte Bilder/PDFs) einmal pro Sitzung aufräumen —
  // erst nach der Store-Hydration, sonst wäre die Referenzliste leer
  useEffect(() => {
    if (!hydrated) return
    const t = setTimeout(() => {
      const run = () => {
        const st = useBoardStore.getState()
        pruneBlobs(collectBlobRefs({ boards: st.boards, trash: st.trash }))
      }
      if (useBoardStore.persist.hasHydrated()) run()
      else useBoardStore.persist.onFinishHydration(run)
    }, 3000)
    return () => clearTimeout(t)
  }, [hydrated])

  const [creating, setCreating]           = useState(false)
  const [newName, setNewName]             = useState('')
  const [selectedTpl, setSelectedTpl]     = useState('empty')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editName, setEditName]           = useState('')
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [query, setQuery]                 = useState('')
  const [sortBy, setSortBy]               = useState<SortKey>('edited')
  const [sortOpen, setSortOpen]           = useState(false)
  const [menuFor, setMenuFor]             = useState<string | null>(null)
  const [storageOpen, setStorageOpen]     = useState(false)
  // Hover- (nicht klick-)gesteuerte Popover an den Boards-/Widgets-Chips —
  // rein informativ, daher genügt mouseenter/mouseleave ohne Klick-Außerhalb-Logik.
  const [boardsListOpen, setBoardsListOpen]   = useState(false)
  const [widgetsListOpen, setWidgetsListOpen] = useState(false)
  const [trashOpen, setTrashOpen]         = useState(false)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null)
  const [confirmFolderDelete, setConfirmFolderDelete] = useState<string | null>(null)
  const [deleteBoardsToo, setDeleteBoardsToo]         = useState(false)
  const folderColors     = useSettings(s => s.folderColors)
  const persistedFolders = useSettings(s => s.folders)
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([])
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName]   = useState('')
  const [renamingFolder, setRenamingFolder]   = useState<string | null>(null)
  const [renameFolderValue, setRenameFolderValue] = useState('')
  const inputRef       = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sortRef        = useRef<HTMLDivElement>(null)
  const storageRef     = useRef<HTMLDivElement>(null)
  const boardsListRef  = useRef<HTMLDivElement>(null)
  const widgetsListRef = useRef<HTMLDivElement>(null)
  const folderCreateRef = useRef<HTMLDivElement>(null)

  // Dropdowns/Menüs bei Klick außerhalb schließen
  // (das Board-Kontextmenü selbst regelt sein Outside-Click-Verhalten in BoardMenuButton —
  // es liegt per Portal außerhalb der Karte im DOM, ein closest()-Check hier würde ins Leere laufen)
  useEffect(() => {
    if (!sortOpen && !storageOpen && !boardsListOpen && !widgetsListOpen && !folderMenuFor && !creatingFolder) return
    const fn = (e: MouseEvent) => {
      const t = e.target as Node
      if (sortOpen && !sortRef.current?.contains(t)) setSortOpen(false)
      if (storageOpen && !storageRef.current?.contains(t)) setStorageOpen(false)
      if (boardsListOpen && !boardsListRef.current?.contains(t)) setBoardsListOpen(false)
      if (widgetsListOpen && !widgetsListRef.current?.contains(t)) setWidgetsListOpen(false)
      if (folderMenuFor && !(t instanceof Element && t.closest('[data-folder-menu]'))) setFolderMenuFor(null)
      if (creatingFolder && !folderCreateRef.current?.contains(t)) setCreatingFolder(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [sortOpen, storageOpen, boardsListOpen, widgetsListOpen, folderMenuFor, creatingFolder])

  // Konfigurierbar unter Einstellungen → Tastenkürzel → Board-Auswahl
  // (settingsStore.keyboardShortcutsHome) — eigenes Set, unabhängig von den
  // 5 board-internen Shortcuts (TopBar.tsx), da hier andere Aktionen gelten.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = (e.target ?? document.activeElement) as HTMLElement
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) ||
        el?.isContentEditable
      ) return
      const shortcuts = useSettings.getState().keyboardShortcutsHome
      const key = e.key.toUpperCase()
      if (key === shortcuts.newBoard)       setCreating(c => !c)
      else if (key === shortcuts.newFolder) setCreatingFolder(o => !o)
      else if (key === shortcuts.focusSearch) { e.preventDefault(); searchInputRef.current?.focus() }
      else if (key === shortcuts.settings)  setSettingsOpen(o => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Alle Boards als vollständiges Backup sichern (klickbarer Backup-Chip) —
  // inkl. eigener Themes/Vorlagen/Plugins und eingebetteter Binärdaten
  async function exportAllBoards() {
    const st      = useBoardStore.getState()
    const se      = useSettings.getState()
    const payload = await buildFullBackupPayload(st.boards, st.trash, se)
    downloadJson(payload, fullBackupFilename())
    setSetting({ lastExportAt: Date.now() })
  }

  // Einzelnes Board als JSON exportieren (Kontextmenü) — mit eingebetteten Binärdaten
  async function exportBoardJson(board: Board) {
    const payload = await buildBoardBackupPayload(board)
    downloadJson(payload, boardExportFilename(board))
    setSetting({ lastExportAt: Date.now() })
  }

  // Layout eines Boards als eigene Vorlage sichern (ohne Inhalte)
  function saveAsTemplate(board: Board) {
    addCustomTemplate({
      id:   `tpl_${Date.now()}`,
      name: board.name.slice(0, 30),
      widgets: Object.values(board.widgets).map(w => ({
        type: w.type, col: w.pos.col, row: w.pos.row, colSpan: w.pos.colSpan, rowSpan: w.pos.rowSpan,
      })),
    })
  }

  // Dark/Light-Modus für die Übersichts-UI selbst (Hintergrund, Karten, Buttons) —
  // unabhängig von den Themes der einzelnen Boards. Einstellbar (inkl. "System")
  // unter Einstellungen → Erscheinungsbild; liegt im settingsStore, nicht mehr
  // in einem eigenen localStorage-Key.
  const homeThemeMode = useSettings(s => s.homeThemeMode)
  const [systemPrefersDark, setSystemPrefersDark] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemPrefersDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const uiMode: 'dark' | 'light' = homeThemeMode === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : homeThemeMode
  useEffect(() => {
    // Setzt die CSS-Variablen der Seite (Deep Space bzw. Light-Theme);
    // beim Öffnen eines Boards übernimmt dessen eigenes Theme wieder.
    const theme = getTheme(uiMode === 'light' ? 'light' : 'dark')
    const root  = document.documentElement
    Object.entries(theme.cssVars).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [uiMode])

  // Speicher-Statistik
  const [storagePct, setStoragePct] = useState<number | null>(null)
  useEffect(() => {
    if (!navigator.storage?.estimate) return
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage != null && quota) setStoragePct(Math.round(usage / quota * 100))
    })
  }, [])

  // Eingebaute + eigene Vorlagen (eigene aus „Als Vorlage speichern")
  const allTemplates: Template[] = [
    ...TEMPLATES,
    ...customTemplates.map(ct => ({
      id:      ct.id,
      label:   ct.name,
      // Bereits in der aktuellen Sprache aufgebaut (nicht über TEMPLATES' Schlüssel-Mechanismus,
      // da die Widget-Anzahl pro Vorlage variiert) — t() am Renderort wirkt hier als No-Op-Passthrough.
      desc:    `${ct.widgets.length} ${ct.widgets.length !== 1 ? t('Widgets') : t('Widget')} · ${t('custom template')}`,
      icon:    <TplIcon><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></TplIcon>,
      widgets: ct.widgets,
      custom:  true,
    })),
  ]

  function handleCreate() {
    const name = newName.trim() || t('New board')
    const id   = createBoard(name)
    const tpl  = allTemplates.find(t => t.id === selectedTpl)
    tpl?.widgets.forEach(w => {
      addWidget(defaultWidget(w.type, { col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan }))
    })
    setCreating(false)
    setNewName('')
    setSelectedTpl('empty')
    router.push(`/board/${id}`)
  }

  function startRename(board: Board) {
    setEditingId(board.id)
    setEditName(board.name)
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      renameBoard(editingId, editName.trim())
    }
    setEditingId(null)
  }

  // Zugeklappte Ordner ueber Sitzungen merken
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('mosaic-home-folders') ?? '[]')
      if (Array.isArray(v)) setCollapsedFolders(v.filter(x => typeof x === 'string'))
    } catch { /* defekter Eintrag - ignorieren */ }
  }, [])

  function toggleFolder(f: string) {
    setCollapsedFolders(prev => {
      const next = prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
      try { localStorage.setItem('mosaic-home-folders', JSON.stringify(next)) } catch { /* voll */ }
      return next
    })
  }

  function setFolderColor(folder: string, color: string) {
    setSetting({ folderColors: { ...folderColors, [folder]: color } })
    setFolderMenuFor(null)
  }

  // Ordner aufloesen: Boards wandern zurueck ins Hauptraster —
  // oder (per Checkbox) zusammen mit dem Ordner in den Papierkorb
  function deleteFolder(f: string, withBoards = false) {
    Object.values(useBoardStore.getState().boards).forEach(b => {
      if (b.folder !== f) return
      if (withBoards) deleteBoard(b.id)
      else setBoardFolder(b.id, null)
    })
    const rest = { ...folderColors }
    delete rest[f]
    setSetting({ folderColors: rest, folders: persistedFolders.filter(x => x !== f) })
    setFolderMenuFor(null)
    setConfirmFolderDelete(null)
  }

  // Ordner samt aller Boards duplizieren (Kopien behalten ihre Namen);
  // der neue Ordner bleibt auch dann bestehen, wenn der Original-Ordner leer war
  function duplicateFolder(f: string) {
    let copy = `${f} (${t('Copy')})`.slice(0, 30)
    let n = 2
    while (folderNames.includes(copy)) copy = `${f} (${t('Copy')} ${n++})`.slice(0, 30)
    inFolder(f).forEach(b => duplicateBoard(b.id, { name: b.name, folder: copy }))
    setSetting({
      folders: [...persistedFolders, copy],
      folderColors: folderColors[f] ? { ...folderColors, [copy]: folderColors[f] } : folderColors,
    })
    setFolderMenuFor(null)
  }

  // Neuen (leeren) Ordner anlegen — Boards kommen später per Drag & Drop hinein
  function createFolder() {
    const name = newFolderName.trim().slice(0, 30)
    if (!name) return
    if (!folderNames.includes(name)) setSetting({ folders: [...persistedFolders, name] })
    setNewFolderName('')
    setCreatingFolder(false)
  }

  // Ordner sind reine Namens-Strings (keine ID) — Umbenennen heißt: den String
  // überall ersetzen, wo er als Identität dient (folders-Liste, folderColors-Key,
  // jedes zugehörige Board). Analog zu deleteFolder/duplicateFolder oben nur
  // aktive Boards, nicht den Papierkorb (gleiches bestehendes Verhalten).
  function renameFolder(oldName: string, newNameRaw: string) {
    const newName = newNameRaw.trim().slice(0, 30)
    if (!newName || newName === oldName) { setRenamingFolder(null); return }
    if (folderNames.includes(newName)) return
    Object.values(useBoardStore.getState().boards).forEach(b => {
      if (b.folder === oldName) setBoardFolder(b.id, newName)
    })
    const rest = { ...folderColors }
    const col = rest[oldName]
    delete rest[oldName]
    setSetting({
      folders: persistedFolders.map(f => f === oldName ? newName : f),
      folderColors: col ? { ...rest, [newName]: col } : rest,
    })
    setFolderMenuFor(null)
    setRenamingFolder(null)
  }

  // ── Filter + Sortierung (gepinnte zuerst) ──────────────────────────────────
  const q = query.trim().toLowerCase()
  const filtered = q ? boards.filter(b => b.name.toLowerCase().includes(q)) : boards
  const sortFns: Record<SortKey, (a: Board, b: Board) => number> = {
    edited:  (a, b) => b.lastEdited - a.lastEdited,
    name:    (a, b) => a.name.localeCompare(b.name, 'de'),
    created: (a, b) => (b.createdAt ?? b.lastEdited) - (a.createdAt ?? a.lastEdited),
  }
  const sorted = [...filtered].sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || sortFns[sortBy](a, b)
  )

  // Ordner-Gruppierung: Sektionen nur ohne aktive Suche anzeigen
  // Vereint explizit angelegte (auch leere) Ordner mit denen, die Boards bereits zugewiesen sind
  const derivedFolders = boards.map(b => b.folder).filter((f): f is string => !!f)
  const folderNames = [...new Set([...persistedFolders, ...derivedFolders])].sort((a, b) => a.localeCompare(b, 'de'))
  const showFolders = !q && folderNames.length > 0
  const ungrouped   = showFolders ? sorted.filter(b => !b.folder) : sorted
  const inFolder    = (f: string) => sorted.filter(b => b.folder === f)

  const widgetCount = boards.reduce((n, b) => n + Object.keys(b.widgets).length, 0)
  // Häufigkeit je Widget-Typ über alle Boards hinweg — fürs Hover-Popover am
  // "N Widgets"-Chip, absteigend nach Häufigkeit sortiert.
  const widgetTypeCounts = boards.reduce<Record<string, number>>((acc, b) => {
    for (const w of Object.values(b.widgets)) acc[w.type] = (acc[w.type] ?? 0) + 1
    return acc
  }, {})
  const widgetTypeList = Object.entries(widgetTypeCounts).sort((a, z) => z[1] - a[1])
  const backupUrgent = !lastExportAt || Date.now() - lastExportAt > 14 * 86400000

  // ── Drag & Drop: Boards per Ziehen in/aus Ordnern verschieben ──────────────
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const { isOver: ungroupedIsOver, setNodeRef: setUngroupedRef } = useDroppable({ id: 'ungrouped' })

  // Schwing-Effekt der Drag-Vorschau: Roh-Wert springt bei jeder Zeiger-Bewegung
  // proportional zur seitlichen Geschwindigkeit aus, die Feder zieht ihn danach
  // sanft zur Grund-Neigung zurück — fühlt sich wie an einem Faden hängend an.
  const DRAG_REST_ROTATE = -2
  const dragRotateRaw = useMotionValue(DRAG_REST_ROTATE)
  const dragRotate     = useSpring(dragRotateRaw, { stiffness: 260, damping: 32, mass: 0.6 })
  const lastDragDeltaX = useRef(0)

  function handleDragStart(e: DragStartEvent) {
    setDraggingBoardId(String(e.active.id))
    lastDragDeltaX.current = 0
    dragRotateRaw.set(DRAG_REST_ROTATE)
  }
  function handleDragMove(e: DragMoveEvent) {
    const vx = e.delta.x - lastDragDeltaX.current   // seitliche Bewegung seit dem letzten Move-Event
    lastDragDeltaX.current = e.delta.x
    const target = Math.max(-10, Math.min(10, DRAG_REST_ROTATE + vx * 0.7))
    dragRotateRaw.set(target)
  }
  function handleDragEnd(e: DragEndEvent) {
    setDraggingBoardId(null)
    dragRotateRaw.set(DRAG_REST_ROTATE)
    const boardId = String(e.active.id)
    const overId  = e.over?.id != null ? String(e.over.id) : null
    // Nur ein Treffer auf eine konkrete Ordner-Kachel weist dem Board diesen Ordner zu.
    // Alles andere — die Haupt-Rasterzone, aber auch losgelassen auf freier Fläche
    // ohne Treffer — zieht das Board vollständig aus seinem Ordner heraus, es landet
    // dann ganz normal bei den Boards ohne Ordner neben „Neues Board".
    if (overId && overId.startsWith('folder:')) setBoardFolder(boardId, overId.slice('folder:'.length))
    else setBoardFolder(boardId, null)
  }

  // Eine Board-Karte - im Hauptraster und in den Ordner-Sektionen verwendet.
  // In DraggableBoardCard eingepackt, damit sie in/aus Ordner gezogen werden kann;
  // während des Umbenennens deaktiviert (sonst würde Text-Markieren als Ziehen zählen).
  const renderBoardCard = (board: Board, i: number) => (
        <DraggableBoardCard key={board.id} board={board} disabled={editingId === board.id}>
          <motion.div
            initial={animations ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={animations ? { delay: Math.min(i * 0.04, 0.3), duration: 0.22 } : { duration: 0 }}
            style={{ position: 'relative' }}
          >
            <Link href={`/board/${board.id}`} style={{ textDecoration: 'none', display: 'block' }}>
              {/* Schatten sitzt auf diesem äußeren Element (kein overflow:hidden hier —
                  sonst schneidet die Karte ihren eigenen Schatten an den Rändern ab,
                  sichtbar z. B. in Ordner-Kacheln). Die Ecken-Abrundung fürs Vorschaubild
                  übernimmt der innere Container mit eigenem overflow:hidden. */}
              <motion.div
                whileHover={{ y: -4, scale: 1.02 }}
                transition={{ duration: 0.15 }}
                style={{
                  borderRadius: 18,
                  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* Vorschau: echte Mini-Map auf dem echten Board-Hintergrund */}
                  <div style={{ height: 140, position: 'relative', ...bgPreview(board) }}>
                    <BoardMiniMap board={board} />
                    {board.pinned && (
                      <div style={{
                        position: 'absolute', top: 10, left: 10,
                        width: 22, height: 22, borderRadius: 7,
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <PinIcon filled />
                      </div>
                    )}
                  </div>
                  {/* Fußzeile */}
                  <div style={{ padding: '12px 16px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {editingId === board.id ? (
                      <input
                        autoFocus
                        maxLength={60}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                        onClick={e => e.preventDefault()}
                        style={{
                          flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text1)',
                          background: 'var(--surface2)', borderRadius: 6, padding: '2px 6px',
                        }}
                      />
                    ) : (
                      <span
                        style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        onDoubleClick={e => { e.preventDefault(); startRename(board) }}
                      >
                        {board.name}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }} suppressHydrationWarning>
                      {timeAgo(board.lastEdited, t)}
                    </span>
                  </div>
                </div>
              </motion.div>
            </Link>

            {/* Karten-Aktionen: Pin + Kontextmenü */}
            <div className="delete-btn" style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4, ...(menuFor === board.id ? { opacity: 1 } : {}) }}>
              <CardBtn title={board.pinned ? t('Unpin board') : t('Pin board')} onClick={() => togglePinBoard(board.id)}>
                <PinIcon filled={!!board.pinned} />
              </CardBtn>
              <BoardMenuButton
                isOpen={menuFor === board.id}
                onToggle={() => setMenuFor(m => m === board.id ? null : board.id)}
                onClose={() => setMenuFor(null)}
                items={[
                  { label: t('Open'), icon: <MenuIco d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>, action: () => router.push(`/board/${board.id}`) },
                  { label: t('Rename'), icon: <MenuIco d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>, action: () => startRename(board) },
                  { label: t('Duplicate'), icon: <MenuIco d="M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>, action: () => duplicateBoard(board.id) },
                  { label: t('Export as JSON'), icon: <MenuIco d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>, action: () => exportBoardJson(board) },
                  { label: t('Save as template'), icon: <MenuIco d="M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7v3h-7z"/>, action: () => saveAsTemplate(board) },
                  ...(board.folder ? [{ label: `${t('Remove from folder')} “${board.folder}”`, icon: <MenuIco d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 13h6"/>, action: () => setBoardFolder(board.id, null) }] : []),
                  { label: t('Move to trash'), icon: <MenuIco d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>, action: () => setConfirmDelete(board.id), danger: true },
                ]}
              />
            </div>
          </motion.div>
        </DraggableBoardCard>
  )

  return (
    <DndContext sensors={dndSensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={() => { setDraggingBoardId(null); dragRotateRaw.set(DRAG_REST_ROTATE) }}>
    <div style={{ width: '100vw', height: '100vh', overflow: 'auto', background: 'var(--bg)' }}>
      {/* ── Kopfzeile ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '20px 36px 0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mosaiclogo.png" alt="mosaic" width={32} height={32} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <span style={{ fontSize: 28, fontWeight: 400, color: 'var(--text1)', marginLeft: 10, fontFamily: 'Guavine, sans-serif', lineHeight: 1 }}>mosaic</span>

        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            title={`${t('Settings')} [${homeShortcuts.settings}]`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: '50%',
              border: `1px solid ${settingsOpen ? 'var(--accent)' : 'var(--border)'}`,
              background: settingsOpen ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
              color: settingsOpen ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {showKbdHints && <span style={kbdBadgeStyle}>{homeShortcuts.settings}</span>}
        </div>
      </div>

      {/* ── Info-Leiste + Vorschau-Modus ── */}
      {hydrated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '18px 36px 0' }}>
          <div ref={boardsListRef} style={{ position: 'relative' }}>
            <StatChip
              label={`${boards.length} ${boards.length !== 1 ? t('Boards') : t('Board')}`}
              onClick={() => setBoardsListOpen(o => !o)}
              title={t('Show all boards')}
            />
            {boardsListOpen && boards.length > 0 && (
              <div style={{
                position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 100,
                minWidth: 200, maxWidth: 280, padding: '8px 0',
                background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.42)',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', padding: '0 12px 6px' }}>
                  {t('All boards')}
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {sorted.map(b => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', fontSize: 11.5 }}>
                      {b.pinned && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="var(--accent)" stroke="none" style={{ flexShrink: 0 }}>
                          <path d="M12 2l2.5 6.5L21 11l-5.5 4L17 22l-5-3.5L7 22l1.5-7L3 11l6.5-2.5z"/>
                        </svg>
                      )}
                      <span style={{ minWidth: 0, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div ref={widgetsListRef} style={{ position: 'relative' }}>
            <StatChip
              label={`${widgetCount} ${widgetCount !== 1 ? t('Widgets') : t('Widget')}`}
              onClick={() => setWidgetsListOpen(o => !o)}
              title={t('Show widget types')}
            />
            {widgetsListOpen && widgetTypeList.length > 0 && (
              <div style={{
                position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 100,
                minWidth: 190, padding: '8px 0',
                background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.42)',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', padding: '0 12px 6px' }}>
                  {t('Widget types')}
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {widgetTypeList.map(([type, count]) => (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', fontSize: 11.5 }}>
                      <span style={{ display: 'flex', flexShrink: 0, color: 'var(--text2)', opacity: 0.75 }}>{TYPE_ICONS[type]}</span>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t(TYPE_LABELS[type] ?? type)}
                      </span>
                      <span style={{ color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {storagePct != null && (
            <div ref={storageRef} style={{ position: 'relative' }}>
              <StatChip
                label={`${t('Storage')} ${storagePct} %`}
                warn={storagePct > 80}
                onClick={() => setStorageOpen(o => !o)}
                title={t('Show largest boards')}
              />
              {storageOpen && (
                <div style={{
                  position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 100,
                  minWidth: 210, padding: '8px 0',
                  background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                  backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--border)',
                  borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.42)',
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', padding: '0 12px 6px' }}>
                    {t('Largest boards')}
                  </div>
                  {[...boards]
                    .map(b => ({ b, size: JSON.stringify(b).length }))
                    .sort((a, z) => z.size - a.size)
                    .slice(0, 4)
                    .map(({ b, size }) => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px', fontSize: 11.5 }}>
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                        <span style={{ color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
          <StatChip
            label={lastExportAt ? `${t('Backup')} ${timeAgo(lastExportAt, t)}` : t('No backup yet')}
            warn={backupUrgent}
            onClick={exportAllBoards}
            title={t('Back up all boards as JSON now')}
          />
          {/* Dark/Light/System für die Übersichts-UI — jetzt unter
              Einstellungen → Erscheinungsbild (auch dort steuerbar) */}
        </div>
      )}

      {/* ── Suche + Sortierung — immer sichtbar, sobald es Boards gibt ── */}
      {hydrated && boards.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '24px 36px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 'auto' }}>
            {t('All boards')}
          </div>
          {/* Suche */}
          <div id="tour-search-input" style={{
            display: 'flex', alignItems: 'center', gap: 7, width: 220,
            padding: '6px 12px', borderRadius: 20,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              ref={searchInputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('Search boards…')}
              style={{ flex: 1, minWidth: 0, fontSize: 12, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text1)' }}
            />
            {query ? (
              <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
            ) : (
              showKbdHints && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--text3)',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '1px 4px', lineHeight: 1, flexShrink: 0,
                }}>{homeShortcuts.focusSearch}</span>
              )
            )}
          </div>
          {/* Sortierung: ein Filter-Button mit Dropdown */}
          <div ref={sortRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setSortOpen(o => !o)}
              title={t('Sort')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
                border: `1px solid ${sortOpen ? 'var(--accent)' : 'var(--border)'}`,
                background: sortOpen ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface)',
                color: sortOpen ? 'var(--accent)' : 'var(--text2)',
                fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>
              </svg>
              {t(SORT_OPTIONS.find(o => o.id === sortBy)?.label ?? '')}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ transform: sortOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {sortOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 100,
                minWidth: 176, overflow: 'hidden',
                background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.42)',
              }}>
                {SORT_OPTIONS.map((o, i) => {
                  const active = sortBy === o.id
                  return (
                    <button key={o.id} onClick={() => { setSortBy(o.id); setSortOpen(false) }} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 13px', textAlign: 'left',
                      border: 'none', cursor: 'pointer',
                      borderTop: i > 0 ? '1px solid color-mix(in srgb, var(--border) 50%, transparent)' : 'none',
                      background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text1)',
                      fontSize: 11.5, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--text1) 5%, transparent)' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ width: 12, display: 'flex', flexShrink: 0 }}>
                        {active && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </span>
                      {t(o.label)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* Ordner hinzufügen */}
          <div ref={folderCreateRef} style={{ position: 'relative' }}>
            <button
              id="tour-add-folder-btn"
              onClick={() => setCreatingFolder(o => !o)}
              title={`${t('Add folder')} [${homeShortcuts.newFolder}]`} aria-label={t('Add folder')} aria-haspopup="dialog"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', padding: 0,
                border: `1px solid ${creatingFolder ? 'var(--accent)' : 'var(--border)'}`,
                background: creatingFolder ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface)',
                color: creatingFolder ? 'var(--accent)' : 'var(--text2)',
                transition: 'all 0.15s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <line x1="12" y1="10" x2="12" y2="15"/>
                <line x1="9.5" y1="12.5" x2="14.5" y2="12.5"/>
              </svg>
            </button>
            {showKbdHints && <span style={kbdBadgeStyle}>{homeShortcuts.newFolder}</span>}

            {/* Zentriertes Modal statt kleinem Dropdown am Button */}
            {creatingFolder && (
              <div
                onClick={() => setCreatingFolder(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 1500,
                  background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  role="dialog" aria-modal="true" aria-label={t('New folder')}
                  style={{
                    width: 'min(420px, 92vw)', padding: '26px 28px',
                    background: 'color-mix(in srgb, var(--surface) 75%, var(--bg))',
                    backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                    border: '1px solid var(--border)',
                    borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                    display: 'flex', flexDirection: 'column', gap: 14,
                  }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>{t('New folder')}</div>
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false) }}
                    placeholder={t('Name…')}
                    maxLength={30}
                    style={{
                      fontSize: 14, padding: '10px 13px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--surface2)',
                      color: 'var(--text1)', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setCreatingFolder(false)}
                      style={{ padding: '9px 16px', fontSize: 13, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text1)', cursor: 'pointer' }}
                    >{t('Cancel')}</button>
                    <button onClick={createFolder} disabled={!newFolderName.trim()}
                      style={{
                        padding: '9px 20px', fontSize: 13, fontWeight: 700, borderRadius: 999, border: 'none',
                        background: 'var(--accent)', color: 'white',
                        cursor: newFolderName.trim() ? 'pointer' : 'default', opacity: newFolderName.trim() ? 1 : 0.4,
                      }}
                    >{t('Create')}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Ordner-Sektionen: farbige Kacheln, zugeklappt eine schlanke Leiste ── */}
      {hydrated && showFolders && folderNames.map(f => {
        const list = inFolder(f)
        return (
          <FolderSection
            key={f}
            folder={f}
            list={list}
            color={folderColors[f] ?? '#7c6fe8'}
            collapsed={collapsedFolders.includes(f)}
            animations={animations}
            menuOpen={folderMenuFor === f}
            onToggleFolder={() => toggleFolder(f)}
            onToggleMenu={() => setFolderMenuFor(m => m === f ? null : f)}
            onSetColor={c => setFolderColor(f, c)}
            onDuplicate={() => duplicateFolder(f)}
            onRequestDelete={() => { setFolderMenuFor(null); setDeleteBoardsToo(false); setConfirmFolderDelete(f) }}
            onRequestRename={() => { setFolderMenuFor(null); setRenameFolderValue(f); setRenamingFolder(f) }}
            renderBoardCard={renderBoardCard}
          />
        )
      })}
      {/* ── Board-Raster (zugleich Drop-Zone „aus Ordner entfernen") ── */}
      <div ref={setUngroupedRef} style={{
        padding: '18px 36px 60px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20,
        borderRadius: ungroupedIsOver && showFolders ? 18 : 0,
        boxShadow: ungroupedIsOver && showFolders ? 'inset 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent)' : 'none',
        transition: 'box-shadow 0.2s',
      }}>
        {hydrated && ungrouped.map(renderBoardCard)}

        {/* ── Neues Board ── */}
        {hydrated && !q && (
        <motion.div
          initial={animations ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={animations ? { delay: Math.min(sorted.length * 0.04, 0.3), duration: 0.22 } : { duration: 0 }}
        >
          <AnimatePresence mode="wait">
            {creating ? (
              <motion.div
                key="creating"
                id="tour-new-board-btn"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                style={{
                  borderRadius: 18, border: '2px solid var(--accent)',
                  background: 'var(--surface)', padding: 18,
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>{t('Create new board')}</div>
                <input
                  ref={inputRef}
                  autoFocus
                  maxLength={60}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                  placeholder={t('Board name…')}
                  style={{
                    fontSize: 14, padding: '8px 12px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    color: 'var(--text1)',
                  }}
                />
                {/* Vorlagen */}
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {t('Template')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {allTemplates.map(tpl => {
                      const active = selectedTpl === tpl.id
                      return (
                        <button key={tpl.id} onClick={() => setSelectedTpl(tpl.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px',
                          width: '100%', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                          minWidth: 0, overflow: 'hidden',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--surface2))' : 'var(--surface2)',
                          transition: 'all 0.12s',
                        }}>
                          <span style={{ color: active ? 'var(--accent)' : 'var(--text3)', display: 'flex', flexShrink: 0 }}>{tpl.icon}</span>
                          <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text1)', whiteSpace: 'nowrap' }}>{t(tpl.label)}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{t(tpl.desc)}</span>
                          {tpl.custom && (
                            <span
                              role="button"
                              title={t('Remove template')}
                              onClick={e => {
                                e.stopPropagation()
                                removeCustomTemplate(tpl.id)
                                if (selectedTpl === tpl.id) setSelectedTpl('empty')
                              }}
                              style={{ flexShrink: 0, width: 15, height: 15, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11, lineHeight: 1 }}
                            >×</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCreate}
                    style={{
                      flex: 1, padding: '8px', fontSize: 13, fontWeight: 600,
                      borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
                    }}
                  >{t('Create')}</button>
                  <button
                    onClick={() => { setCreating(false); setNewName('') }}
                    style={{
                      padding: '8px 14px', fontSize: 13, borderRadius: 999,
                      border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer',
                    }}
                  >{t('Cancel')}</button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="plus"
                whileHover={{ y: -4, scale: 1.02 }}
                transition={{ duration: 0.15 }}
                onClick={() => setCreating(true)}
                title={`${t('New board')} [${homeShortcuts.newBoard}]`}
                style={{
                  width: '100%', height: 200, borderRadius: 18, position: 'relative',
                  border: '2px dashed rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'var(--text3)', fontSize: 14, fontWeight: 600,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.color = 'var(--text3)'
                }}
              >
                {showKbdHints && <span style={{ ...kbdBadgeStyle, top: 10, right: 10 }}>{homeShortcuts.newBoard}</span>}
                <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
                <span>{t('New board')}</span>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
        )}

        {/* Kein Suchtreffer */}
        {hydrated && q && sorted.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 13 }}>
            {t('No board found for')} “{query}”
          </div>
        )}
      </div>

      {/* ── Papierkorb — schwebender Button unten rechts. Immer sichtbar,
          auch leer — Klick öffnet dasselbe Fenster, nur mit dem
          "Papierkorb ist leer"-Hinweis statt Einträgen. */}
      {hydrated && (
        <button
          onClick={() => setTrashOpen(true)}
          title={trash.length > 0 ? `${t('Trash')} (${trash.length})` : t('Trash')}
          aria-label={trash.length > 0 ? `${t('Trash')} (${trash.length})` : t('Trash')}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1200,
            width: 46, height: 46, borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            color: 'var(--text2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          {trash.length > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17,
              borderRadius: 9, padding: '0 4px', boxSizing: 'border-box',
              background: 'var(--danger)', color: 'white',
              fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>{trash.length}</span>
          )}
        </button>
      )}

      {/* ── Papierkorb-Fenster ── */}
      <AnimatePresence>
        {trashOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}
            onClick={() => { setTrashOpen(false); setConfirmEmptyTrash(false) }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 560, maxHeight: '78vh',
                display: 'flex', flexDirection: 'column',
                background: 'color-mix(in srgb, var(--surface) 88%, var(--bg))',
                backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                border: '1px solid var(--border)', borderRadius: 18,
                boxShadow: '0 24px 70px rgba(0,0,0,0.55)', overflow: 'hidden',
              }}
            >
              {/* Kopf */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', flex: 1 }}>
                  {t('Trash')} ({trash.length})
                </span>
                {trash.length > 0 && !confirmEmptyTrash && (
                  <button
                    onClick={() => setConfirmEmptyTrash(true)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
                      border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)',
                      color: 'var(--danger)', cursor: 'pointer', flexShrink: 0,
                    }}
                  >{t('Empty trash')}</button>
                )}
                <button onClick={() => { setTrashOpen(false); setConfirmEmptyTrash(false) }} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>×</button>
              </div>

              {/* Alle-löschen-Bestätigung */}
              {confirmEmptyTrash && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.25)', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>
                    {t('Delete all permanently?')} <strong style={{ color: 'var(--danger)' }}>{t('This action cannot be undone.')}</strong>
                  </span>
                  <button
                    onClick={() => { emptyTrash(); setConfirmEmptyTrash(false); setTrashOpen(false) }}
                    style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: 'none', background: 'var(--danger)', color: 'white', cursor: 'pointer', flexShrink: 0 }}
                  >{t('Yes, empty it')}</button>
                  <button
                    onClick={() => setConfirmEmptyTrash(false)}
                    style={{ fontSize: 11, padding: '6px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 }}
                  >{t('Cancel')}</button>
                </div>
              )}

              {/* Liste */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {trash.length === 0 && (
                  <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                    {t('The trash is empty.')}
                  </div>
                )}
                {[...trash].sort((a, b) => b.deletedAt - a.deletedAt).map(entry => {
                  const daysLeft = Math.max(0, Math.ceil((entry.deletedAt + 30 * 86400000 - Date.now()) / 86400000))
                  const widgetN  = Object.keys(entry.board.widgets).length
                  return (
                    <div key={entry.board.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 13px', borderRadius: 11,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.board.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }} suppressHydrationWarning>
                        {widgetN} {widgetN !== 1 ? t('Widgets') : t('Widget')} · {t('expires in {n} days').replace('{n}', String(daysLeft))}
                      </span>
                      <button
                        onClick={() => restoreBoard(entry.board.id)}
                        style={{
                          flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                          border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
                        }}
                      >{t('Restore')}</button>
                      <button
                        onClick={() => purgeBoard(entry.board.id)}
                        title={t('Delete permanently')}
                        style={{
                          flexShrink: 0, width: 24, height: 24, borderRadius: 7,
                          border: '1px solid var(--border)', background: 'var(--surface2)',
                          color: 'var(--danger)', cursor: 'pointer', fontSize: 12, lineHeight: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                      >×</button>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Lösch-Bestätigung ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 18, padding: 28,
                display: 'flex', flexDirection: 'column', gap: 12, width: 320,
                boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700 }}>{t('Move board to trash?')}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>
                {t('The board')} <strong>&quot;{boards.find(b => b.id === confirmDelete)?.name}&quot;</strong> {t('will move to the trash and can be restored there for')} <strong>{t('30 days')}</strong>.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { deleteBoard(confirmDelete); setConfirmDelete(null) }}
                  style={{
                    flex: 1, padding: '9px', fontSize: 13, fontWeight: 600,
                    borderRadius: 999, border: 'none', background: 'var(--danger)', color: 'white', cursor: 'pointer',
                  }}
                >{t('Move to trash')}</button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  style={{
                    flex: 1, padding: '9px', fontSize: 13,
                    borderRadius: 999, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer',
                  }}
                >{t('Cancel')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ordner löschen: Bestätigung ── */}
      <AnimatePresence>
        {confirmFolderDelete && (
          <motion.div key="folder-delete-confirm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setConfirmFolderDelete(null)}
          >
            <motion.div role="dialog" aria-modal="true" aria-label={t('Confirm delete folder')}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 18, padding: 28,
                display: 'flex', flexDirection: 'column', gap: 12, width: 340,
                boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700 }}>{t('Delete folder?')}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>
                {t('The folder')} <strong>&quot;{confirmFolderDelete}&quot;</strong> {t('will be dissolved.')}
                {deleteBoardsToo
                  ? (inFolder(confirmFolderDelete).length === 1
                    ? <> {t('The board it contains moves to the')} <strong>{t('trash')}</strong> ({t('restorable for 30 days')}).</>
                    : <> {t('The')} {inFolder(confirmFolderDelete).length} {t('boards it contains move to the')} <strong>{t('trash')}</strong> ({t('restorable for 30 days')}).</>)
                  : (inFolder(confirmFolderDelete).length === 1
                    ? <> {t('The board it contains is')} <strong>{t('not deleted')}</strong> — {t('it moves back to the overview.')}</>
                    : <> {t('The')} {inFolder(confirmFolderDelete).length} {t('boards it contains are')} <strong>{t('not deleted')}</strong> — {t('they move back to the overview.')}</>)}
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                padding: '9px 11px', borderRadius: 10, fontSize: 12.5, color: 'var(--text1)',
                border: `1px solid ${deleteBoardsToo ? 'color-mix(in srgb, var(--danger) 45%, transparent)' : 'var(--border)'}`,
                background: deleteBoardsToo ? 'color-mix(in srgb, var(--danger) 8%, transparent)' : 'var(--surface2)',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={deleteBoardsToo}
                  onChange={e => setDeleteBoardsToo(e.target.checked)}
                  style={{ accentColor: 'var(--danger)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                />
                {t('Also delete contained boards')}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => deleteFolder(confirmFolderDelete, deleteBoardsToo)}
                  style={{
                    flex: 1, padding: '9px', fontSize: 13, fontWeight: 600,
                    borderRadius: 999, border: 'none', background: 'var(--danger)', color: 'white', cursor: 'pointer',
                  }}
                >{deleteBoardsToo ? t('Delete folder & boards') : t('Delete folder')}</button>
                <button
                  onClick={() => setConfirmFolderDelete(null)}
                  style={{
                    flex: 1, padding: '9px', fontSize: 13,
                    borderRadius: 999, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer',
                  }}
                >{t('Cancel')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ordner umbenennen ── */}
      <AnimatePresence>
        {renamingFolder && (
          <motion.div key="folder-rename"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setRenamingFolder(null)}
          >
            <motion.div role="dialog" aria-modal="true" aria-label={t('Rename folder')}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: 'min(420px, 92vw)', padding: '26px 28px',
                background: 'color-mix(in srgb, var(--surface) 75%, var(--bg))',
                backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                border: '1px solid var(--border)',
                borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>{t('Rename folder')}</div>
              <input
                autoFocus
                value={renameFolderValue}
                onChange={e => setRenameFolderValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') renameFolder(renamingFolder, renameFolderValue); if (e.key === 'Escape') setRenamingFolder(null) }}
                placeholder={t('Name…')}
                maxLength={30}
                style={{
                  fontSize: 14, padding: '10px 13px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--text1)', outline: 'none',
                }}
              />
              {renameFolderValue.trim() !== renamingFolder && folderNames.includes(renameFolderValue.trim().slice(0, 30)) && (
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>{t('A folder with this name already exists.')}</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setRenamingFolder(null)}
                  style={{ padding: '9px 16px', fontSize: 13, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text1)', cursor: 'pointer' }}
                >{t('Cancel')}</button>
                <button
                  onClick={() => renameFolder(renamingFolder, renameFolderValue)}
                  disabled={!renameFolderValue.trim() || (renameFolderValue.trim() !== renamingFolder && folderNames.includes(renameFolderValue.trim().slice(0, 30)))}
                  style={{
                    padding: '9px 20px', fontSize: 13, fontWeight: 700, borderRadius: 999, border: 'none',
                    background: 'var(--accent)', color: 'white',
                    cursor: renameFolderValue.trim() ? 'pointer' : 'default',
                    opacity: (!renameFolderValue.trim() || (renameFolderValue.trim() !== renamingFolder && folderNames.includes(renameFolderValue.trim().slice(0, 30)))) ? 0.4 : 1,
                  }}
                >{t('Rename')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Backup-Warnung beim ersten Besuch ──
          position:fixed statt normaler Fluss-Platzierung: die Seite selbst
          scrollt (s. äußeres overflow:auto weiter oben), vorher wanderte die
          Warnung je nach Board-Anzahl irgendwo mit dem Inhalt mit statt
          sichtbar zu bleiben. bottom:84 statt 24, damit sie nicht mit dem
          Papierkorb-Button (fixed, bottom:24, rechts) kollidiert. */}

      <style>{`
        .delete-btn { opacity: 0; transition: opacity 0.15s; }
        *:hover > .delete-btn { opacity: 1; }
      `}</style>
    </div>
    {settingsOpen && (
      <SettingsModal
        onClose={() => setSettingsOpen(false)}
        categories={['general', 'boards', 'tastenkürzel', 'daten', 'datenschutz', 'über']}
      />
    )}
    {hydrated && (
      <HomeTutorialTour
        onOpenCreateBoard={() => setCreating(true)}
        onCloseCreateBoard={() => { setCreating(false); setNewName('') }}
        onEnterBoard={() => router.push(`/board/${sorted[0]?.id ?? boards[0]?.id}`)}
      />
    )}
    <DragOverlay>
      {draggingBoardId ? <DragPreviewCard board={boards.find(b => b.id === draggingBoardId)} rotate={dragRotate} /> : null}
    </DragOverlay>
    </DndContext>
  )
}

// ── Kleine Bausteine ──────────────────────────────────────────────────────────

function StatChip({ label, warn, onClick, title }: { label: string; warn?: boolean; onClick?: () => void; title?: string }) {
  const style: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 20,
    background: warn ? 'rgba(245,158,11,0.1)' : 'var(--surface)',
    border: `1px solid ${warn ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
    color: warn ? '#f59e0b' : 'var(--text2)',
    whiteSpace: 'nowrap',
  }
  if (onClick) {
    return (
      <button onClick={onClick} title={title} suppressHydrationWarning
        style={{ ...style, cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = warn ? '#f59e0b' : 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = warn ? 'rgba(245,158,11,0.35)' : 'var(--border)' }}
      >
        {label}
      </button>
    )
  }
  return <span style={style} suppressHydrationWarning>{label}</span>
}

function CardBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); e.preventDefault(); onClick() }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function MenuIco({ d }: { d: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? '#f5c95c' : 'none'} stroke={filled ? '#f5c95c' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 5.2 5.6.7-4.2 3.9 1.1 5.6L12 14.8l-4.9 2.6 1.1-5.6L4 7.9l5.6-.7z"/>
    </svg>
  )
}
