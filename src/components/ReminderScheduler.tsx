'use client'
import { useEffect, useRef } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { eventOccursOn } from '@/lib/events'
import { fireNotification } from '@/lib/notify'
import { useT } from '@/hooks/useT'
import type { CalendarEvent } from '@/types'

const TICK_MS        = 30_000
// Nach langem Schlafmodus/Tab-Wechsel nicht einen ganzen Rückstau an
// verpassten Erinnerungen auf einmal nachfeuern — nur, was noch "frisch"
// genug ist. Siehe Plan: bewusst tunbare Konstante.
const STALE_GRACE_MS = 8 * 60_000

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Läuft einmal pro App (in layout.tsx gemountet, unabhängig davon, welches
// Board/Widget gerade offen ist — useBoardStore hält ohnehin ALLE Boards),
// prüft periodisch jeden Kalender-Termin mit reminderMinutesBefore gesetzt
// und feuert eine Notification, sobald der Auslösezeitpunkt erreicht ist.
// Rein clientseitig, kein Service Worker: eine Erinnerung kann nur feuern,
// während dieser Code tatsächlich läuft (Tab offen bzw. — im Electron-Build
// mit Hintergrundbetrieb — der versteckte Fensterprozess). Ist die App zu
// diesem Zeitpunkt komplett beendet, wird sie endgültig verpasst.
export default function ReminderScheduler() {
  const t = useT()
  const lastTickRef = useRef(Date.now())
  // useT() returns a brand-new function identity every render (not
  // memoized) — RootLayout re-renders constantly as the app is used, and
  // without this ref, an effect depending on `t` directly would tear down
  // and rebuild the interval on every single one of those re-renders,
  // never surviving long enough to actually complete a 30s tick.
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    function tick() {
      const now = Date.now()
      const boards = useBoardStore.getState().boards
      const nowDate = new Date()
      // 3 Kandidaten-Tage statt nur "heute": ein Termin mit Erinnerung kurz
      // vor Mitternacht braucht ggf. den Vortag als Bezugsdatum.
      const candidates = [-1, 0, 1].map(offset => {
        const d = new Date(nowDate)
        d.setDate(d.getDate() + offset)
        return toDateStr(d)
      })

      for (const board of Object.values(boards)) {
        for (const widget of Object.values(board.widgets)) {
          if (widget.type !== 'calendar') continue
          const events = (widget.data.events as CalendarEvent[] | undefined) ?? []
          for (const ev of events) {
            if (ev.reminderMinutesBefore == null || !ev.timeStart) continue
            for (const ds of candidates) {
              const occurs = ev.recurrence ? eventOccursOn(ev, ds) : ds === ev.date
              if (!occurs) continue
              const trigger = new Date(`${ds}T${ev.timeStart}:00`).getTime() - ev.reminderMinutesBefore * 60_000
              if (trigger > lastTickRef.current && trigger <= now && trigger >= now - STALE_GRACE_MS) {
                const timeRange = ev.timeEnd ? `${ev.timeStart}–${ev.timeEnd}` : ev.timeStart
                const body = ev.location ? `${timeRange} · ${ev.title} · ${ev.location}` : `${timeRange} · ${ev.title}`
                fireNotification(tRef.current('Upcoming event'), body)
              }
            }
          }
        }
      }
      lastTickRef.current = now
    }

    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [])

  return null
}
