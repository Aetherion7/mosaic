'use client'
import { useState, useEffect } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { uid } from '@/lib/defaults'
import StatsToggle from '@/components/ui/StatsToggle'
import SlidingTabs from '@/components/ui/SlidingTabs'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { Widget, TaskData, HabitEntry } from '@/types'

type ChartMode = 'kachel' | 'balken' | 'verlauf'

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
  const showStats = useSettings(st => !st.statsDisabledTypes.includes('task'))

  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [chartMode,  setChartMode]  = useState<ChartMode>('kachel')
  const [weekOffset, setWeekOffset] = useState(0)

  function patch(p: Record<string, unknown>) { updateTaskData(widget.id, p) }

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Habit list ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 6px 4px' }}>
        {habits.map(h => (
          <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '5px 7px', borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)', flexShrink: 0 }}>
            {/* Name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {mode === 'edit' ? (
                <div onPointerDown={e => e.stopPropagation()}>
                  <ColorSwatch value={h.color} onChange={v => updateHabit(h.id, { color: v })}
                    trigger={onClick => <div onClick={onClick} style={{ width: 10, height: 10, borderRadius: '50%', background: h.color, border: '1.5px solid rgba(255,255,255,0.15)', cursor: 'pointer', flexShrink: 0 }} />}
                  />
                </div>
              ) : (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
              )}

              {editingId === h.id && mode === 'edit' ? (
                <input autoFocus value={h.name} maxLength={60}
                  onChange={e => updateHabit(h.id, { name: e.target.value })}
                  onBlur={() => setEditingId(null)}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, color: 'var(--text1)', background: 'var(--surface)', borderRadius: 4, padding: '1px 4px', border: 'none', outline: 'none' }}
                />
              ) : (
                // Eigener Flex-Container statt flex:1 direkt auf dem Namen: so
                // sitzt der Bearbeiten-Stift IMMER direkt hinter dem (ggf. mit
                // Ellipsis abgeschnittenen) Namensende, statt vom rechten Rand
                // des ganzen Zeilen-Containers an den Namen herangezogen zu werden.
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
              )}

              <span style={{ fontSize: 9, fontWeight: 700, color: h.color, flexShrink: 0 }}>{h.weekDays.length}/7</span>

              {mode === 'edit' && (
                <button onPointerDown={e => e.stopPropagation()} onClick={() => removeHabit(h.id)}
                  title={`${t('Remove')} ${h.name}`}
                  style={{ width: 15, height: 15, borderRadius: 4, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
              )}
            </div>

            {/* Weekday buttons */}
            <div style={{ display: 'flex', gap: 2 }}>
              {WEEK_DAYS.map(({ key, label }) => {
                const checked = h.weekDays.includes(key)
                const past    = isPastDay(key)
                return (
                  <button key={key} onPointerDown={e => e.stopPropagation()} onClick={() => toggleDay(h.id, key)}
                    disabled={readOnly || past}
                    style={{
                      flex: 1, height: 22, borderRadius: 4,
                      border: `1.5px solid ${checked ? h.color : past ? 'transparent' : 'var(--border)'}`,
                      background: checked ? `color-mix(in srgb, ${h.color} 13%, transparent)` : 'transparent',
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
        ))}

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
