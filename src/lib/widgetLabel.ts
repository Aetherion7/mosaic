// Labels a widget for pickers that list same-type widgets from the same
// board (Chart widget's data-source link, Task widget's "schedule in
// calendar"). Prefers the widget's own custom name (TileWrapper.tsx's
// generic per-widget rename, widget.data.customName) when set — "Task •
// Morning routine" — falling back to deterministic "Sleep" / "Sleep #2"
// style disambiguation, ordered by board position (row, then col) so it's
// stable across renders regardless of Object.values() iteration order.
//
// Deliberately NOT importing TileWrapper.tsx's own TYPE_LABELS here:
// TileWrapper.tsx directly imports TaskWidget.tsx/ChartWidget.tsx (two of
// this helper's callers), so doing so would create a circular import
// (TileWrapper -> TaskWidget -> widgetLabel -> TileWrapper). This only
// needs labels for the widget types these pickers actually list.
import type { Widget } from '@/types'

const BASE_LABELS: Record<string, string> = {
  sleep: 'Sleep', water: 'Water', task: 'Task', calendar: 'Calendar',
}

export function labelForWidget(
  w: Widget,
  allWidgets: Record<string, Widget>,
  t: (s: string) => string,
): string {
  const base = t(BASE_LABELS[w.type] ?? w.type)
  const customName = (w.data as { customName?: string } | undefined)?.customName?.trim()
  if (customName) return `${base} • ${customName}`
  const sameType = Object.values(allWidgets)
    .filter(x => x.type === w.type)
    .sort((a, b) => (a.pos.row - b.pos.row) || (a.pos.col - b.pos.col) || a.id.localeCompare(b.id))
  if (sameType.length <= 1) return base
  const idx = sameType.findIndex(x => x.id === w.id)
  return idx <= 0 ? base : `${base} #${idx + 1}`
}
