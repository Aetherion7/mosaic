'use client'
// Chat-Zustand des KI-Assistenten — bewusst NICHT persistiert: der Verlauf
// überlebt das Schließen/Öffnen des Panels, verschwindet aber beim Reload.
import { create } from 'zustand'
import { runAgent, type ChatTurn } from '@/lib/ai/client'

export interface AiChatItem {
  id:   string
  kind: 'user' | 'assistant' | 'action' | 'error'
  text: string
}

interface AiStore {
  items:    AiChatItem[]
  running:  boolean
  _abort:   AbortController | null
  send:     (text: string) => Promise<void>
  stop:     () => void
  clear:    () => void
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

export const useAiStore = create<AiStore>()((set, get) => ({
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
      items: [...s.items, { id: iid(), kind: 'user', text: trimmed }],
    }))

    // Verlauf für die API: nur user/assistant-Texte (Aktionen/Fehler sind
    // reine Anzeige), gekappt auf die letzten Turns
    const history = apiHistory(get().items)

    try {
      const answer = await runAgent(history, abort.signal, e => {
        if (e.type === 'action') {
          set(s => ({ items: [...s.items, { id: iid(), kind: 'action', text: e.text }] }))
        }
      })
      if (answer) set(s => ({ items: [...s.items, { id: iid(), kind: 'assistant', text: answer }] }))
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const msg = err instanceof Error ? err.message : String(err)
        set(s => ({ items: [...s.items, { id: iid(), kind: 'error', text: msg }] }))
      }
    } finally {
      set({ running: false, _abort: null })
    }
  },

  stop: () => { get()._abort?.abort() },

  clear: () => { get()._abort?.abort(); set({ items: [], running: false, _abort: null }) },
}))

// ── Widget-gepinnte Mini-Chats ────────────────────────────────────────────────
// Ein Verlauf pro Widget-ID; der Agent läuft im Widget-Scope (nur dieses
// Widget änderbar). Läufe sind PRO WIDGET unabhängig — mehrere Widgets können
// parallel arbeiten (running/_aborts als Maps). Wie oben bewusst nicht
// persistiert — Verläufe überleben das Schließen des Popovers, keinen Reload.
interface WidgetAiStore {
  chats:   Record<string, AiChatItem[]>
  running: Record<string, boolean>
  _aborts: Record<string, AbortController>
  send:    (widgetId: string, text: string) => Promise<void>
  stop:    (widgetId: string) => void
  clear:   (widgetId: string) => void
}

export const useWidgetAiStore = create<WidgetAiStore>()((set, get) => ({
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
    push({ id: iid(), kind: 'user', text: trimmed })

    const history = apiHistory(get().chats[widgetId] ?? [])

    try {
      const answer = await runAgent(history, abort.signal, e => {
        if (e.type === 'action') push({ id: iid(), kind: 'action', text: e.text })
      }, { widgetId })
      if (answer) push({ id: iid(), kind: 'assistant', text: answer })
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        push({ id: iid(), kind: 'error', text: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      set(s => {
        const running = { ...s.running }; delete running[widgetId]
        const aborts  = { ...s._aborts }; delete aborts[widgetId]
        return { running, _aborts: aborts }
      })
    }
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
}))
