'use client'
import { useState, useEffect, useRef } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { todayStr, getWeekDates, weekRangeLabel, sleepDurationH } from '@/lib/dates'
import StatsToggle from '@/components/ui/StatsToggle'
import { useT } from '@/hooks/useT'
import { useSettings } from '@/store/settingsStore'
import type { Widget, SleepData, SleepEntry } from '@/types'

const GOAL_MIN = 4, GOAL_MAX = 12, GOAL_STEP = 0.5
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmtH(h: number, lang: 'en' | 'de'): string {
  return h.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 }) + ' h'
}

// Hours + minutes breakdown ("8 h 35 min") for the passive duration readout —
// distinct from fmtH's rounded decimal-hours format used for the goal value.
function fmtHM(hoursFloat: number): string {
  const totalMin = Math.round(hoursFloat * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h} h ${m} min`
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
  const updateTaskData    = useBoardStore(s => s.updateTaskData)
  const updateWidgetQuiet = useBoardStore(s => s.updateWidgetQuiet)
  const mode = useUIStore(s => s.mode)
  const d    = widget.data as SleepData

  // s. types/index.ts SleepData.weekOffset — persistiert für den Fokus-Modus
  const [weekOffset, setWeekOffset] = useState(() => d.weekOffset ?? 0)
  // useState's Lazy-Initializer liest widget.data nur einmal beim Mounten —
  // ohne diesen Re-Sync-Effekt blieb ein zweites gleichzeitiges Mounting
  // (Board-Kachel + Fokus-Modus, s. FocusOverlay.tsx) beim Umschalten der
  // Woche in der jeweils ANDEREN Instanz auf dem alten Stand stehen, obwohl
  // der Wert im Store längst aktuell war. Reiner Wertevergleich, kein
  // Zurückschreiben hier — kann sich also nicht mit setDraft()/den
  // Wochen-Buttons gegenseitig aufschaukeln.
  useEffect(() => {
    const next = d.weekOffset ?? 0
    if (next !== weekOffset) setWeekOffset(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.weekOffset])

  const goalH = d.goalH ?? 8
  const log   = d.log ?? {}
  const today = todayStr()
  // Der Entwurf (noch nicht geloggt) lebt direkt in widget.data.draft statt
  // in lokalem useState — dadurch spiegeln Board-Kachel und Fokus-Overlay
  // sich automatisch, ganz ohne eigenen Re-Sync-Effekt, weil beide Instanzen
  // bei jedem Render denselben Store-Wert lesen.
  const draft    = d.draft ?? { bed: '', wake: '' }
  const durDraft = sleepDurationH(draft)
  const use12h   = d.timeFormat24 === false
  const canLog   = !!draft.bed && !!draft.wake

  function setDraft(patch: Partial<SleepEntry>) {
    updateWidgetQuiet(widget.id, { data: { ...d, draft: { ...draft, ...patch } } })
  }

  // "Jede Nacht neu": Loggen schreibt den Entwurf ins Verlauf UND setzt ihn
  // sofort zurück — die nächste Nacht startet wieder leer, statt die zuletzt
  // eingetragenen Zeiten stehen zu lassen, als wären sie schon die neuen.
  function logSleep() {
    if (!canLog) return
    updateTaskData(widget.id, { log: { ...log, [today]: draft }, draft: { bed: '', wake: '' } })
  }

  const weekDates = getWeekDates(weekOffset)
  const values    = weekDates.map(date => sleepDurationH(log[date]) ?? 0)
  const yMax      = Math.max(goalH + 1, Math.ceil(Math.max(...values, 0)))
  const statsOpen = d.statsOpen ?? false
  const showStats = useSettings(st => !st.statsDisabledTypes.includes('sleep'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }} onPointerDown={e => e.stopPropagation()}>

      {/* Time-format — same custom dropdown pattern as ClockWidget's style
          picker / CalendarWidget's view switcher (button + chevron, opens a
          floating popover with the options spelled out by their real term)
          instead of a bare native <select>, so it reads as the same kind of
          control as every other "pick one of a few options" button in the
          app. Edit-mode only — a settings-like control, not something to
          show while just viewing the board. Top-and-centered since it
          applies to the whole widget (dial + both time fields), not just
          whatever sits directly below it. */}
      {mode === 'edit' && (
        <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <TimeFormatPicker use12h={use12h} onChange={v => updateTaskData(widget.id, { timeFormat24: !v })} />
        </div>
      )}

      {/* Bedtime / woke-up + circular sleep dial, as ONE unit that gets
          centered together in the flex:1 area below — so the labels always
          hug the dial regardless of widget height, instead of sitting at a
          fixed spot near the top of the widget with a growing gap to the
          dial on tall widgets. The label row is in normal document flow
          ABOVE the dial inside this same wrapper, so it can never overlap
          the picker above the wrapper (only the negative marginBottom below
          pulls the dial closer, which only affects what comes after it).
          The previous version anchored the labels via a negative "top"
          measured against the OUTER centered box, which drifted with
          however much free height that box had — safe at one widget size,
          overlapping the picker at another (the narrower minimum surfaced
          it). This wrapper has no such ambiguity: everything inside it is
          normal flow. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 'min(240px, 100%)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: -16, position: 'relative', zIndex: 1 }}>
            <SleepTimeField icon={<MoonIcon />} label={t('Bedtime')} value={draft.bed} onChange={v => setDraft({ bed: v })} use12h={use12h} />
            <SleepTimeField icon={<SunIcon />} label={t('Woke up')} value={draft.wake} onChange={v => setDraft({ wake: v })} use12h={use12h} align="right" />
          </div>
          <div style={{ aspectRatio: '1 / 1', width: '100%' }}>
            <SleepDial
              bed={draft.bed || '23:00'}
              wake={draft.wake || '07:00'}
              onChangeBed={v => setDraft({ bed: v })}
              onChangeWake={v => setDraft({ wake: v })}
              onChangeBoth={(b, w) => setDraft({ bed: b, wake: w })}
              use12h={use12h}
            />
          </div>
        </div>
      </div>

      {/* Passive duration readout — how long the current draft amounts to,
          hours + minutes rather than fmtH's rounded decimal (the goal
          value's format). Purely informational, no +/- controls; editing
          happens on the dial/time fields above. */}
      <div style={{ textAlign: 'center', flexShrink: 0, margin: '2px 0 6px', fontSize: 13, fontWeight: 700, color: durDraft != null ? 'var(--text1)' : 'var(--text3)' }}>
        {durDraft != null ? fmtHM(durDraft) : '–'}
      </div>

      {/* Log sleep — commits the draft to the history below AND resets it,
          so the next night always starts from a blank slate instead of
          silently carrying over whatever was last entered. Sized to its
          content (alignSelf: center) instead of stretching the full widget
          width, which read as oversized for a single confirm action. */}
      <button
        onClick={logSleep}
        disabled={!canLog}
        style={{
          alignSelf: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '7px 22px', borderRadius: 8, border: 'none', marginBottom: 10,
          background: canLog ? 'var(--accent)' : 'var(--surface2)',
          color: canLog ? 'var(--on-accent, white)' : 'var(--text3)',
          fontSize: 11, fontWeight: 700, cursor: canLog ? 'pointer' : 'default',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        {t('Log sleep')}
      </button>

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
          // Explicitly request the native picker instead of relying on the
          // browser opening it only when a click lands on its (invisible,
          // internally-positioned) picker icon — that icon's hit region
          // follows the input's OWN native content width, not our CSS
          // width:100%, so it drifted out of reach in 12h mode once "AM/PM"
          // widened the visible label (worked fine in 24h, silently missed
          // the icon in 12h). showPicker() opens it unconditionally on any
          // click, in both formats.
          onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* unsupported browser — click still focuses for keyboard entry */ } }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, border: 'none', outline: 'none', padding: 0, margin: 0,
            cursor: 'pointer', colorScheme: 'dark',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text1)', pointerEvents: 'none', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {formatClockTime(value, use12h)}
        </span>
      </span>
    </label>
  )
}

// ── Time-format dropdown ─────────────────────────────────────────────────────
// Same button+chevron+floating-popover shape as ClockWidget's clock-style
// picker and CalendarWidget's view switcher — the app's standard "pick one
// of a few options" control, rather than a bare native <select>.
function TimeFormatPicker({ use12h, onChange }: { use12h: boolean; onChange: (use12h: boolean) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const OPTS: { id: boolean; label: string }[] = [
    { id: false, label: t('24-hour clock') },
    { id: true,  label: t('12-hour clock (AM/PM)') },
  ]
  const current = OPTS.find(o => o.id === use12h) ?? OPTS[0]

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t('Time format')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10, fontWeight: 600, padding: '4px 9px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface2)',
          color: 'var(--text2)', cursor: 'pointer',
        }}
      >
        {current.label}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (<>
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', gap: 1, padding: 4, minWidth: 150,
          background: 'var(--popover-bg)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 28px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
        }}>
          {OPTS.map(opt => {
            const active = opt.id === use12h
            return (
              <button
                key={String(opt.id)}
                onClick={() => { onChange(opt.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 10, fontWeight: active ? 700 : 500, padding: '5px 8px', borderRadius: 7,
                  border: 'none', textAlign: 'left',
                  background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text2)',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </>)}
    </div>
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

function SleepDial({ bed, wake, onChangeBed, onChangeWake, onChangeBoth, use12h }: {
  bed: string; wake: string; onChangeBed: (v: string) => void; onChangeWake: (v: string) => void
  onChangeBoth: (bed: string, wake: string) => void; use12h: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<'bed' | 'wake' | 'arc' | null>(null)
  // Holds BOTH times while any drag is in progress — for a handle drag only
  // the field being moved actually changes, for an arc drag both shift
  // together, but the shape is the same either way so one preview object
  // handles all three drag kinds uniformly.
  const [preview, setPreview] = useState<{ bed: string; wake: string } | null>(null)

  const curBed  = preview ? preview.bed  : bed
  const curWake = preview ? preview.wake : wake

  const bedAngle = angleForTime(curBed)
  const wakeAngleRaw = angleForTime(curWake)
  const wakeAngle = wakeAngleRaw <= bedAngle ? wakeAngleRaw + 360 : wakeAngleRaw
  const largeArc = wakeAngle - bedAngle > 180 ? 1 : 0
  const p1 = polar(DIAL_R, bedAngle)
  const p2 = polar(DIAL_R, wakeAngle % 360)
  const arcPath = `M ${p1.x} ${p1.y} A ${DIAL_R} ${DIAL_R} 0 ${largeArc} 1 ${p2.x} ${p2.y}`
  // Grip dots at the arc's midpoint hint that the whole band can be dragged
  // (not just the two end handles) — same idea as a drag-handle affordance.
  const midAngle = (bedAngle + wakeAngle) / 2
  const gripDots = [-6, 0, 6].map(off => polar(DIAL_R, midAngle + off))

  function localPoint(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: DIAL_CX, y: DIAL_CY }
    const rect = svg.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / rect.width * DIAL_SIZE,
      y: (clientY - rect.top) / rect.height * DIAL_SIZE,
    }
  }

  function angleFromPointer(clientX: number, clientY: number): number {
    const { x, y } = localPoint(clientX, clientY)
    const dx = x - DIAL_CX, dy = y - DIAL_CY
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
      e.preventDefault()
      setDragging(which)
      let lastBed = bed, lastWake = wake
      const onMove = (ev: PointerEvent) => {
        const angle = angleFromPointer(ev.clientX, ev.clientY)
        const mins = Math.round((angle / 360 * 1440) / 5) * 5
        const t = minutesToTime(mins)
        if (which === 'bed') lastBed = t; else lastWake = t
        setPreview({ bed: lastBed, wake: lastWake })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDragging(null)
        setPreview(null)
        if (which === 'bed') onChangeBed(lastBed)
        else onChangeWake(lastWake)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  }

  // Dragging the highlighted band itself shifts bed AND wake together by the
  // same delta — moves the whole sleep window earlier/later without
  // changing its length, instead of only ever being able to drag one end.
  function startArcDrag(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    setDragging('arc')
    const startBedMin  = timeToMinutes(bed)
    const startWakeMin = timeToMinutes(wake)
    const startAngle = angleFromPointer(e.clientX, e.clientY)
    let lastBed = bed, lastWake = wake
    const onMove = (ev: PointerEvent) => {
      const angle = angleFromPointer(ev.clientX, ev.clientY)
      let deltaAngle = angle - startAngle
      // Normalize to [-180, 180] so a grab near the 0/360 wrap doesn't jump
      if (deltaAngle > 180) deltaAngle -= 360
      if (deltaAngle < -180) deltaAngle += 360
      const deltaMin = Math.round((deltaAngle / 360 * 1440) / 5) * 5
      lastBed  = minutesToTime(startBedMin + deltaMin)
      lastWake = minutesToTime(startWakeMin + deltaMin)
      setPreview({ bed: lastBed, wake: lastWake })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(null)
      setPreview(null)
      // One atomic update, not two separate onChangeBed/onChangeWake calls —
      // each of those independently spreads the same stale `draft` snapshot
      // in the parent's setDraft(), so the second call would silently
      // overwrite what the first one just wrote (bed snapping back to its
      // pre-drag value while only wake actually moved, ballooning the
      // window's apparent length).
      onChangeBoth(lastBed, lastWake)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Single dispatcher on the whole SVG instead of separate onPointerDown
  // handlers per element: relying on native hit-testing/z-order to route a
  // grab to "the band" vs. a handle vs. an hour label was ambiguous (a press
  // near a handle or over a text glyph could start the wrong drag, or start
  // none at all and fall through to the browser's native text-selection
  // drag instead) — computing the nearest target ourselves from the pointer
  // position is unambiguous, and doubles as one place to preventDefault the
  // native text-selection gesture.
  const HANDLE_HIT_R = 16
  function handleDialPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    const { x, y } = localPoint(e.clientX, e.clientY)
    const distBed  = Math.hypot(x - p1.x, y - p1.y)
    const distWake = Math.hypot(x - p2.x, y - p2.y)
    if (distBed <= HANDLE_HIT_R || distWake <= HANDLE_HIT_R) {
      startDrag(distBed <= distWake ? 'bed' : 'wake')(e)
      return
    }
    const dx = x - DIAL_CX, dy = y - DIAL_CY
    const radial = Math.hypot(dx, dy)
    if (Math.abs(radial - DIAL_R) > TRACK_W / 2 + 8) return
    let angle = Math.atan2(dx, -dy) * 180 / Math.PI
    if (angle < 0) angle += 360
    const inRange = (angle >= bedAngle && angle <= wakeAngle) || (angle + 360 >= bedAngle && angle + 360 <= wakeAngle)
    if (inRange) startArcDrag(e)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
      width="100%" height="100%"
      onPointerDown={handleDialPointerDown}
      style={{ maxWidth: 240, maxHeight: 240, touchAction: 'none', overflow: 'visible', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <circle cx={DIAL_CX} cy={DIAL_CY} r={DIAL_R} fill="none" stroke="var(--surface2)" strokeWidth={TRACK_W} style={{ pointerEvents: 'none' }} />

      {Array.from({ length: 24 }, (_, h) => h).map(h => {
        const angle  = h / 24 * 360
        const major  = h % 6 === 0
        const pOut = polar(DIAL_R + TRACK_W / 2 + 2, angle)
        const pIn  = polar(DIAL_R + TRACK_W / 2 - (major ? 6 : 3), angle)
        return <line key={h} x1={pIn.x} y1={pIn.y} x2={pOut.x} y2={pOut.y} stroke="var(--text3)" strokeWidth={major ? 1.4 : 0.8} opacity={major ? 0.55 : 0.28} style={{ pointerEvents: 'none' }} />
      })}

      {/* The band itself is draggable (shifts bed+wake together) — the three
          grip dots at its midpoint signal that, same as a drag-handle icon. */}
      <path d={arcPath} fill="none" stroke="var(--accent)" strokeWidth={TRACK_W} strokeLinecap="round" opacity={0.85}
        style={{ cursor: dragging === 'arc' ? 'grabbing' : 'grab', pointerEvents: 'none' }} />
      {gripDots.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.6} fill="var(--on-accent, white)" opacity={0.85} style={{ pointerEvents: 'none' }} />
      ))}

      {LABEL_HOURS.map(h => {
        const cardinal = CARDINAL_HOURS.has(h)
        const p = polar(DIAL_R - TRACK_W / 2 - (cardinal ? 11 : 9), h / 24 * 360)
        return (
          <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={cardinal ? 8 : 6.5} fontWeight={cardinal ? 700 : 500}
            fill="var(--text3)" opacity={cardinal ? 1 : 0.7} style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {dialLabel(h, use12h)}
          </text>
        )
      })}

      <g style={{ cursor: 'grab', pointerEvents: 'none' }}>
        <circle cx={p1.x} cy={p1.y} r={11} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
        <g transform={`translate(${p1.x - 4}, ${p1.y - 4})`} style={{ color: 'var(--accent)' }}><MoonIcon size={8} /></g>
      </g>
      <g style={{ cursor: 'grab', pointerEvents: 'none' }}>
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
