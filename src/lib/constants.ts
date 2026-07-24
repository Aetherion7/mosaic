// Widget types that are always full-width (span=2) on mobile
export const MOBILE_FORCE_FULL = new Set([
  'calendar', 'chart', 'spreadsheet', 'drawboard', 'map', 'reader',
])

// Single source of truth for grid geometry — do not redefine elsewhere
// Zelle + Gap ergeben zusammen den Raster-Pitch von 124 px. Der Gap ist bewusst
// deutlich sichtbar (12 px), damit benachbarte Widgets oben/unten und
// links/rechts denselben, klar erkennbaren Abstand haben.
export const GRID_COLS  = 12
export const GRID_ROW_H = 112
export const GRID_GAP   = 12

// Infinite-canvas mode
export const INFINITE_COL_W     = 112   // cell width (px) — Pitch 124 wie die Zeilen
export const INFINITE_GRID_COLS = 100   // total columns
export const INFINITE_GRID_ROWS = 100   // total rows
