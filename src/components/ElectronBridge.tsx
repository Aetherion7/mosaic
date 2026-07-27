'use client'
import { useEffect } from 'react'
import { useSettings } from '@/store/settingsStore'

declare global {
  interface Window {
    // Nur im Electron-Build vorhanden (s. electron/preload.js) — im Browser
    // schlicht undefined, jeder Aufruf unten also folgenlos.
    mosaicDesktop?: {
      setLaunchAtLogin:    (enabled: boolean) => Promise<void>
      setKeepInBackground: (enabled: boolean) => Promise<void>
      // s. UpdateAvailablePopup.tsx
      onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string; releaseUrl: string }) => void) => () => void
      installUpdate: () => Promise<void>
    }
  }
}

// Unsichtbar, immer gemountet (gleiches Muster wie StorageErrorBanner):
// spiegelt die beiden Desktop-Einstellungen aus settingsStore in den
// Electron-Hauptprozess, der als einziger Zugriff auf die echten OS-APIs
// (Autostart, Fenster verstecken) hat. Läuft bei jeder Änderung UND einmal
// beim Mounten, damit der Hauptprozess (der die persistierten Werte selbst
// nicht kennt) den aktuellen Stand direkt beim Start bekommt.
export default function ElectronBridge() {
  const launchAtLogin           = useSettings(s => s.launchAtLogin)
  const keepRunningInBackground = useSettings(s => s.keepRunningInBackground)

  useEffect(() => {
    window.mosaicDesktop?.setLaunchAtLogin(launchAtLogin)
  }, [launchAtLogin])

  useEffect(() => {
    window.mosaicDesktop?.setKeepInBackground(keepRunningInBackground)
  }, [keepRunningInBackground])

  return null
}
