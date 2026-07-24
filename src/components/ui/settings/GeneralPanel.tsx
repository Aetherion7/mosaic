'use client'
import { useState, useRef, useEffect } from 'react'
import { useSettings } from '@/store/settingsStore'
import type { Lang } from '@/lib/i18n'
import { useT } from '@/hooks/useT'
import { SectionTitle, SettingItem, Row } from './shared'
import SlidingTabs from '@/components/ui/SlidingTabs'
import AddOnsPanel from './AddOnsPanel'

const LANGUAGES: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'de', label: 'German',  native: 'Deutsch'  },
]

// `home`: Board-Auswahl (Startseite) bekommt eine bewusst knappe Variante
// dieser Kategorie — nur Theme + Sprache, unabhängig vom Rest der
// "normalen" (board-internen) Einstellungen, die hier komplett wegfallen.
export default function GeneralPanel({ onClose, home }: { onClose: () => void; home?: boolean }) {
  const homeThemeMode = useSettings(s => s.homeThemeMode)
  const language = useSettings(s => s.language)
  const animations = useSettings(s => s.animations)
  const showKbdHints = useSettings(s => s.showKbdHints)
  const setSetting = useSettings(s => s.setSetting)
  const t = useT()

  if (home) {
    return (
      <div>
        <SectionTitle>{t('Theme')}</SectionTitle>
        <SettingItem
          label={t('Theme')}
          desc={t('Light or dark look for the board overview page — independent of each board\'s own theme.')}
          control={
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 2 }}>
              <SlidingTabs<'dark' | 'light' | 'system'>
                options={[
                  { value: 'dark',   label: t('Dark') },
                  { value: 'light',  label: t('Light') },
                  { value: 'system', label: t('System') },
                ]}
                value={homeThemeMode}
                onChange={v => setSetting({ homeThemeMode: v })}
                slotW={56} slotH={26} radius={8} fontSize={10.5}
              />
            </div>
          }
        />

        <SectionTitle>{t('Language')}</SectionTitle>
        <SettingItem
          label={t('Language')}
          desc={t('Switches every label, button and message in the app')}
          control={<LanguageSelect value={language} onChange={lng => setSetting({ language: lng })} />}
        />
      </div>
    )
  }

  return (
    <div>
      <SectionTitle>{t('Language')}</SectionTitle>
      <SettingItem
        label={t('Language')}
        desc={t('Switches every label, button and message in the app')}
        control={<LanguageSelect value={language} onChange={lng => setSetting({ language: lng })} />}
      />

      <SectionTitle>{t('Animations')}</SectionTitle>
      <Row
        label={t('Animations')}
        desc={t('Turns decorative transitions and effects on or off across the entire app')}
        value={animations}
        onChange={v => setSetting({ animations: v })}
      />
      <Row
        label={t('Keyboard shortcut hints')}
        desc={t('Shows shortcuts like [E] in the header')}
        value={showKbdHints}
        onChange={v => setSetting({ showKbdHints: v })}
      />

      <SectionTitle>{t('Help')}</SectionTitle>
      <SettingItem
        label={t('Intro tour')}
        desc={t('starts on the board')}
        control={
          <button
            onClick={() => { setSetting({ hasSeenTutorial: false }); onClose() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8, whiteSpace: 'nowrap',
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text1)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {t('Watch again')}
          </button>
        }
      />

      <AddOnsPanel />
    </div>
  )
}

// Kompaktes Dropdown statt der früheren volle-Breite-Leiste: sitzt auf
// gleicher Höhe wie Titel/Beschreibung, rechtsbündig, Breite passt sich dem Text an.
function LanguageSelect({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
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

  const current = LANGUAGES.find(l => l.id === value) ?? LANGUAGES[0]

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
        {current.native}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
          minWidth: 150,
          // Mit --bg gemischt + Blur: bleibt auch bei transparentem --surface
          // (Crystal-Glass-Theme) deckend & lesbar statt komplett durchsichtig
          background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden',
        }}>
          {LANGUAGES.map(lng => {
            const active = lng.id === value
            return (
              <button
                key={lng.id}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(lng.id); setOpen(false) }}
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
                    {lng.native}
                  </span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text3)' }}>{t(lng.label)}</span>
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
