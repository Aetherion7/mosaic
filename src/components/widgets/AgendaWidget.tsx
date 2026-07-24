'use client'
import { useMemo } from 'react'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { toDateStr, todayStr } from '@/lib/dates'
import { eventOccursOn } from '@/lib/events'
import { useT } from '@/hooks/useT'
import type { Widget, AgendaData, CalendarEvent } from '@/types'

const DAYS_OPTIONS = [3, 7, 14, 30]
const DAY_NAMES    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function dayHeading(dateStr: string, today: string, t: (s: string) => string): string {
  if (dateStr === today) return t('Today')
  const d  = new Date(dateStr + 'T00:00:00')
  const td = new Date(today + 'T00:00:00')
  if (d.getTime() - td.getTime() === 86400000) return t('Tomorrow')
  return `${t(DAY_NAMES[d.getDay()])}, ${d.getDate()}. ${t(MONTHS[d.getMonth()])}`
}

export default function AgendaWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const mode    = useUIStore(s => s.mode)
  const d       = widget.data as AgendaData
  const widgets = useBoardStore(useShallow(s => selectBoard(s)?.widgets ?? {}))

  const daysAhead = d.daysAhead ?? 7
  const today     = todayStr()

  // Collect all events from every calendar widget on this board
  const allEvents: CalendarEvent[] = useMemo(() => Object.values(widgets)
    .filter(w => w.type === 'calendar')
    .flatMap(w => (w.data.events ?? []) as CalendarEvent[])
  , [widgets])

  // Next N days with their events, sorted by start time
  const days = useMemo(() => Array.from({ length: daysAhead }, (_, i) => {
    const dt = new Date(today + 'T00:00:00'); dt.setDate(dt.getDate() + i)
    const ds = toDateStr(dt)
    const events = allEvents
      .filter(ev => eventOccursOn(ev, ds))
      .sort((a, b) => (a.timeStart ?? '') < (b.timeStart ?? '') ? -1 : 1)
    return { ds, events }
  }).filter(day => day.events.length > 0)
  , [allEvents, daysAhead, today])

  const hasCalendar = Object.values(widgets).some(w => w.type === 'calendar')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }} onPointerDown={e => e.stopPropagation()}>

      {/* Range selector (edit mode) */}
      {mode === 'edit' && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {DAYS_OPTIONS.map(n => (
            <button key={n} onClick={() => updateTaskData(widget.id, { daysAhead: n })}
              style={{
                fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, cursor: 'pointer',
                border: `1px solid ${daysAhead === n ? 'var(--accent)' : 'var(--border)'}`,
                background: daysAhead === n ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface2)',
                color: daysAhead === n ? 'var(--accent)' : 'var(--text3)',
              }}>
              {n} {t('days')}
            </button>
          ))}
        </div>
      )}

      {/* Event list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {days.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, color: 'var(--text3)', textAlign: 'center', padding: '0 12px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{ fontSize: 10, lineHeight: 1.5 }}>
              {hasCalendar
                ? `${t('No events in the next')} ${daysAhead} ${t('days')}`
                : t('Add a calendar widget to see events')}
            </span>
          </div>
        ) : days.map(({ ds, events }) => (
          <div key={ds}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: ds === today ? 'var(--accent)' : 'var(--text3)', marginBottom: 3,
            }}>
              {dayHeading(ds, today, t)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {events.map(ev => (
                <div key={`${ev.id}-${ds}`} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 7px',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${ev.color}`, borderRadius: 7, minWidth: 0,
                }}>
                  <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums', minWidth: 30 }}>
                    {ev.timeStart ?? '—'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title}{ev.recurrence ? <span style={{ fontSize: 8, marginLeft: 3, opacity: 0.55 }}>↻</span> : null}
                    </div>
                    {ev.location && (
                      <div style={{ fontSize: 8.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.location}
                      </div>
                    )}
                  </div>
                  {ev.timeEnd && (
                    <span style={{ flexShrink: 0, fontSize: 8.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
                      – {ev.timeEnd}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
