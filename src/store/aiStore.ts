'use client'
// Chat-Zustand des KI-Assistenten — persistiert (IndexedDB, wie boardStore.ts),
// damit die Einstellungen → KI-Assistent → "Chat history" den Verlauf auch
// nach einem Reload noch zeigen kann. Alte Einträge werden beim App-Start
// automatisch entfernt (s. pruneOldChatItems), außer die Option ist in den
// Einstellungen deaktiviert (aiHistoryAutoExpire).
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '@/lib/idbStorage'
import { useSettings } from '@/store/settingsStore'
import { runAgent, type ChatTurn } from '@/lib/ai/client'

export interface AiChatItem {
  id:        string
  kind:      'user' | 'assistant' | 'action' | 'error'
  text:      string
  timestamp: number
}

interface AiStore {
  items:      AiChatItem[]
  running:    boolean
  _abort:     AbortController | null
  send:       (text: string) => Promise<void>
  regenerate: () => Promise<void>
  stop:       () => void
  clear:      () => void
}

let _n = 1
const iid = () => `ai_${Date.now()}_${_n++}`

// Nur die letzten Turns gehen an die API — der Board-Zustand kommt ohnehin
// jede Runde frisch aus dem Store, älterer Verlauf trägt wenig bei, kostet
// aber linear wachsende Tokens.
const MAX_HISTORY_TURNS = 12
function apiHistory(items: AiChatItem[]): ChatTurn[] {
  return items
    .filter(i => i.kind === 'user' || i.kind === 'assistant')
    .slice(-MAX_HISTORY_TURNS)
    .map(i => ({ role: i.kind as 'user' | 'assistant', text: i.text }))
}

// Auto-Verfall (Einstellungen → KI-Assistent → Chat history): standardmäßig
// an, ein Monat Aufbewahrung. Geprüft bei jedem Prune-Lauf (nicht in den
// persistierten Daten verankert), damit Umschalten der Option sofort für
// den NÄCHSTEN App-Start wirkt, ohne bereits gespeicherte Einträge implizit
// "einzufrieren".
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
function pruneOldChatItems(items: AiChatItem[]): AiChatItem[] {
  if (!useSettings.getState().aiHistoryAutoExpire) return items
  const cutoff = Date.now() - THIRTY_DAYS_MS
  return items.filter(i => i.timestamp >= cutoff)
}

// Gemeinsamer Tail von send()/regenerate(): einen Agenten-Lauf über die
// übergebene History ausführen und Action-/Antwort-/Fehler-Einträge über
// `push` anhängen. regenerate() ruft das exakt so auf wie send() — nur mit
// einer History, die schon um die letzte Antwort gekürzt wurde, statt eine
// neue User-Nachricht vorn anzuhängen.
async function runAndAppend(
  history: ChatTurn[], signal: AbortSignal,
  push: (item: AiChatItem) => void,
  opts?: { widgetId: string },
) {
  try {
    const answer = await runAgent(history, signal, e => {
      if (e.type === 'action') push({ id: iid(), kind: 'action', text: e.text, timestamp: Date.now() })
    }, opts)
    if (answer) push({ id: iid(), kind: 'assistant', text: answer, timestamp: Date.now() })
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      const msg = err instanceof Error ? err.message : String(err)
      push({ id: iid(), kind: 'error', text: msg, timestamp: Date.now() })
    }
  }
}

// Letzten User-Turn in `items` finden — für regenerate(): alles danach
// (die alte Antwort, evtl. Action-Chips/Fehler) wird verworfen, dann läuft
// derselbe Turn noch einmal.
function lastUserIndex(items: AiChatItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'user') return i
  return -1
}

export const useAiStore = create<AiStore>()(
  persist(
    (set, get) => ({
      items:   [],
      running: false,
      _abort:  null,

      send: async (text: string) => {
        const trimmed = text.trim()
        if (!trimmed || get().running) return
        const abort = new AbortController()
        set(s => ({
          running: true,
          _abort: abort,
          items: [...s.items, { id: iid(), kind: 'user', text: trimmed, timestamp: Date.now() }],
        }))
        const history = apiHistory(get().items)
        await runAndAppend(history, abort.signal, item => set(s => ({ items: [...s.items, item] })))
        set({ running: false, _abort: null })
      },

      regenerate: async () => {
        if (get().running) return
        const idx = lastUserIndex(get().items)
        if (idx === -1) return
        const trimmedItems = get().items.slice(0, idx + 1)
        const abort = new AbortController()
        set({ items: trimmedItems, running: true, _abort: abort })
        const history = apiHistory(trimmedItems)
        await runAndAppend(history, abort.signal, item => set(s => ({ items: [...s.items, item] })))
        set({ running: false, _abort: null })
      },

      stop: () => { get()._abort?.abort() },

      clear: () => { get()._abort?.abort(); set({ items: [], running: false, _abort: null }) },
    }),
    {
      name: 'planboard-ai-chat',
      storage: createJSONStorage(() => idbStorage),
      // running/_abort are per-session-only (a persisted "true"/live
      // AbortController would be meaningless after a reload — nothing is
      // actually in flight anymore).
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const pruned = pruneOldChatItems(state.items)
        if (pruned.length !== state.items.length) {
          queueMicrotask(() => useAiStore.setState({ items: pruned }))
        }
      },
    },
  ),
)

// ── Widget-gepinnte Mini-Chats ────────────────────────────────────────────────
// Ein Verlauf pro Widget-ID; der Agent läuft im Widget-Scope (nur dieses
// Widget änderbar). Läufe sind PRO WIDGET unabhängig — mehrere Widgets können
// parallel arbeiten (running/_aborts als Maps). Persistiert wie useAiStore
// oben; ein Widget, dessen komplette Chat-Liste nach dem Prunen leer ist,
// verliert seinen Eintrag ganz (kein leeres Array liegen lassen).
interface WidgetAiStore {
  chats:      Record<string, AiChatItem[]>
  running:    Record<string, boolean>
  _aborts:    Record<string, AbortController>
  send:       (widgetId: string, text: string) => Promise<void>
  regenerate: (widgetId: string) => Promise<void>
  stop:       (widgetId: string) => void
  clear:      (widgetId: string) => void
}

export const useWidgetAiStore = create<WidgetAiStore>()(
  persist(
    (set, get) => ({
      chats:   {},
      running: {},
      _aborts: {},

      send: async (widgetId: string, text: string) => {
        const trimmed = text.trim()
        if (!trimmed || get().running[widgetId]) return
        const abort = new AbortController()
        const push = (item: AiChatItem) => set(s => ({
          chats: { ...s.chats, [widgetId]: [...(s.chats[widgetId] ?? []), item] },
        }))
        set(s => ({
          running: { ...s.running, [widgetId]: true },
          _aborts: { ...s._aborts, [widgetId]: abort },
        }))
        push({ id: iid(), kind: 'user', text: trimmed, timestamp: Date.now() })
        const history = apiHistory(get().chats[widgetId] ?? [])
        await runAndAppend(history, abort.signal, push, { widgetId })
        set(s => {
          const running = { ...s.running }; delete running[widgetId]
          const aborts  = { ...s._aborts }; delete aborts[widgetId]
          return { running, _aborts: aborts }
        })
      },

      regenerate: async (widgetId: string) => {
        if (get().running[widgetId]) return
        const items = get().chats[widgetId] ?? []
        const idx = lastUserIndex(items)
        if (idx === -1) return
        const trimmedItems = items.slice(0, idx + 1)
        const abort = new AbortController()
        const push = (item: AiChatItem) => set(s => ({
          chats: { ...s.chats, [widgetId]: [...(s.chats[widgetId] ?? []), item] },
        }))
        set(s => ({
          chats: { ...s.chats, [widgetId]: trimmedItems },
          running: { ...s.running, [widgetId]: true },
          _aborts: { ...s._aborts, [widgetId]: abort },
        }))
        const history = apiHistory(trimmedItems)
        await runAndAppend(history, abort.signal, push, { widgetId })
        set(s => {
          const running = { ...s.running }; delete running[widgetId]
          const aborts  = { ...s._aborts }; delete aborts[widgetId]
          return { running, _aborts: aborts }
        })
      },

      stop: (widgetId: string) => { get()._aborts[widgetId]?.abort() },

      clear: (widgetId: string) => {
        get()._aborts[widgetId]?.abort()
        set(s => {
          const next = { ...s.chats }
          delete next[widgetId]
          return { chats: next }
        })
      },
    }),
    {
      name: 'planboard-widget-ai-chat',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ chats: s.chats }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        let changed = false
        const nextChats: Record<string, AiChatItem[]> = {}
        for (const [wid, items] of Object.entries(state.chats)) {
          const pruned = pruneOldChatItems(items)
          if (pruned.length !== items.length) changed = true
          if (pruned.length > 0) nextChats[wid] = pruned
        }
        if (changed) queueMicrotask(() => useWidgetAiStore.setState({ chats: nextChats }))
      },
    },
  ),
)
