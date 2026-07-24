'use client'
import { useEffect, useRef, useState } from 'react'
import { useSettings, type AiProvider } from '@/store/settingsStore'
import { DEFAULT_MODELS } from '@/lib/ai/client'
import { useT } from '@/hooks/useT'
import { IconSparkle } from '@/components/ui/aiShared'
import { SectionTitle, SettingItem, Row } from './shared'

// desc ist der englische Quelltext (Default-Sprache) — an Verwendungsstellen mit t() übersetzt
const PROVIDERS: { id: AiProvider; label: string; desc: string; keyHint: string }[] = [
  { id: 'anthropic', label: 'Anthropic',         desc: 'Claude models',                 keyHint: 'sk-ant-…' },
  { id: 'gemini',    label: 'Google Gemini',     desc: 'Gemini models',                 keyHint: 'AIza…' },
  { id: 'openai',    label: 'OpenAI-compatible', desc: 'OpenAI, Groq, Mistral, Ollama …', keyHint: 'sk-…' },
]

export default function AiSettingsPanel() {
  const aiProvider = useSettings(s => s.aiProvider)
  const aiEnabled = useSettings(s => s.aiEnabled)
  const aiApiKey = useSettings(s => s.aiApiKey)
  const aiModel = useSettings(s => s.aiModel)
  const aiBaseUrl = useSettings(s => s.aiBaseUrl)
  const setSetting = useSettings(s => s.setSetting)
  const t = useT()
  const [showKey, setShowKey] = useState(false)

  const inputStyle: React.CSSProperties = {
    width: 220, fontSize: 12, padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text1)', outline: 'none',
  }
  const provider = PROVIDERS.find(p => p.id === aiProvider) ?? PROVIDERS[0]

  return (
    <div>
      {/* ── Hauptschalter: aus = Button & Funktion komplett weg ── */}
      <SectionTitle>{t('AI assistant')}</SectionTitle>
      <Row
        label={t('Enable AI assistant')}
        desc={(() => {
          // {icon}-Platzhalter durch das echte Funkel-Icon des Assistenten ersetzen
          const [before, after] = t('Off hides the {icon} button in the header and disables the feature entirely').split('{icon}')
          return (
            <>
              {before}
              <span style={{ display: 'inline-flex', verticalAlign: 'text-bottom', color: 'var(--accent)' }}><IconSparkle size={12} /></span>
              {after}
            </>
          )
        })()}
        value={aiEnabled}
        onChange={v => setSetting({ aiEnabled: v })}
      />

      {/* Alles Weitere wird bei ausgeschaltetem Assistenten ausgegraut & gesperrt */}
      <div style={{
        opacity: aiEnabled ? 1 : 0.4,
        pointerEvents: aiEnabled ? 'auto' : 'none',
        filter: aiEnabled ? 'none' : 'grayscale(0.6)',
        transition: 'opacity 0.25s ease, filter 0.25s ease',
      }}>
        <SectionTitle>{t('Connection')}</SectionTitle>
        <SettingItem
          label={t('Provider')}
          desc={t(provider.desc)}
          control={<ProviderSelect value={aiProvider} onChange={p => setSetting({ aiProvider: p })} />}
        />
        <SettingItem
          label={t('API key')}
          desc={aiProvider === 'openai'
            ? `${t('Stored only on this device. Sent exclusively to the provider above.')} ${t('Local endpoints without authentication can leave this empty.')}`
            : t('Stored only on this device. Sent exclusively to the provider above.')}
          control={
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={aiApiKey}
                onChange={e => setSetting({ aiApiKey: e.target.value })}
                placeholder={provider.keyHint}
                autoComplete="off"
                style={inputStyle}
              />
              <button onClick={() => setShowKey(v => !v)} title={showKey ? t('Hide') : t('Show')}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {showKey
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
          }
        />
        <SettingItem
          label={t('Model')}
          desc={`${t('Empty = default:')} ${DEFAULT_MODELS[aiProvider]}`}
          control={
            <input
              type="text"
              value={aiModel}
              onChange={e => setSetting({ aiModel: e.target.value })}
              placeholder={DEFAULT_MODELS[aiProvider]}
              style={inputStyle}
            />
          }
        />
        {aiProvider === 'openai' && (
          <SettingItem
            label={t('Base URL')}
            desc={t('For alternative endpoints (Groq, Mistral, Ollama …). Empty = api.openai.com')}
            control={
              <input
                type="text"
                value={aiBaseUrl}
                onChange={e => setSetting({ aiBaseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                style={inputStyle}
              />
            }
          />
        )}

        <SectionTitle>{t('Privacy')}</SectionTitle>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, padding: '4px 0 12px' }}>
          {t('When you send a message, the assistant transmits your request plus a summary of the current board (widget types, positions, titles and contents) directly from your browser to the selected provider. Nothing runs through mosaic servers, and nothing is sent until you write a message. The API key is stored unencrypted in this browser profile and is never included in backups.')}
        </div>
      </div>
    </div>
  )
}

// Kompaktes Dropdown im Muster des Sprach-Auswahlfelds (GeneralPanel):
// sitzt rechtsbündig auf Zeilenhöhe, Liste zeigt Name + Kurzbeschreibung.
function ProviderSelect({ value, onChange }: { value: AiProvider; onChange: (p: AiProvider) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = PROVIDERS.find(p => p.id === value) ?? PROVIDERS[0]

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8,
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          background: 'var(--surface2)', cursor: 'pointer',
          fontSize: 12.5, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap',
          transition: 'border-color 0.12s',
        }}
      >
        {current.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
          minWidth: 210,
          // Deckend auch bei transparentem --surface (Crystal-Glass-Theme)
          background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden',
        }}>
          {PROVIDERS.map(p => {
            const active = p.id === value
            return (
              <button
                key={p.id}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(p.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text1)' }}>
                    {p.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)' }}>{t(p.desc)}</span>
                </span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
