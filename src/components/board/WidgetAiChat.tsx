'use client'
// Widget-gepinnter Mini-KI-Chat: öffnet sich neben dem ausgewählten Widget
// (KI-Knopf in dessen Aktionsleiste) und darf ausschließlich dieses eine
// Widget verändern — der Agent läuft im Widget-Scope (lib/ai/client.ts).
import { useEffect, useRef, useState } from 'react'
import { useWidgetAiStore } from '@/store/aiStore'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { IconSparkle, renderInlineMd } from '@/components/ui/aiShared'
import { useT } from '@/hooks/useT'
import type { Widget } from '@/types'

// Stabiler Leer-Zustand: `?? []` im Selector würde bei jedem Aufruf ein neues
// Array liefern → useSyncExternalStore sieht ständig neue Snapshots → Endlosloop
const EMPTY_CHAT: never[] = []

// label kommt als Prop statt via TYPE_LABELS-Import — der würde einen
// Import-Zyklus mit TileWrapper erzeugen (TDZ-Fehler beim Modulstart)
export default function WidgetAiChat({ widget, label, side, top = 0, onClose }: {
  widget: Widget
  label: string
  side: 'left' | 'right'
  top?: number   // vertikale Verschiebung, damit das Fenster im Viewport bleibt
  onClose: () => void
}) {
  const t = useT()
  const items     = useWidgetAiStore(s => s.chats[widget.id] ?? EMPTY_CHAT)
  const running   = useWidgetAiStore(s => !!s.running[widget.id])
  const send      = useWidgetAiStore(s => s.send)
  const stop      = useWidgetAiStore(s => s.stop)
  const clear     = useWidgetAiStore(s => s.clear)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Eingabefeld wächst automatisch mit dem Inhalt (bis ~5 Zeilen)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }, [input])

  // Das Chat-Fenster ist UI, kein Board-Inhalt: Auf der unendlichen Leinwand
  // skaliert es sonst mit dem Zoom mit — beim Rauszoomen wird der 2px-Ring zu
  // ungleichmäßigen Subpixeln zerdrückt und der Text unlesbar. Gegenskalieren
  // hält es unabhängig vom Zoom immer bei 560×440 sichtbaren Pixeln.
  const isInfinite = useBoardStore(s => (selectBoard(s)?.layoutMode ?? 'infinite') === 'infinite')
  const zoom = useUIStore(s => (isInfinite ? s.canvasView.zoom : 1))
  const counterScale = 1 / zoom

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, running])

  function submit() {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    send(widget.id, text)
  }

  const frameStyle: React.CSSProperties = {
    position: 'absolute', top, zIndex: 60,
    ...(side === 'right' ? { left: 'calc(100% + 10px)' } : { right: 'calc(100% + 10px)' }),
    width: 560, height: 440,
    transform: counterScale !== 1 ? `scale(${counterScale})` : undefined,
    transformOrigin: side === 'right' ? 'top left' : 'top right',
    display: 'flex',
    borderRadius: 16, padding: 3,
    boxShadow: '0 16px 56px rgba(0,0,0,0.45)',
  }

  return (
    // Gleicher animierter Verlaufs-Rahmen wie das große KI-Panel: äußere
    // Hülle mit 2px-Ring (.ai-border-frame, globals.css), innen die Fläche
    <div
      className="ai-border-frame"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      style={frameStyle}
    >
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0,
      display: 'flex', flexDirection: 'column',
      background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderRadius: 13,
      padding: 14,
    }}>
      {/* Kopfzeile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, flexShrink: 0 }}>
        <span style={{ color: 'var(--accent)', display: 'flex' }}><IconSparkle size={13} /></span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {items.length > 0 && (
          <button onClick={() => clear(widget.id)} title={t('Clear conversation')}
            style={{ border: 'none', background: 'none', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>
            {t('Clear')}
          </button>
        )}
        <button onClick={onClose} title={t('Close')} aria-label={t('Close')}
          style={{ width: 24, height: 24, borderRadius: 8, border: 'none', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ×
        </button>
      </div>

      {/* Verlauf */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
        {items.length === 0 && !running && (
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.7, textAlign: 'center', padding: '16px 8px', margin: 'auto' }}>
            {t('Changes apply only to this widget.')}
          </div>
        )}
        {items.map(item => {
          if (item.kind === 'action') return (
            <span key={item.id} style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderRadius: 999, padding: '2px 9px' }}>
              {item.text}
            </span>
          )
          if (item.kind === 'error') {
            const [first, ...rest] = (item.text === 'NO_KEY' ? t('No API key configured.') : item.text).split('\n')
            return (
              <div key={item.id} style={{ fontSize: 11, color: '#e53e3e', background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.25)', borderRadius: 10, padding: '7px 10px', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {first}
                {rest.length > 0 && <div style={{ fontSize: 9.5, opacity: 0.7, marginTop: 3 }}>{rest.join(' ')}</div>}
              </div>
            )
          }
          const isUser = item.kind === 'user'
          return (
            <div key={item.id} style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: isUser ? 'white' : 'var(--text1)',
              background: isUser ? 'var(--accent)' : 'var(--surface2)',
              border: isUser ? 'none' : '1px solid var(--border)',
              borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              padding: '8px 11px',
            }}>
              {isUser ? item.text : renderInlineMd(item.text)}
            </div>
          )
        })}
        {running && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text3)', padding: '4px 2px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            {t('Working…')}
          </div>
        )}
      </div>

      {/* Eingabe */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'flex-end', paddingTop: 8 }}>
        <textarea
          ref={inputRef}
          className="hide-scrollbar"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            if (e.key === 'Escape') onClose()
          }}
          placeholder={t('Change this widget…')}
          rows={1}
          style={{
            flex: 1, resize: 'none', fontSize: 12, lineHeight: 1.5,
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
            color: 'var(--text1)', padding: '8px 10px', outline: 'none', fontFamily: 'inherit',
            maxHeight: 96, overflowY: 'auto',
          }}
        />
        <button
          onClick={running ? () => stop(widget.id) : submit}
          disabled={!running && !input.trim()}
          title={running ? t('Stop') : t('Send')} aria-label={running ? t('Stop') : t('Send')}
          style={{
            width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0,
            background: running || input.trim() ? 'var(--accent)' : 'var(--surface2)',
            color: running || input.trim() ? 'white' : 'var(--text3)',
            cursor: running || input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {running ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
      </div>
    </div>
    </div>
  )
}
