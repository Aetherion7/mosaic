'use client'
import { create } from 'zustand'
import type { ReactNode } from 'react'
import type { UIMode, PanelId, Widget } from '@/types'

export interface DeletedWidgetEntry {
  widget:  Widget
  boardId: string
}

// Vereinheitlichter Stapel für Rückgängig- und Status-Kurzmeldungen: beide
// teilen sich dieselbe Bildschirmposition (unten, zentriert), darum müssen
// sie sich auch denselben Stapel teilen — sonst überlagern sich zwei
// gleichzeitig sichtbare Meldungen exakt an derselben Stelle statt
// übereinander gestapelt zu werden.
export type ToastItem =
  | ({ kind: 'undo'; id: string } & DeletedWidgetEntry)
  | { kind: 'action'; id: string; message: ReactNode }

let toastSeq = 0
const nextToastId = () => `toast_${Date.now()}_${toastSeq++}`
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()

interface UIState {
  mode:               UIMode
  selectedId:         string | null
  panel:              PanelId
  // Settings ist ein eigenständiges Modal (SettingsModal.tsx), das TopBar
  // früher als rein lokalen useState hielt — nicht Teil von `panel`. Musste
  // in den globalen Store wandern, damit BoardGrid.tsx (Marquee-Auswahl
  // abbrechen, sobald IRGENDein Panel aufgeht) es überhaupt sehen kann.
  settingsOpen:       boolean
  lastAddedWidgetId:  string | null
  multiSelectedIds:   string[]
  pendingBulkDelete:  boolean
  toasts:             ToastItem[]
  canvasView:         { x: number; y: number; zoom: number }
  pendingCanvasFocus: { col: number; row: number; colSpan: number; rowSpan: number } | null
  focusedId:          string | null   // Widget im Fokus-Modus (Vollbild-Overlay)

  setMode:               (m: UIMode) => void
  setFocusedWidget:      (id: string | null) => void
  selectWidget:          (id: string | null) => void
  openPanel:             (p: PanelId) => void
  setSettingsOpen:       (v: boolean) => void
  toggleMode:            () => void
  setLastAddedWidget:    (id: string | null) => void
  toggleMultiSelect:     (id: string) => void
  setMultiSelectedIds:   (ids: string[]) => void
  clearMultiSelect:      () => void
  setPendingBulkDelete:  (v: boolean) => void
  showUndoToast:         (entry: DeletedWidgetEntry) => void
  showActionToast:       (message: ReactNode) => void
  dismissToast:          (id: string) => void
  setCanvasView:         (x: number, y: number, zoom: number) => void
  setCanvasFocus:        (pos: { col: number; row: number; colSpan: number; rowSpan: number } | null) => void
}

export const useUIStore = create<UIState>()((set, get) => ({
  mode:               'view',
  selectedId:         null,
  panel:              null,
  settingsOpen:       false,
  lastAddedWidgetId:  null,
  multiSelectedIds:   [],
  pendingBulkDelete:  false,
  toasts:             [],
  canvasView:         { x: 0, y: 0, zoom: 1 },
  pendingCanvasFocus: null,
  focusedId:          null,

  setMode:             (mode)  => set({ mode, panel: null, focusedId: null }),
  setFocusedWidget:    (id)    => set({ focusedId: id }),
  selectWidget:        (id)    => set({ selectedId: id }),
  openPanel:           (panel) => set({ panel }),
  setSettingsOpen:     (v)     => set({ settingsOpen: v }),
  toggleMode:          ()      => set(s => ({ mode: s.mode === 'edit' ? 'view' : 'edit', panel: null, multiSelectedIds: [], pendingBulkDelete: false, focusedId: null })),
  setLastAddedWidget:  (id)    => set({ lastAddedWidgetId: id }),
  toggleMultiSelect:   (id)    => set(s => ({
    multiSelectedIds: s.multiSelectedIds.includes(id)
      ? s.multiSelectedIds.filter(x => x !== id)
      : [...s.multiSelectedIds, id],
    pendingBulkDelete: false,
  })),
  setMultiSelectedIds:  (ids)  => set({ multiSelectedIds: ids, pendingBulkDelete: false }),
  clearMultiSelect:     ()     => set({ multiSelectedIds: [], pendingBulkDelete: false }),
  setPendingBulkDelete: (v)    => set({ pendingBulkDelete: v }),

  // Neue Meldung kommt vorne in die Liste — der Stapel wird per
  // flex-direction: column-reverse gerendert, wodurch das erste Element
  // stets unten sitzt und ältere, noch sichtbare Meldungen automatisch
  // nach oben rutschen statt überlagert zu werden.
  showUndoToast: (entry) => {
    const id = nextToastId()
    set(s => ({ toasts: [{ kind: 'undo', id, ...entry }, ...s.toasts] }))
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), 5000))
  },

  showActionToast: (message) => {
    const id = nextToastId()
    set(s => ({ toasts: [{ kind: 'action', id, message }, ...s.toasts] }))
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), 3000))
  },

  dismissToast: (id) => {
    const timer = toastTimers.get(id)
    if (timer) { clearTimeout(timer); toastTimers.delete(id) }
    set(s => ({ toasts: s.toasts.filter(x => x.id !== id) }))
  },

  setCanvasView:  (x, y, zoom) => set({ canvasView: { x, y, zoom } }),
  setCanvasFocus: (pos) => set({ pendingCanvasFocus: pos }),
}))
