// Bewusst nur eine schmale, fest umrissene Funktionsliste — die einzige
// Abweichung von "kein Node im Renderer" (s. Kommentar in main.js): Autostart,
// Hintergrundbetrieb und der Update-Installer brauchen echte Betriebssystem-
// APIs, auf die nur der Hauptprozess Zugriff hat. contextIsolation bleibt an,
// nodeIntegration aus — die Seite bekommt über contextBridge ausschließlich
// diese aufrufbaren Funktionen, sonst nichts (kein direkter ipcRenderer, kein
// require, kein fs-Zugriff usw.).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mosaicDesktop', {
  setLaunchAtLogin:    (enabled) => ipcRenderer.invoke('desktop:set-launch-at-login', enabled),
  setKeepInBackground: (enabled) => ipcRenderer.invoke('desktop:set-keep-in-background', enabled),
  // Feuert, sobald ein Update im Hintergrund fertig heruntergeladen wurde
  // (s. main.js notifyRendererOfUpdate) — gibt eine Unsubscribe-Funktion
  // zurück, damit UpdateAvailablePopup.tsx beim Unmount sauber abmelden kann.
  onUpdateAvailable: (callback) => {
    const listener = (_event, info) => callback(info)
    ipcRenderer.on('update:downloaded', listener)
    return () => ipcRenderer.removeListener('update:downloaded', listener)
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
})
