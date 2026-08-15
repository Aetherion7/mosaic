'use client'
import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { IconDrag } from '@/components/ui/Icons'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { uid } from '@/lib/defaults'
import StatsToggle from '@/components/ui/StatsToggle'
import SlidingTabs from '@/components/ui/SlidingTabs'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { Widget, TaskData, HabitEntry } from '@/types'

type ChartMode     = 'kachel' | 'balken' | 'verlauf'
type ViewMode      = 'weekly' | 'daily'
type RoadmapLayout = 'zigzag' | 'linear'

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEK_DAYS = [
  { key: 'mo', label: 'Mon' },
  { key: 'di', label: 'Tue' },
  { key: 'mi', label: 'Wed' },
  { key: 'do', label: 'Thu' },
  { key: 'fr', label: 'Fri' },
  { key: 'sa', label: 'Sat' },
  { key: 'so', label: 'Sun' },
]
const DAY_KEYS = WEEK_DAYS.map(d => d.key)

const HABIT_COLORS = [
  '#7c6fe8','#4ecdc4','#ffd166','#e84855','#52b5d4','#95e06c','#ff9f43','#a29bfe',
]

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWeekKey(date = new Date()): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() || 7
  d.setDate(d.getDate() + 4 - day)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`
}

function getWeekKeyOffset(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  return getWeekKey(d)
}

function getWeekMonday(wk: string): Date {
  const [yr, w] = wk.split('-W')
  const jan4 = new Date(Number(yr), 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (Number(w) - 1) * 7)
  return monday
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function weekShortLabel(wk: string, t: (s: string) => string): string {
  const monday = getWeekMonday(wk)
  return `${monday.getDate()}. ${t(MONTHS[monday.getMonth()])}`
}

function weekRangeLabel(offset: number, t: (s: string) => string): string {
  if (offset === 0) return t('This week')
  if (offset === -1) return t('Last week')
  const monday = getWeekMonday(getWeekKeyOffset(offset))
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return `${monday.getDate()}. ${t(MONTHS[monday.getMonth()])} – ${sunday.getDate()}. ${t(MONTHS[sunday.getMonth()])}`
}

function getTodayDayKey(): string {
  const keys = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']
  return keys[new Date().getDay()]
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

// Roadmap-Layout-Umschalter: Zickzack- vs. gerader Pfad
function ZigzagLayoutIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,1 9,4 3,7 9,10"/>
    </svg>
  )
}
function LinearLayoutIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="6" y1="1" x2="6" y2="11"/>
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
      <rect x="1" y="1" width="4" height="4" rx="0.8"/>
      <rect x="7" y="1" width="4" height="4" rx="0.8"/>
      <rect x="1" y="7" width="4" height="4" rx="0.8"/>
      <rect x="7" y="7" width="4" height="4" rx="0.8"/>
    </svg>
  )
}

function BarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
      <rect x="1"   y="7" width="2.5" height="4"  rx="0.6"/>
      <rect x="4.8" y="3" width="2.5" height="8"  rx="0.6"/>
      <rect x="8.5" y="5" width="2.5" height="6"  rx="0.6" opacity="0.7"/>
    </svg>
  )
}

function LineIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,9 4,5 7,7 11,2"/>
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskWidget({ widget, readOnly }: { widget: Widget; readOnly?: boolean }) {
  const t = useT()
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const mode   = useUIStore(s => s.mode)
  const d         = widget.data as TaskData
  const habits    = d.habits ?? []
  const statsOpen = d.statsOpen ?? false
  const viewMode      = d.viewMode ?? 'weekly'
  const roadmapLayout = d.roadmapLayout ?? 'zigzag'
  const showStats = useSettings(st => !st.statsDisabledTypes.includes('task'))

  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [chartMode,    setChartMode]    = useState<ChartMode>('kachel')
  const [weekOffset,   setWeekOffset]   = useState(0)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)

  function patch(p: Record<string, unknown>) { updateTaskData(widget.id, p) }

  // Reihenfolge per Drag & Drop (Griff-Icon, nur im Bearbeiten-Modus sichtbar
  // — s. IconDrag-Button unten) — dieselbe Sensor-Distanz wie beim
  // Board-eigenen Widget-Drag, damit ein normaler Klick nicht versehentlich
  // schon als Drag zählt.
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = habits.findIndex(h => h.id === active.id)
    const newIndex = habits.findIndex(h => h.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    patch({ habits: arrayMove(habits, oldIndex, newIndex) })
  }

  // Weekly reset — checked on mount and hourly, so a tab left open across the
  // Sunday→Monday boundary archives and resets without a reload.
  useEffect(() => {
    function checkReset() {
      const boards = useBoardStore.getState().boards
      const boardId = Object.keys(boards).find(bid => boards[bid]?.widgets[widget.id])
      const current = boardId ? (boards[boardId].widgets[widget.id].data as TaskData) : undefined
      const freshHabits = current?.habits ?? []
      if (freshHabits.length === 0) return
      const wk = getWeekKey()
      const updated = freshHabits.map(h => {
        if (!h.lastWeek) return { ...h, lastWeek: wk }
        if (h.lastWeek !== wk) {
          return { ...h, weekDays: [], lastWeek: wk, weeklyLog: { ...(h.weeklyLog ?? {}), [h.lastWeek]: h.weekDays } }
        }
        return h
      })
      if (updated.some((u, i) => u !== freshHabits[i])) updateTaskData(widget.id, { habits: updated })
    }
    checkReset()
    const id = setInterval(checkReset, 60 * 60 * 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id])

  const currentWeek = getWeekKey()
  const todayKey    = getTodayDayKey()
  const todayIdx    = DAY_KEYS.indexOf(todayKey)

  // Datumsanzeige oben mittig im Widget — in der Wochenansicht die
  // Spanne Tag.Monat–Tag.Monat, in der Tagesansicht nur das heutige Datum.
  const weekMonday = getWeekMonday(currentWeek)
  const weekSunday = new Date(weekMonday)
  weekSunday.setDate(weekMonday.getDate() + 6)
  const weekRangeShort = `${weekMonday.getDate()}.${weekMonday.getMonth() + 1}. – ${weekSunday.getDate()}.${weekSunday.getMonth() + 1}.`
  const now = new Date()
  const todayLabel = WEEK_DAYS.find(d => d.key === todayKey)?.label ?? ''
  const todayShort = `${t(todayLabel)}, ${now.getDate()}.${now.getMonth() + 1}.`
  const headerDateLabel = viewMode === 'daily' ? todayShort : weekRangeShort

  function isPastDay(key: string) { return DAY_KEYS.indexOf(key) < todayIdx }

  function getDaysForWeek(h: HabitEntry, wk: string): string[] {
    return wk === currentWeek ? h.weekDays : (h.weeklyLog?.[wk] ?? [])
  }

  function updateHabit(id: string, changes: Partial<HabitEntry>) {
    patch({ habits: habits.map(h => h.id === id ? { ...h, ...changes } : h) })
  }

  function toggleDay(id: string, key: string) {
    if (readOnly || isPastDay(key)) return
    const h = habits.find(x => x.id === id)
    if (!h) return
    const updated = h.weekDays.includes(key) ? h.weekDays.filter(k => k !== key) : [...h.weekDays, key]
    updateHabit(id, { weekDays: updated })
  }

  function addHabit() {
    const id    = `h_${uid()}`
    // Die erste Aufgabe bekommt immer die Theme-Akzentfarbe, weitere die Palette
    const color = habits.length === 0 ? 'var(--accent)' : HABIT_COLORS[habits.length % HABIT_COLORS.length]
    const newH: HabitEntry = { id, name: `${t('Task')} ${habits.length + 1}`, color, weekDays: [], lastWeek: currentWeek, weeklyLog: {} }
    patch({ habits: [...habits, newH] })
    setTimeout(() => setEditingId(id), 50)
  }

  function removeHabit(id: string) { patch({ habits: habits.filter(h => h.id !== id) }) }

  const HISTORY    = 8
  const historyWks = Array.from({ length: HISTORY }, (_, i) => getWeekKeyOffset(-(HISTORY - 1 - i)))

  // Kopfzeile schwebt frei über der scrollenden Liste (wie TopBar.tsx im
  // "island"-Modus) statt als eigene Zeile Platz wegzunehmen — dazwischen
  // bleibt der Widget-Hintergrund sichtbar, beim Scrollen laufen die
  // Aufgaben-Einträge sichtbar unter den frei stehenden Buttons hindurch.
  const contentTopPad = habits.length > 0 ? 40 : (viewMode === 'daily' ? 14 : 6)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

      {/* Ansichts-Umschalter: Wochenraster (Mo–So) vs. Checkpoint-Roadmap für heute
          — gleiches Auswahlfeld-Muster wie im Kalender-Widget (Button + Chevron,
          Dropdown mit Glass-Hintergrund), nur mit Woche/Tag statt Monat/Woche/Tag.
          pointerEvents: 'none' auf dem Container, 'auto' auf jedem Button —
          der leere Zwischenraum lässt Klicks/Scroll zur Liste durch, nur die
          Buttons selbst sind klickbar. */}
      {habits.length > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
          padding: '6px 6px 0', flexShrink: 0, pointerEvents: 'none',
        }} onPointerDown={e => e.stopPropagation()}>
          {viewMode === 'daily' ? (
            <button
              onClick={() => patch({ roadmapLayout: roadmapLayout === 'zigzag' ? 'linear' : 'zigzag' })}
              title={roadmapLayout === 'zigzag' ? t('Switch to linear layout') : t('Switch to zigzag layout')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'start',
                width: 26, height: 26, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text2)', cursor: 'pointer', flexShrink: 0, pointerEvents: 'auto',
              }}
            >
              {roadmapLayout === 'zigzag' ? <ZigzagLayoutIcon /> : <LinearLayoutIcon />}
            </button>
          ) : <div />}
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text2)', textAlign: 'center', letterSpacing: 0.2,
            padding: '4px 9px', borderRadius: 8, background: 'var(--surface2)', justifySelf: 'center', pointerEvents: 'auto',
          }}>
            {headerDateLabel}
          </span>
          <div style={{ position: 'relative', flexShrink: 0, justifySelf: 'end', pointerEvents: 'auto' }}>
            <button
              onClick={() => setViewMenuOpen(o => !o)}
              title={t('Task view')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 9, fontWeight: 600, padding: '4px 9px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text2)', cursor: 'pointer',
              }}
            >
              {viewMode === 'weekly' ? t('Week') : t('Day')}
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: viewMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {viewMenuOpen && (<>
              <div style={{ position: 'fixed', inset: 0, zIndex: 140 }} onClick={() => setViewMenuOpen(false)} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 150,
                display: 'flex', flexDirection: 'column', gap: 1, padding: 4, minWidth: 96,
                background: 'var(--popover-bg)',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)', borderRadius: 10,
                boxShadow: '0 8px 28px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
              }}>
                {(['weekly', 'daily'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => { patch({ viewMode: v }); setViewMenuOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center',
                      fontSize: 10, fontWeight: viewMode === v ? 700 : 500, padding: '5px 8px', borderRadius: 7,
                      border: 'none', textAlign: 'left',
                      background: viewMode === v ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                      color: viewMode === v ? 'var(--accent)' : 'var(--text2)',
                      cursor: 'pointer',
                    }}
                  >
                    {v === 'weekly' ? t('Week') : t('Day')}
                  </button>
                ))}
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* ── Habit list ── */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: viewMode === 'daily' ? 0 : 4,
        padding: `${contentTopPad}px ${viewMode === 'daily' ? 10 : 6}px 4px`,
      }}>
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={habits.map(h => h.id)} strategy={verticalListSortingStrategy}>
            {habits.map((h, i) => (
              <SortableHabitRow
                key={h.id}
                h={h}
                index={i}
                isLast={i === habits.length - 1}
                nextHabit={habits[i + 1]}
                viewMode={viewMode}
                roadmapLayout={roadmapLayout}
                mode={mode}
                readOnly={readOnly}
                editingId={editingId}
                setEditingId={setEditingId}
                updateHabit={updateHabit}
                removeHabit={removeHabit}
                toggleDay={toggleDay}
                isPastDay={isPastDay}
                todayKey={todayKey}
                t={t}
              />
            ))}
          </SortableContext>
        </DndContext>

        {mode === 'edit' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={addHabit}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px', borderRadius: 7, border: '1.5px dashed color-mix(in srgb, var(--accent) 40%, var(--border))', background: 'transparent', color: 'var(--accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('Add task')}
          </button>
        )}
      </div>

      {/* ── Chart section (ein-/ausklappbar) ── */}
      {showStats && habits.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <StatsToggle open={statsOpen} onToggle={() => patch({ statsOpen: !statsOpen })} />
          {statsOpen && (<>
          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px 4px', gap: 4 }}>
            {/* Chart type selector — gleitende Pille (SlidingTabs) */}
            <div onPointerDown={e => e.stopPropagation()}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
              <SlidingTabs<ChartMode>
                options={[
                  { value: 'kachel',  icon: <GridIcon />, title: t('Tiles') },
                  { value: 'balken',  icon: <BarIcon />,  title: t('Bars')  },
                  { value: 'verlauf', icon: <LineIcon />, title: t('Trend') },
                ]}
                value={chartMode}
                onChange={setChartMode}
                slotW={22} slotH={18} radius={4} soft
              />
            </div>

            {/* Week navigation */}
            {chartMode !== 'verlauf' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
                <button onPointerDown={e => e.stopPropagation()} onClick={() => setWeekOffset(o => o - 1)}
                  title={t('Previous week')}
                  style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7,1 3,5 7,9"/></svg>
                </button>
                <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', textAlign: 'center', minWidth: 68 }}>
                  {weekRangeLabel(weekOffset, t)}
                </span>
                <button onPointerDown={e => e.stopPropagation()} onClick={() => setWeekOffset(o => Math.min(0, o + 1))} disabled={weekOffset >= 0}
                  title={t('Next week')}
                  style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: weekOffset >= 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: weekOffset >= 0 ? 0.25 : 1 }}>
                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,1 7,5 3,9"/></svg>
                </button>
              </div>
            )}
          </div>

          {/* Chart */}
          <div style={{ padding: '0 6px 6px' }}>
            {chartMode === 'kachel' && (
              <KachelChart habits={habits} weekKey={getWeekKeyOffset(weekOffset)} getDaysForWeek={getDaysForWeek} />
            )}
            {chartMode === 'balken' && (
              <BalkenChart habits={habits} weekKey={getWeekKeyOffset(weekOffset)} getDaysForWeek={getDaysForWeek} />
            )}
            {chartMode === 'verlauf' && (
              <VerlaufChart habits={habits} weekKeys={historyWks} currentWeek={currentWeek} getDaysForWeek={getDaysForWeek} />
            )}
          </div>
          </>)}
        </div>
      )}
    </div>
  )
}

// ── Eine Aufgaben-/Gewohnheits-Zeile ──────────────────────────────────────────
// Trägt die Drag&Drop-Sortierung (useSortable) UND rendert je nach Ansicht
// entweder die Wochenraster-Karte (Mo–So-Kreise) oder einen Checkpoint der
// Roadmap-Ansicht — beide teilen sich Griff, Namensfeld und Lösch-Button,
// damit Bearbeiten/Umbenennen/Entfernen in beiden Ansichten gleich funktioniert.
function SortableHabitRow({
  h, index, isLast, nextHabit, viewMode, roadmapLayout, mode, readOnly, editingId, setEditingId,
  updateHabit, removeHabit, toggleDay, isPastDay, todayKey, t,
}: {
  h: HabitEntry
  index: number
  isLast: boolean
  nextHabit?: HabitEntry
  viewMode: ViewMode
  roadmapLayout: RoadmapLayout
  mode: 'edit' | 'view'
  readOnly?: boolean
  editingId: string | null
  setEditingId: (id: string | null) => void
  updateHabit: (id: string, changes: Partial<HabitEntry>) => void
  removeHabit: (id: string) => void
  toggleDay: (id: string, key: string) => void
  isPastDay: (key: string) => boolean
  todayKey: string
  t: (s: string) => string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: h.id, disabled: mode !== 'edit' })
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : undefined,
  }

  // Wichtig: NICHT einfach onPointerDown={e => e.stopPropagation()} nach
  // {...listeners} spreaden — das überschreibt (gleicher Prop-Name, späterer
  // JSX-Wert gewinnt) dnd-kit's eigenen onPointerDown-Handler ersatzlos,
  // wodurch der Drag nie startet. Stattdessen beides verketten: erst
  // stopPropagation (verhindert, dass BoardGrid.tsx währenddessen eine
  // Marquee-Auswahl beginnt), danach den ursprünglichen dnd-kit-Handler selbst aufrufen.
  const dragHandle = mode === 'edit' && (
    <button {...attributes} {...listeners}
      onPointerDown={e => { e.stopPropagation(); listeners?.onPointerDown?.(e) }}
      title={t('Drag to reorder')}
      style={{ width: 14, height: 14, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'grab', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, touchAction: 'none' }}>
      <IconDrag size={11} />
    </button>
  )

  const nameField = editingId === h.id && mode === 'edit' ? (
    <input autoFocus value={h.name} maxLength={60}
      onChange={e => updateHabit(h.id, { name: e.target.value })}
      onBlur={() => setEditingId(null)}
      onPointerDown={e => e.stopPropagation()}
      style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, color: 'var(--text1)', background: 'var(--surface)', borderRadius: 4, padding: '1px 4px', border: 'none', outline: 'none' }}
    />
  ) : (
    // Eigener Flex-Container statt flex:1 direkt auf dem Namen: so sitzt der
    // Bearbeiten-Stift IMMER direkt hinter dem (ggf. mit Ellipsis
    // abgeschnittenen) Namensende, statt vom rechten Rand herangezogen zu werden.
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
      <span onDoubleClick={() => mode === 'edit' && setEditingId(h.id)}
        style={{ minWidth: 0, fontSize: 11, fontWeight: 600, color: 'var(--text1)', cursor: mode === 'edit' ? 'text' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {h.name}
      </span>
      {mode === 'edit' && (
        <button onPointerDown={e => e.stopPropagation()} onClick={() => setEditingId(h.id)}
          title={`${t('Rename')} ${h.name}`}
          style={{ width: 15, height: 15, borderRadius: 4, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>
          </svg>
        </button>
      )}
    </div>
  )

  const removeBtn = mode === 'edit' && (
    <button onPointerDown={e => e.stopPropagation()} onClick={() => removeHabit(h.id)}
      title={`${t('Remove')} ${h.name}`}
      style={{ width: 15, height: 15, borderRadius: 4, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
  )

  // Farbpunkt — in beiden Ansichten identisch, damit die Farbe auch in der
  // Tagesansicht (nicht nur der Wochenansicht) änderbar ist.
  const colorDot = mode === 'edit' ? (
    <div onPointerDown={e => e.stopPropagation()}>
      <ColorSwatch value={h.color} onChange={v => updateHabit(h.id, { color: v })}
        trigger={onClick => <div onClick={onClick} style={{ width: 10, height: 10, borderRadius: '50%', background: h.color, border: '1.5px solid rgba(255,255,255,0.15)', cursor: 'pointer', flexShrink: 0 }} />}
      />
    </div>
  ) : (
    <div style={{ width: 7, height: 7, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
  )

  if (viewMode === 'daily') {
    const doneToday     = h.weekDays.includes(todayKey)
    const nextDoneToday = nextHabit?.weekDays.includes(todayKey) ?? false
    // Verbindung bleibt gedämpft/"transparent", solange nicht BEIDE
    // verknüpften Checkpoints abgehakt sind — erst dann wird sie vollfarbig
    // (Verlauf von der aktuellen zur nächsten Habit-Farbe).
    const bothDone = doneToday && nextDoneToday
    // Pathways/Duolingo-artige Checkpoint-Roadmap: größere, zentrierte Kreise,
    // die im Zickzack-Layout abwechselnd links/rechts der Mitte versetzt sind;
    // im linearen Layout bleiben sie mittig (offset 0 für alle). Amplitude/
    // Zeilenhöhe sind feste Konstanten, damit sich Länge/Winkel der
    // Verbindungslinie zum nächsten Checkpoint rein rechnerisch (ohne
    // Messen) bestimmen lassen.
    const CIRCLE     = 56
    const AMP        = 64
    const ROW_H       = 100
    const LINE_THICK = 3
    // Lineares Layout: Kreise linksbündig statt zentriert, Pfad läuft gerade
    // nach unten (Zickzack-Auslenkung bleibt bei 0/0 → dx=0 → senkrechte Linie).
    const LINEAR_X   = CIRCLE / 2 + 6
    const offset     = roadmapLayout === 'zigzag' ? (index % 2 === 0 ? -AMP : AMP) : 0
    const nextOffset = roadmapLayout === 'zigzag' ? -offset : 0
    const anchorX    = roadmapLayout === 'zigzag' ? `calc(50% + ${offset}px)` : `${LINEAR_X}px`
    // Linie verläuft Mittelpunkt-zu-Mittelpunkt (nicht Tangente-zu-Tangente) —
    // die Kreise selbst (zIndex 1, höher als die Linie) überdecken dadurch das
    // jeweils innere Stück, sodass der Pfad optisch durchgehend IN die Kreise
    // hineinläuft statt sichtbar davor zu enden.
    const dx = nextOffset - offset
    const dy = ROW_H
    const pathLen   = Math.hypot(dx, dy)
    const pathAngle = Math.atan2(dy, dx) * 180 / Math.PI
    // Label sitzt im Zickzack auf der Seite, zu der der Kreis NICHT ausgelenkt
    // ist (nutzt den freien Platz); im linearen Layout sitzt der Kreis links,
    // der Text also immer rechts davon.
    const labelOnRight = roadmapLayout === 'linear' ? true : offset < 0
    const labelPos: React.CSSProperties = labelOnRight
      ? { left: `calc(${anchorX} + ${CIRCLE / 2 + 8}px)`, justifyContent: 'flex-start' }
      : { right: `calc(100% - ${anchorX} + ${CIRCLE / 2 + 8}px)`, justifyContent: 'flex-end' }

    return (
      // flexShrink: 0 ist hier Pflicht — ohne das quetscht der scrollende
      // Flex-Container (der bei vielen Aufgaben höher wird als sichtbar) die
      // fest gesetzte `height` jeder Zeile zusammen, wodurch die absolut
      // positionierten Kreise übereinander stapeln statt sauber untereinander
      // zu stehen (das exakte Problem aus dem Screenshot der Rückmeldung).
      <div ref={setNodeRef} style={{ ...dragStyle, position: 'relative', flexShrink: 0, height: isLast ? CIRCLE + 36 : ROW_H }}>
        {/* Pfad zum nächsten Checkpoint. Beim Ziehen (isDragging) ausgeblendet,
            damit die Drag-Vorschau nur den Kreis zeigt, keine mitwandernde
            angeschnittene Linie. */}
        {!isLast && !isDragging && (
          <div style={{
            position: 'absolute', left: anchorX, top: CIRCLE / 2 - LINE_THICK / 2, width: pathLen, height: LINE_THICK,
            transformOrigin: '0 50%', transform: `rotate(${pathAngle}deg)`,
            background: bothDone
              ? `linear-gradient(90deg, ${h.color}, ${nextHabit?.color ?? h.color})`
              : `color-mix(in srgb, ${h.color} 35%, var(--border))`,
            borderRadius: 2, transition: 'background 0.2s',
          }} />
        )}
        <button onClick={() => toggleDay(h.id, todayKey)} disabled={readOnly}
          title={h.name}
          style={{
            position: 'absolute', left: anchorX, top: 0, transform: 'translateX(-50%)',
            width: CIRCLE, height: CIRCLE, borderRadius: '50%', zIndex: 1, padding: 0,
            border: `2.5px solid ${h.color}`,
            // Nicht einfach var(--surface2) — im Crystal-Glass-Theme ist das nur
            // 10% deckend, wodurch der Verbindungslinien-Treffpunkt mitten durch
            // den (dann fast unsichtbaren) Kreis hindurchscheint. var(--bg) ist
            // in jedem Theme deckend, daher hier stark gewichtet.
            background: doneToday ? h.color : 'color-mix(in srgb, var(--surface2) 20%, var(--bg) 80%)',
            boxShadow: doneToday ? `0 0 0 4px color-mix(in srgb, ${h.color} 16%, transparent)` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: readOnly ? 'default' : 'pointer', transition: 'all 0.15s',
          }}>
          {doneToday && <CheckIcon />}
        </button>
        {/* Name/Steuerung sitzt neben (nicht unter) dem Kreis — auf der Seite,
            zu der der Kreis NICHT ausgelenkt ist, damit der freie Platz der
            Zickzack-Auslegung genutzt wird statt der Text mittig unter dem
            Kreis abgeschnitten zu werden. */}
        <div style={{
          position: 'absolute', top: CIRCLE / 2, transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center',
          gap: 3, maxWidth: 140,
          ...labelPos,
        }}>
          {dragHandle}
          {colorDot}
          {nameField}
          {removeBtn}
        </div>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={{ ...dragStyle, display: 'flex', flexDirection: 'column', gap: 4, padding: '5px 7px', borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)', flexShrink: 0 }}>
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {dragHandle}
        {colorDot}

        {nameField}

        <span style={{ fontSize: 9, fontWeight: 700, color: h.color, flexShrink: 0 }}>{h.weekDays.length}/7</span>

        {removeBtn}
      </div>

      {/* Weekday circles — über die volle Kartenbreite verteilt (space-between)
          statt mittig geklumpt, damit an den Seiten kein Leerraum bleibt. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        {WEEK_DAYS.map(({ key, label }) => {
          const checked = h.weekDays.includes(key)
          const past    = isPastDay(key)
          return (
            <button key={key} onPointerDown={e => e.stopPropagation()} onClick={() => toggleDay(h.id, key)}
              disabled={readOnly || past}
              title={t(label)}
              style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${checked ? h.color : past ? 'transparent' : 'var(--border)'}`,
                background: checked ? `color-mix(in srgb, ${h.color} 18%, transparent)` : 'transparent',
                color: checked ? h.color : 'var(--text3)',
                fontSize: 8, fontWeight: 700,
                cursor: readOnly || past ? 'default' : 'pointer',
                opacity: past && !checked ? 0.28 : 1,
                transition: 'all 0.1s', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {t(label)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Kachel (heatmap grid) ─────────────────────────────────────────────────────

function KachelChart({ habits, weekKey, getDaysForWeek }: {
  habits: HabitEntry[]
  weekKey: string
  getDaysForWeek: (h: HabitEntry, wk: string) => string[]
}) {
  const W    = 260
  const cellH = 13
  const rowH  = 17
  const PAD  = { t: 13, l: 4, r: 4, b: 2 }
  const cW   = (W - PAD.l - PAD.r) / 7
  const H    = PAD.t + habits.length * rowH + PAD.b
  const t = useT()

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {WEEK_DAYS.map(({ key, label }, i) => (
        <text key={key} x={PAD.l + i * cW + cW / 2} y={PAD.t - 3} textAnchor="middle" fontSize={6.5} fill="var(--text3)" fontWeight="600">
          {t(label)}
        </text>
      ))}
      {habits.map((h, hi) => {
        const days = getDaysForWeek(h, weekKey)
        const y    = PAD.t + hi * rowH
        return (
          <g key={h.id}>
            {WEEK_DAYS.map(({ key }, di) => {
              const done = days.includes(key)
              return (
                <rect key={key}
                  x={PAD.l + di * cW + 1} y={y} width={cW - 2} height={cellH} rx={2.5}
                  fill={done ? h.color : 'transparent'}
                  stroke={done ? h.color : 'color-mix(in srgb, var(--border) 70%, transparent)'}
                  strokeWidth={0.8}
                  opacity={done ? 0.85 : 0.45}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

// ── Balken (stacked bar) ──────────────────────────────────────────────────────

function BalkenChart({ habits, weekKey, getDaysForWeek }: {
  habits: HabitEntry[]
  weekKey: string
  getDaysForWeek: (h: HabitEntry, wk: string) => string[]
}) {
  const W   = 260, H = 80
  const PAD = { t: 6, r: 4, b: 16, l: 4 }
  const cW  = W - PAD.l - PAD.r
  const cH  = H - PAD.t - PAD.b
  const gW  = cW / 7
  const bW  = Math.min(gW * 0.72, 24)
  const nH  = habits.length
  const segH = nH > 0 ? cH / nH : cH
  const t = useT()

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* Background bars */}
      {WEEK_DAYS.map(({ key }, di) => (
        <rect key={key}
          x={PAD.l + di * gW + (gW - bW) / 2} y={PAD.t} width={bW} height={cH} rx={3}
          fill="color-mix(in srgb, var(--surface2) 80%, transparent)"
          stroke="var(--border)" strokeWidth={0.5}
        />
      ))}

      {/* Stacked segments */}
      {WEEK_DAYS.map(({ key }, di) => (
        <g key={key}>
          {habits.map((h, hi) => {
            const done = getDaysForWeek(h, weekKey).includes(key)
            if (!done) return null
            return (
              <rect key={h.id}
                x={PAD.l + di * gW + (gW - bW) / 2}
                y={PAD.t + cH - (hi + 1) * segH + 0.5}
                width={bW} height={segH - 1} rx={2}
                fill={h.color} opacity={0.85}
              />
            )
          })}
        </g>
      ))}

      {/* Day labels */}
      {WEEK_DAYS.map(({ key, label }, di) => (
        <text key={key} x={PAD.l + di * gW + gW / 2} y={H - PAD.b + 10} textAnchor="middle" fontSize={6.5} fill="var(--text3)">
          {t(label)}
        </text>
      ))}
    </svg>
  )
}

// ── Verlauf (trend line) ──────────────────────────────────────────────────────

function VerlaufChart({ habits, weekKeys, currentWeek, getDaysForWeek }: {
  habits: HabitEntry[]
  weekKeys: string[]
  currentWeek: string
  getDaysForWeek: (h: HabitEntry, wk: string) => string[]
}) {
  const W = 260
  // Legend wraps: 62px per entry, max 3 rows visible
  const LEGEND_PER_ROW = Math.floor((W - 30) / 62)
  const legendRows     = Math.min(3, Math.ceil(habits.length / LEGEND_PER_ROW))
  const H   = 90 + (legendRows - 1) * 9
  const PAD = { t: 5 + legendRows * 9, r: 8, b: 22, l: 22 }
  const cW  = W - PAD.l - PAD.r
  const cH  = H - PAD.t - PAD.b
  const n   = weekKeys.length
  const gW  = n > 1 ? cW / (n - 1) : cW

  const px = (wi: number) => PAD.l + wi * gW
  const py = (v: number)  => PAD.t + cH * (1 - v / 7)
  const t = useT()

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* Grid */}
      {[0, 3, 7].map(v => (
        <g key={v}>
          <line x1={PAD.l} y1={py(v)} x2={W - PAD.r} y2={py(v)} stroke="color-mix(in srgb, var(--border) 55%, transparent)" strokeWidth={0.5}/>
          <text x={PAD.l - 3} y={py(v) + 3.5} textAnchor="end" fontSize={6} fill="var(--text3)">{v}</text>
        </g>
      ))}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + cH} stroke="var(--border)" strokeWidth={0.8}/>
      <line x1={PAD.l} y1={PAD.t + cH} x2={W - PAD.r} y2={PAD.t + cH} stroke="var(--border)" strokeWidth={0.8}/>

      {/* Lines per habit */}
      {habits.map(h => {
        const pts = weekKeys.map((wk, wi) => `${px(wi)},${py(getDaysForWeek(h, wk).length)}`).join(' ')
        return (
          <g key={h.id}>
            <polyline points={pts} fill="none" stroke={h.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}/>
            {weekKeys.map((wk, wi) => (
              <circle key={wi} cx={px(wi)} cy={py(getDaysForWeek(h, wk).length)} r={2} fill={h.color} opacity={wk === currentWeek ? 1 : 0.55}/>
            ))}
          </g>
        )
      })}

      {/* X labels */}
      {weekKeys.map((wk, wi) => (
        <text key={wi} x={px(wi)} y={H - PAD.b + 10} textAnchor="middle" fontSize={5.5}
          fill={wk === currentWeek ? 'var(--text2)' : 'var(--text3)'}
          fontWeight={wk === currentWeek ? '700' : '400'}>
          {wk === currentWeek ? t('Now') : weekShortLabel(wk, t)}
        </text>
      ))}

      {/* Legend — wraps to multiple rows */}
      {habits.slice(0, LEGEND_PER_ROW * 3).map((h, hi) => {
        const row = Math.floor(hi / LEGEND_PER_ROW)
        const col = hi % LEGEND_PER_ROW
        return (
          <g key={hi} transform={`translate(${PAD.l + col * 62}, ${5 + row * 9})`}>
            <rect x={0} y={-4} width={6} height={6} rx={1.5} fill={h.color} opacity={0.9}/>
            <text x={9} y={1} fontSize={6} fill="var(--text2)">{h.name.slice(0, 9)}</text>
          </g>
        )
      })}
    </svg>
  )
}
