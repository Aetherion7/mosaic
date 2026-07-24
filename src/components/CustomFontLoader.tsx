'use client'
import { useEffect, useRef } from 'react'
import { useSettings } from '@/store/settingsStore'
import { getBlob } from '@/lib/blobStore'
import { customFontFamily } from '@/lib/fonts'

// Registriert jede eigene, hochgeladene Schriftart (Einstellungen →
// Erscheinungsbild → Schrift) als echte @font-face über die FontFace-API,
// sobald ihre Datei aus dem blobStore (IndexedDB) geladen ist. Läuft einmal
// pro Font-ID — schon geladene werden bei erneutem Rendern übersprungen.
export default function CustomFontLoader() {
  const customFonts = useSettings(s => s.customFonts)
  const loaded = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    for (const font of customFonts) {
      if (loaded.current.has(font.id)) continue
      loaded.current.add(font.id)
      getBlob(font.blobRef).then(async blob => {
        if (cancelled || !blob) return
        const url = URL.createObjectURL(blob)
        try {
          const face = new FontFace(customFontFamily(font.id), `url(${url})`)
          await face.load()
          URL.revokeObjectURL(url)
          if (cancelled) return
          document.fonts.add(face)
        } catch {
          // Ungültige/kaputte Font-Datei — einfach überspringen, kein Absturz
          loaded.current.delete(font.id)
        }
      }).catch(() => { loaded.current.delete(font.id) })
    }
    return () => { cancelled = true }
  }, [customFonts])

  return null
}
