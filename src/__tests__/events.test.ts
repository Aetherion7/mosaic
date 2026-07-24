import { describe, it, expect } from 'vitest'
import { eventOccursOn } from '@/lib/events'
import type { CalendarEvent } from '@/types'

function ev(patch: Partial<CalendarEvent>): CalendarEvent {
  return { id: 'e1', date: '2026-07-06', title: 'Test', color: '#fff', ...patch }
}

describe('eventOccursOn — einmalige Termine', () => {
  it('trifft nur am eigenen Tag', () => {
    expect(eventOccursOn(ev({}), '2026-07-06')).toBe(true)
    expect(eventOccursOn(ev({}), '2026-07-05')).toBe(false)
    expect(eventOccursOn(ev({}), '2026-07-07')).toBe(false)
  })

  it('mehrtägige Termine treffen im gesamten Bereich', () => {
    const e = ev({ dateEnd: '2026-07-08' })
    expect(eventOccursOn(e, '2026-07-06')).toBe(true)
    expect(eventOccursOn(e, '2026-07-07')).toBe(true)
    expect(eventOccursOn(e, '2026-07-08')).toBe(true)
    expect(eventOccursOn(e, '2026-07-09')).toBe(false)
  })
})

describe('eventOccursOn — Wiederholungen', () => {
  it('daily: jeder Tag ab Start, nie davor', () => {
    const e = ev({ recurrence: 'daily' })
    expect(eventOccursOn(e, '2026-07-06')).toBe(true)
    expect(eventOccursOn(e, '2026-12-24')).toBe(true)
    expect(eventOccursOn(e, '2026-07-05')).toBe(false)
  })

  it('weekly: gleicher Wochentag', () => {
    const e = ev({ recurrence: 'weekly' })   // 2026-07-06 ist ein Montag
    expect(eventOccursOn(e, '2026-07-13')).toBe(true)
    expect(eventOccursOn(e, '2026-07-14')).toBe(false)
  })

  it('monthly: gleicher Monatstag', () => {
    const e = ev({ recurrence: 'monthly' })
    expect(eventOccursOn(e, '2026-08-06')).toBe(true)
    expect(eventOccursOn(e, '2026-08-07')).toBe(false)
  })

  it('yearly: gleicher Monat + Tag', () => {
    const e = ev({ recurrence: 'yearly' })
    expect(eventOccursOn(e, '2027-07-06')).toBe(true)
    expect(eventOccursOn(e, '2027-08-06')).toBe(false)
  })

  it('recurrenceUntil beendet die Wiederholung', () => {
    const e = ev({ recurrence: 'daily', recurrenceUntil: '2026-07-10' })
    expect(eventOccursOn(e, '2026-07-10')).toBe(true)
    expect(eventOccursOn(e, '2026-07-11')).toBe(false)
  })
})
