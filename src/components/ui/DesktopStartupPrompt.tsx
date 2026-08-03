'use client'
import { useEffect, useState } from 'react'
import { useSettings } from '@/store/settingsStore'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { useT } from '@/hooks/useT'
import { Row } from './settings/shared'

// Einmaliges In-App-Modal statt eines nativen OS-Dialogs: passt zum
// bestehenden Look, und der Electron-Hauptprozess hat ohnehin keinen Zugriff
// auf die i18n-Übersetzungen des Renderers. Erscheint nur im Desktop-Build,
// nur einmal (hasSeenStartupPrompt, gleiches Muster wie hasSeenTutorial) —
// beide Schalter bleiben danach jederzeit unter Einstellungen → Allgemein
// änderbar.
export default function DesktopStartupPrompt() {
  const t = useT()
  const isDesktop = useIsDesktop()
  const hasSeenStartupPrompt = useSettings(s => s.hasSeenStartupPrompt)
  const setSetting = useSettings(s => s.setSetting)

  const [visible, setVisible] = useState(false)
  const [launch, setLaunch] = useState(true)
  const [background, setBackground] = useState(true)

  // Start verzögert, damit die Board-/Startseiten-UI fertig gerendert ist,
  // gleiches Muster wie TutorialTour.
  useEffect(() => {
    if (!isDesktop || hasSeenStartupPrompt) { setVisible(false); return }
    const id = setTimeout(() => setVisible(true), 700)
    return () => clearTimeout(id)
  }, [isDesktop, hasSeenStartupPrompt])

  function confirm(apply: boolean) {
    setVisible(false)
    setSetting({
      hasSeenStartupPrompt: true,
      launchAtLogin: apply ? launch : false,
      keepRunningInBackground: apply ? background : false,
    })
  }

  if (!visible) return null

  return (
    <div role="dialog" aria-modal="true" aria-label={t('Run mosaic in the background?')}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,10,0.72)', backdropFilter: 'blur(1.5px)', WebkitBackdropFilter: 'blur(1.5px)' }} />
      <div style={{
        position: 'relative', width: 440, maxWidth: 'calc(100vw - 24px)',
        background: 'color-mix(in srgb, var(--surface) 45%, var(--bg))',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: 18,
        padding: '22px 26px 20px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent)',
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text1)', marginBottom: 8 }}>
          {t('Run mosaic in the background?')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 16 }}>
          {t('mosaic can start automatically when you log in, and keep running in the background afterward — so calendar reminders still arrive even when the window is closed. Both are optional and can be changed anytime under Settings → General.')}
        </div>

        <Row
          label={t('Launch at login')}
          desc={t('Automatically start mosaic when you log in to your computer')}
          value={launch}
          onChange={setLaunch}
        />
        <Row
          label={t('Keep running in background')}
          desc={t('Keep mosaic running in the background after closing the window, so reminders can still arrive')}
          value={background}
          onChange={setBackground}
          last
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={() => confirm(false)} style={{
            fontSize: 12.5, fontWeight: 600, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer',
          }}>
            {t('Maybe later')}
          </button>
          <button onClick={() => confirm(true)} style={{
            fontSize: 13, fontWeight: 700, padding: '9px 22px', borderRadius: 999,
            border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
            boxShadow: '0 4px 18px color-mix(in srgb, var(--accent) 45%, transparent)',
          }}>
            {t('Continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
