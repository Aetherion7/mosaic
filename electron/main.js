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

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, Tray } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { fork } = require('child_process')
const http = require('http')

const isDev = !app.isPackaged
const DEV_URL = process.env.MOSAIC_DEV_URL || 'http://localhost:3001'

let mainWindow = null
let serverProcess = null
let serverPort = null
let tray = null
let isQuitting = false
// Vom Renderer per IPC gesetzt (ElectronBridge.tsx spiegelt den persistierten
// Einstellungswert) — der Hauptprozess hat selbst keinen Zugriff auf den
// zustand-Store, der im Renderer-localStorage liegt.
let keepInBackground = false

// Ohne diese Sperre würde ein Doppelklick auf das App-Icon, während bereits
// eine Instanz im Hintergrund läuft (s. Hintergrundbetrieb unten), eine
// komplett zweite Instanz starten, die den festen Server-Port 47893 schon
// belegt vorfindet und auf einen zufälligen Port ausweicht — genau der
// Datenverlust-Bug (unterschiedlicher Origin bei jedem Start), der an anderer
// Stelle bereits gefixt wurde, nur über einen neuen Weg reproduziert.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) { mainWindow.show(); hideTray() }
  mainWindow.focus()
})

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
  // IndexedDB/localStorage are scoped per full origin — scheme + host +
  // PORT included. Picking a fresh random port on every launch (the old
  // behavior here) therefore put every single restart on a brand-new
  // origin: nothing was ever actually deleted, but the browser storage
  // from the previous launch was permanently orphaned under a port that's
  // never revisited again — from the user's side that looks exactly like
  // "close the app, reopen it, every board is gone". Using a fixed,
  // dedicated port keeps the origin (and with it, the storage) stable
  // across restarts; the random-port fallback still exists for the rare
  // case something else on the machine is already bound to it.
  const net = require('net')
  const PREFERRED_PORT = 47893
  serverPort = await new Promise((resolve, reject) => {
    const preferred = net.createServer()
    preferred.once('error', () => {
      const fallback = net.createServer()
      fallback.once('error', reject)
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address()
        fallback.close(() => resolve(port))
      })
    })
    preferred.listen(PREFERRED_PORT, '127.0.0.1', () => {
      preferred.close(() => resolve(PREFERRED_PORT))
    })
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
      // Ohne das drosselt Chromium Timer in unsichtbaren Fenstern auf mehrere
      // Minuten Verzögerung — würde den ganzen Sinn des Hintergrundbetriebs
      // (rechtzeitige Kalender-Erinnerungen, s. ReminderScheduler.tsx) untergraben.
      backgroundThrottling: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Hintergrundbetrieb: Fenster nur verstecken statt zerstören, damit der
  // Renderer (und mit ihm der Erinnerungs-Scheduler) weiterläuft. Gilt auf
  // allen drei Plattformen — auch macOS, wo window-all-closed zwar schon den
  // App-Exit verhindert, das Fenster selbst aber ohne dieses Abfangen trotzdem
  // zerstört würde. isQuitting (gesetzt in 'before-quit') lässt einen echten
  // Beenden-Wunsch ungehindert durch.
  mainWindow.on('close', (e) => {
    if (keepInBackground && !isQuitting) {
      e.preventDefault()
      mainWindow.hide()
      showTray()
    }
  })

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

// ── Hintergrundbetrieb: Tray-Icon ───────────────────────────────────────────
// Erscheint nur, während das Fenster tatsächlich versteckt ist (nicht dauerhaft
// bei aktivem Hintergrundbetrieb) — sonst gäbe es ein Tray-Icon, obwohl die App
// die ganze Zeit normal sichtbar im Fenster läuft.
function showTray() {
  if (tray) return
  const iconPath = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  tray = new Tray(iconPath)
  tray.setToolTip('mosaic')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open mosaic', click: () => { mainWindow?.show(); hideTray() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('click', () => { mainWindow?.show(); hideTray() })
}

function hideTray() {
  if (!tray) return
  tray.destroy()
  tray = null
}

// ── Autostart beim Systemstart ──────────────────────────────────────────────
// Mac/Windows haben mit app.setLoginItemSettings eine eingebaute API dafür.
// Linux wird davon nicht unterstützt (Electron-Doku) — dort wird von Hand
// eine XDG-Autostart-Datei geschrieben/entfernt, das vom Desktop-Environment
// (GNOME/KDE/...) beim Login gelesene Standardverfahren.
function setLaunchAtLogin(enabled) {
  if (process.platform === 'linux') {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart')
    const desktopFile = path.join(autostartDir, 'mosaic.desktop')
    if (enabled) {
      fs.mkdirSync(autostartDir, { recursive: true })
      // AppImage: der laufende Prozess ist nur ein temporärer AppRun-Stub in
      // einem gemounteten Squashfs, der beim nächsten Boot nicht mehr
      // existiert — process.env.APPIMAGE zeigt auf die tatsächliche,
      // dauerhafte .AppImage-Datei. Beim .deb-Build läuft schon process.execPath
      // direkt auf dem echten, dauerhaft installierten Programm.
      const exec = process.env.APPIMAGE || process.execPath
      const content = `[Desktop Entry]\nType=Application\nName=mosaic\nExec="${exec}"\nIcon=mosaic\nX-GNOME-Autostart-enabled=true\n`
      fs.writeFileSync(desktopFile, content, 'utf8')
    } else if (fs.existsSync(desktopFile)) {
      fs.unlinkSync(desktopFile)
    }
  } else {
    app.setLoginItemSettings({ openAtLogin: enabled })
  }
}

// ── IPC-Brücke (s. preload.js) ──────────────────────────────────────────────
ipcMain.handle('desktop:set-launch-at-login', (_e, enabled) => {
  try { setLaunchAtLogin(!!enabled) } catch (err) { console.error('[mosaic] setLaunchAtLogin failed:', err) }
})
ipcMain.handle('desktop:set-keep-in-background', (_e, enabled) => {
  keepInBackground = !!enabled
})

// ── App-Menü ─────────────────────────────────────────────────────────────
// mosaic hat seine eigene Oberfläche (TopBar, Einstellungen-Panel mit GitHub-
// Links im Über-Bereich) für alles, was Edit/View/Window/Help sonst anbieten
// würden — die native Menüleiste (auf Windows/Linux als eigene Zeile über dem
// Fenster sichtbar) bleibt deshalb bewusst leer. Auf macOS bleibt nur das
// System-übliche Minimum (App-Name-Menü mit About/Hide/Quit) bestehen, weil
// das dort Plattform-Konvention ist, nicht ein zusätzliches Feature.
function buildMenu() {
  const isMac = process.platform === 'darwin'
  if (!isMac) {
    Menu.setApplicationMenu(null)
    return
  }
  const template = [{
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
  }]
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
    else if (mainWindow && !mainWindow.isVisible()) { mainWindow.show(); hideTray() }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
})
