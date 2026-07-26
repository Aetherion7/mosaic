'use client'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import { useSettings, DEFAULT_SHORTCUTS, DEFAULT_HOME_SHORTCUTS, type ShortcutAction, type HomeShortcutAction } from '@/store/settingsStore'
import { SectionTitle, KbdRow } from './shared'

// Nur die 5 globalen Single-Key-Shortcuts aus TopBar.tsx sind umbelegbar —
// nicht Ctrl+Z/Y (feste Konvention) und nicht die Widget-internen Tasten
// (Tabelle, Drawboard), die feste Interaktionsmuster sind statt einzelner
// Aktionen, die man sinnvoll verlegen würde.
const REBINDABLE: { action: ShortcutAction; label: string }[] = [
  { action: 'toggleMode', label: 'Toggle edit/view mode' },
  { action: 'addWidget',  label: 'Add widget (edit mode only)' },
  { action: 'theme',      label: 'Open / close themes panel' },
  { action: 'ai',         label: 'Open / close AI assistant' },
  { action: 'settings',   label: 'Open / close settings' },
]

// Eigenes Set für die Board-Auswahl (page.tsx) — andere Aktionen als auf
// einem Board, deshalb unabhängig von REBINDABLE oben.
const REBINDABLE_HOME: { action: HomeShortcutAction; label: string }[] = [
  { action: 'newBoard',    label: 'Create new board' },
  { action: 'newFolder',   label: 'Create new folder' },
  { action: 'focusSearch', label: 'Focus search' },
  { action: 'settings',    label: 'Open / close settings' },
]

// `home`: Board-Auswahl (Startseite) bekommt ihr eigenes, kleineres Shortcut-
// Set (kein Edit/Ansicht-Modus, kein KI-Assistent dort) und keine der board-
// internen Tastenkürzel-Abschnitte (Tabelle, Drawboard) weiter unten.
export default function TastenkürzelPanel({ home }: { home?: boolean } = {}) {
  return home ? <HomeShortcuts /> : <BoardShortcuts />
}

function BoardShortcuts() {
  const t = useT()
  const shortcuts = useSettings(s => s.keyboardShortcuts)
  const setSetting = useSettings(s => s.setSetting)
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    const recordingAction: ShortcutAction = recording
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); setConflict(null); return }
      // Nur einzelne, druckbare Zeichen zulassen (Buchstaben/Zahlen) — kein
      // reiner Modifier-Tastendruck (Shift/Ctrl/Alt/Meta allein) als Binding.
      if (e.key.length !== 1) return
      const key = e.key.toUpperCase()
      const current = useSettings.getState().keyboardShortcuts
      const usedBy = (Object.entries(current) as [ShortcutAction, string][])
        .find(([action, k]) => k === key && action !== recordingAction)
      if (usedBy) {
        const label = REBINDABLE.find(r => r.action === usedBy[0])?.label ?? usedBy[0]
        setConflict(t('Already used by: {action}').replace('{action}', t(label)))
        return
      }
      setSetting({ keyboardShortcuts: { ...current, [recordingAction]: key } })
      setRecording(null)
      setConflict(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, setSetting, t])

  return (
    <div>
      <SectionTitle>{t('Navigation')}</SectionTitle>
      {REBINDABLE.map(({ action, label }) => (
        <RebindableKbdRow
          key={action}
          action={t(label)}
          keyValue={shortcuts[action]}
          recording={recording === action}
          isDefault={shortcuts[action] === DEFAULT_SHORTCUTS[action]}
          conflict={recording === action ? conflict : null}
          onStartRecording={() => { setRecording(action); setConflict(null) }}
          onReset={() => setSetting({ keyboardShortcuts: { ...shortcuts, [action]: DEFAULT_SHORTCUTS[action] } })}
        />
      ))}
      <KbdRow keys={['Esc']} action={t('Close panel / selection')} />

      <SectionTitle>{t('Board')}</SectionTitle>
      <KbdRow keys={['Ctrl', 'Z']} action={t('Undo (calendar, drawboard)')} />
      <KbdRow keys={['Ctrl', 'Y']} action={t('Redo (calendar, drawboard)')} />

      <SectionTitle>{t('Table widget')}</SectionTitle>
      <KbdRow keys={['Enter']} action={t('Edit cell / confirm')} />
      <KbdRow keys={['Tab']} action={t('Next cell')} />
      <KbdRow keys={['Esc']} action={t('Cancel editing')} />
      <KbdRow keys={['↑', '↓', '←', '→']} action={t('Navigate cells')} />
      <KbdRow keys={['Ctrl', 'C']} action={t('Copy cell')} />
      <KbdRow keys={['Ctrl', 'V']} action={t('Paste')} />
      <KbdRow keys={['Delete']} action={t('Clear cell')} />

      <SectionTitle>{t('Drawboard widget')}</SectionTitle>
      <KbdRow keys={['Ctrl', '0']} action={t('Reset zoom')} />
      <KbdRow keys={['Delete']} action={t('Delete selected element')} />
      <KbdRow keys={['Alt', t('Drag')]} action={t('Pan canvas')} />
      <KbdRow keys={['Ctrl', t('Scroll')]} action={t('Zoom')} />
    </div>
  )
}

function HomeShortcuts() {
  const t = useT()
  const shortcuts = useSettings(s => s.keyboardShortcutsHome)
  const setSetting = useSettings(s => s.setSetting)
  const [recording, setRecording] = useState<HomeShortcutAction | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    const recordingAction: HomeShortcutAction = recording
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); setConflict(null); return }
      if (e.key.length !== 1) return
      const key = e.key.toUpperCase()
      const current = useSettings.getState().keyboardShortcutsHome
      const usedBy = (Object.entries(current) as [HomeShortcutAction, string][])
        .find(([action, k]) => k === key && action !== recordingAction)
      if (usedBy) {
        const label = REBINDABLE_HOME.find(r => r.action === usedBy[0])?.label ?? usedBy[0]
        setConflict(t('Already used by: {action}').replace('{action}', t(label)))
        return
      }
      setSetting({ keyboardShortcutsHome: { ...current, [recordingAction]: key } })
      setRecording(null)
      setConflict(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, setSetting, t])

  return (
    <div>
      <SectionTitle>{t('Board selection')}</SectionTitle>
      {REBINDABLE_HOME.map(({ action, label }) => (
        <RebindableKbdRow
          key={action}
          action={t(label)}
          keyValue={shortcuts[action]}
          recording={recording === action}
          isDefault={shortcuts[action] === DEFAULT_HOME_SHORTCUTS[action]}
          conflict={recording === action ? conflict : null}
          onStartRecording={() => { setRecording(action); setConflict(null) }}
          onReset={() => setSetting({ keyboardShortcutsHome: { ...shortcuts, [action]: DEFAULT_HOME_SHORTCUTS[action] } })}
        />
      ))}
      <KbdRow keys={['Esc']} action={t('Close panel / selection')} />
    </div>
  )
}

// Wie KbdRow, aber die Taste ist ein Button: Klick startet die Aufnahme, der
// nächste Tastendruck (außer Escape) wird das neue Binding. Konflikte mit
// einer anderen Aktion desselben Sets werden abgelehnt statt stillschweigend
// getauscht — weniger überraschend, wenn zwei Aktionen dieselbe Taste wollen.
function RebindableKbdRow({ action, keyValue, recording, isDefault, conflict, onStartRecording, onReset }: {
  action: string
  keyValue: string
  recording: boolean
  isDefault: boolean
  conflict: string | null
  onStartRecording: () => void
  onReset: () => void
}) {
  const t = useT()
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (recording) btnRef.current?.focus() }, [recording])

  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{action}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isDefault && !recording && (
            <button onClick={onReset} title={t('Reset to default')}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
            </button>
          )}
          <button
            ref={btnRef}
            onClick={onStartRecording}
            title={recording ? t('Press any key — Esc to cancel') : t('Click to change')}
            style={{
              fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
              padding: '2px 9px', borderRadius: 5, cursor: 'pointer',
              background: recording ? 'color-mix(in srgb, var(--accent) 16%, var(--surface2))' : 'var(--surface2)',
              border: `1px solid ${recording ? 'var(--accent)' : 'var(--border)'}`,
              color: recording ? 'var(--accent)' : 'var(--text1)',
              minWidth: 26,
            }}
          >
            {recording ? t('Press key…') : keyValue}
          </button>
        </div>
      </div>
      {conflict && (
        <div style={{ fontSize: 10.5, color: 'var(--danger)', marginTop: 4, textAlign: 'right' }}>{conflict}</div>
      )}
    </div>
  )
}
