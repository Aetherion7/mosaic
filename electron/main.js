// ─── mosaic Desktop — Electron main process ──────────────────────────────────
// Startet die App als eigenständiges Fenster:
//  - Dev  (npm run electron:dev): lädt den laufenden `next dev`-Server
//    (MOSAIC_DEV_URL, siehe package.json-Skript) — Hot Reload funktioniert
//    ganz normal, weil es einfach dieselbe Dev-URL im Electron-Fenster ist.
//  - Prod (gepackte App): startet den Next.js-"standalone"-Server
//    (.next/standalone/server.js, siehe next.config.ts) als Kindprozess auf
//    einem lokalen Port und lädt ihn dann im Fenster.
//
// mosaic bleibt dabei genau die gleiche App wie im Browser: keine Node-APIs
// werden an die Seite durchgereicht (contextIsolation an, nodeIntegration
// aus), IndexedDB/localStorage laufen wie gewohnt im Chromium-Renderer, der
// optionale KI-Assistent ruft weiterhin direkt aus dem Renderer den vom
// Nutzer gewählten Anbieter auf (BYOK, KONZEPT.md §15) — die Desktop-App ist
// nur eine andere Hülle um dieselbe lokale Web-App, kein zusätzlicher Server.

const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')
const { fork } = require('child_process')
const http = require('http')

const isDev = !app.isPackaged
const DEV_URL = process.env.MOSAIC_DEV_URL || 'http://localhost:3001'

let mainWindow = null
let serverProcess = null
let serverPort = null

// ── Next-Standalone-Server als Kindprozess starten (nur Prod) ───────────────
function waitForServer(url, timeoutMs = 20000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http.get(url, res => { res.resume(); resolve() })
        .on('error', () => {
          if (Date.now() - started > timeoutMs) reject(new Error('Server did not start in time'))
          else setTimeout(tryOnce, 200)
        })
    }
    tryOnce()
  })
}

async function startStandaloneServer() {
  // Freien Port suchen, statt einen festen zu riskieren (Konflikt mit
  // anderen lokalen Diensten)
  const net = require('net')
  serverPort = await new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })

  const serverEntry = path.join(process.resourcesPath, 'standalone', 'server.js')
  serverProcess = fork(serverEntry, [], {
    env: { ...process.env, PORT: String(serverPort), HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
    stdio: 'ignore',
  })
  serverProcess.on('exit', code => {
    if (code !== 0 && code !== null) console.error(`[mosaic] standalone server exited with code ${code}`)
  })

  const url = `http://127.0.0.1:${serverPort}`
  await waitForServer(url)
  return url
}

// ── Fenster ───────────────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090f', // Deep-Space-Theme-Hintergrund — kein weißer Blitz beim Start
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Externe Links (z.B. der GitHub-/Spenden-Link im Über-Panel) im System-
  // Browser öffnen statt im App-Fenster
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const url = isDev ? DEV_URL : await startStandaloneServer()
  await mainWindow.loadURL(url)

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Minimales, plattformübliches App-Menü ───────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'mosaic on GitHub', click: () => shell.openExternal('https://github.com/YOUR_GITHUB_USERNAME/mosaic') },
        { label: 'Report an issue', click: () => shell.openExternal('https://github.com/YOUR_GITHUB_USERNAME/mosaic/issues') },
        ...(!isMac ? [{ label: 'Check for Updates…', click: () => checkForUpdates(true) }] : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Auto-Update über GitHub Releases ─────────────────────────────────────────
// electron-updater liest das von electron-builder generierte app-update.yml
// (aus der "publish"-Konfig in package.json) und vergleicht gegen die neueste
// GitHub-Release. Läuft nur in gepackten Builds — im Dev-Modus gibt es weder
// die App-Update-Metadaten noch eine sinnvolle Update-Quelle.
function checkForUpdates(manual = false) {
  if (isDev) {
    if (manual) console.log('[mosaic] Auto-update is disabled in development.')
    return
  }
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('[mosaic] Update check failed:', err)
  })
}

app.whenReady().then(async () => {
  buildMenu()
  await createWindow()
  checkForUpdates(false)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
})
