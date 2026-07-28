import type { Widget, WidgetStyle, WidgetType, TilePos, Board, BoardBg } from '@/types'
import { GRID_COLS } from '@/lib/constants'
import { todayStr } from '@/lib/dates'
import { translate } from '@/lib/i18n'
import { useSettings } from '@/store/settingsStore'

let _counter = 1
export function uid() {
  return `w_${Date.now()}_${_counter++}`
}

export const DEFAULT_STYLE: WidgetStyle = {
  bgColor:      'var(--surface)',
  gradient:     null,
  gradientDir:  'to-br',
  opacity:      1,
  blur:         0,
  borderColor:  'var(--border)',
  borderWidth:  1,
  borderRadius: 14,
  shadow:       'md',
  glowColor:    null,
  glowSize:     0,
}

export const DEFAULT_BG: BoardBg = {
  type:            'color',
  color:           '#09090f',
  gradient:        ['#09090f', '#0d0d14'],
  gradientDir:     'to-br',
  imageUrl:        null,
  imageName:       null,
  imageBlur:       0,
  imageBrightness: 1,
  pattern:         'dots',
  patternColor:    '#ffffff',
  patternOpacity:  0.15,
}

export function makeBoard(name: string, themeId: string = 'dark'): Board {
  return {
    id:         uid(),
    name,
    icon:       null,
    widgets:    {},
    bg:         { ...DEFAULT_BG },
    themeId,
    lastEdited: Date.now(),
    createdAt:  Date.now(),
  }
}

// Default colSpan × rowSpan per type
const DEFAULT_SPANS: Record<WidgetType, { colSpan: number; rowSpan: number }> = {
  task:        { colSpan: 3, rowSpan: 3 },
  note:        { colSpan: 4, rowSpan: 2 },
  timer:       { colSpan: 3, rowSpan: 3 },
  water:       { colSpan: 3, rowSpan: 3 },
  image:       { colSpan: 4, rowSpan: 2 },
  calendar:    { colSpan: 6, rowSpan: 3 },
  chart:       { colSpan: 6, rowSpan: 3 },
  text:        { colSpan: 4, rowSpan: 2 },
  spreadsheet: { colSpan: 8, rowSpan: 4 },
  drawboard:   { colSpan: 6, rowSpan: 4 },
  clock:       { colSpan: 4, rowSpan: 2 },
  weather:     { colSpan: 4, rowSpan: 2 },
  map:         { colSpan: 6, rowSpan: 3 },
  plugin:      { colSpan: 4, rowSpan: 2 },
  reader:      { colSpan: 6, rowSpan: 4 },
  sleep:       { colSpan: 4, rowSpan: 2 },
  agenda:      { colSpan: 3, rowSpan: 2 },
  quicklinks:  { colSpan: 4, rowSpan: 2 },
}

// Find the first free cell near a given center (for infinite canvas mode)
export function findPosNear(
  widgets: Record<string, Widget>,
  type: WidgetType,
  centerCol: number,
  centerRow: number,
  maxCols = 200,
): TilePos {
  const { colSpan, rowSpan } = DEFAULT_SPANS[type]
  const existing = Object.values(widgets)

  function isFree(col: number, row: number) {
    if (col < 1 || row < 1 || col + colSpan - 1 > maxCols) return false
    return !existing.some(w =>
      col < w.pos.col + w.pos.colSpan &&
      col + colSpan > w.pos.col &&
      row < w.pos.row + w.pos.rowSpan &&
      row + rowSpan > w.pos.row
    )
  }

  const sc = Math.max(1, Math.round(centerCol))
  const sr = Math.max(1, Math.round(centerRow))
  if (isFree(sc, sr)) return { col: sc, row: sr, colSpan, rowSpan }

  for (let r = 1; r <= 30; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.abs(dr) !== r && Math.abs(dc) !== r) continue
        if (isFree(sc + dc, sr + dr)) return { col: sc + dc, row: sr + dr, colSpan, rowSpan }
      }
    }
  }
  return { col: sc, row: sr, colSpan, rowSpan }
}

// Find the first free cell in the grid, scanning row-by-row, left-to-right
export function findNextPos(widgets: Record<string, Widget>, type: WidgetType): TilePos {
  const { colSpan, rowSpan } = DEFAULT_SPANS[type]
  const existing = Object.values(widgets)
  if (existing.length === 0) return { col: 1, row: 1, colSpan, rowSpan }
  const maxRow = existing.reduce((m, w) => Math.max(m, w.pos.row + w.pos.rowSpan - 1), 0)

  function isFree(col: number, row: number): boolean {
    return !existing.some(w =>
      col < w.pos.col + w.pos.colSpan &&
      col + colSpan > w.pos.col &&
      row < w.pos.row + w.pos.rowSpan &&
      row + rowSpan > w.pos.row
    )
  }

  for (let row = 1; row <= maxRow; row++) {
    for (let col = 1; col + colSpan - 1 <= GRID_COLS; col++) {
      if (isFree(col, row)) return { col, row, colSpan, rowSpan }
    }
  }
  return { col: 1, row: maxRow + 1, colSpan, rowSpan }
}

export function defaultWidget(
  type: WidgetType,
  pos?: TilePos,
  styleOverride: Partial<WidgetStyle> = {},
): Widget {
  const finalPos = pos ?? { col: 1, row: 1, ...DEFAULT_SPANS[type] }
  const lang = useSettings.getState().language
  const tr = (s: string) => translate(lang, s)
  const base = {
    id:        uid(),
    pos:       finalPos,
    zIndex:    1,
    style:     { ...DEFAULT_STYLE, ...styleOverride },
  }

  switch (type) {
    case 'task':
      // Erste Aufgabe in der Akzentfarbe des Themes — passt sich Theme-Wechseln an
      return { ...base, type, data: { habits: [{ id: `h_${uid()}`, name: `${tr('Task')} 1`, color: 'var(--accent)', weekDays: [], lastWeek: '', weeklyLog: {} }] } }
    case 'note':
      return { ...base, type, data: { title: tr('Note'), content: '' } }
    case 'timer':
      return { ...base, type, data: { name: '', durationMin: 25, startedAt: null, running: false, elapsed: 0 } }
    case 'water':
      return { ...base, type, data: { goalMl: 2000, loggedMl: 0, mlPerSection: 500, lastDate: todayStr() } }
    case 'image':
      return { ...base, type, data: { src: '', alt: tr('Image'), objectFit: 'contain', noBar: false } }
    case 'calendar':
      return { ...base, type, data: { events: [] } }
    case 'text':
      return { ...base, type, data: {
        content:         '',
        fontSize:        24,
        fontWeight:      'normal',
        fontStyle:       'normal',
        textDecoration:  'none',
        textAlign:       'left',
        color:           'var(--text1)',
        colorPalette:    [],
        fontFamily:      'inter',
        lineHeight:      1.4,
        textShadow:      false,
        textShadowColor: '#000000',
        textShadowBlur:  6,
        textShadowX:     1,
        textShadowY:     2,
        textStroke:      false,
        textStrokeColor: '#000000',
        textStrokeWidth: 1,
        noBg:            false,
      }}
    case 'chart':
      return { ...base, type, data: {
        title:     tr('Chart'),
        chartType: 'column',
        labels:    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map(tr),
        datasets:  [
          { label: `${tr('Series')} 1`, values: [42, 68, 53, 89, 71, 95], color: '#7c6fe8' },
          { label: `${tr('Series')} 2`, values: [30, 45, 70, 55, 80, 60], color: '#4ecdc4' },
        ],
      }}
    case 'spreadsheet':
      return { ...base, type, data: {
        rows: 30,
        cols: 8,
        cells: {} as Record<string, unknown>,
        colW: Array(8).fill(90),
        title: tr('Table'),
      }}
    case 'drawboard':
      return { ...base, type, data: { elements: [] } }
    case 'clock':
      return { ...base, type, data: { clockStyle: 'digital', showSeconds: true } }
    case 'weather':
      return { ...base, type, data: { manualCity: '', unit: 'celsius' } }
    case 'map':
      return { ...base, type, data: { centerLat: 51.505, centerLng: -0.09, zoom: 13, markers: [], routes: [] } }
    case 'plugin':
      return { ...base, type, data: { pluginId: '', pluginName: 'Plugin', pluginIcon: '🧩', pluginDesc: '' } }
    case 'reader':
      return { ...base, type, data: { highlights: {}, currentPage: 1 } }
    case 'sleep':
      return { ...base, type, data: { goalH: 8, log: {} } }
    case 'agenda':
      return { ...base, type, data: { daysAhead: 7 } }
    case 'quicklinks':
      return { ...base, type, data: { links: [] } }
  }
}
