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

const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
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
  // stdout/stderr werden mitgeschnitten (statt 'ignore'): stürzt server.js
  // selbst ab (z. B. ein natives Modul mit falscher ABI), war das vorher
  // unsichtbar — waitForServer() lief einfach in den Timeout, ohne den
  // eigentlichen Grund preiszugeben.
  let serverOutput = ''
  serverProcess = fork(serverEntry, [], {
    env: {
      ...process.env,
      PORT: String(serverPort), HOSTNAME: '127.0.0.1', NODE_ENV: 'production',
      // In a packaged app, process.execPath points at the mosaic/Electron
      // binary itself, not a system node — without this, fork() tries to
      // launch another full Electron/Chromium instance instead of just
      // running server.js as plain Node, so the standalone server never
      // actually starts (the packaged app silently never opens a window,
      // since loadURL() hangs until waitForServer()'s timeout, which
      // rejects with no .catch() anywhere in the chain).
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  serverProcess.stdout.on('data', d => { serverOutput += d.toString() })
  serverProcess.stderr.on('data', d => { serverOutput += d.toString() })
  serverProcess.on('exit', code => {
    if (code !== 0 && code !== null) console.error(`[mosaic] standalone server exited with code ${code}\n${serverOutput}`)
  })

  const url = `http://127.0.0.1:${serverPort}`
  try {
    await waitForServer(url)
  } catch (err) {
    // Den mitgeschnittenen Output an den Timeout-Fehler anhängen, damit er
    // im Fehlerdialog (app.whenReady-Handler unten) tatsächlich sichtbar wird.
    throw new Error(`${err.message}\n\n${serverOutput || '(no output from standalone server)'}`)
  }
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
        { label: 'mosaic on GitHub', click: () => shell.openExternal('https://github.com/Aetherion7/mosaic') },
        { label: 'Report an issue', click: () => shell.openExternal('https://github.com/Aetherion7/mosaic/issues') },
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
  try {
    await createWindow()
  } catch (err) {
    // Without this, a startup failure (e.g. the standalone server never
    // answering) previously meant the app just quietly never showed a
    // window at all, with nothing in the UI to explain why.
    console.error('[mosaic] Failed to start:', err)
    dialog.showErrorBox('mosaic failed to start', String(err?.stack || err))
    app.quit()
    return
  }
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
