import type { Metadata } from 'next'
import localFont from 'next/font/local'
import MotionProvider from '@/components/MotionProvider'
import CustomFontLoader from '@/components/CustomFontLoader'
import StorageErrorBanner from '@/components/ui/StorageErrorBanner'
import ReminderScheduler from '@/components/ReminderScheduler'
import ElectronBridge from '@/components/ElectronBridge'
import DesktopStartupPrompt from '@/components/ui/DesktopStartupPrompt'
import UpdateAvailablePopup from '@/components/ui/UpdateAvailablePopup'
import GlobalContextMenu from '@/components/ui/GlobalContextMenu'
import './globals.css'

// Alle wählbaren Programm-/Board-Schriften (Einstellungen → Erscheinungsbild,
// s. src/lib/fonts.ts) — Dateien liegen selbst im Repo (src/fonts/google/),
// statt sie über next/font/google bei jedem Build von Google herunterzuladen.
// next/font/google lädt zur BUILD-Zeit von fonts.gstatic.com, was in CI
// wiederholt an Netzwerk-/Rate-Limit-Problemen dort gescheitert ist (s.
// Commit-Historie) — next/font/local braucht dagegen gar keine
// Netzwerkverbindung mehr, passend zum ohnehin lokalen Anspruch der App.
// Die meisten dieser Familien sind variable Fonts (eine Datei deckt den
// ganzen Gewichtsbereich ab); nur Poppins hat auf Google Fonts keine
// Variable-Version und braucht darum vier einzelne statische Dateien.
const inter = localFont({
  src: '../fonts/google/inter-variable.woff2',
  variable: '--font-inter', display: 'swap',
})
const roboto = localFont({
  src: '../fonts/google/roboto-variable.woff2',
  variable: '--font-roboto', display: 'swap',
})
const poppins = localFont({
  src: [
    { path: '../fonts/google/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/google/poppins-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/google/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/google/poppins-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins', display: 'swap',
})
const spaceGrotesk = localFont({
  src: '../fonts/google/spacegrotesk-variable.woff2',
  variable: '--font-space-grotesk', display: 'swap',
})
const merriweather = localFont({
  src: '../fonts/google/merriweather-variable.woff2',
  variable: '--font-merriweather', display: 'swap',
})
const lora = localFont({
  src: '../fonts/google/lora-variable.woff2',
  variable: '--font-lora', display: 'swap',
})
const firaCode = localFont({
  src: '../fonts/google/firacode-variable.woff2',
  variable: '--font-fira-code', display: 'swap',
})

const fontVariables = `${inter.variable} ${roboto.variable} ${poppins.variable} ${spaceGrotesk.variable} ${merriweather.variable} ${lora.variable} ${firaCode.variable}`

export const metadata: Metadata = {
  title: 'mosaic',
  description: 'A local-first, widget-based personal dashboard — no account, no server, your data stays on your device.',
  icons: {
    icon:        '/mosaiclogo.png',
    apple:       '/mosaiclogo.png',
    shortcut:    '/mosaiclogo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${fontVariables} h-full`}>
      <body className="h-full overflow-hidden">
        <CustomFontLoader />
        <MotionProvider>{children}</MotionProvider>
        <StorageErrorBanner />
        <ReminderScheduler />
        <ElectronBridge />
        <DesktopStartupPrompt />
        <UpdateAvailablePopup />
        <GlobalContextMenu />
      </body>
    </html>
  )
}
