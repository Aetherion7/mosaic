'use client'
// Chat-Verlauf: separates Fenster (nicht ein Settings-Tab), geöffnet über
// einen Button in AiSettingsPanel.tsx — gleiches Portal-Muster wie
// ThemeEditorModal.tsx, aus demselben Grund (SettingsModal's eigene Karte
// hat ein inline transform, das jedem position:fixed-Nachfahren einen
// eigenen containing block gibt; ohne Portal würde dieses Fenster an DER
// Karte statt am Viewport geclippt).
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useT } from '@/hooks/useT'
import { useAiStore, useWidgetAiStore, type AiChatItem } from '@/store/aiStore'
import { useBoardStore } from '@/store/boardStore'
import { useSettings } from '@/store/settingsStore'
import { IconSparkle, renderInlineMd, MessageActions } from '@/components/ui/aiShared'
import { widgetTypeIcon, TYPE_LABELS } from '@/components/board/TileWrapper'
import { Toggle } from './shared'
import type { Board, Widget } from '@/types'

type ConvKey = 'board' | `widget:${string}`
interface ConvEntry {
  key: ConvKey
  label: string
  icon: React.ReactNode
  items: AiChatItem[]
  lastTs: number
  resolvable: boolean
}

// Scans every board for a widget id — same "no dedicated index, just walk
// every board" pattern already used by TaskWidget.tsx's weekly-reset effect
// and DrawboardWidget.tsx's getLiveData() this session. Chats are keyed
// purely by widget id (no board id stored alongside), so this is the only
// way to resolve a friendly label — and the only way to notice a widget or
// its whole board was deleted since the chat was recorded.
function findWidgetInfo(boards: Record<string, Board>, widgetId: string): { board: Board; widget: Widget } | null {
  for (const board of Object.values(boards)) {
    const widget = board.widgets[widgetId]
    if (widget) return { board, widget }
  }
  return null
}

// {n} placeholder (not string concatenation) so German's "vor {n}m" word
// order — the number goes AFTER "vor", not before like English "{n}m ago" —
// isn't hard-coded into the function; same convention i18n.ts already uses
// elsewhere (e.g. "This highlight is linked {n} time(s) in a note.").
function timeAgo(ts: number, t: (s: string) => string): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('Just now')
  if (min < 60) return t('{n}m ago').replace('{n}', String(min))
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('{n}h ago').replace('{n}', String(hr))
  const day = Math.floor(hr / 24)
  return t('{n}d ago').replace('{n}', String(day))
}

export default function ChatHistoryModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef, true)

  const boardItems  = useAiStore(s => s.items)
  const clearBoard  = useAiStore(s => s.clear)
  const regenBoard  = useAiStore(s => s.regenerate)
  const widgetChats = useWidgetAiStore(s => s.chats)
  const clearWidget = useWidgetAiStore(s => s.clear)
  const regenWidget = useWidgetAiStore(s => s.regenerate)
  const boards       = useBoardStore(s => s.boards)
  const autoExpire    = useSettings(s => s.aiHistoryAutoExpire)
  const setSetting    = useSettings(s => s.setSetting)

  const conversations = useMemo<ConvEntry[]>(() => {
    const list: ConvEntry[] = []
    if (boardItems.length > 0) {
      list.push({
        key: 'board', label: t('Board chat'), icon: <IconSparkle size={13} />,
        items: boardItems, lastTs: boardItems.at(-1)?.timestamp ?? 0, resolvable: true,
      })
    }
    for (const [widgetId, items] of Object.entries(widgetChats)) {
      if (!items.length) continue
      const found = findWidgetInfo(boards, widgetId)
      list.push({
        key: `widget:${widgetId}`,
        label: found ? `${t(TYPE_LABELS[found.widget.type] ?? found.widget.type)} — ${found.board.name}` : t('Deleted widget'),
        icon: found ? widgetTypeIcon(found.widget) : <IconTrash />,
        items, lastTs: items.at(-1)?.timestamp ?? 0, resolvable: !!found,
      })
    }
    return list.sort((a, b) => b.lastTs - a.lastTs)
  }, [boardItems, widgetChats, boards, t])

  const [selectedKey, setSelectedKey] = useState<ConvKey | null>(() => conversations[0]?.key ?? null)
  const selected = conversations.find(c => c.key === selectedKey) ?? null
  const lastAssistantId = selected?.items.filter(i => i.kind === 'assistant').at(-1)?.id

  function deleteConversation(key: ConvKey) {
    if (key === 'board') clearBoard()
    else clearWidget(key.slice('widget:'.length))
    if (selectedKey === key) setSelectedKey(null)
  }

  function clearAll() {
    clearBoard()
    for (const widgetId of Object.keys(widgetChats)) clearWidget(widgetId)
    setSelectedKey(null)
  }

  function regenerateSelected() {
    if (!selected) return
    if (selected.key === 'board') regenBoard()
    else regenWidget(selected.key.slice('widget:'.length))
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="chat-history-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <motion.div
          ref={modalRef}
          key="chat-history-modal"
          role="dialog" aria-modal="true" aria-label={t('Chat history')}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(920px, 94vw)', height: 'min(640px, 88vh)',
            background: 'var(--popover-bg)',
            backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid var(--border)', borderRadius: 18,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>{t('Chat history')}</span>
            <button onClick={onClose} title={t('Close')} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>×</button>
          </div>

          {/* Auto-expire + clear-all row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 12 }}>
            <div
              onClick={() => setSetting({ aiHistoryAutoExpire: !autoExpire })}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <Toggle value={autoExpire} onChange={v => setSetting({ aiHistoryAutoExpire: v })} label={t('Automatically delete chats older than 1 month')} />
              <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{t('Automatically delete chats older than 1 month')}</span>
            </div>
            <button
              onClick={clearAll}
              disabled={conversations.length === 0}
              style={{
                fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: conversations.length === 0 ? 'var(--text3)' : '#ef4444',
                cursor: conversations.length === 0 ? 'default' : 'pointer',
                opacity: conversations.length === 0 ? 0.5 : 1, flexShrink: 0,
              }}
            >
              {t('Clear all')}
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: conversation list */}
            <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 8 }}>
              {conversations.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--text3)', textAlign: 'center', padding: '24px 12px', lineHeight: 1.6 }}>
                  {t('No chat history yet.')}
                </div>
              )}
              {conversations.map(c => (
                <div key={c.key}
                  onClick={() => setSelectedKey(c.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 9,
                    cursor: 'pointer', marginBottom: 2,
                    background: selectedKey === c.key ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                  }}
                >
                  <span style={{ color: c.resolvable ? 'var(--text2)' : 'var(--text3)', display: 'flex', flexShrink: 0 }}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: c.resolvable ? 'var(--text1)' : 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--text3)' }}>{timeAgo(c.lastTs, t)} · {c.items.length} {t('messages')}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteConversation(c.key) }}
                    title={t('Delete')}
                    style={{ width: 20, height: 20, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 5 }}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>

            {/* Right: selected transcript */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {!selected ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: 24 }}>
                  {t('Select a conversation to view it.')}
                </div>
              ) : (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 18 }}>
                  {selected.items.filter(i => i.kind === 'user' || i.kind === 'assistant' || i.kind === 'error').map(item => {
                    const isUser = item.kind === 'user'
                    const isError = item.kind === 'error'
                    if (isError) {
                      return (
                        <div key={item.id} style={{ fontSize: 11, color: '#e53e3e', background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.25)', borderRadius: 10, padding: '7px 10px', lineHeight: 1.5, wordBreak: 'break-word', alignSelf: 'flex-start', maxWidth: '85%' }}>
                          {item.text}
                        </div>
                      )
                    }
                    return (
                      <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                        <div style={{
                          fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          color: isUser ? 'var(--on-accent, white)' : 'var(--text1)',
                          background: isUser ? 'var(--accent)' : 'var(--surface2)',
                          border: isUser ? 'none' : '1px solid var(--border)',
                          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          padding: '9px 12px',
                        }}>
                          {isUser ? item.text : renderInlineMd(item.text)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: isUser ? 'flex-end' : 'flex-start', padding: '0 2px' }}>
                          <span style={{ fontSize: 9, color: 'var(--text3)' }}>{timeAgo(item.timestamp, t)}</span>
                          <MessageActions
                            text={item.text}
                            onRegenerate={selected.resolvable && item.id === lastAssistantId ? regenerateSelected : undefined}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  )
}
