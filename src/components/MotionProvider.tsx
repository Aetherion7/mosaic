'use client'
import { useEffect } from 'react'
import { MotionConfig, MotionGlobalConfig } from 'framer-motion'
import { useSettings } from '@/store/settingsStore'
import { getFontStack } from '@/lib/fonts'

// Setzt die Animations-Einstellung global und vollständig durch:
// 1. MotionGlobalConfig.skipAnimations — überspringt ALLE framer-motion-
//    Animationen (auch Opacity-Fades und explizite Springs), Zielwerte
//    werden sofort gesetzt.
// 2. reducedMotion="always" — zusätzliche Absicherung für Transform/Layout.
// 3. data-no-anim am <html> — globals.css tötet damit sämtliche
//    CSS-Transitions und Keyframe-Animationen (inkl. ::before/::after,
//    also auch den KI-Rahmen, Puls-Ringe und Spinner).
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  const animations  = useSettings(s => s.animations)
  const programFont = useSettings(s => s.programFont)
  const customFonts = useSettings(s => s.customFonts)
  useEffect(() => {
    MotionGlobalConfig.skipAnimations = !animations
    document.documentElement.toggleAttribute('data-no-anim', !animations)
  }, [animations])
  // --font-app treibt die gesamte Oberfläche an (Startseite, Einstellungen,
  // sowie jedes Board ohne eigene Board-Schrift, s. board/[id]/page.tsx).
  useEffect(() => {
    document.documentElement.style.setProperty('--font-app', getFontStack(programFont, customFonts))
  }, [programFont, customFonts])
  return (
    <MotionConfig reducedMotion={animations ? 'never' : 'always'}>
      {children}
    </MotionConfig>
  )
}
