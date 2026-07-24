// Local-timezone date helpers (never use toISOString for calendar dates —
// it converts to UTC and shifts the day for UTC+ timezones).

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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function weekRangeLabel(offset: number, t: (s: string) => string): string {
  if (offset === 0) return t('This week')
  if (offset === -1) return t('Last week')
  const dates = getWeekDates(offset)
  const mo = new Date(dates[0] + 'T00:00:00'), so = new Date(dates[6] + 'T00:00:00')
  return `${mo.getDate()}. ${t(MONTHS[mo.getMonth()])} – ${so.getDate()}. ${t(MONTHS[so.getMonth()])}`
}
