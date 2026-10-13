// Local-timezone date helpers (never use toISOString for calendar dates —
// it converts to UTC and shifts the day for UTC+ timezones).
import type { SleepEntry } from '@/types'

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

// Mo–So of the week `offset` weeks from the current one, as YYYY-MM-DD strings
export function getWeekDates(offset: number): string[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dow = today.getDay() || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - dow + 1 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    return toDateStr(d)
  })
}

// Duration in hours; a wake time "before" bed time means sleeping past midnight.
// Shared by SleepWidget itself and chartLink.ts (Chart widget's live link to
// a Sleep widget's stats) — moved here so both can import the same logic
// instead of duplicating the bed/wake math.
export function sleepDurationH(e: SleepEntry | undefined): number | null {
  if (!e?.bed || !e?.wake) return null
  const [bh, bm] = e.bed.split(':').map(Number)
  const [wh, wm] = e.wake.split(':').map(Number)
  let mins = (wh * 60 + wm) - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  return mins / 60
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function weekRangeLabel(offset: number, t: (s: string) => string): string {
  if (offset === 0) return t('This week')
  if (offset === -1) return t('Last week')
  const dates = getWeekDates(offset)
  const mo = new Date(dates[0] + 'T00:00:00'), so = new Date(dates[6] + 'T00:00:00')
  return `${mo.getDate()}. ${t(MONTHS[mo.getMonth()])} – ${so.getDate()}. ${t(MONTHS[so.getMonth()])}`
}

// ISO-week helpers — moved here from TaskWidget.tsx so chartLink.ts (Chart
// widget's live link to a Task widget's per-habit weekly history) can share
// the exact same week-key math instead of duplicating it.
export function getWeekKey(date = new Date()): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() || 7
  d.setDate(d.getDate() + 4 - day)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`
}

export function getWeekKeyOffset(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  return getWeekKey(d)
}

export function getWeekMonday(wk: string): Date {
  const [yr, w] = wk.split('-W')
  const jan4 = new Date(Number(yr), 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (Number(w) - 1) * 7)
  return monday
}

export function weekShortLabel(wk: string, t: (s: string) => string): string {
  const monday = getWeekMonday(wk)
  return `${monday.getDate()}. ${t(MONTHS[monday.getMonth()])}`
}
