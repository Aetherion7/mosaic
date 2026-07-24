'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/store/uiStore'
import { useAiStore, type AiChatItem } from '@/store/aiStore'
import { useSettings } from '@/store/settingsStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useT } from '@/hooks/useT'
import SettingsModal from '@/components/ui/SettingsModal'
import { IconSparkle, renderInlineMd } from '@/components/ui/aiShared'

// Aufeinanderfolgende Aktions-Chips zu einer umbrechenden Reihe bündeln,
// statt jeden Chip in eine eigene Zeile zu setzen
type ChatGroup = { kind: 'chips'; id: string; items: AiChatItem[] } | { kind: 'item'; item: AiChatItem }
function groupItems(items: AiChatItem[]): ChatGroup[] {
  const groups: ChatGroup[] = []
  for (const item of items) {
    const prev = groups[groups.length - 1]
    if (item.kind === 'action') {
      if (prev?.kind === 'chips') prev.items.push(item)
      else groups.push({ kind: 'chips', id: item.id, items: [item] })
    } else {
      groups.push({ kind: 'item', item })
    }
  }
  return groups
}

const desktopMotion = {
  initial:    { opacity: 0, y: -10, scale: 0.97 },
  animate:    { opacity: 1, y: 0,   scale: 1    },
  exit:       { opacity: 0, y: -10, scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
}
const mobileMotion = {
  initial:    { opacity: 0, y: '100%' },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: '100%' },
  transition: { type: 'spring' as const, stiffness: 380, damping: 40 },
}

export default function AiPanel() {
  const t = useT()
  const panel = useUIStore(s => s.panel)
  const openPanel = useUIStore(s => s.openPanel)
  const isMobile  = useIsMobile()
  const items     = useAiStore(s => s.items)
  const running   = useAiStore(s => s.running)
  const send      = useAiStore(s => s.send)
  const stop      = useAiStore(s => s.stop)
  const clear     = useAiStore(s => s.clear)
  // Konfiguriert = Schlüssel vorhanden ODER eigener OpenAI-kompatibler
  // Endpunkt (lokale Server wie Ollama brauchen keinen Schlüssel)
  const hasKey    = useSettings(s => !!s.aiApiKey.trim() || (s.aiProvider === 'openai' && !!s.aiBaseUrl.trim()))
  const aiEnabled = useSettings(s => s.aiEnabled)

  const [input, setInput] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Eingabefeld wächst automatisch mit dem Inhalt (bis ~6 Zeilen, dann
  // scrollt es intern) — statt fester Zeilenzahl
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  // --ai-border-angle als <angle> registrieren, damit die Rahmen-Animation
  // (globals.css) den Winkel interpolieren kann. Per JS statt @property-Regel,
  // weil der CSS-Bundler @property aus globals.css entfernt. Doppelte
  // Registrierung wirft — deshalb try/catch (z. B. nach Hot-Reload).
  useEffect(() => {
    try {
      CSS.registerProperty({ name: '--ai-border-angle', syntax: '<angle>', inherits: false, initialValue: '0deg' })
    } catch { /* bereits registriert oder Browser ohne Support → statischer Rahmen */ }
  }, [])

  // Ans Ende scrollen, wenn neue Einträge kommen
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, running])

  function submit() {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    send(text)
  }

  // Pur var(--surface) statt mit --bg gemischt: In Themes mit transparentem
  // Surface (Crystal Glass) bleibt das Panel dadurch echt durchsichtig —
  // der Blur macht es lesbar, der animierte Rand läuft unverändert außen.
  // In Themes mit opakem Surface ändert sich nichts.
  const panelBg = 'var(--surface)'
  // Animierter Rahmen: conic-gradient aus Akzentfarbe + hellerer Variante,
  // dessen Winkel per registrierter Custom Property rotiert. Der Verlauf lebt
  // in einem maskierten ::before (globals.css, .ai-border-frame) und füllt nur
  // den 2px-Padding-Ring — nicht die ganze Fläche, sonst schiene er bei
  // transparentem Panel (Crystal Glass) komplett durch. Ganzzahlige Stärke:
  // bei 1.5px rundete der Browser je nach Kantenlage auf 1px oder 2px.
  const frameStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
        borderRadius: '20px 20px 0 0', padding: '3px 3px 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,.5)',
        height: '78vh', display: 'flex',
      }
    : {
        position: 'fixed', top: 60, right: 16, zIndex: 900,
        width: 360,
        borderRadius: 20, padding: 3,
        boxShadow: '0 24px 64px rgba(0,0,0,.55)',
        height: 'min(740px, calc(100vh - 80px))', display: 'flex',
      }
  const surfaceStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, minHeight: 0,
    background: panelBg,
    backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
    borderRadius: isMobile ? '17px 17px 0 0' : 17,
    padding: isMobile ? '8px 16px 16px' : 16,
    display: 'flex', flexDirection: 'column',
  }

  return (
    <>
    <AnimatePresence>
      {panel === 'ai' && aiEnabled && (
        <motion.div
          {...(isMobile ? mobileMotion : desktopMotion)}
          onClick={e => e.stopPropagation()}
          className="ai-border-frame"
          style={frameStyle}
        >
          <div style={surfaceStyle}>
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
          )}

          {/* Kopfzeile — gleiches Muster wie ThemePanel/WidgetStylePanel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, flexShrink: 0 }}>
            <span style={{ color: 'var(--accent)', display: 'flex' }}><IconSparkle size={13} /></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
              {t('AI assistant')}
            </span>
            {items.length > 0 && (
              <button onClick={clear} title={t('Clear conversation')}
                style={{ border: 'none', background: 'none', color: 'var(--text3)', fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}>
                {t('Clear')}
              </button>
            )}
            <button onClick={() => openPanel(null)} title={t('Close')} aria-label={t('Close')}
              style={{ width: 24, height: 24, borderRadius: 8, border: 'none', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ×
            </button>
          </div>

          {!hasKey ? (
            /* ── Einrichtung nötig ── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 16 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                <IconSparkle size={22} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 260 }}>
                {t('Connect your own AI API key and the assistant will build and manage this board with you. The key never leaves your device except to your chosen provider.')}
              </div>
              <button
                onClick={() => setSetupOpen(true)}
                style={{ padding: '8px 18px', fontSize: 12, fontWeight: 600, borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer' }}
              >
                {t('Set up AI assistant')}
              </button>
            </div>
          ) : (
            <>
              {/* ── Verlauf ── */}
              <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 2px 8px' }}>
                {items.length === 0 && (
                  <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text3)', fontSize: 11, lineHeight: 1.7, padding: 16 }}>
                    {t('Ask for anything on this board —')}<br />
                    {t('“Build me a fitness board”, “add a week schedule”, “switch to a calm theme” …')}
                  </div>
                )}
                {groupItems(items).map(group => {
                  if (group.kind === 'chips') return (
                    <div key={group.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignSelf: 'flex-start', maxWidth: '92%' }}>
                      {group.items.map(chip => (
                        <span key={chip.id} style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                          {chip.text}
                        </span>
                      ))}
                    </div>
                  )
                  const item = group.item
                  if (item.kind === 'error') {
                    const [first, ...rest] = (item.text === 'NO_KEY' ? t('No API key configured.') : item.text).split('\n')
                    return (
                      <div key={item.id} style={{ alignSelf: 'stretch', fontSize: 11, color: '#e53e3e', background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.25)', borderRadius: 10, padding: '7px 10px', lineHeight: 1.5, wordBreak: 'break-word' }}>
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
                  <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text3)', padding: '4px 2px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    {t('Working…')}
                  </div>
                )}
              </div>

              {/* ── Eingabe ── */}
              <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'flex-end', paddingTop: 10 }}>
                <textarea
                  ref={inputRef}
                  className="hide-scrollbar"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                  placeholder={t('Describe what to change…')}
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', fontSize: 12, lineHeight: 1.5,
                    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                    color: 'var(--text1)', padding: '8px 10px', outline: 'none', fontFamily: 'inherit',
                    maxHeight: 120, overflowY: 'auto',
                  }}
                />
                {/* Während die KI arbeitet, wird aus dem Senden- ein Stopp-Knopf */}
                <button
                  onClick={running ? stop : submit}
                  disabled={!running && !input.trim()}
                  title={running ? t('Stop') : t('Send')} aria-label={running ? t('Stop') : t('Send')}
                  style={{
                    width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0,
                    background: running ? 'var(--accent)' : (!input.trim() ? 'var(--surface2)' : 'var(--accent)'),
                    color: running ? 'white' : (!input.trim() ? 'var(--text3)' : 'white'),
                    cursor: running || input.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {running ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="3"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    {setupOpen && <SettingsModal onClose={() => setSetupOpen(false)} initialCat="ki" />}
    </>
  )
}
