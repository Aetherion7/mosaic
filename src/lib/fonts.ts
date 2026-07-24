// Auswählbare Schriften für Programm- und Board-Schrift (Einstellungen →
// Erscheinungsbild). Jede Google-Schrift wird über next/font/google in
// layout.tsx selbst gehostet (kein Laufzeit-Request) und über eine CSS-
// Variable referenziert; „System" braucht keine Variable.
export interface FontOption {
  id:    string
  label: string
  stack: string
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'inter',        label: 'Inter',          stack: 'var(--font-inter), system-ui, sans-serif' },
  { id: 'system',       label: 'System UI',      stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' },
  { id: 'roboto',       label: 'Roboto',         stack: 'var(--font-roboto), system-ui, sans-serif' },
  { id: 'poppins',      label: 'Poppins',        stack: 'var(--font-poppins), system-ui, sans-serif' },
  { id: 'spaceGrotesk', label: 'Space Grotesk',  stack: 'var(--font-space-grotesk), system-ui, sans-serif' },
  { id: 'merriweather', label: 'Merriweather',   stack: 'var(--font-merriweather), Georgia, serif' },
  { id: 'lora',         label: 'Lora',           stack: 'var(--font-lora), Georgia, serif' },
  { id: 'firaCode',     label: 'Fira Code',      stack: 'var(--font-fira-code), ui-monospace, monospace' },
]

// Eigene Schriften (Einstellungen → Erscheinungsbild → Schrift → Eigene
// Schrift hinzufügen) werden nicht in FONT_OPTIONS geführt — ihre Bytes
// liegen im blobStore, geladen von CustomFontLoader über die FontFace-API
// unter diesem Familiennamen (id eingebettet, damit jede eindeutig ist).
export function customFontFamily(id: string): string {
  return `mosaic-custom-${id}`
}
export function customFontStack(id: string): string {
  return `"${customFontFamily(id)}", system-ui, sans-serif`
}

export function getFontStack(id: string | null | undefined, customFonts: { id: string }[] = []): string {
  const builtin = FONT_OPTIONS.find(f => f.id === id)
  if (builtin) return builtin.stack
  if (id && customFonts.some(f => f.id === id)) return customFontStack(id)
  return FONT_OPTIONS[0].stack
}
