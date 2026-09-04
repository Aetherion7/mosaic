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

// Muss vor app.whenReady() gesetzt werden: viele Linux-Compositor (X11 ohne
// echtes Alpha-Visual) rendern ein `transparent: true`-BrowserWindow sonst
// als undurchsichtiges Rechteck statt echter Transparenz — genau der
// eckige Hintergrundrand, der bei den angepinnten Desktop-Widgets auftrat.
// macOS/Windows brauchen das nicht, deshalb nur unter Linux gesetzt.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals')
  // Web-EyeDropper-API (Farbpipette im ColorSwatch-Picker): auf Linux/Wayland
  // baut Chromiums eigene Implementierung auf dessen Desktop-Capture-Stack
  // auf (X11 kann den Bildschirm direkt lesen und braucht das nicht) — ohne
  // dieses Feature versucht Chromium erst gar nicht, eine PipeWire-Aufnahme
  // über xdg-desktop-portal auszuhandeln: das Vorschau-Fenster öffnet sich
  // kurz und schließt sich sofort wieder, ohne je eine Farbe liefern zu
  // können (genau das gemeldete Verhalten). Setzt nur das Chromium-Feature —
  // xdg-desktop-portal + PipeWire müssen weiterhin auf dem System vorhanden
  // sein (praktisch auf jedem modernen Wayland-Desktop der Fall); ohne sie
  // bricht der Portal-Dialog selbst ab, statt dass es an dieser Stelle liegt.
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')
}

const isDev = !app.isPackaged
const DEV_URL = process.env.MOSAIC_DEV_URL || 'http://localhost:3001'
// Überlebt den Prozess selbst (anders als die Modul-Variablen unten) — nötig,
// um einen Waisenprozess aus einer FRÜHEREN, abgestürzten/gekillten Sitzung
// überhaupt wiederzufinden. s. reapStaleServerProcess().
const SERVER_PID_FILE = path.join(app.getPath('userData'), 'server.pid')
// Liste gepinnter Desktop-Widgets ({boardId, widgetId, bounds}[]) — überlebt
// App-Neustarts unabhängig davon, ob/wann der Renderer seinen boardStore aus
// IndexedDB fertig hydriert hat, deshalb eine eigene Datei statt etwas, das
// erst per IPC vom Renderer abgefragt werden müsste. s. loadPinnedWidgets/
// savePinnedWidgets weiter unten.
const PINNED_WIDGETS_FILE = path.join(app.getPath('userData'), 'pinned-widgets.json')

let mainWindow = null
// Ein Fenster pro angepinntem Widget, Schlüssel `${boardId}:${widgetId}` —
// s. createWidgetWindow().
const widgetWindows = new Map()
let serverProcess = null
let serverPort = null
let tray = null
let isQuitting = false
// Vom Renderer per IPC gesetzt (ElectronBridge.tsx spiegelt den persistierten
// Einstellungswert) — der Hauptprozess hat selbst keinen Zugriff auf den
// zustand-Store, der im Renderer-localStorage liegt.
let keepInBackground = false
// Nur einmal je laufender Sitzung feuern (nicht bei jedem Schließen) — sonst
// nervt dieselbe native Benachrichtigung bei jedem einzelnen Klick auf X.
let notifiedBackgroundThisSession = false
// Vom Renderer gespiegelt (s. ElectronBridge.tsx) — steuert nur den
// AUTOMATISCHEN Check beim Start; ein manueller Check (Settings-Button,
// Mac-Menü) funktioniert unabhängig davon immer.
let autoUpdateEnabled = true
// Verhindert doppelte autoUpdater-Listener, wenn checkForUpdates() mehrfach
// aufgerufen wird (einmal beim Start, danach jederzeit über "Check for
// Updates…" im Mac-Menü) — die Listener selbst sollen nur einmal angehängt
// werden, unabhängig davon, wie oft geprüft wird.
let updateListenersAttached = false

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
  // mainWindow kann inzwischen null sein, obwohl die App noch läuft — z. B.
  // wenn nur noch angepinnte Desktop-Widgets offen sind (window-all-closed
  // hält den Prozess dann am Leben, s. Kommentar dort). Ohne diesen Zweig
  // täte ein erneuter App-Start in genau diesem Zustand gar nichts.
  if (!mainWindow) { createWindow(); return }
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

// fork() erzeugt einen komplett eigenständigen OS-Prozess — stirbt der
// Hauptprozess unerwartet (Absturz, vom Fenstermanager/Nutzer erzwungenes
// Beenden, `kill -9`, abgebrochene Desktop-Sitzung), stirbt der geforkte
// Standalone-Server NICHT automatisch mit, sondern wird zur Waise (unter
// Linux von systemd/init reparented) und läuft unsichtbar weiter — und
// belegt dabei dauerhaft den festen Port 47893. Der nächste Start findet
// den Port dann besetzt, weicht auf einen zufälligen Port aus, und genau
// der schon einmal gefixte Datenverlust-Bug (anderer Origin bei jedem
// Start) ist über diesen neuen Weg zurück. Live auf dieser Maschine
// nachgewiesen: fünf genau solche Waisen hatten sich aus früheren
// Testläufen angesammelt, eine davon seit über zwei Tagen unbemerkt aktiv.
//
// Die PID-Datei überlebt den Prozess selbst und macht diese Waise beim
// nächsten Start wiederauffindbar. requestSingleInstanceLock() hat zu
// diesem Zeitpunkt bereits bestätigt, dass keine echte zweite mosaic-
// Instanz läuft — jede hier noch lebend vorgefundene PID ist also
// zwangsläufig so eine Leiche und kann gefahrlos beendet werden.
function reapStaleServerProcess() {
  try {
    const pid = parseInt(fs.readFileSync(SERVER_PID_FILE, 'utf8'), 10)
    if (!pid) return
    process.kill(pid, 0) // wirft ESRCH, wenn der Prozess nicht (mehr) existiert
    console.log(`[mosaic] Killing orphaned standalone server from a previous session (pid ${pid})`)
    process.kill(pid, 'SIGTERM')
  } catch { /* keine Datei, ungültiger Inhalt, oder Prozess bereits tot — nichts zu tun */ }
}

async function startStandaloneServer() {
  reapStaleServerProcess()

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

  function tryPreferredPort() {
    return new Promise((resolve, reject) => {
      const preferred = net.createServer()
      preferred.once('error', reject)
      preferred.listen(PREFERRED_PORT, '127.0.0.1', () => {
        preferred.close(() => resolve(PREFERRED_PORT))
      })
    })
  }

  serverPort = await (async () => {
    // Ein gerade per SIGTERM beendeter Waisenprozess braucht einen kurzen
    // Moment, um den Port tatsächlich freizugeben — ein paar Versuche mit
    // kurzer Pause dazwischen, bevor endgültig auf einen zufälligen Port
    // ausgewichen wird.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await tryPreferredPort()
      } catch {
        await new Promise(r => setTimeout(r, 200))
      }
    }
    return new Promise((resolve, reject) => {
      const fallback = net.createServer()
      fallback.once('error', reject)
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address()
        fallback.close(() => resolve(port))
      })
    })
  })()

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
  // Für reapStaleServerProcess() beim nächsten Start — s. Kommentar dort.
  try { fs.writeFileSync(SERVER_PID_FILE, String(serverProcess.pid), 'utf8') } catch { /* nicht kritisch */ }
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

// Server-URL zwischengespeichert statt jedes Mal neu aufgelöst — sowohl
// createWindow() als auch createWidgetWindow() (Desktop-Widget-Fenster,
// s. u.) laden gegen denselben schon laufenden Server/Port, statt einen
// zweiten zu starten oder den Port per IPC an den Renderer durchzureichen.
let cachedServerUrl = null
async function resolveServerUrl() {
  if (!cachedServerUrl) cachedServerUrl = isDev ? DEV_URL : await startStandaloneServer()
  return cachedServerUrl
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
      if (!notifiedBackgroundThisSession) {
        notifiedBackgroundThisSession = true
        // Text kommt vom Renderer (übersetzt, s. ElectronBridge.tsx) — der
        // Hauptprozess hat keinen Zugriff auf die i18n-Übersetzungen.
        mainWindow.webContents.send('desktop:hidden-to-background')
      }
    }
  })

  // Externe Links (z.B. der GitHub-/Spenden-Link im Über-Panel) im System-
  // Browser öffnen statt im App-Fenster
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const url = await resolveServerUrl()
  await mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
    // Pinned widget windows keep the whole app alive even with mainWindow
    // gone (window-all-closed only fires once ALL windows are closed) — show
    // the tray so there's still a way back to the dashboard, regardless of
    // the separate keepInBackground setting (that one only controls whether
    // closing the main window hides-instead-of-closes IT specifically).
    if (widgetWindows.size > 0) showTray()
  })
}

// ── Desktop-Widgets ("Pin to desktop") ──────────────────────────────────────
// Ein Widget frei schwebend auf dem echten Desktop, unabhängig vom
// Hauptfenster — Rainmeter/Übersicht-artig. v1: echtes "sitzt HINTER anderen
// Fenstern auf dem Desktop" nur auf macOS (setAlwaysOnTop(..., 'desktop') ist
// dort in Electron eingebaut, keine neue Abhängigkeit nötig); Windows/Linux
// bekommen vorerst ein normales Immer-im-Vordergrund-Fenster. Absichtlich in
// einer eigenen, klar austauschbaren Funktion isoliert, damit ein Windows-
// Progman/WorkerW-Trick bzw. ein Linux-X11-Hint später reinpasst, ohne
// createWidgetWindow() selbst anzufassen.
function applyDesktopWidgetPlacement(win) {
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'desktop')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else {
    win.setAlwaysOnTop(true, 'floating')
  }
}

function loadPinnedWidgets() {
  try {
    return JSON.parse(fs.readFileSync(PINNED_WIDGETS_FILE, 'utf8'))
  } catch {
    return []
  }
}

function savePinnedWidgets(list) {
  try { fs.writeFileSync(PINNED_WIDGETS_FILE, JSON.stringify(list), 'utf8') } catch { /* nicht kritisch */ }
}

// Jedes offene Fenster (Haupt- + alle Widget-Fenster) über eine geänderte
// Pin-Liste informieren, damit TileWrapper.tsx's "Pin to desktop"-Button
// überall sofort den richtigen aktiv/inaktiv-Zustand zeigt, nicht nur im
// Fenster, von dem die Änderung ausging.
function broadcastPinnedWidgets() {
  const list = loadPinnedWidgets().map(({ boardId, widgetId }) => ({ boardId, widgetId }))
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('widget:pinned-changed', list)
  }
}

async function createWidgetWindow(boardId, widgetId, bounds) {
  const key = `${boardId}:${widgetId}`
  const existing = widgetWindows.get(key)
  if (existing) { existing.focus(); return }

  const win = new BrowserWindow({
    width: bounds?.width ?? 320,
    height: bounds?.height ?? 240,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 120,
    minHeight: 90,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000', // explizit voll-transparent statt Electron-Default
    hasShadow: false,
    // On Windows/macOS this stays native-resizable — DWM/Cocoa give
    // frameless windows a working (invisible) resize border on their own.
    // On Linux this is handled entirely by hand instead (see
    // LinuxResizeEdges in widget/[boardId]/[widgetId]/page.tsx +
    // widget:resize-move below) — confirmed via ground-truth compositor
    // geometry (KWin's own scripting interface, independent of Electron's
    // self-reported getBounds/setBounds, which turned out to be unreliable
    // here) that (a) BrowserWindow.setBounds()/setPosition() can never
    // change a window's POSITION on this Wayland session, only its size —
    // not a KWin quirk, Wayland's xdg_toplevel protocol has no "set
    // position" request for a client to make, ever, for any window — and
    // (b) KWin, unlike Windows' DWM, does not provide any native resize
    // affordance for undecorated (frame:false) windows either (confirmed:
    // no resize cursor appears on hover with resizable:true and no custom
    // handles in the way). With no way to move the window at all, the only
    // thing that can genuinely work is resizing from a FIXED top-left
    // origin — width/height change, x/y never do, on every edge alike.
    resizable: process.platform !== 'linux',
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  // Registered immediately (synchronously, right after the window itself is
  // created) rather than after the `await`s below — a real race otherwise:
  // `new BrowserWindow()` is synchronous, so two pin calls for the same
  // widget arriving close together (confirmed live: a flaky repeated click
  // during testing fired this function 3x for one widget before the first
  // call had reached this point) would both see the Map empty and each
  // create their own real OS window before either finished loading.
  widgetWindows.set(key, win)
  applyDesktopWidgetPlacement(win)
  win.once('ready-to-show', () => win.show())

  const url = await resolveServerUrl()
  await win.loadURL(`${url}/widget/${boardId}/${widgetId}`)

  win.on('closed', () => {
    widgetWindows.delete(key)
    // Das eigene Schließen des Fensters (per Unpin-Button in der Titelzeile
    // ODER per OS-Fenstersteuerung) IST das Unpinnen — es gibt bewusst keinen
    // dritten Zustand "geschlossen, aber noch angepinnt, erscheint beim
    // nächsten Start wieder". Einfacher; ein reines "Verstecken ohne Unpin"
    // wäre eine denkbare spätere Ergänzung, nicht Teil von v1.
    const stillPinned = loadPinnedWidgets().some(w => w.boardId === boardId && w.widgetId === widgetId)
    if (stillPinned) {
      savePinnedWidgets(loadPinnedWidgets().filter(w => !(w.boardId === boardId && w.widgetId === widgetId)))
      broadcastPinnedWidgets()
    }
  })

  let boundsSaveTimer = null
  const saveBounds = () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer)
    boundsSaveTimer = setTimeout(() => {
      const list = loadPinnedWidgets()
      const entry = list.find(w => w.boardId === boardId && w.widgetId === widgetId)
      if (entry) { entry.bounds = win.getBounds(); savePinnedWidgets(list) }
    }, 400)
  }
  win.on('moved', saveBounds)
  win.on('resized', saveBounds)
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

// ── Linux: AppImage in den Anwendungsstarter einbinden ──────────────────────
// .deb-Installationen bekommen einen Menüeintrag + Icon automatisch von dpkg
// (das Paket bringt sein eigenes .desktop-File mit) — die portable AppImage
// dagegen ist nur eine einzelne Datei ohne jede Desktop-Integration: ohne
// dies bliebe mosaic dort für immer "eine Datei, die man im Terminal
// startet" statt einer im Anwendungsmenü auffindbaren, normal anklickbaren
// App. Schreibt beim ersten Start einmalig ein .desktop-File + Icon-Kopie
// nach ~/.local/share — von GNOME/KDE/XFCE/... automatisch erkannt, kein
// zusätzliches Werkzeug (z. B. AppImageLauncher) nötig.
function ensureLinuxDesktopIntegration() {
  if (process.platform !== 'linux' || !process.env.APPIMAGE) return
  try {
    const appsDir  = path.join(os.homedir(), '.local', 'share', 'applications')
    const iconsDir = path.join(os.homedir(), '.local', 'share', 'icons')
    fs.mkdirSync(appsDir, { recursive: true })
    fs.mkdirSync(iconsDir, { recursive: true })

    const iconDest = path.join(iconsDir, 'mosaic.png')
    fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), iconDest)

    const desktopFile = path.join(appsDir, 'mosaic.desktop')
    const content = `[Desktop Entry]\nType=Application\nName=mosaic\nComment=A local-first, widget-based personal dashboard\nExec="${process.env.APPIMAGE}"\nIcon=${iconDest}\nCategories=Office;\nTerminal=false\n`
    fs.writeFileSync(desktopFile, content, 'utf8')
  } catch (err) {
    console.error('[mosaic] Linux desktop integration failed:', err)
  }
}

// ── IPC-Brücke (s. preload.js) ──────────────────────────────────────────────
ipcMain.handle('desktop:set-launch-at-login', (_e, enabled) => {
  try { setLaunchAtLogin(!!enabled) } catch (err) { console.error('[mosaic] setLaunchAtLogin failed:', err) }
})
ipcMain.handle('desktop:set-keep-in-background', (_e, enabled) => {
  keepInBackground = !!enabled
})
ipcMain.handle('desktop:set-auto-update-enabled', (_e, enabled) => {
  autoUpdateEnabled = !!enabled
})
// In-app color picker (s. ColorSwatch.tsx): captures ONLY this window's own
// rendered content, not the screen or any other app — entirely in-process,
// no OS permission dialog, no portal/PipeWire negotiation of any kind. This
// replaces the Web EyeDropper API on desktop, which picks from the whole
// screen and (s. the earlier WebRTCPipeWireCapturer fix, which did not fully
// resolve it either) depends on Wayland screen-capture plumbing that isn't
// reliable on every compositor. toDataURL() runs off the main thread inside
// Chromium, cheap enough to call on every pick.
ipcMain.handle('window:capture-page', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const image = await win.webContents.capturePage()
  return { dataUrl: image.toDataURL(), size: image.getSize() }
})
ipcMain.handle('update:install', () => {
  // isQuitting muss hier NICHT gesetzt werden — quitAndInstall() beendet die
  // App direkt selbst und startet die neue Version, umgeht also ohnehin den
  // normalen close-Handler (Hintergrundbetrieb).
  const { autoUpdater } = require('electron-updater')
  autoUpdater.quitAndInstall()
})
ipcMain.handle('update:check', () => checkForUpdates(true))

ipcMain.handle('widget:pin', async (_e, { boardId, widgetId, bounds }) => {
  const list = loadPinnedWidgets()
  if (!list.some(w => w.boardId === boardId && w.widgetId === widgetId)) {
    list.push({ boardId, widgetId, bounds: bounds ?? null })
    savePinnedWidgets(list)
  }
  await createWidgetWindow(boardId, widgetId, bounds)
  broadcastPinnedWidgets()
})
ipcMain.handle('widget:unpin', (_e, { boardId, widgetId }) => {
  const key = `${boardId}:${widgetId}`
  // Schließt das Fenster — dessen eigener 'closed'-Handler (s.
  // createWidgetWindow) räumt die Pin-Liste auf und broadcastet erneut, also
  // hier nicht doppelt tun.
  widgetWindows.get(key)?.close()
})
ipcMain.handle('widget:list-pinned', () => loadPinnedWidgets().map(({ boardId, widgetId }) => ({ boardId, widgetId })))

// Manual resize for pinned widget windows on Linux (s. resizable:false above
// for why) — width/height only, from a fixed top-left origin. x/y are never
// touched: proven (via KWin's own scripting interface, ground truth
// independent of Electron's self-reported bounds) that this compositor
// cannot reposition a window via any client API at all, so every edge
// resizes the same way east/south already correctly do — dragging the
// west/north handles grows/shrinks the SAME width/height east/south control,
// just triggered from the opposite side, rather than tracking the cursor on
// that side (which would require moving x/y, which is impossible here).
// `send`/`on` rather than `invoke`/`handle`: fires on every mousemove during
// a drag, a fire-and-forget stream of deltas, not a request/response pair.
ipcMain.on('widget:resize-move', (event, { edge, dx, dy }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const minW = 120, minH = 90
  const { x, y, width, height } = win.getBounds()
  const newWidth  = (edge.includes('e') || edge.includes('w')) ? Math.max(minW, width + dx) : width
  const newHeight = (edge.includes('n') || edge.includes('s')) ? Math.max(minH, height + dy) : height
  win.setBounds({ x, y, width: newWidth, height: newHeight })
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
  }, {
    // Nicht sichtbar (keine Menüleiste im Fenster), aber auf macOS PFLICHT:
    // Cmd+C/V/X/A/Z laufen dort über die NSMenu-Tastenkürzel dieser Rollen zum
    // fokussierten Element durch — ohne dieses Menü tut Cmd+V in JEDEM Textfeld
    // der App schlicht gar nichts, unabhängig vom Fokus. Windows/Linux brauchen
    // das nicht (dort gehen Tastatur-Events direkt ans DOM), daher isMac-Gate.
    label: 'Edit',
    submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' },
    ],
  }]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Auto-Update über GitHub Releases ─────────────────────────────────────────
// electron-updater liest das von electron-builder generierte app-update.yml
// (aus der "publish"-Konfig in package.json) und vergleicht gegen die neueste
// GitHub-Release. Läuft nur in gepackten Builds — im Dev-Modus gibt es weder
// die App-Update-Metadaten noch eine sinnvolle Update-Quelle.
//
// Statt der eingebauten OS-Benachrichtigung (checkForUpdatesAndNotify) zeigt
// mosaic ein eigenes In-App-Popup mit Änderungen + Update-Button (s.
// UpdateAvailablePopup.tsx) — das erfordert, erst NACH dem vollständigen
// Download zu benachrichtigen (nicht schon bei "verfügbar"), damit ein Klick
// auf "Update" sofort per quitAndInstall() greift, ohne erst noch warten zu
// müssen.
function notifyRendererOfUpdate(info) {
  if (!mainWindow) return
  mainWindow.webContents.send('update:downloaded', {
    version: info.version,
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
    releaseUrl: `https://github.com/Aetherion7/mosaic/releases/tag/v${info.version}`,
  })
}

// `manual`: true for an explicit user-triggered check (Settings button, Mac
// menu) — always runs, regardless of the auto-update setting. A `false`
// (startup) call is skipped entirely if the user turned auto-update off, so
// disabling it actually stops mosaic from silently downloading updates
// rather than just hiding the notification.
function sendUpdateStatus(status) {
  mainWindow?.webContents.send('update:status', { status })
}

function checkForUpdates(manual = false) {
  if (isDev) {
    if (manual) console.log('[mosaic] Auto-update is disabled in development.')
    return
  }
  if (!manual && !autoUpdateEnabled) {
    console.log('[mosaic] Skipping startup update check — auto-update is disabled.')
    return
  }
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  if (!updateListenersAttached) {
    updateListenersAttached = true
    autoUpdater.on('update-downloaded', notifyRendererOfUpdate)
    autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'))
    autoUpdater.on('error', err => {
      console.error('[mosaic] Update error:', err)
      sendUpdateStatus('error')
    })
  }
  if (manual) sendUpdateStatus('checking')
  autoUpdater.checkForUpdates().catch(err => {
    console.error('[mosaic] Update check failed:', err)
    sendUpdateStatus('error')
  })
}

app.whenReady().then(async () => {
  buildMenu()
  ensureLinuxDesktopIntegration()
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

  // Zuvor angepinnte Desktop-Widgets wiederherstellen, unabhängig davon, ob/
  // wann der Renderer seinen boardStore aus IndexedDB fertig hydriert hat —
  // die Pin-Liste kommt aus der eigenen Datei (s. loadPinnedWidgets), nicht
  // aus dem Renderer-Store.
  for (const { boardId, widgetId, bounds } of loadPinnedWidgets()) {
    createWidgetWindow(boardId, widgetId, bounds).catch(err =>
      console.error(`[mosaic] Failed to reopen pinned widget ${boardId}:${widgetId}:`, err))
  }

  app.on('activate', () => {
    // Bewusst NICHT mehr an BrowserWindow.getAllWindows().length === 0
    // geprüft: das ist bereits falsch, sobald irgendein Widget-Fenster
    // offen ist, auch wenn mainWindow null ist — der Klick aufs Dock-Icon
    // täte dann nichts, obwohl kein Hauptfenster sichtbar ist.
    if (!mainWindow) createWindow()
    else if (!mainWindow.isVisible()) { mainWindow.show(); hideTray() }
  })
})

app.on('window-all-closed', () => {
  // Feuert von Electron aus nur, wenn WIRKLICH jedes Fenster zu ist (Haupt-
  // UND alle Widget-Fenster) — genau das gewünschte Verhalten (Rainmeter-
  // artige Widgets überleben unabhängig vom Hauptfenster), daher hier kein
  // zusätzlicher Widget-Fenster-Check nötig.
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
  // Sauberer Exit — kein Waisenprozess zu reapen, also die PID-Datei mit
  // aufräumen, damit sie beim nächsten Start nicht auf einen längst toten
  // (und ggf. von einem völlig anderen Prozess neu vergebenen) PID zeigt.
  try { fs.unlinkSync(SERVER_PID_FILE) } catch { /* Datei existiert nicht — ok */ }
})
