'use client'
import { useState, useEffect, useRef } from 'react'
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

// European 24h ("23:30") vs. American 12h with AM/PM ("11:30 PM")
function formatClockTime(hhmm: string, use12h: boolean): string {
  if (!hhmm) return '--:--'
  if (!use12h) return hhmm
  const [h, m] = hhmm.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export default function SleepWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const mode = useUIStore(s => s.mode)
  const d    = widget.data as SleepData

  // s. types/index.ts SleepData.weekOffset — persistiert für den Fokus-Modus
  const [weekOffset, setWeekOffset] = useState(() => d.weekOffset ?? 0)
  // useState's Lazy-Initializer liest widget.data nur einmal beim Mounten —
  // ohne diesen Re-Sync-Effekt blieb ein zweites gleichzeitiges Mounting
  // (Board-Kachel + Fokus-Modus, s. FocusOverlay.tsx) beim Umschalten der
  // Woche in der jeweils ANDEREN Instanz auf dem alten Stand stehen, obwohl
  // der Wert im Store längst aktuell war. Reiner Wertevergleich, kein
  // Zurückschreiben hier — kann sich also nicht mit setToday()/den
  // Wochen-Buttons gegenseitig aufschaukeln.
  useEffect(() => {
    const next = d.weekOffset ?? 0
    if (next !== weekOffset) setWeekOffset(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.weekOffset])

  const goalH = d.goalH ?? 8
  const log   = d.log ?? {}
  const today = todayStr()
  const entry = log[today]
  const durToday = durationH(entry)
  const goalMet = durToday != null && durToday >= goalH
  const use12h = d.timeFormat24 === false

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }} onPointerDown={e => e.stopPropagation()}>

      {/* Bedtime / woke-up — big editable time display, iOS Sleep Schedule style */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, flexShrink: 0 }}>
        <SleepTimeField icon={<MoonIcon />} label={t('Bedtime')} value={entry?.bed ?? ''} onChange={v => setToday({ bed: v })} use12h={use12h} />
        <SleepTimeField icon={<SunIcon />} label={t('Woke up')} value={entry?.wake ?? ''} onChange={v => setToday({ wake: v })} use12h={use12h} align="right" />
      </div>

      {/* Circular sleep dial — drag the moon/sun around the clock face to set
          bed/wake time, the highlighted arc between them is the sleep window. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SleepDial
          bed={entry?.bed || '23:00'}
          wake={entry?.wake || '07:00'}
          onChangeBed={v => setToday({ bed: v })}
          onChangeWake={v => setToday({ wake: v })}
          use12h={use12h}
        />
      </div>

      {/* Duration + goal message, below the dial like the iOS reference */}
      <div style={{ textAlign: 'center', flexShrink: 0, padding: '0 4px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text1)', lineHeight: 1.2 }}>
          {durToday != null ? fmtH(durToday, lang) : '–'}
        </div>
        <div style={{ fontSize: 9.5, lineHeight: 1.4, color: durToday == null ? 'var(--text3)' : goalMet ? 'var(--accent)' : 'var(--text3)' }}>
          {durToday == null
            ? t('Log tonight\'s sleep to see how it compares to your goal.')
            : goalMet ? t('This schedule meets your sleep goal.') : t('This schedule falls short of your sleep goal.')}
        </div>
      </div>

      {/* 24h ("European") / 12h AM-PM ("American") display toggle — a display
          preference, not an edit-mode-only control, so it stays visible in
          both modes, right above the (edit-mode-only) Sleep goal row below. */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', flexShrink: 0 }}>
        <button
          onClick={() => updateTaskData(widget.id, { timeFormat24: use12h })}
          title={use12h ? t('Switch to 24-hour time') : t('Switch to 12-hour time (AM/PM)')}
          style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.03em',
            padding: '2px 6px', borderRadius: 999,
            border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text3)',
            cursor: 'pointer',
          }}
        >
          {use12h ? '12h' : '24h'}
        </button>
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

// ── Big editable bed/wake time display ──────────────────────────────────────
// A native <input type="time"> handles the actual editing (keyboard, native
// picker — precise entry alongside the dial's drag gesture below), but its
// own visible text is made fully transparent (opacity: 0, not just color —
// that also hides the browser's built-in calendar/clock picker icon, which
// otherwise stretched the field's clickable width well past the digits and
// pushed Bedtime away from the left edge) and a plain span on top renders
// the actual display text, formatted per the 24h/12h toggle — something a
// native time input can't be told to do directly, its format follows the OS
// locale, not the value/attributes.
function SleepTimeField({ icon, label, value, onChange, align, use12h }: {
  icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void; align?: 'left' | 'right'; use12h: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start', minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {icon}{label}
      </span>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <input
          type="time" value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, border: 'none', outline: 'none', padding: 0, margin: 0,
            cursor: 'pointer', colorScheme: 'dark',
          }}
        />
        <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text1)', pointerEvents: 'none', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {formatClockTime(value, use12h)}
        </span>
      </span>
    </label>
  )
}

// ── Circular sleep dial ──────────────────────────────────────────────────────
// 24h clock face: drag the moon (bed) or sun (wake) handle around the ring —
// the highlighted arc between them is the sleep window, matching the visual
// language of iOS's Sleep Schedule circle.
const DIAL_SIZE = 200, DIAL_CX = 100, DIAL_CY = 100, DIAL_R = 74, TRACK_W = 14
// Every 2 hours gets a label — cardinal hours (12/6/12/6) bold and larger,
// the rest smaller/dimmer — same density as the iOS reference dial.
const CARDINAL_HOURS = new Set([0, 6, 12, 18])
const LABEL_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]

function dialLabel(hour: number, use12h: boolean): string {
  if (!use12h) return String(hour).padStart(2, '0')
  const period = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 || 12
  return `${h12}${period}`
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
function minutesToTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function angleForTime(hhmm: string): number {
  return (timeToMinutes(hhmm) / 1440) * 360
}
function polar(r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: DIAL_CX + r * Math.sin(rad), y: DIAL_CY - r * Math.cos(rad) }
}

function SleepDial({ bed, wake, onChangeBed, onChangeWake, use12h }: {
  bed: string; wake: string; onChangeBed: (v: string) => void; onChangeWake: (v: string) => void; use12h: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<'bed' | 'wake' | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const curBed  = dragging === 'bed'  && preview != null ? preview : bed
  const curWake = dragging === 'wake' && preview != null ? preview : wake

  const bedAngle = angleForTime(curBed)
  const wakeAngleRaw = angleForTime(curWake)
  const wakeAngle = wakeAngleRaw <= bedAngle ? wakeAngleRaw + 360 : wakeAngleRaw
  const largeArc = wakeAngle - bedAngle > 180 ? 1 : 0
  const p1 = polar(DIAL_R, bedAngle)
  const p2 = polar(DIAL_R, wakeAngle % 360)
  const arcPath = `M ${p1.x} ${p1.y} A ${DIAL_R} ${DIAL_R} 0 ${largeArc} 1 ${p2.x} ${p2.y}`

  function angleFromPointer(e: PointerEvent): number {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width * DIAL_SIZE
    const relY = (e.clientY - rect.top) / rect.height * DIAL_SIZE
    const dx = relX - DIAL_CX, dy = relY - DIAL_CY
    let angle = Math.atan2(dx, -dy) * 180 / Math.PI
    if (angle < 0) angle += 360
    return angle
  }

  // Store writes happen ONCE on release, not per pointermove — dragging only
  // updates local preview state in between (same lesson as NoteWidget's
  // typing-lag fix: hammering the board store on every intermediate tick of
  // a fast, continuous gesture is what actually causes visible jank).
  function startDrag(which: 'bed' | 'wake') {
    return (e: React.PointerEvent) => {
      e.stopPropagation()
      setDragging(which)
      let last = which === 'bed' ? bed : wake
      const onMove = (ev: PointerEvent) => {
        const angle = angleFromPointer(ev)
        const mins = Math.round((angle / 360 * 1440) / 5) * 5
        last = minutesToTime(mins)
        setPreview(last)
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDragging(null)
        setPreview(null)
        if (which === 'bed') onChangeBed(last)
        else onChangeWake(last)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
      width="100%" height="100%"
      style={{ maxWidth: 240, maxHeight: 240, touchAction: 'none', overflow: 'visible' }}
    >
      <circle cx={DIAL_CX} cy={DIAL_CY} r={DIAL_R} fill="none" stroke="var(--surface2)" strokeWidth={TRACK_W} />

      {Array.from({ length: 24 }, (_, h) => h).map(h => {
        const angle  = h / 24 * 360
        const major  = h % 6 === 0
        const pOut = polar(DIAL_R + TRACK_W / 2 + 2, angle)
        const pIn  = polar(DIAL_R + TRACK_W / 2 - (major ? 6 : 3), angle)
        return <line key={h} x1={pIn.x} y1={pIn.y} x2={pOut.x} y2={pOut.y} stroke="var(--text3)" strokeWidth={major ? 1.4 : 0.8} opacity={major ? 0.55 : 0.28} />
      })}

      <path d={arcPath} fill="none" stroke="var(--accent)" strokeWidth={TRACK_W} strokeLinecap="round" opacity={0.85} />

      {LABEL_HOURS.map(h => {
        const cardinal = CARDINAL_HOURS.has(h)
        const p = polar(DIAL_R - TRACK_W / 2 - (cardinal ? 11 : 9), h / 24 * 360)
        return (
          <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={cardinal ? 8 : 6.5} fontWeight={cardinal ? 700 : 500}
            fill="var(--text3)" opacity={cardinal ? 1 : 0.7}>
            {dialLabel(h, use12h)}
          </text>
        )
      })}

      <g onPointerDown={startDrag('bed')} style={{ cursor: 'grab' }}>
        <circle cx={p1.x} cy={p1.y} r={11} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
        <g transform={`translate(${p1.x - 4}, ${p1.y - 4})`} style={{ color: 'var(--accent)' }}><MoonIcon size={8} /></g>
      </g>
      <g onPointerDown={startDrag('wake')} style={{ cursor: 'grab' }}>
        <circle cx={p2.x} cy={p2.y} r={11} fill="var(--surface)" stroke="#f2b84b" strokeWidth={2} />
        <g transform={`translate(${p2.x - 4}, ${p2.y - 4})`} style={{ color: '#f2b84b' }}><SunIcon size={8} /></g>
      </g>
    </svg>
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

function MoonIcon({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 9.8A6 6 0 0 1 6.2 2.5 6 6 0 1 0 13.5 9.8Z"/>
    </svg>
  )
}

function SunIcon({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="3"/>
      <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>
    </svg>
  )
}
