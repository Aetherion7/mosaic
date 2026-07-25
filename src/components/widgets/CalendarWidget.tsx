'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { IconPin, IconEdit, IconX } from '@/components/ui/Icons'
import { Toggle } from '@/components/ui/settings/shared'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { uid } from '@/lib/defaults'
import { eventOccursOn } from '@/lib/events'
import { getTheme } from '@/lib/themes'
import { requestNotifyPermission } from '@/lib/notify'
import { useT } from '@/hooks/useT'
import type { Widget, CalendarData, CalendarEvent, CalendarRecurrence } from '@/types'

const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const HOURS        = Array.from({ length: 24 }, (_, i) => i)
const HOUR_H_MIN   = 20
const HOUR_H_MAX   = 120
const HOUR_H_STEP  = 10
const HOUR_H_DEF   = 44

const RECURRENCE_LABELS: Record<CalendarRecurrence, string> = {
  daily:   'Täglich',
  weekly:  'Wöchentlich',
  monthly: 'Monatlich',
  yearly:  'Jährlich',
}

function useThemePalette(): string[] {
  const board = useBoardStore(selectBoard)
  const theme = getTheme(board?.themeId ?? 'dark')
  const v     = theme.cssVars
  return [v['--accent'], v['--accent2'], v['--success'], v['--danger'], v['--amber']]
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMonday(d: Date) {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day))
  r.setHours(0, 0, 0, 0)
  return r
}
function hhmm(hour: number, min = 0) {
  return `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`
}
function parseHHMM(s: string) {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function isMultiDay(ev: CalendarEvent): boolean {
  return !!ev.dateEnd && ev.dateEnd > ev.date
}

// UTC ("Z"-Suffix) oder ein TZID-Parameter bedeuten, dass die Ziffern NICHT
// bereits lokale Wanduhrzeit sind — vorher wurden sie unverändert übernommen,
// wodurch importierte Termine aus einer anderen Zeitzone (oder UTC) zur
// falschen lokalen Stunde landeten. Bei TZID wird die tatsächliche Zone
// iterativ per Intl.DateTimeFormat aufgelöst (JS kennt sonst keine IANA-Zonen
// außer der des Nutzers selbst).
function icsWallClockToLocalParts(y: number, mo: number, d: number, hh: number, mm: number, ss: number, tz: string): { y: number; mo: number; d: number; hh: number; mm: number } {
  try {
    let guess = Date.UTC(y, mo - 1, d, hh, mm, ss)
    const target = guess
    for (let i = 0; i < 2; i++) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(new Date(guess))
      const part = (t: string) => +(parts.find(p => p.type === t)?.value ?? 0)
      const shown = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour') % 24, part('minute'), part('second'))
      guess += target - shown
    }
    const r = new Date(guess)
    return { y: r.getFullYear(), mo: r.getMonth() + 1, d: r.getDate(), hh: r.getHours(), mm: r.getMinutes() }
  } catch {
    return { y, mo, d, hh, mm }
  }
}

// Parse .ics file content into CalendarEvent[]
function parseIcs(text: string, palette: string[]): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const blocks = text.split('BEGIN:VEVENT')
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]
    function get(key: string): string {
      const m = block.match(new RegExp(`${key}[^:]*:([^\\r\\n]+)`))
      return m ? m[1].trim() : ''
    }
    // Wie get(), liefert aber zusätzlich die Parameter vor dem ":" (z. B.
    // ";TZID=America/New_York") — für DTSTART/DTEND relevant, get() wirft sie weg.
    function getDated(key: string): { params: string; value: string } | null {
      const m = block.match(new RegExp(`${key}([^:]*):([^\\r\\n]+)`))
      return m ? { params: m[1], value: m[2].trim() } : null
    }
    // digits: YYYYMMDD oder YYYYMMDDTHHMMSS(Z)?. Löst Z/TZID auf und gibt
    // date/time bereits in der lokalen Zeitzone des Browsers zurück.
    function parseIcsDateTime(digits: string, params: string): { date: string; time?: string } {
      const isUtc = digits.endsWith('Z')
      const d0 = isUtc ? digits.slice(0, -1) : digits
      if (d0.length < 15 || d0[8] !== 'T') {
        return { date: `${d0.slice(0, 4)}-${d0.slice(4, 6)}-${d0.slice(6, 8)}` }
      }
      const y = +d0.slice(0, 4), mo = +d0.slice(4, 6), day = +d0.slice(6, 8)
      const hh = +d0.slice(9, 11), mm = +d0.slice(11, 13), ss = +(d0.slice(13, 15) || '0')
      const tzid = params.match(/TZID=([^;]+)/)?.[1]
      if (isUtc || tzid) {
        const local = icsWallClockToLocalParts(y, mo, day, hh, mm, ss, isUtc ? 'UTC' : tzid!)
        return {
          date: `${local.y}-${String(local.mo).padStart(2, '0')}-${String(local.d).padStart(2, '0')}`,
          time: `${String(local.hh).padStart(2, '0')}:${String(local.mm).padStart(2, '0')}`,
        }
      }
      // Kein Z, kein TZID: "floating time" per RFC 5545 — unverändert als
      // lokale Wanduhrzeit übernehmen (bisheriges Verhalten).
      return { date: `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
    }

    const summary  = get('SUMMARY')
    if (!summary) continue

    // Parse DTSTART (handle date-only and datetime formats)
    const dtStartRaw = getDated('DTSTART')
    let date = '', timeStart: string | undefined, timeEnd: string | undefined

    if (dtStartRaw && dtStartRaw.value.length >= 8) {
      const parsed = parseIcsDateTime(dtStartRaw.value, dtStartRaw.params)
      date = parsed.date
      timeStart = parsed.time
    }
    if (!date) continue

    const dtEndRaw = getDated('DTEND')
    let dateEnd: string | undefined
    if (dtEndRaw && dtEndRaw.value.length >= 8) {
      const parsedEnd = parseIcsDateTime(dtEndRaw.value, dtEndRaw.params)
      let endDate = parsedEnd.date
      if (parsedEnd.time) {
        timeEnd = parsedEnd.time
      } else {
        // Date-only DTEND is exclusive per RFC 5545 → last occupied day is DTEND − 1
        const d = new Date(endDate + 'T00:00:00')
        d.setDate(d.getDate() - 1)
        endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
      if (endDate > date) dateEnd = endDate
    }

    // Parse RRULE (FREQ + UNTIL; COUNT is not supported)
    const rrule = get('RRULE')
    let recurrence: CalendarRecurrence | undefined
    let recurrenceUntil: string | undefined
    if (rrule) {
      if (rrule.includes('FREQ=DAILY'))   recurrence = 'daily'
      else if (rrule.includes('FREQ=WEEKLY'))  recurrence = 'weekly'
      else if (rrule.includes('FREQ=MONTHLY')) recurrence = 'monthly'
      else if (rrule.includes('FREQ=YEARLY'))  recurrence = 'yearly'
      const until = rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/)
      if (until) recurrenceUntil = `${until[1]}-${until[2]}-${until[3]}`
    }

    events.push({
      id:          uid(),
      date,
      dateEnd,
      timeStart,
      timeEnd,
      title:       summary.replace(/\\,/g, ',').replace(/\\n/g, '\n'),
      color:       palette[summary.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xFFFFFF, 0) % palette.length] ?? '#7c6fe8',
      location:    get('LOCATION') || undefined,
      description: get('DESCRIPTION').replace(/\\n/g, '\n') || undefined,
      recurrence,
      recurrenceUntil,
    })
  }
  return events
}

function pad(n: number, len = 2) { return String(n).padStart(len, '0') }

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function icsDateTime(dateStr: string, timeStr?: string): string {
  const [y, m, d] = dateStr.split('-')
  if (timeStr) {
    const [hh, mm] = timeStr.split(':')
    return `${y}${m}${d}T${hh}${mm}00`
  }
  return `${y}${m}${d}`
}

// Serialize CalendarEvent[] back into a .ics file — the reverse of parseIcs()
// above. Ganztägige Termine (kein timeStart) nutzen VALUE=DATE mit
// exklusivem DTEND (RFC 5545: letzter belegter Tag + 1), Termine mit Uhrzeit
// den lokalen DTSTART/DTEND ohne Zeitzonen-Konvertierung (wie beim Import).
function eventsToIcs(events: CalendarEvent[]): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//mosaic//Calendar Widget//EN', 'CALSCALE:GREGORIAN']
  const now = new Date()
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  for (const ev of events) {
    const allDay = !ev.timeStart
    lines.push('BEGIN:VEVENT', `UID:${ev.id}@mosaic`, `DTSTAMP:${dtstamp}`)
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDateTime(ev.date)}`)
      const endD = new Date((ev.dateEnd ?? ev.date) + 'T00:00:00')
      endD.setDate(endD.getDate() + 1)
      lines.push(`DTEND;VALUE=DATE:${endD.getFullYear()}${pad(endD.getMonth() + 1)}${pad(endD.getDate())}`)
    } else {
      lines.push(`DTSTART:${icsDateTime(ev.date, ev.timeStart)}`)
      if (ev.timeEnd) lines.push(`DTEND:${icsDateTime(ev.dateEnd ?? ev.date, ev.timeEnd)}`)
    }
    if (ev.recurrence) {
      let rrule = `FREQ=${ev.recurrence.toUpperCase()}`
      if (ev.recurrenceUntil) rrule += `;UNTIL=${ev.recurrenceUntil.replace(/-/g, '')}${allDay ? '' : 'T235959'}`
      lines.push(`RRULE:${rrule}`)
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`)
    if (ev.location)    lines.push(`LOCATION:${escapeIcsText(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function downloadIcsFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface DragState { startColIdx: number; endColIdx: number; startHour: number; endHour: number }
interface PopupState { date: string; endDate: string; startTime: string; endTime: string }

interface DragMoveState         { evId: string; clickOffsetMin: number; clickColOffset?: number; origDaySpan?: number }
interface DragResizeState       { evId: string; origStartMin: number; origEndMin: number; mouseY0: number; scrollTop0: number }
interface DragCornerResizeState { evId: string; origStartMin: number; origEndMin: number; origDateEnd: string; mouseY0: number; scrollTop0: number; mouseX0: number }
interface DragOverride          { evId: string; date: string; dateEnd?: string; startMin: number; endMin: number }

export default function CalendarWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const addCalendarEvent = useBoardStore(s => s.addCalendarEvent)
  const updateCalendarEvent = useBoardStore(s => s.updateCalendarEvent)
  const deleteCalendarEvent = useBoardStore(s => s.deleteCalendarEvent)
  const updateWidget = useBoardStore(s => s.updateWidget)
  const mode = useUIStore(s => s.mode)
  const palette = useThemePalette()
  const fadePastEvents = useSettings(s => s.calendarFadePastEvents)
  const today = new Date()
  const todayStr = toDateStr(today)
  const outerRef = useRef<HTMLDivElement>(null)
  const icsInputRef = useRef<HTMLInputElement>(null)
  const [importToast,     setImportToast]     = useState<string|null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  // View — persisted in widget data so it survives reloads
  const [calView, setCalView] = useState<'month'|'week'|'day'>(() => {
    const v = widget.data.calView as string | undefined
    return (v === 'week' || v === 'day') ? v : 'month'
  })
  function changeCalView(v: 'month'|'week'|'day') {
    setCalView(v)
    updateWidget(widget.id, { data: { ...widget.data, calView: v } })
  }
  const [hourH,   setHourH]   = useState(HOUR_H_DEF)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)

  // Current time (minutes since midnight) — updates every 30 s
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date(); setNowMin(n.getHours() * 60 + n.getMinutes())
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  // Month state
  const [viewYear,     setViewYear]     = useState(today.getFullYear())
  const [viewMonth,    setViewMonth]    = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string|null>(null)

  // Week state
  const [weekStart, setWeekStart] = useState(() => getMonday(today))

  // Day state
  const [dayDate, setDayDate] = useState(() => new Date(today))

  // Drag (week view — create new event by dragging empty cells)
  const draggingRef    = useRef(false)
  const [dragState, setDragState] = useState<DragState|null>(null)
  const [hoverCell, setHoverCell] = useState<{ colIdx: number; hour: number } | null>(null)

  // Popup (week view + edit)
  const [popup,            setPopup]            = useState<PopupState|null>(null)
  const [editingId,        setEditingId]        = useState<string|null>(null)
  const [popupTitle,       setPopupTitle]       = useState('')
  const [popupLocation,    setPopupLocation]    = useState('')
  const [popupDesc,        setPopupDesc]        = useState('')
  const [popupColor,       setPopupColor]       = useState(() => palette[0])
  const [popupRecurrence,  setPopupRecurrence]  = useState<CalendarRecurrence | ''>('')
  const [popupReminderMin, setPopupReminderMin] = useState<number | null>(null)

  const events: CalendarEvent[] = widget.data.events ?? []

  // ─── Drag-move / resize refs ───────────────────────────────────────────────
  const gridScrollRef    = useRef<HTMLDivElement>(null)
  const gridBodyRef      = useRef<HTMLDivElement>(null)
  const eventsRef        = useRef(events)
  const hourHRef         = useRef(hourH)
  const dragMoveRef         = useRef<DragMoveState         | null>(null)
  const dragResizeRef       = useRef<DragResizeState       | null>(null)
  const dragCornerResizeRef = useRef<DragCornerResizeState | null>(null)
  const [dragOverride, setDragOverride] = useState<DragOverride | null>(null)
  const dragOverrideRef  = useRef(dragOverride)
  // Keep refs in sync on every render (stable references, no extra effects needed)
  eventsRef.current      = events
  hourHRef.current       = hourH
  dragOverrideRef.current = dragOverride

  // Week days derived from weekStart — memoized so viewDays keeps a stable
  // reference across renders that don't touch weekStart/calView/dayDate
  // (previously a fresh array every render defeated any downstream memo).
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
  }), [weekStart])

  // Unified view days (1 for day view, 7 for week view)
  const viewDays = useMemo(() => calView === 'day' ? [dayDate] : weekDays, [calView, dayDate, weekDays])
  const viewDaysRef = useRef(viewDays)
  viewDaysRef.current = viewDays

  // ─── Scrollposition der Wochen-/Tagesansicht merken ───────────────────────
  // Ohne das startet das Stundenraster nach Reload/Board-Wechsel immer bei
  // 0 Uhr. Debounced über updateWidgetQuiet: kein Undo-Snapshot, kein
  // lastEdited-Bump — reiner Lesezustand wie beim Reader.
  const updateWidgetQuiet = useBoardStore(s => s.updateWidgetQuiet)
  const dataRef = useRef(widget.data)
  dataRef.current = widget.data
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  function onGridScroll() {
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current)
    scrollSaveTimer.current = setTimeout(() => {
      const el = gridScrollRef.current
      if (!el) return
      updateWidgetQuiet(widget.id, { data: { ...dataRef.current, gridScrollTop: el.scrollTop } })
    }, 350)
  }
  useEffect(() => () => { if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current) }, [])
  // Beim Einblenden des Rasters (Mount bzw. Wechsel auf Woche/Tag) wiederherstellen
  useEffect(() => {
    if (calView === 'month') return
    const el = gridScrollRef.current
    if (!el) return
    const saved = dataRef.current.gridScrollTop as number | undefined
    if (typeof saved === 'number') el.scrollTop = saved
  }, [calView])

  // ─── Window listeners: create-event drag ─────────────────────────────────
  useEffect(() => {
    function onUp() { if (draggingRef.current) finalizeDrag() }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  })

  // ─── Window listeners: move / resize events ───────────────────────────────
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragMoveRef.current) {
        const { evId, clickOffsetMin, clickColOffset, origDaySpan } = dragMoveRef.current
        const ev       = eventsRef.current.find(ev => ev.id === evId)
        if (!ev) return
        const scrollTop = gridScrollRef.current?.scrollTop ?? 0
        const bodyRect  = gridBodyRef.current?.getBoundingClientRect()
        if (!bodyRect) return
        const mouseYFromTop = e.clientY - bodyRect.top + scrollTop
        const rawStart      = (mouseYFromTop / hourHRef.current) * 60 - clickOffsetMin
        const snapped       = Math.round(rawStart / 15) * 15
        const duration      = ev.timeEnd ? parseHHMM(ev.timeEnd) - parseHHMM(ev.timeStart!) : 60
        const newStart      = Math.max(0, Math.min(1425, snapped))
        const newEnd        = Math.min(1440, newStart + duration)
        const numVC         = viewDaysRef.current.length
        const colAreaLeft   = bodyRect.left + 34
        const colW          = (bodyRect.width - 34) / numVC
        const colIdx        = Math.max(0, Math.min(numVC - 1, Math.floor((e.clientX - colAreaLeft) / colW)))

        if (clickColOffset !== undefined && origDaySpan !== undefined) {
          // Multi-day: shift start col by click offset, keep day span
          const startColIdx = Math.max(0, Math.min(numVC - 1, colIdx - clickColOffset))
          const newDate     = toDateStr(viewDaysRef.current[startColIdx])
          const endD        = new Date(newDate + 'T00:00:00')
          endD.setDate(endD.getDate() + origDaySpan)
          setDragOverride({ evId, date: newDate, dateEnd: toDateStr(endD), startMin: newStart, endMin: newEnd })
        } else {
          const newDate = toDateStr(viewDaysRef.current[colIdx])
          setDragOverride({ evId, date: newDate, startMin: newStart, endMin: newEnd })
        }
      } else if (dragResizeRef.current) {
        const { evId, origStartMin, origEndMin, mouseY0, scrollTop0 } = dragResizeRef.current
        const ev        = eventsRef.current.find(ev => ev.id === evId)
        if (!ev) return
        const scrollTop = gridScrollRef.current?.scrollTop ?? 0
        const deltaY    = e.clientY - mouseY0 + (scrollTop - scrollTop0)
        const deltaMin  = Math.round((deltaY / hourHRef.current) * 60 / 15) * 15
        const newEnd    = Math.max(origStartMin + 15, Math.min(1440, origEndMin + deltaMin))
        setDragOverride({ evId, date: ev.date, dateEnd: ev.dateEnd, startMin: origStartMin, endMin: newEnd })

      } else if (dragCornerResizeRef.current) {
        const { evId, origStartMin, origEndMin, mouseY0, scrollTop0, mouseX0 } = dragCornerResizeRef.current
        const ev       = eventsRef.current.find(ev => ev.id === evId)
        if (!ev) return
        const bodyRect = gridBodyRef.current?.getBoundingClientRect()
        if (!bodyRect) return
        const scrollTop = gridScrollRef.current?.scrollTop ?? 0

        // Vertical — update endMin
        const deltaY   = e.clientY - mouseY0 + (scrollTop - scrollTop0)
        const deltaMin = Math.round((deltaY / hourHRef.current) * 60 / 15) * 15
        const newEnd   = Math.max(origStartMin + 15, Math.min(1440, origEndMin + deltaMin))

        // Horizontal — drag right shifts dateEnd, drag left shifts date (start)
        // Threshold: left-extension only activates after deliberate horizontal drag (≥ half a column width)
        const numVC2     = viewDaysRef.current.length
        const colW       = (bodyRect.width - 34) / numVC2
        const relX       = e.clientX - bodyRect.left - 34
        const colIdx     = Math.max(0, Math.min(numVC2 - 1, Math.floor(relX / colW)))
        const colDate    = toDateStr(viewDaysRef.current[colIdx])
        const anchor     = ev.date
        const movedLeft  = mouseX0 - e.clientX > colW * 0.5
        const resDate    = (colDate < anchor && movedLeft) ? colDate : anchor
        const resDateEnd = colDate >= anchor ? colDate : anchor

        setDragOverride({ evId, date: resDate, dateEnd: resDateEnd, startMin: origStartMin, endMin: newEnd })
      }
    }

    function onMouseUp() {
      const override = dragOverrideRef.current
      if ((dragMoveRef.current || dragResizeRef.current || dragCornerResizeRef.current) && override) {
        const ev = eventsRef.current.find(ev => ev.id === override.evId)
        if (ev) {
          updateCalendarEvent(widget.id, {
            ...ev,
            date:      override.date,
            dateEnd:   override.dateEnd ?? ev.dateEnd,
            timeStart: hhmm(Math.floor(override.startMin / 60), override.startMin % 60),
            timeEnd:   hhmm(Math.floor(override.endMin   / 60), override.endMin   % 60),
            copyShadow: undefined,   // Kopie-Schatten verschwindet beim ersten Bewegen
          })
        }
      }
      dragMoveRef.current         = null
      dragResizeRef.current       = null
      dragCornerResizeRef.current = null
      setDragOverride(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [updateCalendarEvent, widget.id])

  // ─── Month helpers ────────────────────────────────────────────────────────
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const startOff = (firstDow + 6) % 7
  const daysInMo = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number|null)[] = [
    ...Array(startOff).fill(null),
    ...Array.from({ length: daysInMo }, (_, i) => i + 1),
  ]
  function monthDateStr(day: number) {
    return `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }
  // Einmal pro Monatsansicht/Termin-Änderung berechnet statt für jede der bis
  // zu 42 Tageszellen einzeln mit events.filter(eventOccursOn) — das lief
  // vorher bei jedem Render (auch für unabhängige State-Änderungen wie
  // Drag/Menü) erneut in O(Tage × Termine).
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of cells) {
      if (day == null) continue
      const ds = monthDateStr(day)
      map.set(ds, events.filter(e => eventOccursOn(e, ds)))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, viewYear, viewMonth, daysInMo, startOff])
  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1) } else setViewMonth(m => m-1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1) } else setViewMonth(m => m+1)
    setSelectedDate(null)
  }

  // ─── Week helpers ─────────────────────────────────────────────────────────
  function prevWeek() { setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate()-7); return d }) }
  function nextWeek() { setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate()+7); return d }) }
  const weekLabel = (() => {
    const end = new Date(weekStart); end.setDate(end.getDate()+6)
    const sm = weekStart.getMonth(), em = end.getMonth()
    if (sm === em) return `${weekStart.getDate()}. – ${end.getDate()}. ${t(MONTH_NAMES[sm])} ${weekStart.getFullYear()}`
    return `${weekStart.getDate()}. ${t(MONTH_NAMES[sm])} – ${end.getDate()}. ${t(MONTH_NAMES[em])} ${end.getFullYear()}`
  })()

  // ─── Day helpers ──────────────────────────────────────────────────────────
  function prevDay() { setDayDate(d => { const n = new Date(d); n.setDate(n.getDate()-1); return n }) }
  function nextDay() { setDayDate(d => { const n = new Date(d); n.setDate(n.getDate()+1); return n }) }
  const dayLabel = `${t(DAY_NAMES[(dayDate.getDay()+6)%7])}, ${dayDate.getDate()}. ${t(MONTH_NAMES[dayDate.getMonth()])} ${dayDate.getFullYear()}`
  const dayIsToday = toDateStr(dayDate) === toDateStr(today)

  // ─── Create-event drag handlers ───────────────────────────────────────────
  function handleCellMouseDown(colIdx: number, hour: number) {
    if (mode === 'view') return
    draggingRef.current = true
    setHoverCell(null)
    setDragState({ startColIdx: colIdx, endColIdx: colIdx, startHour: hour, endHour: hour })
  }
  function handleCellMouseEnter(colIdx: number, hour: number) {
    if (!draggingRef.current) return
    setDragState(ds => ds ? { ...ds, endColIdx: colIdx, endHour: hour } : ds)
  }
  function finalizeDrag() {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragState(ds => {
      if (!ds) return null
      const loCol   = Math.min(ds.startColIdx, ds.endColIdx)
      const hiCol   = Math.max(ds.startColIdx, ds.endColIdx)
      const lo      = Math.min(ds.startHour, ds.endHour)
      const hi      = Math.max(ds.startHour, ds.endHour) + 1
      const date    = toDateStr(viewDays[loCol])
      const endDate = toDateStr(viewDays[hiCol])
      // hi kann 24 sein (Ziehen der 23-Uhr-Zeile) — Math.min(hi,23) hätte das
      // vorher auf denselben Wert wie die Startstunde zurückgeklemmt und eine
      // Null-Minuten-Termin erzeugt. 23:59 statt 24:00, da Enddatum = Startdatum.
      const endTime = hi >= 24 ? '23:59' : hhmm(hi)
      setTimeout(() => openNewPopup(date, hhmm(lo), endTime, endDate), 0)
      return null
    })
  }

  // ─── Edit / copy helpers ──────────────────────────────────────────────────
  function openEditPopup(ev: CalendarEvent) {
    setEditingId(ev.id)
    setPopup({ date: ev.date, endDate: ev.dateEnd ?? ev.date, startTime: ev.timeStart ?? '', endTime: ev.timeEnd ?? '' })
    setPopupTitle(ev.title)
    setPopupLocation(ev.location ?? '')
    setPopupDesc(ev.description ?? '')
    setPopupColor(ev.color)
    setPopupRecurrence(ev.recurrence ?? '')
    setPopupReminderMin(ev.reminderMinutesBefore ?? null)
  }

  function openNewPopup(date: string, startTime = '', endTime = '', endDate?: string) {
    setEditingId(null)
    setPopup({ date, endDate: endDate ?? date, startTime, endTime })
    setPopupTitle('')
    setPopupLocation('')
    setPopupDesc('')
    setPopupColor(palette[0])
    setPopupRecurrence('')
    setPopupReminderMin(null)
  }

  function copyEvent(ev: CalendarEvent) {
    // Kopie 30 Minuten nach unten versetzen, damit sie nicht direkt neben dem
    // Original klebt; copyShadow markiert sie, bis sie erstmals bewegt wird.
    const OFFSET = 30
    let timeStart = ev.timeStart
    let timeEnd   = ev.timeEnd
    if (ev.timeStart) {
      const start = parseHHMM(ev.timeStart)
      const dur   = ev.timeEnd ? parseHHMM(ev.timeEnd) - start : 60
      // Nie vor dem Original starten: bei einem sehr späten Original konnte
      // die obere Mitternachts-Grenze sonst unter "start" liegen, wodurch die
      // Kopie VOR statt nach dem Original landete.
      const maxStart = 24 * 60 - Math.max(15, dur)
      const newStart = Math.max(start, Math.min(start + OFFSET, maxStart))
      timeStart = hhmm(Math.floor(newStart / 60), newStart % 60)
      if (ev.timeEnd) {
        const newEnd = Math.min(24 * 60, newStart + dur)
        timeEnd = hhmm(Math.floor(newEnd / 60), newEnd % 60)
      }
    }
    addCalendarEvent(widget.id, { ...ev, id: uid(), recurrence: undefined, timeStart, timeEnd, copyShadow: true })
  }

  // ─── ICS import ──────────────────────────────────────────────────────────
  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setImportToast(msg)
    toastTimerRef.current = setTimeout(() => setImportToast(null), 3500)
  }

  function handleIcsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fileName = file.name
    const reader = new FileReader()
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer
      const bytes = new Uint8Array(buf)
      let encoding = 'UTF-8'
      if (bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'UTF-16LE'
      else if (bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'UTF-16BE'
      else if (bytes[1] === 0x00 && bytes[3] === 0x00 && bytes[5] === 0x00) encoding = 'UTF-16LE'
      const text = new TextDecoder(encoding).decode(buf)
      const imported = parseIcs(text, palette)
      const existing: CalendarEvent[] = widget.data.events ?? []
      const existingSources: Array<{ name: string; ids: string[] }> = (widget.data.icsSources as Array<{ name: string; ids: string[] }>) ?? []
      // Make display name unique if same file imported multiple times
      const sameCount = existingSources.filter(s => s.name === fileName || s.name.startsWith(fileName + ' (')).length
      const displayName = sameCount > 0 ? `${fileName} (${sameCount + 1})` : fileName
      updateWidget(widget.id, {
        data: {
          ...widget.data,
          events: [...existing, ...imported],
          icsSources: [...existingSources, { name: displayName, ids: imported.map(ev => ev.id) }],
        }
      })
      showToast(`${imported.length} ${imported.length !== 1 ? t('events added') : t('event added')}`)
    }
    reader.onerror = () => showToast(t('Error reading file'))
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ─── Submit handlers ──────────────────────────────────────────────────────
  function submitPopupEvent() {
    if (!popup || !popupTitle.trim()) return
    const endDateDiff = popup.endDate && popup.endDate !== popup.date ? popup.endDate : undefined
    const payload: CalendarEvent = {
      id:          editingId ?? uid(),
      date:        popup.date,
      dateEnd:     endDateDiff,
      timeStart:   popup.startTime || undefined,
      timeEnd:     popup.endTime   || undefined,
      title:       popupTitle.trim(),
      color:       popupColor,
      location:    popupLocation.trim() || undefined,
      description: popupDesc.trim()     || undefined,
      recurrence:  popupRecurrence || undefined,
      // Erinnerung braucht eine Uhrzeit als Ankerpunkt — ohne timeStart bleibt
      // sie aus, egal was im Popup eingestellt war (Feld ist dann eh deaktiviert).
      reminderMinutesBefore: (popup.startTime && popupReminderMin !== null) ? popupReminderMin : undefined,
    }
    if (editingId) updateCalendarEvent(widget.id, payload)
    else           addCalendarEvent(widget.id, payload)
    setPopup(null)
    setEditingId(null)
  }

  function closePopup() {
    setPopup(null)
    setEditingId(null)
  }

  const selectedDateEvents = selectedDate ? events.filter(e => eventOccursOn(e, selectedDate)) : []

  // ── Week/day overlay layout (entries + per-day overlap slots) ──────────────
  // Previously rebuilt from scratch as a plain IIFE inside the JSX on every
  // render — including every mousemove while dragging/resizing an event, and
  // every unrelated re-render (selection, popups, etc.). Hoisted into a memo
  // so it only recomputes when the inputs that actually affect it change.
  const overlayLayout = useMemo(() => {
    const weekDateStrs = viewDays.map(toDateStr)
    const lastDs       = weekDateStrs[weekDateStrs.length - 1]
    // Multi-day events (non-recurring) now live exclusively in the pinned
    // multiDayBarLayout strip below instead of the hourly grid — see there.
    // Recurring events are left alone even if they happen to carry a
    // dateEnd: multi-day span math isn't modeled for recurring occurrences
    // anywhere else in this file either (the recurrence branch below always
    // treats each occurrence as a single day), so excluding them here would
    // just silently drop them from both places.
    const timedEvs = events.filter(ev => !!ev.timeStart && !(isMultiDay(ev) && !ev.recurrence))
    if (!timedEvs.length) return { entries: [], overlapMap: new Map<string, { slot: number; totalSlots: number }>() }

    const entries: Array<{ ev: CalendarEvent; colStart: number; numCols: number; effStart: string; effEnd: string }> = []
    for (const ev of timedEvs) {
      const eff              = dragOverride?.evId === ev.id ? dragOverride : null
      const dateEnd          = ev.dateEnd ?? ev.date
      const effectiveStart   = eff?.date    ?? ev.date
      const effectiveDateEnd = eff?.dateEnd ?? dateEnd
      if (ev.recurrence && !eff) {
        weekDateStrs.forEach((ds, colIdx) => {
          if (eventOccursOn(ev, ds))
            entries.push({ ev, colStart: colIdx, numCols: 1, effStart: ds, effEnd: ds })
        })
      } else {
        if (effectiveStart > lastDs || effectiveDateEnd < weekDateStrs[0]) continue
        let colStart = weekDateStrs.findIndex(ds => ds >= effectiveStart)
        if (colStart === -1) colStart = 0
        let colEnd = -1
        for (let i = weekDateStrs.length - 1; i >= 0; i--) {
          if (weekDateStrs[i] <= effectiveDateEnd) { colEnd = i; break }
        }
        if (colEnd < 0 || colStart > colEnd) continue
        entries.push({ ev, colStart, numCols: colEnd - colStart + 1, effStart: effectiveStart, effEnd: effectiveDateEnd })
      }
    }
    if (!entries.length) return { entries, overlapMap: new Map<string, { slot: number; totalSlots: number }>() }

    // ── Per-day overlap layout (greedy slot assignment) ──────────────
    const overlapMap = new Map<string, { slot: number; totalSlots: number }>()
    {
      const dayBuckets = new Map<string, Array<{ key: string; sMin: number; eMin: number }>>()
      for (const { ev, colStart, numCols, effStart } of entries) {
        if (numCols !== 1) continue
        const eff  = dragOverride?.evId === ev.id ? dragOverride : null
        const sMin = eff ? eff.startMin : parseHHMM(ev.timeStart!)
        const eMin = eff ? eff.endMin   : (ev.timeEnd ? parseHHMM(ev.timeEnd) : sMin + 60)
        const bk   = `${colStart}|${effStart}`
        if (!dayBuckets.has(bk)) dayBuckets.set(bk, [])
        dayBuckets.get(bk)!.push({ key: `${ev.id}|${effStart}`, sMin, eMin })
      }
      for (const bucket of dayBuckets.values()) {
        const sorted = [...bucket].sort((a, b) => a.sMin - b.sMin)
        const slotEnds: number[] = []
        const assigned: number[] = []
        for (const e of sorted) {
          let s = slotEnds.findIndex(t => t <= e.sMin)
          if (s === -1) { s = slotEnds.length; slotEnds.push(0) }
          slotEnds[s] = e.eMin
          assigned.push(s)
        }
        sorted.forEach((e, i) => {
          // Count max simultaneous events active during e's own time window
          let maxConcurrent = 1
          for (const f of sorted) {
            if (f.sMin >= e.eMin || f.eMin <= e.sMin) continue
            const t   = Math.max(f.sMin, e.sMin)
            const cnt = sorted.filter(g => g.sMin <= t && g.eMin > t).length
            if (cnt > maxConcurrent) maxConcurrent = cnt
          }
          overlapMap.set(e.key, { slot: assigned[i], totalSlots: maxConcurrent })
        })
      }
    }

    return { entries, overlapMap }
  }, [events, viewDays, dragOverride])

  // Mehrtägige Termine (nicht wiederkehrend) — gerendert als angepinnte
  // Leiste unter dem Tages-Header statt im Stundenraster, siehe Kommentar in
  // overlayLayout oben. colStart/numCols wird auf viewDays geclippt, exakt
  // dieselbe Spannlogik wie overlayLayout's else-Zweig vorher hatte.
  // Überlappende Termine werden per einfachem Interval-Stacking auf Zeilen
  // verteilt (gleiche Grundidee wie overlayLayout's Tages-Overlap-Map, nur
  // eindimensional über Spalten statt Minuten).
  const multiDayBarLayout = useMemo(() => {
    const weekDateStrs = viewDays.map(toDateStr)
    const lastDs = weekDateStrs[weekDateStrs.length - 1]
    const multiDayEvs = events.filter(ev => isMultiDay(ev) && !ev.recurrence)
    if (!multiDayEvs.length) return { entries: [], rowCount: 0 }

    const raw: Array<{ ev: CalendarEvent; colStart: number; numCols: number }> = []
    for (const ev of multiDayEvs) {
      const eff = dragOverride?.evId === ev.id ? dragOverride : null
      const effectiveStart   = eff?.date    ?? ev.date
      const effectiveDateEnd = eff?.dateEnd ?? (ev.dateEnd ?? ev.date)
      if (effectiveStart > lastDs || effectiveDateEnd < weekDateStrs[0]) continue
      let colStart = weekDateStrs.findIndex(ds => ds >= effectiveStart)
      if (colStart === -1) colStart = 0
      let colEnd = -1
      for (let i = weekDateStrs.length - 1; i >= 0; i--) {
        if (weekDateStrs[i] <= effectiveDateEnd) { colEnd = i; break }
      }
      if (colEnd < 0 || colStart > colEnd) continue
      raw.push({ ev, colStart, numCols: colEnd - colStart + 1 })
    }
    if (!raw.length) return { entries: [], rowCount: 0 }

    // Greedy: sortiert nach colStart, jeder Termin geht in die erste Zeile,
    // deren zuletzt belegte Spalte vor diesem colStart liegt.
    const sorted  = [...raw].sort((a, b) => a.colStart - b.colStart)
    const rowEnds: number[] = []
    const entries: Array<{ ev: CalendarEvent; colStart: number; numCols: number; row: number }> = []
    for (const e of sorted) {
      let row = rowEnds.findIndex(end => end < e.colStart)
      if (row === -1) { row = rowEnds.length; rowEnds.push(-1) }
      rowEnds[row] = e.colStart + e.numCols - 1
      entries.push({ ...e, row })
    }
    return { entries, rowCount: rowEnds.length }
  }, [events, viewDays, dragOverride])

  return (
    <div
      ref={outerRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6, overflow: 'hidden', position: 'relative' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Kopfzeile — eine Zeile: Zeitraum-Pille (mit Icon + Navigation) mittig
          zentriert, rechts die Monat/Woche/Tag-Auswahl und der ICS-Import */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }} />
        <NavBtn
          onClick={calView === 'month' ? prevMonth : calView === 'week' ? prevWeek : prevDay}
          title={calView === 'month' ? t('Previous month') : calView === 'week' ? t('Previous week') : t('Previous day')}
        >‹</NavBtn>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5, minWidth: 0,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 999, padding: '3px 10px',
          fontSize: 10, fontWeight: 700, color: 'var(--text1)', whiteSpace: 'nowrap',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {calView === 'month' ? `${t(MONTH_NAMES[viewMonth])} ${viewYear}` : calView === 'week' ? weekLabel : dayLabel}
          </span>
        </span>
        <NavBtn
          onClick={calView === 'month' ? nextMonth : calView === 'week' ? nextWeek : nextDay}
          title={calView === 'month' ? t('Next month') : calView === 'week' ? t('Next week') : t('Next day')}
        >›</NavBtn>
        {/* Rechte Seite gleich breit wie der linke Abstandshalter → Pille bleibt mittig */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          {/* Ansichts-Auswahl als einzelnes Feld mit Aufklapp-Pfeil
              (Muster: Uhrenstil-Dropdown im ClockWidget, öffnet nach unten) */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setViewMenuOpen(o => !o)}
              title={t('Calendar view')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 9, fontWeight: 600, padding: '4px 9px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text2)', cursor: 'pointer',
              }}
            >
              {calView === 'month' ? t('Month') : calView === 'week' ? t('Week') : t('Day')}
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: viewMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {viewMenuOpen && (<>
              <div style={{ position: 'fixed', inset: 0, zIndex: 140 }} onClick={() => setViewMenuOpen(false)} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 150,
                display: 'flex', flexDirection: 'column', gap: 1, padding: 4, minWidth: 96,
                background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)', borderRadius: 10,
                boxShadow: '0 8px 28px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
              }}>
                {(['month','week','day'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => { changeCalView(v); setSelectedDate(null); setDragState(null); setPopup(null); setViewMenuOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center',
                      fontSize: 10, fontWeight: calView === v ? 700 : 500, padding: '5px 8px', borderRadius: 7,
                      border: 'none', textAlign: 'left',
                      background: calView === v ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                      color: calView === v ? 'var(--accent)' : 'var(--text2)',
                      cursor: 'pointer',
                    }}
                  >
                    {v === 'month' ? t('Month') : v === 'week' ? t('Week') : t('Day')}
                  </button>
                ))}
              </div>
            </>)}
          </div>
          {/* ICS upload — directly opens file picker */}
          <button
            onClick={() => icsInputRef.current?.click()}
            title={t('Import ICS calendar')}
            style={{
              width: 24, height: 22, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
          {/* ICS export — Kalenderdaten als .ics-Datei herunterladen */}
          <button
            onClick={() => {
              const today = new Date()
              downloadIcsFile(`mosaic-calendar-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.ics`, eventsToIcs(events))
              showToast(`${events.length} ${events.length !== 1 ? t('events exported') : t('event exported')}`)
            }}
            title={t('Export as ICS')}
            style={{
              width: 24, height: 22, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        </div>
        <input ref={icsInputRef} type="file" accept=".ics,text/calendar" onChange={handleIcsFile} style={{ display: 'none' }} />
      </div>


      {/* ── MONAT ── */}
      {calView === 'month' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1 }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ fontSize: 9, textAlign: 'center', fontWeight: 700, color: 'var(--text3)', paddingBottom: 2 }}>{t(d)}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, flex: 1, overflowY: 'auto' }}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const ds      = monthDateStr(day)
            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
            const isSel   = ds === selectedDate
            const dots    = eventsByDate.get(ds) ?? []
            return (
              <button key={day} onClick={() => { if (mode === 'view') return; setSelectedDate(s => s===ds ? null : ds) }} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '3px 1px', borderRadius: 7, border: 'none',
                background: isToday ? 'var(--accent)' : isSel ? 'var(--surface2)' : 'none',
                cursor: mode === 'view' ? 'default' : 'pointer',
                outline: isSel && !isToday ? '1px solid var(--accent)' : 'none', minHeight: 28,
              }}>
                <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? 'white' : 'var(--text1)', lineHeight: 1 }}>{day}</span>
                {dots.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {dots.slice(0,3).map(e => (
                      <div key={e.id} style={{ width: 4, height: 4, borderRadius: '50%', background: isToday ? 'rgba(255,255,255,0.8)' : e.color, opacity: (fadePastEvents && !e.recurrence && ds < todayStr) ? 0.3 : 1 }} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {selectedDate && mode === 'edit' && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selectedDateEvents.map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: (fadePastEvents && !ev.recurrence && (ev.dateEnd ?? ev.date) < todayStr) ? 0.35 : 1 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.timeStart ? <span style={{ color: 'var(--text3)', marginRight: 4 }}>{ev.timeStart}</span> : null}
                  {ev.title}{ev.recurrence ? <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.6 }}>↻</span> : null}
                </span>
                <button onClick={() => openEditPopup(ev)} style={evActionBtn} title={t('Edit')}><IconEdit size={10} /></button>
                <button onClick={() => deleteCalendarEvent(widget.id, ev.id)} style={{ ...evActionBtn, color: 'var(--danger)' }} className="cal-delete-btn" title={t('Delete')}><IconX size={9} /></button>
              </div>
            ))}
            <button
              onClick={() => openNewPopup(selectedDate)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 7, border: '1px dashed var(--border)', background: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, width: '100%' }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> {t('Add event')}
            </button>
          </div>
        )}

        {mode === 'view' && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, maxHeight: 48, overflowY: 'auto' }}>
            {events.filter(e => eventOccursOn(e, todayStr)).slice(0,3).map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: ev.color }} />
                <span style={{ fontSize: 10, color: 'var(--text2)' }}>{ev.title}</span>
              </div>
            ))}
          </div>
        )}
      </>)}

      {/* ── WOCHE / TAG ── */}
      {(calView === 'week' || calView === 'day') && (<>
        {/* Week-day header — outside scroll container so content can never overlap it */}
        {calView === 'week' && (
          <div style={{ display: 'flex', flexShrink: 0 }}>
            <div style={{ width: 34, flexShrink: 0 }} />
            {viewDays.map((d, i) => {
              const isToday = toDateStr(d) === toDateStr(today)
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center', paddingBottom: 4, paddingTop: 2 }}>
                  <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600 }}>{t(DAY_NAMES[i])}</div>
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: isToday ? 'white' : 'var(--text1)',
                    background: isToday ? 'var(--accent)' : 'transparent',
                    borderRadius: '50%', width: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto',
                  }}>{d.getDate()}</div>
                </div>
              )
            })}
          </div>
        )}

        <div ref={gridScrollRef} onScroll={onGridScroll} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', userSelect: 'none' }}>
          {/* Angepinnte Leiste für mehrtägige Termine — schwebt fix über der
              ersten Stundenzeile statt eine eigene Zeile zu belegen: position
              sticky (nicht absolute) auf einem direkten Kind von
              gridScrollRef, verankert an dessen eigenem Scroll-Viewport statt
              am Dokument. Braucht einen deckenden Hintergrund, sonst scheint
              das darunterliegende Stundenraster durch, während es
              wegscrollt. Prozentuale statt pixelbasierter Positionierung:
              derselbe 34px-Gutter-dann-flex1-pro-Tag-Aufbau wie gridBodyRef
              darunter, also entsprechen X% hier immer derselben Spalte dort. */}
          {multiDayBarLayout.entries.length > 0 && (
            <div style={{
              position: 'sticky', top: 0, zIndex: 15,
              display: 'flex', background: 'var(--surface)', paddingBottom: 3,
            }}>
              <div style={{ width: 34, flexShrink: 0 }} />
              <div style={{ flex: 1, position: 'relative', height: multiDayBarLayout.rowCount * 20 }}>
                {multiDayBarLayout.entries.map(({ ev, colStart, numCols, row }) => {
                  const numVC     = viewDays.length
                  const leftPct   = (colStart / numVC) * 100
                  const widthPct  = (numCols / numVC) * 100
                  const dateEnd   = ev.dateEnd ?? ev.date
                  const isPast    = fadePastEvents && dateEnd < todayStr
                  return (
                    <div
                      key={ev.id}
                      onClick={() => { if (mode === 'edit') openEditPopup(ev) }}
                      title={ev.title}
                      style={{
                        position: 'absolute',
                        left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                        top: row * 20, height: 17,
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '0 3px 0 6px', borderRadius: 5,
                        background: ev.color, color: 'white',
                        fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                        cursor: mode === 'edit' ? 'pointer' : 'default',
                        opacity: isPast ? 0.4 : 1,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.timeStart ? `${ev.timeStart} · ` : ''}{ev.title}
                      </span>
                      {mode === 'edit' && (
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button onClick={e => { e.stopPropagation(); openEditPopup(ev) }} style={barEvBtn} title={t('Edit')}><IconEdit size={8} /></button>
                          <button onClick={e => { e.stopPropagation(); deleteCalendarEvent(widget.id, ev.id) }} style={barEvBtn} title={t('Delete')}><IconX size={8} /></button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Grid body */}
          <div ref={gridBodyRef} style={{ display: 'flex', position: 'relative' }}>
            {/* Time labels */}
            <div style={{ width: 34, flexShrink: 0 }}>
              {HOURS.map(h => (
                <div key={h} style={{ height: hourH, fontSize: 9, color: 'var(--text3)', textAlign: 'right', paddingRight: 5, paddingTop: 3, borderBottom: '1px solid var(--border)', lineHeight: 1 }}>
                  {String(h).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {/* Day columns — hour grid + time line only; events live in unified overlay */}
            {viewDays.map((d, colIdx) => {
              const ds      = toDateStr(d)
              const isToday = ds === toDateStr(today)
              return (
                <div key={colIdx} style={{
                  flex: 1, position: 'relative',
                  borderLeft: '1px solid var(--border)',
                  background: isToday ? 'rgba(139,116,240,0.04)' : 'transparent',
                }}>
                  {HOURS.map(hour => (
                    <div key={hour} style={{
                      height: hourH, borderBottom: '1px solid var(--border)',
                      position: 'relative',
                      cursor: mode === 'view' ? 'default' : 'crosshair',
                    }}
                      onMouseDown={() => handleCellMouseDown(colIdx, hour)}
                      onMouseEnter={() => { handleCellMouseEnter(colIdx, hour); if (!dragState) setHoverCell({ colIdx, hour }) }}
                      onMouseLeave={() => { if (!dragState) setHoverCell(null) }}
                    >
                      {mode !== 'view' && !dragState && hoverCell?.colIdx === colIdx && hoverCell?.hour === hour && (
                        <div style={{ position: 'absolute', top: 2, left: 3, right: 3, bottom: 2, background: 'color-mix(in srgb, var(--text1) 7%, transparent)', borderRadius: 4, pointerEvents: 'none' }} />
                      )}
                    </div>
                  ))}
                </div>
              )
            })}

            {/* ── Drag-selection preview — single seamless bubble across columns ── */}
            {dragState && mode !== 'view' && (() => {
              const loCol    = Math.min(dragState.startColIdx, dragState.endColIdx)
              const hiCol    = Math.max(dragState.startColIdx, dragState.endColIdx)
              const numSelCols = hiCol - loCol + 1
              const numVC    = viewDays.length
              const topH     = Math.min(dragState.startHour, dragState.endHour)
              const botH     = Math.max(dragState.startHour, dragState.endHour) + 1
              return (
                <div style={{
                  position: 'absolute',
                  left:   `calc(34px + ${loCol} * (100% - 34px) / ${numVC} + 2px)`,
                  width:  `calc(${numSelCols} * (100% - 34px) / ${numVC} - 4px)`,
                  top:    topH * hourH + 2,
                  height: Math.max(6, (botH - topH) * hourH - 4),
                  background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                  border: '1.5px solid color-mix(in srgb, var(--accent) 42%, transparent)',
                  borderRadius: 6,
                  pointerEvents: 'none',
                  zIndex: 2,
                }} />
              )
            })()}

            {/* ── Current-time indicator — rendered last so it's always on top ── */}
            {viewDays.some(d => toDateStr(d) === toDateStr(today)) && (() => {
              const todayColIdx = viewDays.findIndex(d => toDateStr(d) === toDateStr(today))
              const numCols     = viewDays.length
              const nowTop      = (nowMin / 60) * hourH
              const colW        = `calc((100% - 34px) / ${numCols})`
              const colLeft     = `calc(34px + ${todayColIdx} * (100% - 34px) / ${numCols})`
              return (
                <div style={{ position: 'absolute', top: nowTop, left: colLeft, width: colW, zIndex: 22, pointerEvents: 'none' }}>
                  <div style={{ position: 'relative', height: 2, background: 'var(--danger)' }}>
                    <div style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />
                  </div>
                </div>
              )
            })()}

            {/* ── Unified event overlay (single-day + multi-day) ── */}
            {(() => {
              const { entries, overlapMap } = overlayLayout
              if (!entries.length) return null

              return (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 3 }}>
                  {entries.map(({ ev, colStart, numCols, effStart, effEnd }) => {
                    const dateEnd          = ev.dateEnd ?? ev.date
                    const eff              = dragOverride?.evId === ev.id ? dragOverride : null
                    const effectiveStart   = eff?.date    ?? effStart
                    const effectiveDateEnd = eff?.dateEnd ?? effEnd
                    const numVC            = viewDays.length

                    const startMin   = eff ? eff.startMin : parseHHMM(ev.timeStart!)
                    const endMin     = eff ? eff.endMin   : (ev.timeEnd ? parseHHMM(ev.timeEnd) : startMin + 60)

                    const { slot, totalSlots } = (numCols === 1 ? overlapMap.get(`${ev.id}|${effStart}`) : undefined) ?? { slot: 0, totalSlots: 1 }
                    const top        = (startMin / 60) * hourH
                    const durMin     = endMin > startMin ? endMin - startMin : 24 * 60 - startMin
                    const height     = Math.max(24, (durMin / 60) * hourH - 2)
                    const isActive   = !!eff
                    const darkBg     = `color-mix(in srgb, ${ev.color} 60%, black)`
                    const isPast     = fadePastEvents && !ev.recurrence && (effectiveDateEnd ?? effectiveStart) < todayStr

                    // Day span for move (always from original saved dates)
                    const origDaySpan = Math.round((new Date(dateEnd + 'T00:00:00').getTime() - new Date(ev.date + 'T00:00:00').getTime()) / 86400000)

                    return (
                      <div
                        key={`${ev.id}-${effStart}`}
                        onMouseDown={e => {
                          if ((e.target as HTMLElement).closest('[data-nomove]')) return
                          if (mode !== 'edit') return
                          e.preventDefault(); e.stopPropagation()
                          const bodyRect = gridBodyRef.current?.getBoundingClientRect()
                          if (!bodyRect) return
                          const scrollTop  = gridScrollRef.current?.scrollTop ?? 0
                          const colW       = (bodyRect.width - 34) / numVC
                          const relX       = e.clientX - bodyRect.left - 34
                          const clickColIdx = Math.max(0, Math.min(numVC - 1, Math.floor(relX / colW)))
                          const mouseYFromTop = e.clientY - bodyRect.top + scrollTop
                          const clickOffMin   = Math.max(0, ((mouseYFromTop - top) / hourH) * 60)
                          dragMoveRef.current = { evId: ev.id, clickOffsetMin: clickOffMin, clickColOffset: clickColIdx - colStart, origDaySpan }
                        }}
                        style={{
                          position: 'absolute',
                          left:  `calc(34px + ${colStart * totalSlots + slot} * (100% - 34px) / ${numVC * totalSlots} + 2px)`,
                          width: numCols === 1
                            ? `calc((100% - 34px) / ${numVC * totalSlots} - 4px)`
                            : `calc(${numCols} * (100% - 34px) / ${numVC} - 4px)`,
                          top, height,
                          background: ev.color,
                          borderRadius: 5,
                          padding: '3px 4px',
                          overflow: 'visible',
                          display: 'flex', flexDirection: 'column', gap: 2,
                          zIndex: isActive ? 10 : 4,
                          pointerEvents: mode === 'edit' ? 'auto' : 'none',
                          cursor: mode === 'edit' ? (isActive ? 'grabbing' : 'grab') : 'default',
                          transition: isActive ? 'none' : 'box-shadow 0.1s',
                          boxShadow: isActive
                            ? '0 6px 20px rgba(0,0,0,0.45)'
                            : ev.copyShadow
                              ? '0 8px 24px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)'
                              : 'none',
                          opacity: isPast ? 0.35 : 1,
                        }}
                      >

                        {/* Inner clip layer so text doesn't bleed out */}
                        <div style={{ position: 'absolute', inset: 0, borderRadius: 5, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }} />

                        {/* Header: time span + action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, position: 'relative', zIndex: 1 }} data-nomove="true" onMouseDown={e => e.stopPropagation()}>
                          <div style={{ background: darkBg, borderRadius: 3, padding: '1px 5px', fontSize: 8, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {numCols === 1
                              ? `${ev.timeStart ?? ''}${ev.timeEnd ? ' – ' + ev.timeEnd : ''}`
                              : `${ev.timeStart ?? ''} ${effectiveStart.slice(5)}  →  ${ev.timeEnd ?? ''} ${effectiveDateEnd.slice(5)}`
                            }
                          </div>
                          {mode === 'edit' && (
                            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                              <button onClick={() => copyEvent(ev)} style={weekEvBtn} title={t('Copy event')}><IconCopySmall /></button>
                              <button onClick={() => openEditPopup(ev)} style={weekEvBtn} title={t('Edit')}><IconEdit size={9} /></button>
                              <button onClick={() => deleteCalendarEvent(widget.id, ev.id)} style={weekEvBtn} title={t('Delete')}><IconX size={9} /></button>
                            </div>
                          )}
                        </div>
                        {/* Title */}
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'white', lineHeight: 1.3, overflow: 'hidden', wordBreak: 'break-word', position: 'relative', zIndex: 1 }}>
                          {ev.title}
                        </div>
                        {ev.location && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 1, minWidth: 0, color: 'rgba(255,255,255,0.8)' }}>
                            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><IconPin size={7} /></span>
                            <span style={{ fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{ev.location}</span>
                          </div>
                        )}

                        {/* Corner resize circle — drag to extend/shrink both time and days */}
                        {mode === 'edit' && (
                          <div
                            data-nomove="true"
                            onMouseDown={e => {
                              e.preventDefault()
                              e.stopPropagation()
                              const scrollTop = gridScrollRef.current?.scrollTop ?? 0
                              dragCornerResizeRef.current = {
                                evId:         ev.id,
                                origStartMin: startMin,
                                origEndMin:   endMin,
                                origDateEnd:  effectiveDateEnd,
                                mouseY0:      e.clientY,
                                scrollTop0:   scrollTop,
                                mouseX0:      e.clientX,
                              }
                            }}
                            style={{
                              position: 'absolute', bottom: -6, right: -6,
                              width: 14, height: 14, borderRadius: '50%',
                              background: 'white',
                              border: `2px solid ${darkBg}`,
                              cursor: 'nwse-resize',
                              zIndex: 20,
                              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      </>)}

      {/* Zoom buttons */}
      {(calView === 'week' || calView === 'day') && (
        <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 4, zIndex: 10 }}>
          <button onClick={() => setHourH(h => Math.max(HOUR_H_MIN, h - HOUR_H_STEP))} style={zoomBtnStyle} title={t('Zoom out')}>−</button>
          <button onClick={() => setHourH(h => Math.min(HOUR_H_MAX, h + HOUR_H_STEP))} style={zoomBtnStyle} title={t('Zoom in')}>+</button>
        </div>
      )}

      {/* ── Import-Toast ── */}
      {importToast && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          zIndex: 200, pointerEvents: 'none',
          fontSize: 12, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {importToast}
        </div>
      )}

      {/* ── POPUP (Neuer / Bearbeitungs-Termin) ── */}
      {popup && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 'inherit', padding: 8 }}
          onMouseDown={e => { if (e.target === e.currentTarget) closePopup() }}
        >
          <div
            style={{ background: 'color-mix(in srgb, var(--surface) 75%, var(--bg))', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', borderRadius: 14, border: '1px solid var(--border)', width: '100%', maxWidth: 300, maxHeight: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', overflow: 'hidden' }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text1)' }}>
                {editingId ? t('Edit event') : t('New event')}
              </span>
              <button onClick={closePopup} title={t('Close')} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Body skaliert mit der Widget-Höhe (flex:1) statt mit dem Viewport —
                bei kleinen Kalendern scrollt der Inhalt, nichts wird abgeschnitten */}
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, minHeight: 0 }}>

              {/* 1 — Titel */}
              <input
                autoFocus
                value={popupTitle}
                onChange={e => setPopupTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitPopupEvent(); if (e.key === 'Escape') closePopup() }}
                placeholder={t('Event title *')}
                style={{ ...popupInput, fontSize: 13, padding: '7px 10px', fontWeight: 600 }}
              />

              {/* 2 — Von / Bis */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                {/* Von */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={dtLabel}>{t('From')}</span>
                  <input type="date" value={popup.date}
                    onChange={e => setPopup(p => p ? { ...p, date: e.target.value, endDate: p.endDate < e.target.value ? e.target.value : p.endDate } : p)}
                    style={dtInput} />
                  <input type="time" value={popup.startTime}
                    onChange={e => setPopup(p => p ? { ...p, startTime: e.target.value } : p)}
                    style={dtInput} />
                </div>
                {/* Divider */}
                <div style={{ height: 1, background: 'var(--border)', margin: '0 2px' }} />
                {/* Bis */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={dtLabel}>{t('To')}</span>
                  <input type="date" value={popup.endDate}
                    onChange={e => setPopup(p => p ? { ...p, endDate: e.target.value } : p)}
                    min={popup.date}
                    style={dtInput} />
                  <input type="time" value={popup.endTime}
                    onChange={e => setPopup(p => p ? { ...p, endTime: e.target.value } : p)}
                    style={dtInput} />
                </div>
              </div>

              {/* 3 — Wiederholung */}
              <div style={fieldGroup}>
                <label style={fieldLabel}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                  {t('Repeat')}
                </label>
                <select value={popupRecurrence} onChange={e => setPopupRecurrence(e.target.value as CalendarRecurrence | '')} style={popupInput}>
                  <option value="">{t('None')}</option>
                  <option value="daily">{t('Daily')}</option>
                  <option value="weekly">{t('Weekly')}</option>
                  <option value="monthly">{t('Monthly')}</option>
                  <option value="yearly">{t('Yearly')}</option>
                </select>
              </div>

              {/* 3b — Erinnerung */}
              <div style={fieldGroup}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={fieldLabel}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    {t('Reminder')}
                  </label>
                  <Toggle
                    value={popupReminderMin !== null}
                    onChange={v => {
                      if (v) { setPopupReminderMin(10); requestNotifyPermission() }
                      else setPopupReminderMin(null)
                    }}
                  />
                </div>
                {popupReminderMin !== null && (
                  popup.startTime ? (
                    <select value={popupReminderMin} onChange={e => setPopupReminderMin(Number(e.target.value))} style={popupInput}>
                      <option value={0}>{t('At time of event')}</option>
                      <option value={5}>{t('5 minutes before')}</option>
                      <option value={10}>{t('10 minutes before')}</option>
                      <option value={30}>{t('30 minutes before')}</option>
                      <option value={60}>{t('1 hour before')}</option>
                      <option value={1440}>{t('1 day before')}</option>
                    </select>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t('Add a start time to enable a reminder.')}</div>
                  )
                )}
              </div>

              {/* 4 — Standort */}
              <div style={fieldGroup}>
                <label style={fieldLabel}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {t('Location')}
                </label>
                <input value={popupLocation} onChange={e => setPopupLocation(e.target.value)} placeholder={t('Add location…')} style={popupInput} />
              </div>

              {/* 5 — Beschreibung */}
              <div style={fieldGroup}>
                <label style={fieldLabel}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  {t('Description')}
                </label>
                <textarea value={popupDesc} onChange={e => setPopupDesc(e.target.value)} placeholder={t('Add description…')} rows={2} style={{ ...popupInput, resize: 'none', lineHeight: 1.5 }} />
              </div>

              {/* Farbe */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {palette.map(c => (
                  <button key={c} onClick={() => setPopupColor(c)} title={`${t('Color')} ${c}`} style={{
                    width: 20, height: 20, borderRadius: '50%', background: c, border: 'none',
                    cursor: 'pointer', flexShrink: 0,
                    outline: popupColor === c ? '2px solid white' : '2px solid transparent',
                    outlineOffset: 2, transition: 'outline 0.1s',
                  }} />
                ))}
                <ColorSwatch value={popupColor} onChange={setPopupColor}
                  trigger={(onClick) => (
                    <div onClick={onClick} title={t('Custom color')} style={{
                      width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                      background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)',
                      outline: !palette.includes(popupColor) ? '2px solid white' : '2px solid transparent', outlineOffset: 2,
                    }} />
                  )}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={closePopup} style={{ fontSize: 11, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
                {t('Cancel')}
              </button>
              <button onClick={submitPopupEvent} style={{ fontSize: 11, padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 700, opacity: popupTitle.trim() ? 1 : 0.45 }}>
                {t('Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const evActionBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text3)', padding: '1px 2px', borderRadius: 3,
}

const weekEvBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.35)', border: 'none', color: 'white',
  borderRadius: 3, cursor: 'pointer', padding: 0,
  width: 16, height: 16, flexShrink: 0,
}

// Wie weekEvBtn, nur kleiner — für die dünne (17px hohe) Mehrtage-Leiste
const barEvBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.35)', border: 'none', color: 'white',
  borderRadius: 3, cursor: 'pointer', padding: 0,
  width: 14, height: 14, flexShrink: 0,
}

// Popup-specific styles
const popupInput: React.CSSProperties = {
  fontSize: 11, padding: '5px 9px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text1)', width: '100%', outline: 'none',
}

const dtLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text3)',
  width: 22, flexShrink: 0, letterSpacing: '0.02em',
}

const dtInput: React.CSSProperties = {
  fontSize: 11, padding: '4px 6px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text1)', flex: 1, minWidth: 0, outline: 'none',
}

const fieldGroup: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text3)',
  display: 'flex', alignItems: 'center', gap: 4,
}

const zoomBtnStyle: React.CSSProperties = {
  width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text2)', fontSize: 14,
  lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontWeight: 700, padding: 0,
}

// ── Small components ──────────────────────────────────────────────────────────

function NavBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 24, height: 24, borderRadius: 7, border: '1px solid var(--border)',
      background: 'none', color: 'var(--text2)', fontSize: 16, lineHeight: 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>{children}</button>
  )
}

function IconCopySmall() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="8" y="8" width="13" height="13" rx="2"/>
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
    </svg>
  )
}
