// ─── KI-Assistent: Provider-Adapter + Agent-Loop ─────────────────────────────
// BYOK: der Browser ruft die KI-API direkt mit dem Nutzer-Schlüssel auf —
// es gibt keinen mosaic-Server dazwischen (KONZEPT.md §15). Zwei Adapter:
// Anthropic (offiziell browserfähig) und OpenAI-kompatibel (Base-URL frei,
// deckt OpenAI/Groq/Mistral/lokales Ollama ab).

import { useSettings } from '@/store/settingsStore'
import { translate } from '@/lib/i18n'
import { AI_TOOLS, STATIC_BOARD_DOC, buildBoardState, executeAiTool } from './tools'

export interface ChatTurn { role: 'user' | 'assistant'; text: string }

export interface AgentEvent {
  type: 'action' | 'text'
  text: string
}

// Widget-Modus: Der Agent ist an EIN Widget gepinnt — er sieht nur
// update_widget/get_board und darf ausschließlich dieses Widget verändern.
export interface AgentScope { widgetId: string }

const MAX_ROUNDS = 15
const MAX_TOKENS = 4096
// Zeitlimit pro API-Runde — ohne Limit bliebe der Chat bei hängender
// Verbindung unbegrenzt bei "Arbeitet…" (nur manueller Stopp)
const ROUND_TIMEOUT_MS = 60_000

// ── Fehler in verständliche, übersetzte Meldungen übersetzen ─────────────────
// Roh-JSON ("API 503: [{ error: … }]") gehört nicht in den Chat. Die Meldung
// nennt Ursache + nächste Aktion; das technische Detail folgt klein dahinter.
function tr(key: string): string {
  return translate(useSettings.getState().language, key)
}

function apiError(status: number, body: string): Error {
  let msg: string
  if (status === 401 || status === 403) msg = tr('API key invalid or not accepted — check it in the settings.')
  else if (status === 404)              msg = tr('Model not found — check the model name in the settings.')
  else if (status === 429)              msg = tr('Rate limit reached — wait a moment and try again.')
  else if (status >= 500)               msg = tr('The model is overloaded right now — try again in a moment.')
  else                                  msg = tr('Request failed.')
  const detail = body.replace(/\s+/g, ' ').trim().slice(0, 160)
  return new Error(detail ? `${msg}\n(${status} · ${detail})` : `${msg}\n(${status})`)
}

// fetch mit Rundenlimit; unterscheidet Nutzer-Stopp (AbortError, wird still
// geschluckt) von Timeout und Netzwerkfehlern (verständliche Meldung)
async function timedFetch(url: string, init: RequestInit, userSignal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.any([userSignal, AbortSignal.timeout(ROUND_TIMEOUT_MS)]) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(tr('The request timed out — try again.'))
    }
    throw new Error(tr('No connection to the AI provider — check your internet connection.'))
  }
}

export const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-5',
  openai:    'gpt-4o-mini',
  // "-latest"-Alias: zeigt immer auf das aktuelle Flash-Modell — konkrete
  // Versionsnamen (z. B. gemini-2.5-flash) schaltet Google für Neunutzer ab.
  gemini:    'gemini-flash-latest',
} as const

// Google bietet einen offiziellen OpenAI-kompatiblen Endpunkt an —
// Gemini läuft daher über denselben Adapter wie OpenAI, nur mit fester Base-URL.
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

// Statischer Prompt-Teil: byteweise stabil pro Konversation → liegt VOR dem
// Cache-Breakpoint (Prompt Caching ist ein Präfix-Match; Reihenfolge der
// Wire-Repräsentation: tools → system → messages)
function systemStatic(scope?: AgentScope): string {
  return [
    'You are the board assistant inside "mosaic", a local-first dashboard app. You help the user build and manage the currently open board by calling tools.',
    'Rules:',
    '- Use tools to make changes; never claim you changed something without a successful tool call.',
    '- Before editing arrays inside existing widget data (events, links, habits, cells), call get_board to read the current value — your data patch replaces each top-level key entirely.',
    '- Prefer sensible defaults over questions. Only ask back when the request is truly ambiguous.',
    '- Answer in the language the user writes in.',
    '- Keep final answers short — the user sees the board changing live.',
    ...(scope ? [
      '',
      `PINNED WIDGET MODE: You are pinned to the widget with id "${scope.widgetId}". You may ONLY modify this one widget via update_widget (data, position, size). Do not touch anything else on the board.`,
    ] : []),
    '',
    STATIC_BOARD_DOC,
  ].join('\n')
}

// Volatiler Prompt-Teil (Board-Zustand) — ändert sich pro Runde, kommt NACH
// dem Breakpoint, damit er den Cache des stabilen Präfixes nicht invalidiert
function systemDynamic(): string {
  return `Current board state:\n${buildBoardState()}`
}

// Im Widget-Modus nur Lesen + Ändern des gepinnten Widgets anbieten
// (highlight_in_reader ist erlaubt — der Executor erzwingt id === widgetId)
function toolsFor(scope?: AgentScope) {
  return scope
    ? AI_TOOLS.filter(t => t.name === 'update_widget' || t.name === 'get_board' || t.name === 'highlight_in_reader')
    : AI_TOOLS
}

// ── Anthropic Messages API ────────────────────────────────────────────────────

interface AnthropicBlock {
  type: 'text' | 'tool_use'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

async function runAnthropic(
  history: ChatTurn[],
  apiKey: string,
  model: string,
  signal: AbortSignal,
  onEvent: (e: AgentEvent) => void,
  scope?: AgentScope,
): Promise<string> {
  type Msg = { role: 'user' | 'assistant'; content: string | unknown[] }
  const messages: Msg[] = history.map(t => ({ role: t.role, content: t.text }))
  const tools = toolsFor(scope).map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
  let finalText = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await timedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model, max_tokens: MAX_TOKENS,
        // Breakpoint auf dem STABILEN System-Block cached Tools + Regeln +
        // Schema-Doku (Präfix). Der volatile Board-Zustand folgt dahinter —
        // er ändert sich pro Runde und darf den Cache nicht invalidieren.
        system: [
          { type: 'text', text: systemStatic(scope), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: systemDynamic() },
        ],
        messages, tools,
      }),
    }, signal)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw apiError(res.status, body)
    }
    const data = await res.json() as { content: AnthropicBlock[]; stop_reason: string }

    const textParts = data.content.filter(b => b.type === 'text').map(b => b.text ?? '')
    if (textParts.length) finalText = textParts.join('\n').trim()

    const toolUses = data.content.filter(b => b.type === 'tool_use')
    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) return finalText

    messages.push({ role: 'assistant', content: data.content })
    const results: unknown[] = []
    for (const b of toolUses) {
      const r = await executeAiTool(b.name!, b.input ?? {}, scope)
      onEvent({ type: 'action', text: r.summary })
      results.push({ type: 'tool_result', tool_use_id: b.id, content: r.result })
    }
    messages.push({ role: 'user', content: results })
  }
  return finalText || '(stopped: too many tool rounds)'
}

// ── OpenAI-kompatible Chat Completions ───────────────────────────────────────

interface OpenAiToolCall {
  id: string
  function: { name: string; arguments: string }
}

async function runOpenAi(
  history: ChatTurn[],
  apiKey: string,
  model: string,
  baseUrl: string,
  signal: AbortSignal,
  onEvent: (e: AgentEvent) => void,
  scope?: AgentScope,
): Promise<string> {
  type Msg = Record<string, unknown>
  const messages: Msg[] = [
    // Stabiler Teil zuerst, volatiler Board-Zustand dahinter — OpenAI-
    // kompatible Provider cachen Präfixe automatisch, gleiche Logik hilft dort
    { role: 'system', content: `${systemStatic(scope)}\n\n${systemDynamic()}` },
    ...history.map(t => ({ role: t.role, content: t.text })),
  ]
  const tools = toolsFor(scope).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
  const url = `${(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`
  let finalText = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await timedFetch(url, {
      method: 'POST',
      // Ohne Schlüssel (lokale Endpunkte) keinen Authorization-Header senden
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, messages, tools }),
    }, signal)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw apiError(res.status, body)
    }
    const data = await res.json() as { choices: { message: { content?: string | null; tool_calls?: OpenAiToolCall[] } }[] }
    const msg = data.choices?.[0]?.message
    if (!msg) throw new Error('API: empty response')
    if (msg.content) finalText = msg.content.trim()

    const calls = msg.tool_calls ?? []
    if (calls.length === 0) return finalText

    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls })
    for (const c of calls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(c.function.arguments || '{}') } catch { /* leeres Objekt */ }
      const r = await executeAiTool(c.function.name, input, scope)
      onEvent({ type: 'action', text: r.summary })
      messages.push({ role: 'tool', tool_call_id: c.id, content: r.result })
    }
  }
  return finalText || '(stopped: too many tool rounds)'
}

// ── Öffentlicher Einstieg ─────────────────────────────────────────────────────

export async function runAgent(
  history: ChatTurn[],
  signal: AbortSignal,
  onEvent: (e: AgentEvent) => void,
  scope?: AgentScope,
): Promise<string> {
  const s = useSettings.getState()
  const model = s.aiModel.trim() || DEFAULT_MODELS[s.aiProvider]
  // Lokale OpenAI-kompatible Endpunkte (Ollama, LM Studio) brauchen keinen
  // Schlüssel — mit eigener Base-URL ist ein leerer Key deshalb erlaubt
  const keylessOk = s.aiProvider === 'openai' && !!s.aiBaseUrl.trim()
  if (!s.aiApiKey.trim() && !keylessOk) throw new Error('NO_KEY')
  if (s.aiProvider === 'anthropic') {
    return runAnthropic(history, s.aiApiKey.trim(), model, signal, onEvent, scope)
  }
  if (s.aiProvider === 'gemini') {
    return runOpenAi(history, s.aiApiKey.trim(), model, GEMINI_BASE_URL, signal, onEvent, scope)
  }
  return runOpenAi(history, s.aiApiKey.trim(), model, s.aiBaseUrl.trim(), signal, onEvent, scope)
}
