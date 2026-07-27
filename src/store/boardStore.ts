'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '@/lib/idbStorage'
import type {
  Board, Widget, BoardBg, WidgetStyle, TilePos, CalendarEvent,
} from '@/types'
import { DEFAULT_STYLE, makeBoard, uid } from '@/lib/defaults'
import { GRID_COLS } from '@/lib/constants'
import { findTheme } from '@/lib/themes'
import { useSettings } from '@/store/settingsStore'
import { translate } from '@/lib/i18n'

// ─── State + Actions ──────────────────────────────────────────────────────────
// Ein Undo-Schritt umfasst Widgets UND Gestaltung (Hintergrund, Theme),
// damit Theme-/Hintergrund-Wechsel genauso rückgängig gemacht werden können.
type HistoryEntry = {
  boardId: string
  widgets: Record<string, Widget>
  bg:      BoardBg
  themeId: string
  kind?:   string   // z. B. 'bg' — dient dem Zusammenfassen schneller Folgeänderungen
  at:      number
}

// Gelöschte Boards wandern für 30 Tage in den Papierkorb (wiederherstellbar)
export interface TrashedBoard { board: Board; deletedAt: number }
const TRASH_TTL_MS  = 30 * 86400000
const TRASH_MAX     = 20

function withoutExpired(trash: TrashedBoard[]): TrashedBoard[] {
  const cutoff = Date.now() - TRASH_TTL_MS
  return trash.filter(t => t.deletedAt > cutoff)
}

interface BoardState {
  boards:          Record<string, Board>
  currentBoardId:  string
  trash:           TrashedBoard[]
  _history:        HistoryEntry[]
  _future:         HistoryEntry[]
}

interface BoardActions {
  // Board management
  createBoard:     (name: string) => string   // returns new board id
  duplicateBoard:  (id: string, patch?: Partial<Board>) => void
  switchBoard:     (id: string) => void
  deleteBoard:     (id: string) => void
  setBoardName:    (name: string) => void
  renameBoard:     (id: string, name: string) => void
  togglePinBoard:  (id: string) => void
  setBoardFolder:  (id: string, folder: string | null) => void
  restoreBoard:    (id: string) => void   // aus dem Papierkorb zurückholen
  purgeBoard:      (id: string) => void   // endgültig aus dem Papierkorb löschen
  emptyTrash:      () => void             // Papierkorb komplett leeren
  importBoard:     (board: Board) => string
  importAllBoards: (boards: Record<string, Board>) => void

  // Widget CRUD (all operate on currentBoardId)
  addWidget:       (w: Widget) => void
  updateWidget:    (id: string, patch: Partial<Widget>) => void
  // Wie updateWidget, aber ohne Undo-Snapshot und ohne lastEdited-Bump —
  // für reine Lese-/Anzeigezustände (z. B. aktuelle Seite im Reader)
  updateWidgetQuiet: (id: string, patch: Partial<Widget>) => void
  moveWidget:      (id: string, pos: TilePos) => void
  bumpWidgetZIndex: (id: string) => void
  deleteWidget:    (id: string) => void
  deleteWidgets:   (ids: string[]) => void
  duplicateWidget:       (id: string) => void
  // Widget auf ein anderes Board verschieben (copy=false) oder kopieren (copy=true)
  transferWidget:        (id: string, targetBoardId: string, copy: boolean) => void
  updateStyle:           (id: string, patch: Partial<WidgetStyle>) => void
  setWidgetLocked:       (id: string, locked: boolean) => void
  undo: () => void
  redo: () => void

  // Widget-specific data mutations
  updateTaskData:      (id: string, patch: Record<string, unknown>) => void
  updateNoteContent:   (id: string, content: string) => void
  setTimerData:        (id: string, patch: Partial<import('@/types').TimerData>) => void
  resetWater:          (id: string) => void
  updateChartData:     (id: string, patch: Record<string, unknown>) => void
  setImageSrc:         (id: string, src: string) => void
  addCalendarEvent:    (wId: string, event: CalendarEvent) => void
  updateCalendarEvent: (wId: string, event: CalendarEvent) => void
  deleteCalendarEvent: (wId: string, eventId: string) => void

  // Board appearance
  setBackground:  (patch: Partial<BoardBg>) => void
  applyTheme:     (id: string) => void
  setBoardIcon:   (url: string | null) => void
  setLayoutMode:  (mode: 'grid' | 'infinite') => void
  setBoardFont:   (fontFamily: string | null) => void
}

// ─── Layout helpers ───────────────────────────────────────────────────────────
function _overlaps(a: TilePos, b: TilePos): boolean {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  )
}

// Freien Platz für ein Widget MIT seiner Originalgröße suchen (für Board-Transfer).
// Startet bei den vorhandenen Widgets des Zielboards und scannt zeilenweise.
function _findFreePos(widgets: Record<string, Widget>, span: TilePos, maxCols: number): TilePos {
  const existing = Object.values(widgets)
  const size = { colSpan: span.colSpan, rowSpan: span.rowSpan }
  if (existing.length === 0) return { col: Math.min(span.col, Math.max(1, maxCols - span.colSpan + 1)), row: span.row, ...size }
  const minC = Math.max(1, Math.min(...existing.map(w => w.pos.col)))
  const minR = Math.max(1, Math.min(...existing.map(w => w.pos.row)))
  for (let r = minR; r < minR + 80; r++) {
    for (let c = minC; c < Math.min(minC + 80, maxCols - span.colSpan + 2); c++) {
      const cand = { col: c, row: r, ...size }
      if (!existing.some(o => _overlaps(cand, o.pos))) return cand
    }
  }
  return { col: minC, row: minR + 80, ...size }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
type S = BoardState & BoardActions

function snap(s: S, kind?: string): Pick<S, '_history' | '_future'> {
  const b = cur(s)
  if (!b) return { _history: s._history, _future: s._future }
  const entry: HistoryEntry = {
    boardId: s.currentBoardId,
    widgets: { ...b.widgets },
    bg:      { ...b.bg },
    themeId: b.themeId,
    kind,
    at:      Date.now(),
  }
  // Schnelle Folgeänderungen gleicher Art (z. B. Slider-Ziehen beim Hintergrund)
  // nicht als Dutzende Einzelschritte aufzeichnen
  const top = s._history[s._history.length - 1]
  if (kind && top?.kind === kind && top.boardId === entry.boardId && entry.at - top.at < 1500) {
    return { _history: s._history, _future: [] }
  }
  return { _history: [...s._history.slice(-29), entry], _future: [] }
}

// Theme-CSS-Variablen aufs Dokument anwenden (bei Undo/Redo von Theme-Wechseln)
function applyThemeCss(id: string) {
  const theme = findTheme(id)
  if (!theme || typeof document === 'undefined') return
  const root = document.documentElement
  Object.entries(theme.cssVars).forEach(([k, v]) => root.style.setProperty(k, v))
}

function cur(s: BoardState): Board | undefined {
  return s.boards[s.currentBoardId]
}

function patchCur(s: BoardState, update: (b: Board) => Partial<Board>): Partial<BoardState> {
  const b = cur(s)
  if (!b) return {}
  return {
    boards: { ...s.boards, [s.currentBoardId]: { ...b, ...update(b), lastEdited: Date.now() } },
  }
}

function patchWidgets(s: BoardState, fn: (ws: Record<string, Widget>) => Record<string, Widget>): Partial<BoardState> {
  return patchCur(s, b => ({ widgets: fn(b.widgets) }))
}

function patchWidget(s: BoardState, id: string, fn: (w: Widget) => Widget): Partial<BoardState> {
  return patchWidgets(s, ws => {
    const w = ws[id]
    return w ? { ...ws, [id]: fn(w) } : ws
  })
}

// ─── Compact layout helper ────────────────────────────────────────────────────
// Removes empty column and row gaps between widgets while preserving the 2D
// structure. Only remaps coordinates — colSpan/rowSpan stay unchanged.
function _compactWidgets(all: Widget[], layoutMode: string): Record<string, Widget> {
  if (all.length === 0) return {}
  const infinite = layoutMode === 'infinite'

  // Collect every column/row cell occupied by at least one widget
  const usedCols = new Set<number>()
  const usedRows = new Set<number>()
  for (const w of all) {
    for (let c = w.pos.col; c < w.pos.col + w.pos.colSpan; c++) usedCols.add(c)
    for (let r = w.pos.row; r < w.pos.row + w.pos.rowSpan; r++) usedRows.add(r)
  }

  const minC = Math.min(...usedCols)
  const maxC = Math.max(...usedCols)
  const minR = Math.min(...usedRows)
  const maxR = Math.max(...usedRows)

  // Build remapping: skip columns/rows that no widget uses
  // For infinite mode keep the origin area; for grid mode start from 1
  const originC = infinite ? minC : 1
  const originR = infinite ? minR : 1

  const colMap = new Map<number, number>()
  let nc = originC
  for (let c = infinite ? minC : 1; c <= maxC; c++) {
    if (usedCols.has(c)) { colMap.set(c, nc); nc++ }
  }

  const rowMap = new Map<number, number>()
  let nr = originR
  for (let r = infinite ? minR : 1; r <= maxR; r++) {
    if (usedRows.has(r)) { rowMap.set(r, nr); nr++ }
  }

  const result: Record<string, Widget> = {}
  for (const w of all) {
    result[w.id] = {
      ...w,
      pos: {
        ...w.pos,
        col: colMap.get(w.pos.col) ?? w.pos.col,
        row: rowMap.get(w.pos.row) ?? w.pos.row,
      },
    }
  }
  return result
}

// ─── Store ────────────────────────────────────────────────────────────────────
const initialBoard = makeBoard('My Planboard')

export const useBoardStore = create<S>()(
  persist(
    (set, get) => ({
      boards:         { [initialBoard.id]: initialBoard },
      currentBoardId: initialBoard.id,
      trash:          [],
      _history:       [],
      _future:        [],

      // ── Board management ──
      createBoard: (name) => {
        // Neue Boards starten mit dem in den Einstellungen gewählten Standard-Theme
        const themeId = useSettings.getState().defaultThemeId || 'dark'
        const theme   = findTheme(themeId)
        const b = makeBoard(name, theme ? themeId : 'dark')
        if (theme?.bg) b.bg = { ...b.bg, ...theme.bg }
        set(s => ({ boards: { ...s.boards, [b.id]: b }, currentBoardId: b.id }))
        return b.id
      },

      duplicateBoard: (id, patch) => {
        const b = get().boards[id]
        if (!b) return
        const widgetIdMap: Record<string, string> = {}
        Object.keys(b.widgets).forEach(wId => { widgetIdMap[wId] = uid() })
        const newWidgets: Record<string, Widget> = {}
        for (const [wId, w] of Object.entries(b.widgets)) {
          newWidgets[widgetIdMap[wId]] = { ...w, id: widgetIdMap[wId] }
        }
        // patch erlaubt Überschreiben von z. B. name/folder (Ordner duplizieren)
        const newBoard = { ...b, id: uid(), name: `${b.name} (${translate(useSettings.getState().language, 'Copy')})`, lastEdited: Date.now(), createdAt: Date.now(), pinned: false, widgets: newWidgets, ...patch }
        set(s => ({ boards: { ...s.boards, [newBoard.id]: newBoard } }))
      },

      switchBoard: (id) => set({ currentBoardId: id }),

      // Verschiebt in den Papierkorb (30 Tage wiederherstellbar) statt hart zu löschen
      deleteBoard: (id) => set(s => {
        const deleted = s.boards[id]
        const next = { ...s.boards }
        delete next[id]
        const trash = deleted
          ? [...withoutExpired(s.trash), { board: deleted, deletedAt: Date.now() }].slice(-TRASH_MAX)
          : withoutExpired(s.trash)
        const ids = Object.keys(next)
        if (ids.length === 0) {
          const fresh = makeBoard('My Planboard')
          next[fresh.id] = fresh
          return { boards: next, currentBoardId: fresh.id, trash }
        }
        const nextId = s.currentBoardId === id ? ids[0] : s.currentBoardId
        return { boards: next, currentBoardId: nextId, trash }
      }),

      restoreBoard: (id) => set(s => {
        const entry = s.trash.find(t => t.board.id === id)
        if (!entry) return {}
        return {
          boards: { ...s.boards, [id]: { ...entry.board, lastEdited: Date.now() } },
          trash:  withoutExpired(s.trash).filter(t => t.board.id !== id),
        }
      }),

      purgeBoard: (id) => set(s => ({
        trash: withoutExpired(s.trash).filter(t => t.board.id !== id),
      })),

      emptyTrash: () => set({ trash: [] }),

      setBoardName: (name) => set(s => patchCur(s, () => ({ name }))),

      renameBoard: (id, name) => set(s => {
        const b = s.boards[id]
        if (!b) return {}
        return { boards: { ...s.boards, [id]: { ...b, name, lastEdited: Date.now() } } }
      }),

      // Pin-Status ohne lastEdited-Bump (Anpinnen ist keine Bearbeitung)
      togglePinBoard: (id) => set(s => {
        const b = s.boards[id]
        if (!b) return {}
        return { boards: { ...s.boards, [id]: { ...b, pinned: !b.pinned } } }
      }),

      // Ordner-Zuordnung — wie Pin ohne lastEdited-Bump (reine Organisation)
      setBoardFolder: (id, folder) => set(s => {
        const b = s.boards[id]
        if (!b) return {}
        const name = folder?.trim().slice(0, 30)
        return { boards: { ...s.boards, [id]: { ...b, folder: name || undefined } } }
      }),

      importBoard: (board) => {
        const newId = uid()
        const newBoard: Board = { ...board, id: newId, name: `${board.name} (${translate(useSettings.getState().language, 'Imported')})`, lastEdited: Date.now() }
        set(s => ({ boards: { ...s.boards, [newId]: newBoard }, currentBoardId: newId }))
        return newId
      },

      importAllBoards: (boards) => set(s => ({ boards: { ...s.boards, ...boards } })),

      // ── Widget CRUD ──
      addWidget: (w) => set(s => ({ ...snap(s), ...patchWidgets(s, ws => ({ ...ws, [w.id]: w })) })),

      // Mit Undo-Snapshot: kind "data:<id>" nutzt den Merge-Mechanismus in
      // snap() — schnelle Folgeänderungen am selben Widget (KI-Tool-Runden,
      // Tipp-Bursts) werden zu EINEM Undo-Schritt zusammengefasst.
      updateWidget: (id, patch) => set(s => ({ ...snap(s, `data:${id}`), ...patchWidget(s, id, w => ({ ...w, ...patch })) })),

      updateWidgetQuiet: (id, patch) => set(s => {
        const b = cur(s)
        const w = b?.widgets[id]
        if (!b || !w) return s
        // bewusst OHNE lastEdited-Bump: bloßes Lesen (Seitenwechsel im Reader)
        // soll das Board nicht als "bearbeitet" markieren
        return { boards: { ...s.boards, [s.currentBoardId]: { ...b, widgets: { ...b.widgets, [id]: { ...w, ...patch } } } } }
      }),

      moveWidget: (id, pos) => set(s => ({ ...snap(s), ...patchWidget(s, id, w => ({ ...w, pos })) })),
      bumpWidgetZIndex: (id) => set(s => {
        const board = cur(s)
        if (!board) return {}
        const maxZ = Object.values(board.widgets).reduce((m, w) => Math.max(m, w.zIndex ?? 1), 1)
        // Deckel bei 500: Widgets dürfen nie über UI-Ebenen wie den offenen
        // Widget-KI-Chat (Kachel-zIndex 700, TileWrapper) hinauswachsen.
        // Am Deckel: alle normalisieren, damit die Reihenfolge erhalten bleibt.
        if (maxZ + 1 > 500) {
          const sorted = Object.values(board.widgets).sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1))
          const remap = new Map(sorted.map((w, i) => [w.id, i + 1]))
          return patchCur(s, b => ({
            widgets: Object.fromEntries(Object.entries(b.widgets).map(([wid, w]) =>
              [wid, { ...w, zIndex: wid === id ? sorted.length + 1 : (remap.get(wid) ?? 1) }])),
          }))
        }
        return patchWidget(s, id, w => ({ ...w, zIndex: maxZ + 1 }))
      }),

      deleteWidget: (id) => set(s => ({ ...snap(s), ...patchCur(s, b => {
        const next = { ...b.widgets }
        delete next[id]
        return { widgets: next }
      }) })),

      deleteWidgets: (ids) => set(s => ({ ...snap(s), ...patchCur(s, b => {
        const next = { ...b.widgets }
        ids.forEach(id => delete next[id])
        return { widgets: next }
      }) })),

      duplicateWidget: (id) => set(s => {
        const b = cur(s)
        if (!b) return {}
        const w = b.widgets[id]
        if (!w) return {}
        // Place below the original, moving further down until the spot is free
        const others = Object.values(b.widgets)
        let row = w.pos.row + w.pos.rowSpan
        for (let guard = 0; guard < 500; guard++) {
          const candidate = { ...w.pos, row }
          if (!others.some(o => _overlaps(candidate, o.pos))) break
          row++
        }
        const nw: Widget = {
          ...w,
          id: uid(),
          pos: { ...w.pos, row },
        }
        return { ...snap(s), ...patchWidgets(s, ws => ({ ...ws, [nw.id]: nw })) }
      }),

      transferWidget: (id, targetBoardId, copy) => set(s => {
        const src    = cur(s)
        const target = s.boards[targetBoardId]
        if (!src || !target || targetBoardId === s.currentBoardId) return {}
        const w = src.widgets[id]
        if (!w) return {}
        const maxCols  = (target.layoutMode ?? 'infinite') === 'grid' ? GRID_COLS : 200
        const pos      = _findFreePos(target.widgets, w.pos, maxCols)
        const nw: Widget = { ...w, id: uid(), pos }
        const boards = {
          ...s.boards,
          [targetBoardId]: { ...target, widgets: { ...target.widgets, [nw.id]: nw }, lastEdited: Date.now() },
        }
        if (copy) return { boards }
        const rest = { ...src.widgets }
        delete rest[id]
        boards[s.currentBoardId] = { ...src, widgets: rest, lastEdited: Date.now() }
        return { ...snap(s), boards }
      }),

      updateStyle: (id, patch) => set(s => ({ ...snap(s), ...patchWidget(s, id, w => ({
        ...w, style: { ...w.style, ...patch },
      })) })),

      setWidgetLocked: (id, locked) => set(s => ({ ...snap(s), ...patchWidget(s, id, w => ({ ...w, locked })) })),

      // ── Widget-specific mutations ──
      updateTaskData: (id, patch) => set(s => patchWidget(s, id, w => ({
        ...w, data: { ...w.data, ...patch },
      }))),

      updateNoteContent: (id, content) => set(s => patchWidget(s, id, w => ({
        ...w, data: { ...w.data, content },
      }))),

      setTimerData: (id, patch) => set(s => patchWidget(s, id, w => ({
        ...w, data: { ...w.data, ...patch },
      }))),

      resetWater: (id) => set(s => patchWidget(s, id, w => ({
        ...w, data: { ...w.data, loggedMl: 0 },
      }))),

      updateChartData: (id, patch) => set(s => patchWidget(s, id, w => ({
        ...w, data: { ...w.data, ...patch },
      }))),

      setImageSrc: (id, src) => set(s => patchWidget(s, id, w => ({
        ...w, data: { ...w.data, src },
      }))),

      addCalendarEvent: (wId, event) => set(s => patchWidget(s, wId, w => ({
        ...w, data: { ...w.data, events: [...(w.data.events ?? []), event] },
      }))),

      updateCalendarEvent: (wId, event) => set(s => patchWidget(s, wId, w => ({
        ...w, data: { ...w.data, events: (w.data.events ?? []).map((e: CalendarEvent) => e.id === event.id ? event : e) },
      }))),

      deleteCalendarEvent: (wId, eventId) => set(s => patchWidget(s, wId, w => ({
        ...w, data: { ...w.data, events: (w.data.events ?? []).filter((e: CalendarEvent) => e.id !== eventId) },
      }))),

      undo: () => set(s => {
        // Skip (and drop) entries whose board has been deleted so undo never gets stuck
        const history = [...s._history]
        let entry: HistoryEntry | undefined
        while (history.length) {
          const candidate = history.pop()!
          if (s.boards[candidate.boardId]) { entry = candidate; break }
        }
        if (!entry) return { _history: history }
        const b = s.boards[entry.boardId]
        if (entry.boardId === s.currentBoardId && entry.themeId !== b.themeId) applyThemeCss(entry.themeId)
        return {
          boards: { ...s.boards, [entry.boardId]: { ...b, widgets: entry.widgets, bg: entry.bg, themeId: entry.themeId, lastEdited: Date.now() } },
          _history: history,
          _future: [...s._future.slice(-29), { boardId: entry.boardId, widgets: b.widgets, bg: { ...b.bg }, themeId: b.themeId, at: Date.now() }],
        }
      }),

      redo: () => set(s => {
        const future = [...s._future]
        let entry: HistoryEntry | undefined
        while (future.length) {
          const candidate = future.pop()!
          if (s.boards[candidate.boardId]) { entry = candidate; break }
        }
        if (!entry) return { _future: future }
        const b = s.boards[entry.boardId]
        if (entry.boardId === s.currentBoardId && entry.themeId !== b.themeId) applyThemeCss(entry.themeId)
        return {
          boards: { ...s.boards, [entry.boardId]: { ...b, widgets: entry.widgets, bg: entry.bg, themeId: entry.themeId, lastEdited: Date.now() } },
          _future: future,
          _history: [...s._history.slice(-29), { boardId: entry.boardId, widgets: b.widgets, bg: { ...b.bg }, themeId: b.themeId, at: Date.now() }],
        }
      }),

      // ── Board appearance ──
      setBoardIcon:  (url)  => set(s => patchCur(s, () => ({ icon: url }))),
      setLayoutMode: (mode) => set(s => patchCur(s, () => ({ layoutMode: mode }))),
      setBoardFont:  (fontFamily) => set(s => patchCur(s, () => ({ fontFamily: fontFamily ?? undefined }))),

      setBackground: (patch) => set(s => ({ ...snap(s, 'bg'), ...patchCur(s, b => ({ bg: { ...b.bg, ...patch } })) })),

      applyTheme: (id) => {
        const theme = findTheme(id)
        if (!theme) return
        applyThemeCss(id)
        useSettings.getState().setSetting({ lastThemeId: id })
        set(s => {
          const board = s.boards[s.currentBoardId]
          const oldStyle = board ? findTheme(board.themeId)?.widgetStyle : undefined
          const newStyle = theme.widgetStyle
          return { ...snap(s, 'theme'), ...patchCur(s, b => {
            const base: Partial<Board> = {
              themeId: id,
              bg: theme.bg ? { ...b.bg, ...theme.bg } : b.bg,
            }
            if (oldStyle && newStyle) {
              const widgets = { ...b.widgets }
              let changed = false
              for (const [wId, w] of Object.entries(widgets)) {
                // Nicht "s" nennen — das ist im umgebenden set(s => …) bereits
                // der Store-State; ein gleichnamiger innerer Wert hier hätte
                // jeden künftigen Zugriff auf den echten State in dieser
                // Schleife stillschweigend auf widget.style umgelenkt.
                const style = w.style
                const patch: Partial<typeof style> = {}
                // For each style key, if the widget still has the old theme's default value,
                // replace it with the new theme's value — leaving user-customized values intact.
                if (style.bgColor      === oldStyle.bgColor)      patch.bgColor      = newStyle.bgColor
                if (style.borderColor  === oldStyle.borderColor)  patch.borderColor  = newStyle.borderColor
                if (style.borderWidth  === oldStyle.borderWidth)  patch.borderWidth  = newStyle.borderWidth
                if (style.borderRadius === oldStyle.borderRadius) patch.borderRadius = newStyle.borderRadius
                if (style.shadow       === oldStyle.shadow)       patch.shadow       = newStyle.shadow
                if (style.blur         === oldStyle.blur)         patch.blur         = newStyle.blur
                if (style.opacity      === oldStyle.opacity)      patch.opacity      = newStyle.opacity
                if (style.glowColor    === oldStyle.glowColor)    patch.glowColor    = newStyle.glowColor
                if (style.glowSize     === oldStyle.glowSize)     patch.glowSize     = newStyle.glowSize
                if (Object.keys(patch).length > 0) {
                  widgets[wId] = { ...w, style: { ...style, ...patch } }
                  changed = true
                }
              }
              if (changed) base.widgets = widgets
            }
            return base
          }) }
        })
      },

    }),
    {
      name: 'planboard-v2',
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ boards: s.boards, currentBoardId: s.currentBoardId, trash: s.trash }),
      migrate: (persisted: unknown, fromVersion: number) => {
        const s = persisted as { boards: Record<string, Board>; currentBoardId: string }
        if (fromVersion < 2 && s?.boards) {
          const newBoards: Record<string, Board> = {}
          for (const [id, board] of Object.entries(s.boards)) {
            const all = Object.values(board.widgets)
            newBoards[id] = { ...board, widgets: _compactWidgets(all, board.layoutMode ?? 'infinite') }
          }
          return { ...s, boards: newBoards }
        }
        return s
      },
    }
  )
)

// Convenience selector
export const selectBoard = (s: S) => s.boards[s.currentBoardId] as Board | undefined
export const selectDefaultStyle = () => DEFAULT_STYLE
