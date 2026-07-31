'use client'
import { useEffect } from 'react'
import { useSettings } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'

declare global {
  interface Window {
    // Nur im Electron-Build vorhanden (s. electron/preload.js) — im Browser
    // schlicht undefined, jeder Aufruf unten also folgenlos.
    mosaicDesktop?: {
      setLaunchAtLogin:     (enabled: boolean) => Promise<void>
      setKeepInBackground:  (enabled: boolean) => Promise<void>
      setAutoUpdateEnabled: (enabled: boolean) => Promise<void>
      // s. UpdateAvailablePopup.tsx
      onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string; releaseUrl: string }) => void) => () => void
      // s. GeneralPanel.tsx — leichtgewichtige Zwischenstände (checking/not-available/error)
      onUpdateStatus: (callback: (info: { status: 'checking' | 'not-available' | 'error' }) => void) => () => void
      checkForUpdates: () => Promise<void>
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
  const autoUpdateEnabled       = useSettings(s => s.autoUpdateEnabled)

  useEffect(() => {
    window.mosaicDesktop?.setLaunchAtLogin(launchAtLogin)
  }, [launchAtLogin])

  useEffect(() => {
    window.mosaicDesktop?.setKeepInBackground(keepRunningInBackground)
  }, [keepRunningInBackground])

  useEffect(() => {
    window.mosaicDesktop?.setAutoUpdateEnabled(autoUpdateEnabled)
  }, [autoUpdateEnabled])

  // Einziger onUpdateAvailable-Listener der ganzen App, hier statt in
  // UpdateAvailablePopup.tsx/GeneralPanel.tsx: die dortigen Komponenten sind
  // nur gemountet, während das jeweilige Popup/Settings-Panel offen ist — ein
  // im Hintergrund fertig heruntergeladenes Update würde ihren lokalen State
  // sonst für immer verpassen, wenn es feuert, während beide gerade nicht
  // gemountet sind. In den globalen (nicht persistierten) UI-Store schreiben
  // statt lokalem State macht es für beide sichtbar, unabhängig vom Mount-Zeitpunkt.
  useEffect(() => {
    if (!window.mosaicDesktop) return
    return window.mosaicDesktop.onUpdateAvailable(info => {
      useUIStore.getState().setPendingUpdate(info)
    })
  }, [])

  return null
}
