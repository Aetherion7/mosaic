// Bewusst leer / minimal: mosaic braucht keine Node-/Electron-APIs im Renderer
// (kein contextBridge.exposeInMainWorld nötig) — die App läuft im Fenster
// exakt wie im Browser, mit IndexedDB/localStorage als einziger Persistenz.
// contextIsolation bleibt trotzdem an (siehe main.js), damit das theoretisch
// niemals zu einem Sicherheitsproblem werden kann, falls sich das mal ändert.
