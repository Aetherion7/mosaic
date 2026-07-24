import { describe, it, expect } from 'vitest'
import { toDateStr, todayStr, getWeekDates, weekRangeLabel } from '@/lib/dates'

describe('toDateStr', () => {
  it('formatiert lokal als YYYY-MM-DD mit führenden Nullen', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateStr(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('verschiebt den Tag NICHT in UTC (23:59 Ortszeit bleibt derselbe Tag)', () => {
    expect(toDateStr(new Date(2026, 5, 15, 23, 59))).toBe('2026-06-15')
  })
})

describe('todayStr', () => {
  it('entspricht toDateStr(jetzt)', () => {
    expect(todayStr()).toBe(toDateStr(new Date()))
  })
})

describe('getWeekDates', () => {
  it('liefert 7 aufeinanderfolgende Tage, beginnend mit Montag', () => {
    const week = getWeekDates(0)
    expect(week).toHaveLength(7)
    const monday = new Date(week[0] + 'T00:00:00')
    expect(monday.getDay()).toBe(1)
    for (let i = 1; i < 7; i++) {
      const prev = new Date(week[i - 1] + 'T00:00:00')
      const cur  = new Date(week[i] + 'T00:00:00')
      expect((cur.getTime() - prev.getTime()) / 86400000).toBe(1)
    }
    expect(week).toContain(todayStr())
  })

  it('offset verschiebt um ganze Wochen', () => {
    const thisMon = new Date(getWeekDates(0)[0] + 'T00:00:00')
    const nextMon = new Date(getWeekDates(1)[0] + 'T00:00:00')
    expect((nextMon.getTime() - thisMon.getTime()) / 86400000).toBe(7)
  })
})

describe('weekRangeLabel', () => {
  // English is the default language; identity fn stands in for a real translate() call.
  const t = (s: string) => s

  it('benennt aktuelle und letzte Woche', () => {
    expect(weekRangeLabel(0, t)).toBe('This week')
    expect(weekRangeLabel(-1, t)).toBe('Last week')
  })

  it('formatiert andere Wochen als Datumsbereich', () => {
    expect(weekRangeLabel(-2, t)).toMatch(/^\d{1,2}\. \w{3} – \d{1,2}\. \w{3}$/u)
  })
})
