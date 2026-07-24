import type { CalendarEvent } from '@/types'

// Check if a (possibly recurring) event occurs on a given YYYY-MM-DD date string.
// Shared by CalendarWidget and AgendaWidget.
export function eventOccursOn(ev: CalendarEvent, dateStr: string): boolean {
  if (!ev.recurrence) {
    const dateEnd = ev.dateEnd ?? ev.date
    return dateStr >= ev.date && dateStr <= dateEnd
  }
  if (ev.recurrenceUntil && dateStr > ev.recurrenceUntil) return false
  const orig   = new Date(ev.date + 'T00:00:00')
  const target = new Date(dateStr + 'T00:00:00')
  if (target < orig) return false
  switch (ev.recurrence) {
    case 'daily':   return true
    case 'weekly':  return target.getDay() === orig.getDay()
    case 'monthly': return target.getDate() === orig.getDate()
    case 'yearly':  return target.getMonth() === orig.getMonth() && target.getDate() === orig.getDate()
    default:        return ev.date === dateStr
  }
}
