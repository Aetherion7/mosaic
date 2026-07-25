// Bewusst nur 2 schmale Funktionen — die einzige Abweichung von "kein Node im
// Renderer" (s. Kommentar in main.js): Autostart und Hintergrundbetrieb
// brauchen echte Betriebssystem-APIs, auf die nur der Hauptprozess Zugriff
// hat. contextIsolation bleibt an, nodeIntegration aus — die Seite bekommt
// über contextBridge ausschließlich diese 2 aufrufbaren Funktionen, sonst
// nichts (kein direkter ipcRenderer, kein require, kein fs-Zugriff usw.).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mosaicDesktop', {
  setLaunchAtLogin:    (enabled) => ipcRenderer.invoke('desktop:set-launch-at-login', enabled),
  setKeepInBackground: (enabled) => ipcRenderer.invoke('desktop:set-keep-in-background', enabled),
})
