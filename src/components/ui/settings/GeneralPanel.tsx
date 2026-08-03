'use client'
import { useState, useRef, useEffect } from 'react'
import { useSettings } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import type { Lang } from '@/lib/i18n'
import { useT } from '@/hooks/useT'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { SectionTitle, SettingItem, Row } from './shared'
import { FontSection } from './ErscheinungsbildPanel'
import { APP_VERSION } from '@/lib/version'

const LANGUAGES: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'de', label: 'German',  native: 'Deutsch'  },
]

type ThemeMode = 'dark' | 'light' | 'system'
const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light',  label: 'Light'  },
  { id: 'dark',   label: 'Dark'   },
]

// `home`: Board-Auswahl (Startseite) bekommt eine bewusst knappe Variante
// dieser Kategorie — nur Theme + Sprache, unabhängig vom Rest der
// "normalen" (board-internen) Einstellungen, die hier komplett wegfallen.
export default function GeneralPanel({ onClose, home }: { onClose: () => void; home?: boolean }) {
  const homeThemeMode = useSettings(s => s.homeThemeMode)
  const language = useSettings(s => s.language)
  const showKbdHints = useSettings(s => s.showKbdHints)
  const launchAtLogin = useSettings(s => s.launchAtLogin)
  const keepRunningInBackground = useSettings(s => s.keepRunningInBackground)
  const autoUpdateEnabled = useSettings(s => s.autoUpdateEnabled)
  const setSetting = useSettings(s => s.setSetting)
  const isDesktop = useIsDesktop()
  const t = useT()

  if (home) {
    return (
      <div>
        {isDesktop && <div style={{ marginBottom: 20 }}><VersionSection /></div>}

        {/* Einzeloptionen ohne eigene Überkategorie — Kategorie-Titel lohnen
            sich erst ab 2+ zusammengehörigen Optionen (s. "Desktop" unten). */}
        <SettingItem
          label={t('Theme')}
          desc={t('Light or dark look for the board overview page — independent of each board\'s own theme.')}
          control={<ThemeModeSelect value={homeThemeMode} onChange={v => setSetting({ homeThemeMode: v })} />}
        />

        <div style={{ marginTop: 20 }}>
          <SettingItem
            label={t('Language')}
            desc={t('Switches every label, button and message in the app')}
            control={<LanguageSelect value={language} onChange={lng => setSetting({ language: lng })} />}
          />
        </div>

        {/* FontSection zeigt hier (ohne offenes Board) nur die Programm-
            Schrift — der Board-Schrift-Teil rendert nur, wenn ein Board offen
            ist, s. Kommentar dort. */}
        <div style={{ marginTop: 20 }}>
          <FontSection showBoardFont={false} />
        </div>

        <div style={{ marginTop: 20 }}>
          <Row
            label={t('Keyboard shortcut hints')}
            desc={t('Shows shortcuts like [N] in the header')}
            value={showKbdHints}
            onChange={v => setSetting({ showKbdHints: v })}
          />
        </div>

        {isDesktop && (
          <>
            <SectionTitle>{t('Desktop')}</SectionTitle>
            <Row
              label={t('Launch at login')}
              desc={t('Automatically start mosaic when you log in to your computer')}
              value={launchAtLogin}
              onChange={v => setSetting({ launchAtLogin: v })}
            />
            <Row
              label={t('Keep running in background')}
              desc={t('Keep mosaic running in the background after closing the window, so reminders can still arrive')}
              value={keepRunningInBackground}
              onChange={v => setSetting({ keepRunningInBackground: v })}
            />
            <Row
              label={t('Automatic updates')}
              desc={t('Download and install new versions automatically in the background')}
              value={autoUpdateEnabled}
              onChange={v => setSetting({ autoUpdateEnabled: v })}
            />
          </>
        )}

        <SectionTitle>{t('Help')}</SectionTitle>
        <SettingItem
          last
          label={t('Intro tour')}
          desc={t('starts on the board overview')}
          control={
            <button
              onClick={() => { setSetting({ hasSeenHomeTutorial: false }); onClose() }}
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
      </div>
    )
  }

  return (
    <div>
      {isDesktop && <div style={{ marginBottom: 20 }}><VersionSection /></div>}

      {/* Einzeloptionen ohne eigene Überkategorie — Kategorie-Titel lohnen sich
          erst ab 2+ zusammengehörigen Optionen (s. "Desktop" unten). Trotzdem
          sichtbar per marginTop voneinander getrennt statt kommentarlos
          aneinandergereiht. */}
      <SettingItem
        label={t('Language')}
        desc={t('Switches every label, button and message in the app')}
        control={<LanguageSelect value={language} onChange={lng => setSetting({ language: lng })} />}
      />
      <div style={{ marginTop: 20 }}>
        <Row
          label={t('Keyboard shortcut hints')}
          desc={t('Shows shortcuts like [E] in the header')}
          value={showKbdHints}
          onChange={v => setSetting({ showKbdHints: v })}
        />
      </div>

      {isDesktop && (
        <>
          <SectionTitle>{t('Desktop')}</SectionTitle>
          <Row
            label={t('Launch at login')}
            desc={t('Automatically start mosaic when you log in to your computer')}
            value={launchAtLogin}
            onChange={v => setSetting({ launchAtLogin: v })}
          />
          <Row
            label={t('Keep running in background')}
            desc={t('Keep mosaic running in the background after closing the window, so reminders can still arrive')}
            value={keepRunningInBackground}
            onChange={v => setSetting({ keepRunningInBackground: v })}
          />
          <Row
            label={t('Automatic updates')}
            desc={t('Download and install new versions automatically in the background')}
            value={autoUpdateEnabled}
            onChange={v => setSetting({ autoUpdateEnabled: v })}
          />
        </>
      )}

      <SectionTitle>{t('Help')}</SectionTitle>
      <SettingItem
        last
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
    </div>
  )
}

type CheckStatus = 'idle' | 'checking' | 'not-available' | 'error'

// Aktuelle Version + Update-Stand oben in Allgemein — `ready` kommt aus dem
// globalen uiStore (s. ElectronBridge.tsx), `status` ist rein lokal: er
// spiegelt nur einen manuellen Check über den Button unten, der ohnehin nur
// Sinn ergibt, während dieses Panel offen ist.
function VersionSection() {
  const t = useT()
  const ready = useUIStore(s => s.pendingUpdate)
  const [status, setStatus] = useState<CheckStatus>('idle')

  useEffect(() => {
    if (!window.mosaicDesktop) return
    return window.mosaicDesktop.onUpdateStatus(info => setStatus(info.status))
  }, [])

  function check() {
    setStatus('checking')
    window.mosaicDesktop?.checkForUpdates()
  }

  const checking = status === 'checking' && !ready
  const releaseUrl = ready?.releaseUrl ?? 'https://github.com/Aetherion7/mosaic/releases'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '14px 16px', borderRadius: 12,
      border: '1px solid var(--border)', background: 'var(--surface2)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>
          {t('Version')} {APP_VERSION}
        </div>
        {ready ? (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
            {t('Installer version')}: {ready.version} — {t('A new version is ready to install.')}
          </div>
        ) : checking ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{t('Checking for updates…')}</div>
        ) : status === 'error' ? (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>{t('Update check failed.')}</div>
        ) : null}
        <a href={releaseUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11.5, color: 'var(--accent)', marginTop: 4, display: 'inline-block' }}>
          {t('Read the changelog')}
        </a>
      </div>
      <button
        onClick={ready ? () => window.mosaicDesktop?.installUpdate() : check}
        disabled={checking}
        style={{
          flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 999, border: 'none',
          background: ready ? 'var(--accent)' : 'var(--surface3)',
          color: ready ? 'white' : 'var(--text2)',
          cursor: checking ? 'default' : 'pointer',
          opacity: checking ? 0.6 : 1,
        }}
      >
        {ready ? t('Restart to update') : checking ? t('Checking…') : t('Check for updates')}
      </button>
    </div>
  )
}

// Ein Dropdown statt der früheren 3-Wege-Sliding-Tabs — gleiches Muster wie
// LanguageSelect direkt darunter.
function ThemeModeSelect({ value, onChange }: { value: ThemeMode; onChange: (m: ThemeMode) => void }) {
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

  const current = THEME_MODES.find(m => m.id === value) ?? THEME_MODES[0]

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
        {t(current.label)}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
          minWidth: 130,
          background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden',
        }}>
          {THEME_MODES.map(mode => {
            const active = mode.id === value
            return (
              <button
                key={mode.id}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(mode.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : 'var(--text1)' }}>
                  {t(mode.label)}
                </span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 'auto' }}>
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
