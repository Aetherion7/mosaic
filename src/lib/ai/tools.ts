// ─── KI-Assistent: Board-Werkzeuge ───────────────────────────────────────────
// Tool-Definitionen (JSON-Schema, provider-neutral) + Executor gegen die
// bestehenden boardStore-Actions. Dadurch greift automatisch die Undo-Historie
// für Hinzufügen/Löschen/Verschieben. Siehe KONZEPT.md §15.

import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { defaultWidget, findNextPos, findPosNear } from '@/lib/defaults'
import { getReader } from '@/lib/ai/readerRegistry'
import { THEMES } from '@/lib/themes'
import { GRID_COLS, GRID_GAP, INFINITE_COL_W, INFINITE_GRID_COLS } from '@/lib/constants'
import type { Widget, WidgetType, TilePos } from '@/types'

export interface AiToolDef {
  name:        string
  description: string
  parameters:  Record<string, unknown>   // JSON-Schema
}

// Für die Chat-Anzeige: was hat das Werkzeug getan?
export interface AiToolResult {
  result:  string   // geht zurück an die KI
  summary: string   // kurzer Chip-Text für den Verlauf (englischer Quelltext, UI übersetzt nicht — enthält dynamische Teile)
}

const WIDGET_TYPES: WidgetType[] = [
  'task', 'note', 'timer', 'water', 'image', 'calendar', 'chart',
  'spreadsheet', 'drawboard', 'clock', 'weather', 'map', 'reader',
  'sleep', 'agenda', 'quicklinks',
]

// Kompakte Schema-Doku pro Widget-Typ für den Systemprompt — hält die KI davon
// ab, Datenformen zu erfinden. Bewusst nur die praktisch editierbaren Felder.
export const WIDGET_DATA_DOC = `Widget "data" shapes (only set fields you need; unknown fields are ignored by widgets):
- task: { habits: [{id, name, color, weekDays: string[], weeklyLog: {} }] }
- note: { title: string, content: string (markdown), fontFamily?, fontSize?, color?, lineHeight?, textShadow?, textStroke?, noBg? }
- timer: { name: string, durationMin: number }
- water: { goalMl: number, mlPerSection: number }
- image: { src: string (URL), alt: string, objectFit: 'cover'|'contain' }
- calendar: { events: [{id, date: 'YYYY-MM-DD', dateEnd?, timeStart?: 'HH:MM', timeEnd?, title, color: hex, location?, description?, recurrence?: 'daily'|'weekly'|'monthly'|'yearly'}] }
- chart: { title, chartType: 'column'|'bar'|'line'|'radar'|'pie', labels: string[], datasets: [{label, values: number[], color: hex}] }
- spreadsheet: { title, rows: number, cols: number, cells: { "A1": {v: string} } } (keys like "A1","B3"; v may start with '=' for formulas, e.g. "=SUM(A1:A5)")
- clock: { clockStyle: 'digital'|'analog'|'minimal'|'flip', showSeconds: boolean }
- weather: { manualCity: string, unit: 'celsius'|'fahrenheit' }
- map: { centerLat, centerLng, zoom, markers: [{id, lat, lng, label, color}] }
- sleep: { goalH: number }
- agenda: { daysAhead: number }
- quicklinks: { links: [{id, url, label}] }
- reader, drawboard: content is user-provided (PDF/EPUB upload, drawings) — AI cannot fill these. For reader widgets you CAN highlight text in the open document via the highlight_in_reader tool.`

export const AI_TOOLS: AiToolDef[] = [
  {
    name: 'add_widget',
    description: 'Add a new widget to the current board. Position is optional — omit it to auto-place in the next free spot. Returns the new widget id.',
    parameters: {
      type: 'object',
      properties: {
        type:    { type: 'string', enum: WIDGET_TYPES, description: 'Widget type' },
        col:     { type: 'number', description: 'Grid column (1-based). Omit for auto-placement.' },
        row:     { type: 'number', description: 'Grid row (1-based). Omit for auto-placement.' },
        colSpan: { type: 'number', description: 'Width in columns. Omit for the type default.' },
        rowSpan: { type: 'number', description: 'Height in rows. Omit for the type default.' },
        data:    { type: 'object', description: 'Initial widget data (see data shapes doc). Merged over the type defaults.' },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_widget',
    description: 'Update an existing widget: merge a patch into its data, and/or move/resize it. Read current data via get_board first when editing arrays (events, links, habits …) — the patch replaces each top-level key entirely.',
    parameters: {
      type: 'object',
      properties: {
        id:      { type: 'string', description: 'Widget id' },
        data:    { type: 'object', description: 'Patch merged over widget.data (shallow, per top-level key)' },
        col:     { type: 'number' },
        row:     { type: 'number' },
        colSpan: { type: 'number' },
        rowSpan: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_widget',
    description: 'Delete a widget from the board.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Widget id' } },
      required: ['id'],
    },
  },
  {
    name: 'rename_board',
    description: 'Rename the current board.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'set_theme',
    description: 'Apply a color theme to the current board. Valid ids are listed in the system prompt.',
    parameters: {
      type: 'object',
      properties: { themeId: { type: 'string' } },
      required: ['themeId'],
    },
  },
  {
    name: 'highlight_in_reader',
    description: 'Search the PDF/EPUB opened in a reader widget and highlight every occurrence of a text (case-insensitive). Standard highlight colors: yellow #ffd166, green #95e06c, pink #ff6b9d, blue #52b5d4 — any hex color works. Returns the number of matches. Only works while the reader widget is visible on the open board.',
    parameters: {
      type: 'object',
      properties: {
        id:    { type: 'string', description: 'Reader widget id' },
        query: { type: 'string', description: 'Text to search for (case-insensitive, exact substring)' },
        color: { type: 'string', description: 'Highlight color as hex, e.g. #52b5d4 for blue' },
      },
      required: ['id', 'query', 'color'],
    },
  },
  {
    name: 'get_board',
    description: 'Return the current board state with complete widget data. Use before editing existing widget data. Pass ids to fetch only specific widgets (cheaper for large boards).',
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Optional: only return these widget ids' },
      },
    },
  },
]

// ── Board-Zusammenfassung für den Systemprompt ────────────────────────────────

function digestData(w: Widget): string {
  const d = w.data
  switch (w.type) {
    case 'note':       return `title="${d.title ?? ''}", ${String(d.content ?? '').length} chars`
    case 'task':       return `${(d.habits ?? []).length} tasks`
    case 'calendar':   return `${(d.events ?? []).length} events`
    case 'quicklinks': return `${(d.links ?? []).length} links`
    case 'chart':      return `"${d.title ?? ''}" (${d.chartType})`
    case 'timer':      return `${d.durationMin} min`
    case 'weather':    return `city="${d.manualCity || 'auto'}"`
    case 'reader':     return d.fileName ? `file="${d.fileName}"` : 'no file'
    default:           return ''
  }
}

// Statischer Teil des Board-Wissens — byteweise stabil über alle Runden und
// Anfragen hinweg, damit er im Prompt-Cache-Präfix liegen kann (client.ts).
export const STATIC_BOARD_DOC = [
  `Available widget types: ${WIDGET_TYPES.join(', ')}.`,
  '',
  WIDGET_DATA_DOC,
].join('\n')

// Volatiler Board-Zustand — ändert sich zwischen den Tool-Runden (die Tools
// verändern das Board!), gehört deshalb HINTER den Cache-Breakpoint.
export function buildBoardState(): string {
  const board = selectBoard(useBoardStore.getState())
  if (!board) return 'No board is open.'
  const settings = useSettings.getState()
  const themeIds = [...THEMES.map(t => t.id), ...settings.customThemes.map(t => t.id)]
  const widgets = Object.values(board.widgets).map(w => {
    const digest = digestData(w)
    return `- ${w.id} · ${w.type} · col ${w.pos.col}, row ${w.pos.row}, ${w.pos.colSpan}×${w.pos.rowSpan}${digest ? ' · ' + digest : ''}`
  })
  return [
    `Board "${board.name}" — layout: ${board.layoutMode ?? 'infinite'} (${board.layoutMode === 'grid' ? `${GRID_COLS} columns` : 'infinite canvas, ~100 columns'}), theme: ${board.themeId}.`,
    `Available theme ids: ${themeIds.join(', ')}.`,
    `Widgets (${widgets.length}):`,
    widgets.length ? widgets.join('\n') : '(none yet)',
  ].join('\n')
}

// ── Executor ──────────────────────────────────────────────────────────────────

function autoPos(widgets: Record<string, Widget>, type: WidgetType, isInfinite: boolean): TilePos {
  if (!isInfinite) return findNextPos(widgets, type)
  // Unendliche Leinwand: in der Mitte der aktuellen Ansicht platzieren —
  // gleiche Logik wie beim TilePicker, damit KI-Widgets im Sichtfeld landen.
  const cv   = useUIStore.getState().canvasView
  const step = INFINITE_COL_W + GRID_GAP
  const cx   = (window.innerWidth  / 2 - cv.x) / cv.zoom
  const cy   = (window.innerHeight / 2 - cv.y) / cv.zoom
  return findPosNear(widgets, type, Math.round(cx / step) + 1, Math.round(cy / step) + 1, INFINITE_GRID_COLS)
}

// KI-Modelle liefern Tabellenzellen gern als Zahl ({v: 42}) oder nackt
// ("A1": 42) und Schlüssel auch kleingeschrieben — TableWidget erwartet
// {v: string} unter Großbuchstaben-Schlüsseln, sonst crasht die Formel-Engine.
// (exportiert für die Tests)
export function normalizeWidgetData(type: WidgetType, data: Record<string, unknown>): Record<string, unknown> {
  if (type !== 'spreadsheet' || !data.cells || typeof data.cells !== 'object') return data
  const cells: Record<string, Record<string, unknown>> = {}
  for (const [key, val] of Object.entries(data.cells as Record<string, unknown>)) {
    const k = key.toUpperCase()
    if (val && typeof val === 'object' && 'v' in val) {
      const cell = val as Record<string, unknown>
      cells[k] = { ...cell, v: cell.v == null ? '' : String(cell.v) }
    } else {
      cells[k] = { v: val == null ? '' : String(val) }
    }
  }
  return { ...data, cells }
}

// Async wegen highlight_in_reader (durchsucht das geladene Dokument seitenweise) —
// alle übrigen Tools bleiben synchron und werden nur in ein Promise gehüllt.
export async function executeAiTool(
  name: string,
  input: Record<string, unknown>,
  scope?: { widgetId: string },
): Promise<AiToolResult> {
  const store = useBoardStore.getState()
  const board = selectBoard(useBoardStore.getState())
  if (!board) return { result: 'Error: no board open.', summary: 'Error' }

  // Widget-Modus: nur Lesen + Ändern des gepinnten Widgets — hart erzwungen,
  // unabhängig davon, was das Modell anfragt (Tools sind zusätzlich gefiltert)
  if (scope) {
    if (name !== 'update_widget' && name !== 'get_board' && name !== 'highlight_in_reader') {
      return { result: `Error: tool "${name}" is not available in pinned-widget mode.`, summary: 'Error' }
    }
    if ((name === 'update_widget' || name === 'highlight_in_reader') && String(input.id ?? '') !== scope.widgetId) {
      return { result: `Error: you may only modify the pinned widget (id "${scope.widgetId}").`, summary: 'Error' }
    }
  }

  switch (name) {
    case 'add_widget': {
      const type = input.type as WidgetType
      if (!WIDGET_TYPES.includes(type)) return { result: `Error: unknown widget type "${type}".`, summary: 'Error' }
      const isInfinite = (board.layoutMode ?? 'infinite') === 'infinite'
      const base = autoPos(board.widgets, type, isInfinite)
      const pos: TilePos = {
        col:     typeof input.col     === 'number' ? Math.max(1, input.col)     : base.col,
        row:     typeof input.row     === 'number' ? Math.max(1, input.row)     : base.row,
        colSpan: typeof input.colSpan === 'number' ? Math.max(1, input.colSpan) : base.colSpan,
        rowSpan: typeof input.rowSpan === 'number' ? Math.max(1, input.rowSpan) : base.rowSpan,
      }
      const w = defaultWidget(type, pos)
      if (input.data && typeof input.data === 'object') {
        w.data = { ...w.data, ...normalizeWidgetData(type, input.data as Record<string, unknown>) }
      }
      store.addWidget(w)
      return { result: `Added ${type} widget with id ${w.id} at col ${pos.col}, row ${pos.row}.`, summary: `+ ${type}` }
    }

    case 'update_widget': {
      const id = String(input.id ?? '')
      const w = board.widgets[id]
      if (!w) return { result: `Error: no widget with id "${id}".`, summary: 'Error' }
      const patch: Partial<Widget> = {}
      if (input.data && typeof input.data === 'object') {
        patch.data = { ...w.data, ...normalizeWidgetData(w.type, input.data as Record<string, unknown>) }
      }
      if (['col', 'row', 'colSpan', 'rowSpan'].some(k => typeof input[k] === 'number')) {
        patch.pos = {
          col:     typeof input.col     === 'number' ? Math.max(1, input.col as number)     : w.pos.col,
          row:     typeof input.row     === 'number' ? Math.max(1, input.row as number)     : w.pos.row,
          colSpan: typeof input.colSpan === 'number' ? Math.max(1, input.colSpan as number) : w.pos.colSpan,
          rowSpan: typeof input.rowSpan === 'number' ? Math.max(1, input.rowSpan as number) : w.pos.rowSpan,
        }
      }
      if (!patch.data && !patch.pos) return { result: 'Nothing to update — pass data and/or position.', summary: 'Error' }
      store.updateWidget(id, patch)
      return { result: `Updated ${w.type} widget ${id}.`, summary: `✎ ${w.type}` }
    }

    case 'delete_widget': {
      const id = String(input.id ?? '')
      const w = board.widgets[id]
      if (!w) return { result: `Error: no widget with id "${id}".`, summary: 'Error' }
      store.deleteWidget(id)
      return { result: `Deleted ${w.type} widget ${id}.`, summary: `− ${w.type}` }
    }

    case 'rename_board': {
      const name = String(input.name ?? '').trim()
      if (!name) return { result: 'Error: empty name.', summary: 'Error' }
      store.setBoardName(name)
      return { result: `Board renamed to "${name}".`, summary: `„${name}"` }
    }

    case 'set_theme': {
      const id = String(input.themeId ?? '')
      const valid = [...THEMES.map(t => t.id), ...useSettings.getState().customThemes.map(t => t.id)]
      if (!valid.includes(id)) return { result: `Error: unknown theme "${id}". Valid: ${valid.join(', ')}.`, summary: 'Error' }
      store.applyTheme(id)
      return { result: `Theme set to ${id}.`, summary: `🎨 ${id}` }
    }

    case 'highlight_in_reader': {
      const id = String(input.id ?? '')
      const w = board.widgets[id]
      if (!w) return { result: `Error: no widget with id "${id}".`, summary: 'Error' }
      if (w.type !== 'reader') return { result: `Error: widget ${id} is a ${w.type} widget, not a reader.`, summary: 'Error' }
      const query = String(input.query ?? '').trim()
      if (!query) return { result: 'Error: empty query.', summary: 'Error' }
      const color = /^#[0-9a-fA-F]{3,8}$/.test(String(input.color ?? '')) ? String(input.color) : '#ffd166'
      const reader = getReader(id)
      if (!reader) {
        return { result: 'Error: the reader widget has no document loaded on screen right now. The board with the reader must be open and the file finished loading.', summary: 'Error' }
      }
      try {
        const n = await reader.highlightAll(query, color)
        return n > 0
          ? { result: `Highlighted ${n} occurrence(s) of "${query}" in ${color}.`, summary: `🖍 ${n}× "${query}"` }
          : { result: `No occurrences of "${query}" found in the document.`, summary: `🖍 0× "${query}"` }
      } catch (e) {
        return { result: `Error: highlighting failed (${e instanceof Error ? e.message : 'unknown'}).`, summary: 'Error' }
      }
    }

    case 'get_board': {
      const fresh = selectBoard(useBoardStore.getState())!
      // Filter: explizit angefragte ids; im Widget-Modus automatisch nur das
      // gepinnte Widget (spart Kontext-Tokens bei großen Boards)
      const requested = Array.isArray(input.ids) ? (input.ids as unknown[]).map(String) : null
      const filterIds = scope ? [scope.widgetId] : requested
      // Sehr lange Strings kappen — Tokenkosten und Kontextüberlauf begrenzen
      const MAX_STR = 4000
      const trim = (v: unknown): unknown => {
        if (typeof v === 'string') return v.length > MAX_STR ? `${v.slice(0, MAX_STR)}… [truncated, ${v.length} chars total]` : v
        if (Array.isArray(v)) return v.map(trim)
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, trim(x)]))
        return v
      }
      // Reader-Dateidaten (Blob-Referenzen) und Bild-DataURLs sind für die KI
      // nutzlos und teils riesig — ausblenden.
      const widgets = Object.fromEntries(Object.entries(fresh.widgets)
        .filter(([id]) => !filterIds || filterIds.includes(id))
        .map(([id, w]) => {
          const data = { ...w.data }
          delete data.fileData
          delete data.epubLocations
          if (typeof data.src === 'string' && data.src.length > 200) data.src = '(image data omitted)'
          return [id, { type: w.type, pos: w.pos, data: trim(data) }]
        }))
      return {
        result: JSON.stringify({ name: fresh.name, themeId: fresh.themeId, layoutMode: fresh.layoutMode ?? 'infinite', widgets }),
        summary: '🔍',
      }
    }

    default:
      return { result: `Error: unknown tool "${name}".`, summary: 'Error' }
  }
}
