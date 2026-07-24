import type { Metadata } from 'next'
import { Inter, Roboto, Poppins, Space_Grotesk, Merriweather, Lora, Fira_Code } from 'next/font/google'
import MotionProvider from '@/components/MotionProvider'
import CustomFontLoader from '@/components/CustomFontLoader'
import StorageErrorBanner from '@/components/ui/StorageErrorBanner'
import './globals.css'

// Alle wählbaren Programm-/Board-Schriften (Einstellungen → Erscheinungsbild,
// s. src/lib/fonts.ts) — next/font/google hostet sie selbst mit, keine
// Laufzeit-Requests an Google (passend zum local-first-Ansatz).
const inter         = Inter        ({ subsets: ['latin'], variable: '--font-inter' })
const roboto        = Roboto       ({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' })
const poppins       = Poppins      ({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins' })
const spaceGrotesk   = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })
const merriweather   = Merriweather ({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-merriweather' })
const lora           = Lora         ({ subsets: ['latin'], variable: '--font-lora' })
const firaCode       = Fira_Code    ({ subsets: ['latin'], variable: '--font-fira-code' })

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
      </body>
    </html>
  )
}
