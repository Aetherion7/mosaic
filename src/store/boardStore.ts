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
import { stripPdfRefSpans } from '@/lib/pdfRefCleanup'

// Deleting a Reader widget used to leave its note links dangling (clicking
// them silently no-ops, since navigateRef looks the widget up and finds
// nothing) — deleteWidget/deleteWidgets below now strip those spans in the
// same step. countReaderLinks is used by the UI (TileWrapper's move-to-board
// action) to warn before a cross-board move, which breaks links for a
// different reason (NoteWidget only ever resolves widgets on the CURRENT
// board) that isn't fixable here — see the comment at transferWidget.
export function countReaderLinks(board: Board, readerId: string): number {
  const rid = readerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re  = new RegExp(`data-pdf-reader="${rid}"`, 'g')
  let n = 0
  for (const w of Object.values(board.widgets)) {
    if (w.type !== 'note') continue
    const content = (w.data.content ?? '') as string
    n += (content.match(re) ?? []).length
  }
  return n
}

// Mutates `widgets` in place, stripping every link span for the given
// (now-deleted) reader widget ids from every note's content.
function stripReaderRefs(widgets: Record<string, Widget>, readerIds: string[]) {
  for (const [nid, w] of Object.entries(widgets)) {
    if (w.type !== 'note') continue
    let content = (w.data.content ?? '') as string
    let changed = false
    for (const rid of readerIds) {
      if (!content.includes(`data-pdf-reader="${rid}"`)) continue
      content = stripPdfRefSpans(content, rid)
      changed = true
    }
    if (changed) widgets[nid] = { ...w, data: { ...w.data, content } }
  }
}

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
    boardId: resolveBoardId(s),
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

// Per-process override for "which board am I actually looking at" — set once
// by a standalone widget window (src/app/widget/[boardId]/[widgetId]/page.tsx)
// so a pinned desktop widget reads/writes ITS board instead of whatever
// s.currentBoardId happens to be. Deliberately a plain module variable, never
// persisted (not part of partialize below): each Electron BrowserWindow is
// its own renderer process with its own JS heap, so this never leaks into or
// affects the main window's process. Do NOT fold this into s.currentBoardId
// itself — doing so would persist it into the shared IndexedDB blob and flip
// the main window's current board out from under the user the next time it
// reloads/restarts.
let activeBoardOverride: string | null = null
export function setActiveBoardOverride(id: string) { activeBoardOverride = id }
function resolveBoardId(s: BoardState): string { return activeBoardOverride ?? s.currentBoardId }

function cur(s: BoardState): Board | undefined {
  return s.boards[resolveBoardId(s)]
}

function patchCur(s: BoardState, update: (b: Board) => Partial<Board>): Partial<BoardState> {
  const b = cur(s)
  if (!b) return {}
  const id = resolveBoardId(s)
  return {
    boards: { ...s.boards, [id]: { ...b, ...update(b), lastEdited: Date.now() } },
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

// ─── Text-widget → Note-widget migration (v2 → v3) ───────────────────────────
// The old, now-removed Text widget's font/color/shadow/stroke/lineHeight/
// textAlign/noBg fields share the exact same names as the ones on NoteData,
// so they all carry over directly (both are widget-level settings, not
// per-node document state). Bold/italic/underline were a single flat
// widget-wide toggle in Text (there's no per-character formatting in a plain
// textarea) but are real per-selection Tiptap marks in Note — the closest
// lossless equivalent is wrapping the whole (escaped) content in the
// matching HTML tag once, which Markdown-parses back into a real mark on
// load.
function _escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _migrateTextDataToNote(d: any): Widget['data'] {
  let content = _escapeHtml(String(d.content ?? '')).replace(/\n/g, '<br>\n')
  if (d.textDecoration === 'underline') content = `<u>${content}</u>`
  if (d.fontStyle === 'italic')         content = `<em>${content}</em>`
  if (d.fontWeight === 'bold')          content = `<strong>${content}</strong>`
  return {
    title:            '',
    content,
    fontFamily:       d.fontFamily,
    fontSize:         d.fontSize,
    color:            d.color,
    colorPalette:     d.colorPalette,
    textShadow:       d.textShadow,
    textShadowColor:  d.textShadowColor,
    textShadowBlur:   d.textShadowBlur,
    textShadowX:      d.textShadowX,
    textShadowY:      d.textShadowY,
    textStroke:       d.textStroke,
    textStrokeColor:  d.textStrokeColor,
    textStrokeWidth:  d.textStrokeWidth,
    lineHeight:       d.lineHeight,
    textAlign:        d.textAlign,
    noBg:             d.noBg,
  }
}

function _migrateTextWidgetsToNote(board: Board): Board {
  let changed = false
  const widgets: Record<string, Widget> = { ...board.widgets }
  for (const [wId, w] of Object.entries(widgets)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((w.type as any) === 'text') {
      widgets[wId] = { ...w, type: 'note', data: _migrateTextDataToNote(w.data) }
      changed = true
    }
  }
  return changed ? { ...board, widgets } : board
}

// Das frühere Plugin/Add-on-Widget (installierbare Bibliothek mit
// pluginId/pluginName/pluginIcon/pluginDesc/embedUrl) wurde durch das
// einfachere HTML-Widget ersetzt, das nur noch den rohen HTML-Quelltext
// pro Widget-Instanz hält — keine getrennte Installations-Liste mehr.
function _migratePluginWidgetsToHtml(board: Board): Board {
  let changed = false
  const widgets: Record<string, Widget> = { ...board.widgets }
  for (const [wId, w] of Object.entries(widgets)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((w.type as any) === 'plugin') {
      widgets[wId] = { ...w, type: 'html', data: { html: String(w.data?.html ?? '') } }
      changed = true
    }
  }
  return changed ? { ...board, widgets } : board
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
        const boardId = resolveBoardId(s)
        // bewusst OHNE lastEdited-Bump: bloßes Lesen (Seitenwechsel im Reader)
        // soll das Board nicht als "bearbeitet" markieren
        return { boards: { ...s.boards, [boardId]: { ...b, widgets: { ...b.widgets, [id]: { ...w, ...patch } } } } }
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
        const deleted = next[id]
        delete next[id]
        if (deleted?.type === 'reader') stripReaderRefs(next, [id])
        return { widgets: next }
      }) })),

      deleteWidgets: (ids) => set(s => ({ ...snap(s), ...patchCur(s, b => {
        const next = { ...b.widgets }
        const deletedReaderIds = ids.filter(id => next[id]?.type === 'reader')
        ids.forEach(id => delete next[id])
        if (deletedReaderIds.length > 0) stripReaderRefs(next, deletedReaderIds)
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

      // Moving (not copying) a Reader widget to another board breaks any note
      // links pointing at it — not just because its id changes below, but
      // because NoteWidget's navigateRef only ever resolves widgets on the
      // CURRENT board (allWidgets = selectBoard(s).widgets) by design, so a
      // cross-board link could never resolve even with a preserved id. A full
      // fix needs cross-board widget resolution, which is out of scope here.
      // The UI layer (TileWrapper's move-to-board action) warns the user via
      // countReaderLinks() before calling this when links would break;
      // this action itself stays a pure state transition either way.
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
      version: 4,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ boards: s.boards, currentBoardId: s.currentBoardId, trash: s.trash }),
      migrate: (persisted: unknown, fromVersion: number) => {
        let s = persisted as { boards: Record<string, Board>; currentBoardId: string; trash?: TrashedBoard[] }
        if (fromVersion < 2 && s?.boards) {
          const newBoards: Record<string, Board> = {}
          for (const [id, board] of Object.entries(s.boards)) {
            const all = Object.values(board.widgets)
            newBoards[id] = { ...board, widgets: _compactWidgets(all, board.layoutMode ?? 'infinite') }
          }
          s = { ...s, boards: newBoards }
        }
        if (fromVersion < 3 && s?.boards) {
          const newBoards: Record<string, Board> = {}
          for (const [id, board] of Object.entries(s.boards)) {
            newBoards[id] = _migrateTextWidgetsToNote(board)
          }
          const newTrash = s.trash?.map(t => ({ ...t, board: _migrateTextWidgetsToNote(t.board) }))
          s = { ...s, boards: newBoards, ...(newTrash ? { trash: newTrash } : {}) }
        }
        if (fromVersion < 4 && s?.boards) {
          const newBoards: Record<string, Board> = {}
          for (const [id, board] of Object.entries(s.boards)) {
            newBoards[id] = _migratePluginWidgetsToHtml(board)
          }
          const newTrash = s.trash?.map(t => ({ ...t, board: _migratePluginWidgetsToHtml(t.board) }))
          s = { ...s, boards: newBoards, ...(newTrash ? { trash: newTrash } : {}) }
        }
        return s
      },
    }
  )
)

// ─── Cross-window data sync ─────────────────────────────────────────────────
// boardStore has no built-in multi-window awareness: each Electron
// BrowserWindow (or browser tab) runs its own separate in-memory copy of this
// store. Without this, an edit made in a pinned desktop-widget window (see
// src/app/widget/[boardId]/[widgetId]/page.tsx) would never appear in the
// main app window, and vice versa, until a manual reload. Not
// Electron-specific — this also fixes the same staleness across two browser
// tabs of the web app, so it runs unconditionally rather than being gated
// behind window.mosaicDesktop.
//
// Deliberately simple for a single-user local-first app — no CRDT/OT. On
// every local `boards` change, broadcast a "something changed" ping
// (debounced, since widgets like Note/Task fire set() per keystroke); on
// receipt, re-read the persisted blob from IndexedDB (the source of truth)
// and merge it in PER BOARD using the already-present Board.lastEdited
// timestamp as a free logical clock — never a flat replace, so a board
// actively being typed into locally is never clobbered by a remote window's
// stale snapshot of it. Known, accepted v1 gap: lastEdited is per-board, not
// per-widget, so two DIFFERENT widgets on the SAME board edited from two
// windows within the same ~300ms debounce window can still lose one edit —
// real per-field merging is out of scope here. currentBoardId/trash/
// _history/_future are deliberately excluded from the merge: which board is
// "current" and the undo/redo stack are legitimately per-window state, same
// reasoning as uiStore not syncing at all.
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  const WINDOW_ID = crypto.randomUUID()
  const channel = new BroadcastChannel('planboard-sync')
  let applyingRemote = false
  let broadcastTimer: ReturnType<typeof setTimeout> | null = null

  useBoardStore.subscribe((state, prevState) => {
    if (applyingRemote || state.boards === prevState.boards) return
    if (broadcastTimer) clearTimeout(broadcastTimer)
    broadcastTimer = setTimeout(() => channel.postMessage({ sourceId: WINDOW_ID }), 300)
  })

  channel.addEventListener('message', async (e: MessageEvent<{ sourceId: string }>) => {
    if (e.data?.sourceId === WINDOW_ID) return
    const raw = await idbStorage.getItem('planboard-v2')
    if (!raw) return
    let incoming: Record<string, Board>
    try {
      // Persisted shape is zustand's own wrapper — {state: {...}, version} —
      // NOT the partialized object directly (verified against the actual
      // IndexedDB record, not assumed from zustand's source).
      incoming = (JSON.parse(raw).state?.boards ?? {}) as Record<string, Board>
    } catch {
      return
    }
    applyingRemote = true
    useBoardStore.setState(s => {
      const merged = { ...s.boards }
      for (const [id, board] of Object.entries(incoming)) {
        if (!merged[id] || board.lastEdited >= merged[id].lastEdited) merged[id] = board
      }
      return { boards: merged }
    })
    applyingRemote = false
  })
}

// Convenience selector
// resolveBoardId (not a bare s.currentBoardId read) — AgendaWidget, NoteWidget,
// ReaderWidget, and CalendarWidget all import this selector directly, so a
// pinned widget window rendering any of them would otherwise silently read
// the WRONG board's data (its own process's s.currentBoardId, not the board
// the pinned widget actually belongs to).
export const selectBoard = (s: S) => s.boards[resolveBoardId(s)] as Board | undefined
export const selectDefaultStyle = () => DEFAULT_STYLE
