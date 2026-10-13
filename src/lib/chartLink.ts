// Chart widget's live link to a Sleep/Water/Task widget's own stats data —
// pure, store/React-agnostic so it's callable both from ChartWidget's own
// live-render useMemo and from boardStore.ts's delete-time snapshot (see
// stripChartLinks in boardStore.ts).
import { getWeekDates, getWeekKey, getWeekKeyOffset, sleepDurationH, todayStr, weekShortLabel } from '@/lib/dates'
import type { ChartDataset, HabitEntry, SleepData, WaterData, TaskData, Widget } from '@/types'

export const CHART_LINK_SOURCE_TYPES = ['sleep', 'water', 'task'] as const
export type ChartLinkSourceType = typeof CHART_LINK_SOURCE_TYPES[number]

export function isChartLinkSource(w: Widget): boolean {
  return (CHART_LINK_SOURCE_TYPES as readonly string[]).includes(w.type)
}

// Same per-habit weekly-completion lookup as TaskWidget.tsx's own
// getDaysForWeek — kept as a tiny local duplicate rather than shared, since
// it closes over `currentWeek` differently in each caller.
function daysForWeek(h: HabitEntry, wk: string, currentWeek: string): string[] {
  return wk === currentWeek ? h.weekDays : (h.weeklyLog?.[wk] ?? [])
}

const TASK_HISTORY_WEEKS = 8

export function computeLinkedChartData(
  source: Widget,
  t: (s: string) => string,
): { labels: string[]; datasets: ChartDataset[] } | null {
  if (source.type === 'sleep') {
    const d = source.data as SleepData
    const dates = getWeekDates(0)
    return {
      labels: dates.map(date => t(WEEKDAY_SHORT[new Date(date + 'T00:00:00').getDay()])),
      datasets: [{
        label: t('Sleep'),
        color: 'var(--accent)',
        values: dates.map(date => sleepDurationH(d.log?.[date]) ?? 0),
      }],
    }
  }

  if (source.type === 'water') {
    const d = source.data as WaterData
    const dates = getWeekDates(0)
    const today = todayStr()
    return {
      labels: dates.map(date => t(WEEKDAY_SHORT[new Date(date + 'T00:00:00').getDay()])),
      datasets: [{
        label: t('Water'),
        color: 'var(--accent)',
        values: dates.map(date => date === today ? (d.loggedMl ?? 0) : (d.dailyLog?.[date] ?? 0)),
      }],
    }
  }

  if (source.type === 'task') {
    const d = source.data as TaskData
    const habits = d.habits ?? []
    const currentWeek = getWeekKey()
    const weekKeys = Array.from({ length: TASK_HISTORY_WEEKS }, (_, i) => getWeekKeyOffset(-(TASK_HISTORY_WEEKS - 1 - i)))
    return {
      labels: weekKeys.map(wk => weekShortLabel(wk, t)),
      datasets: habits.map(h => ({
        label:  h.name,
        color:  h.color,
        values: weekKeys.map(wk => daysForWeek(h, wk, currentWeek).length),
      })),
    }
  }

  return null
}

// Sunday-first (JS Date#getDay() order) — used only for the Mon..Sun labels
// above, kept local since it's indexed by getDay(), not the app's usual
// Monday-first WEEK_DAYS lists.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
