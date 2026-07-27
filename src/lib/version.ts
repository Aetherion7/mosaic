// Zentraler Versions-String für die UI (z. B. UeberPanel.tsx) — direkt aus
// package.json gelesen, damit er nie manuell nachgezogen werden muss und nie
// wieder hinter einem Versions-Bump zurückbleiben kann.
import packageJson from '../../package.json'

export const APP_VERSION = packageJson.version
