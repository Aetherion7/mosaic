'use client'
import { useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { todayStr, getWeekDates, weekRangeLabel } from '@/lib/dates'
import StatsToggle from '@/components/ui/StatsToggle'
import { useT } from '@/hooks/useT'
import { useSettings } from '@/store/settingsStore'
import type { Widget, SleepData, SleepEntry } from '@/types'

const GOAL_MIN = 4, GOAL_MAX = 12, GOAL_STEP = 0.5
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Duration in hours; a wake time "before" bed time means sleeping past midnight
function durationH(e: SleepEntry | undefined): number | null {
  if (!e?.bed || !e?.wake) return null
  const [bh, bm] = e.bed.split(':').map(Number)
  const [wh, wm] = e.wake.split(':').map(Number)
  let mins = (wh * 60 + wm) - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  return mins / 60
}

function fmtH(h: number, lang: 'en' | 'de'): string {
  return h.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 }) + ' h'
}

export default function SleepWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const mode = useUIStore(s => s.mode)
  const d    = widget.data as SleepData

  // s. types/index.ts SleepData.weekOffset — persistiert für den Fokus-Modus
  const [weekOffset, setWeekOffset] = useState(() => d.weekOffset ?? 0)

  const goalH = d.goalH ?? 8
  const log   = d.log ?? {}
  const today = todayStr()
  const entry = log[today]
  const durToday = durationH(entry)

  function setToday(patch: Partial<SleepEntry>) {
    const next: SleepEntry = { bed: entry?.bed ?? '', wake: entry?.wake ?? '', ...patch }
    updateTaskData(widget.id, { log: { ...log, [today]: next } })
  }

  const weekDates = getWeekDates(weekOffset)
  const values    = weekDates.map(date => durationH(log[date]) ?? 0)
  const yMax      = Math.max(goalH + 1, Math.ceil(Math.max(...values, 0)))
  const statsOpen = d.statsOpen ?? false
  const showStats = useSettings(st => !st.statsDisabledTypes.includes('sleep'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }} onPointerDown={e => e.stopPropagation()}>

      {/* Header: today's duration + goal */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0, padding: '2px 2px 0' }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
          {durToday != null ? fmtH(durToday, lang) : '–'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>/ {t('Goal')} {fmtH(goalH, lang)}</span>
        {durToday != null && durToday >= goalH && (
          <span style={{ fontSize: 10, color: 'var(--accent)' }}>✓</span>
        )}
      </div>

      {/* Time inputs for today */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, flexShrink: 0 }}>
        {([
          { key: 'bed'  as const, label: t('Bedtime'), value: entry?.bed ?? '', icon: <MoonIcon /> },
          { key: 'wake' as const, label: t('Woke up'), value: entry?.wake ?? '', icon: <SunIcon /> },
        ]).map(f => (
          <label key={f.key} style={{
            display: 'flex', flexDirection: 'column', gap: 2, padding: '5px 7px',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, minWidth: 0,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {f.icon}{f.label}
            </span>
            <input
              type="time" value={f.value}
              onChange={e => setToday({ [f.key]: e.target.value })}
              style={{ fontSize: 12, fontWeight: 600, background: 'transparent', border: 'none', color: 'var(--text1)', outline: 'none', padding: 0, width: '100%', colorScheme: 'dark' }}
            />
          </label>
        ))}
      </div>

      {/* Goal stepper (edit mode) */}
      {mode === 'edit' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 7px', flexShrink: 0,
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('Sleep goal')}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={() => updateTaskData(widget.id, { goalH: Math.max(GOAL_MIN, goalH - GOAL_STEP) })}
              disabled={goalH <= GOAL_MIN} style={stepBtnStyle(goalH <= GOAL_MIN)}
            >−</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {fmtH(goalH, lang)}
            </span>
            <button
              onClick={() => updateTaskData(widget.id, { goalH: Math.min(GOAL_MAX, goalH + GOAL_STEP) })}
              disabled={goalH >= GOAL_MAX} style={stepBtnStyle(goalH >= GOAL_MAX)}
            >+</button>
          </div>
        </div>
      )}

      {/* Wochenstatistik (ein-/ausklappbar) */}
      <div style={{ display: showStats ? undefined : 'none', flexShrink: 0, marginTop: 'auto', width: '100%', borderTop: '1px solid var(--border)' }}>
        <StatsToggle open={statsOpen} onToggle={() => updateTaskData(widget.id, { statsOpen: !statsOpen })} />
        {statsOpen && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px 4px', gap: 2, justifyContent: 'center' }}>
              <button onPointerDown={e => e.stopPropagation()} onClick={() => {
                const next = weekOffset - 1
                setWeekOffset(next)
                updateTaskData(widget.id, { weekOffset: next })
              }} style={navBtnStyle(false)}>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7,1 3,5 7,9"/></svg>
              </button>
              <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', textAlign: 'center', minWidth: 68 }}>
                {weekRangeLabel(weekOffset, t)}
              </span>
              <button onPointerDown={e => e.stopPropagation()} onClick={() => {
                const next = Math.min(0, weekOffset + 1)
                setWeekOffset(next)
                updateTaskData(widget.id, { weekOffset: next })
              }} disabled={weekOffset >= 0} style={navBtnStyle(weekOffset >= 0)}>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,1 7,5 3,9"/></svg>
              </button>
            </div>
            <div style={{ padding: '0 4px 4px' }}>
              <SleepWeekChart values={values} weekDates={weekDates} goalH={goalH} yMax={yMax} today={today} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SleepWeekChart({ values, weekDates, goalH, yMax, today }: {
  values: number[]; weekDates: string[]; goalH: number; yMax: number; today: string
}) {
  const W   = 260, H = 78
  const PAD = { t: 6, r: 4, b: 14, l: 18 }
  const cW  = W - PAD.l - PAD.r
  const cH  = H - PAD.t - PAD.b
  const gW  = cW / 7
  const bW  = Math.min(gW * 0.6, 20)
  const py  = (v: number) => PAD.t + cH * (1 - v / yMax)
  const t = useT()

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* Y ticks */}
      {[0, Math.round(yMax / 2), yMax].map(v => (
        <g key={v}>
          <line x1={PAD.l} y1={py(v)} x2={W - PAD.r} y2={py(v)} stroke="color-mix(in srgb, var(--border) 55%, transparent)" strokeWidth={0.5}/>
          <text x={PAD.l - 3} y={py(v) + 3} textAnchor="end" fontSize={6} fill="var(--text3)">{v}h</text>
        </g>
      ))}

      {/* Goal line */}
      <line x1={PAD.l} y1={py(goalH)} x2={W - PAD.r} y2={py(goalH)}
        stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 3" opacity={0.55}/>

      {/* Bars */}
      {values.map((v, i) => {
        const isToday  = weekDates[i] === today
        const isFuture = weekDates[i] > today
        const x = PAD.l + i * gW + (gW - bW) / 2
        return (
          <g key={i}>
            {v > 0 && (
              <rect x={x} y={py(v)} width={bW} height={Math.max(1, cH - (py(v) - PAD.t))} rx={3}
                fill={v >= goalH ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, var(--surface3))'}
                opacity={isToday ? 1 : 0.8}/>
            )}
            <text x={PAD.l + i * gW + gW / 2} y={H - PAD.b + 9} textAnchor="middle" fontSize={6.5}
              fill={isToday ? 'var(--text2)' : 'var(--text3)'} fontWeight={isToday ? '700' : '400'}
              opacity={isFuture ? 0.4 : 1}>
              {t(WEEK_LABELS[i])}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'none',
    color: 'var(--text2)', cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    opacity: disabled ? 0.25 : 1,
  }
}

function stepBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)',
    background: 'var(--surface3)', color: 'var(--text2)',
    fontSize: 13, fontWeight: 700, lineHeight: 1, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.3 : 1,
    transition: 'opacity 0.12s',
  }
}

function MoonIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 9.8A6 6 0 0 1 6.2 2.5 6 6 0 1 0 13.5 9.8Z"/>
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="3"/>
      <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>
    </svg>
  )
}
