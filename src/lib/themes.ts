import type { ThemePreset, BoardBg, WidgetStyle } from '@/types'
import { useSettings, type CustomTheme } from '@/store/settingsStore'

export const THEMES: ThemePreset[] = [
  {
    id: 'dark', name: 'Deep Space',
    cssVars: {
      '--bg':       '#09090f',
      '--surface':  '#12131e',
      '--surface2': '#191a2c',
      '--surface3': '#21223a',
      '--border':   '#2c2d4a',
      '--accent':   '#7c6fe8',
      '--accent2':  '#4ecdc4',
      '--text1':    '#edeaf8',
      '--text2':    '#8986a8',
      '--text3':    '#6b6990',
      '--danger':   '#f87171',
      '--success':  '#4ade80',
      '--amber':    '#fbbf24',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#09090f', pattern: 'dots', patternColor: '#ffffff', patternOpacity: 0.15 },
    widgetStyle: { bgColor: '#12131e', borderColor: '#2c2d4a', borderWidth: 1, borderRadius: 16, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'glass', name: 'Crystal Glass',
    cssVars: {
      '--bg':       '#0b0c11',
      '--surface':  'rgba(255,255,255,0.055)',
      '--surface2': 'rgba(255,255,255,0.10)',
      '--surface3': 'rgba(255,255,255,0.16)',
      '--border':   'rgba(255,255,255,0.14)',
      '--accent':   '#7a9ab8',
      '--accent2':  '#a4bece',
      '--text1':    '#f0f4f8',
      '--text2':    'rgba(255,255,255,0.62)',
      '--text3':    'rgba(255,255,255,0.38)',
      '--danger':   '#f87171',
      '--success':  '#4ade80',
      '--amber':    '#fbbf24',
      '--shadow-color': '#000000',
      // Eigene, fast deckende Farbe statt var(--surface3) (dort nur 16%
      // deckend) — Popover/Dropdowns brauchen echte Lesbarkeit, das ist ein
      // anderer Anwendungsfall als die bewusst durchscheinenden Widget-Flächen.
      // Bleibt dank backdropFilter:blur() trotzdem als "Glas" erkennbar.
      '--popover-bg':   'rgba(16, 18, 24, 0.86)',
    },
    bg: { type: 'gradient', gradient: ['#0b0c11', '#0f141e'], gradientDir: 'to-br', pattern: 'dots', patternColor: '#ffffff', patternOpacity: 0.025 },
    widgetStyle: { bgColor: 'rgba(255,255,255,0.055)', blur: 22, borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderRadius: 20, shadow: 'lg', opacity: 0.92, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'cyber', name: 'Cyberpunk',
    cssVars: {
      '--bg':       '#040410',
      '--surface':  '#07071a',
      '--surface2': '#0c0c26',
      '--surface3': '#111132',
      '--border':   '#1e1e60',
      '--accent':   '#f5e642',
      '--accent2':  '#ff3eb5',
      '--text1':    '#e8e8ff',
      '--text2':    '#6868b0',
      '--text3':    '#5252a8',
      '--danger':   '#ff3355',
      '--success':  '#00ff88',
      '--amber':    '#ffcc00',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#040410', pattern: 'grid', patternColor: '#4040ff', patternOpacity: 0.05 },
    widgetStyle: { bgColor: '#07071a', borderColor: '#f5e642', borderWidth: 1, borderRadius: 4, shadow: 'lg', glowColor: '#f5e642', glowSize: 6, blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br' },
  },
  {
    id: 'nature', name: 'Forest',
    cssVars: {
      '--bg':       '#060e06',
      '--surface':  '#0d1a0d',
      '--surface2': '#132213',
      '--surface3': '#192a19',
      '--border':   '#223322',
      '--accent':   '#3ddd82',
      '--accent2':  '#5effd4',
      '--text1':    '#e2f5e8',
      '--text2':    '#72b882',
      '--text3':    '#4e804e',
      '--danger':   '#f87171',
      '--success':  '#4ade80',
      '--amber':    '#fbbf24',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#060e06', pattern: 'dots', patternColor: '#3ddd82', patternOpacity: 0.04 },
    widgetStyle: { bgColor: '#0d1a0d', borderColor: '#223322', borderWidth: 1, borderRadius: 14, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'neon', name: 'Neon Tokyo',
    cssVars: {
      '--bg':       '#060612',
      '--surface':  '#0b0b20',
      '--surface2': '#10102c',
      '--surface3': '#161638',
      '--border':   'rgba(190,0,255,0.22)',
      '--accent':   '#c200ff',
      '--accent2':  '#00f0ff',
      '--text1':    '#f0e8ff',
      '--text2':    '#9055cc',
      '--text3':    '#7040aa',
      '--danger':   '#ff1744',
      '--success':  '#00e5ff',
      '--amber':    '#ffea00',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#060612', pattern: 'grid', patternColor: '#c200ff', patternOpacity: 0.03 },
    widgetStyle: { bgColor: '#0b0b20', borderColor: '#c200ff', borderWidth: 1, borderRadius: 10, shadow: 'lg', glowColor: '#c200ff', glowSize: 8, blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br' },
  },
  {
    id: 'aurora', name: 'Aurora',
    cssVars: {
      '--bg':       '#070e12',
      '--surface':  '#0c1a1e',
      '--surface2': '#112428',
      '--surface3': '#172e30',
      '--border':   '#1e4042',
      '--accent':   '#00d4a0',
      '--accent2':  '#8b5cf6',
      '--text1':    '#d0f2ec',
      '--text2':    '#52b8a8',
      '--text3':    '#307a68',
      '--danger':   '#f87171',
      '--success':  '#34d399',
      '--amber':    '#fbbf24',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'gradient', gradient: ['#070e12', '#0d1426'], gradientDir: 'to-br', pattern: 'none' },
    widgetStyle: { bgColor: '#0c1a1e', borderColor: '#1e4042', borderWidth: 1, borderRadius: 16, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'sunset', name: 'Sunset',
    cssVars: {
      '--bg':       '#140804',
      '--surface':  '#1e0e08',
      '--surface2': '#2a140c',
      '--surface3': '#351a12',
      '--border':   '#4a2416',
      '--accent':   '#ff7043',
      '--accent2':  '#ff4081',
      '--text1':    '#fff0e4',
      '--text2':    '#cc7854',
      '--text3':    '#986050',
      '--danger':   '#f44336',
      '--success':  '#69f0ae',
      '--amber':    '#ffd740',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'gradient', gradient: ['#140804', '#1e0814'], gradientDir: 'to-br', pattern: 'none' },
    widgetStyle: { bgColor: '#1e0e08', borderColor: '#4a2416', borderWidth: 1, borderRadius: 14, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'ocean', name: 'Deep Ocean',
    cssVars: {
      '--bg':       '#02050e',
      '--surface':  '#040c1e',
      '--surface2': '#07132e',
      '--surface3': '#0a1a3e',
      '--border':   '#0e2452',
      '--accent':   '#2196f3',
      '--accent2':  '#00e5ff',
      '--text1':    '#dff0ff',
      '--text2':    '#4a96cc',
      '--text3':    '#2e6090',
      '--danger':   '#f87171',
      '--success':  '#00e5a0',
      '--amber':    '#fbbf24',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'gradient', gradient: ['#02050e', '#020c1e'], gradientDir: 'to-b', pattern: 'dots', patternColor: '#2196f3', patternOpacity: 0.04 },
    widgetStyle: { bgColor: '#040c1e', borderColor: '#0e2452', borderWidth: 1, borderRadius: 14, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'rose', name: 'Rose Quartz',
    cssVars: {
      '--bg':       '#12060c',
      '--surface':  '#1c0c14',
      '--surface2': '#261220',
      '--surface3': '#30182a',
      '--border':   '#461e34',
      '--accent':   '#e91e63',
      '--accent2':  '#ff80ab',
      '--text1':    '#fce4ec',
      '--text2':    '#cc6e88',
      '--text3':    '#9a4e68',
      '--danger':   '#ff1744',
      '--success':  '#69f0ae',
      '--amber':    '#ffd740',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'gradient', gradient: ['#12060c', '#18061a'], gradientDir: 'to-br', pattern: 'none' },
    widgetStyle: { bgColor: '#1c0c14', borderColor: '#461e34', borderWidth: 1, borderRadius: 16, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'nordic', name: 'Nordic',
    cssVars: {
      '--bg':       '#0c1117',
      '--surface':  '#141c24',
      '--surface2': '#1c2630',
      '--surface3': '#24303c',
      '--border':   '#2e3e4a',
      '--accent':   '#5e9cee',
      '--accent2':  '#7dd4d4',
      '--text1':    '#d8e4f0',
      '--text2':    '#7a9ab0',
      '--text3':    '#5e7a8e',
      '--danger':   '#bf616a',
      '--success':  '#a3be8c',
      '--amber':    '#ebcb8b',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#0c1117', pattern: 'dots', patternColor: '#ffffff', patternOpacity: 0.025 },
    widgetStyle: { bgColor: '#141c24', borderColor: '#2e3e4a', borderWidth: 1, borderRadius: 12, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'carbon', name: 'Carbon',
    cssVars: {
      '--bg':       '#080808',
      '--surface':  '#111111',
      '--surface2': '#1a1a1a',
      '--surface3': '#222222',
      '--border':   '#2e2e2e',
      '--accent':   '#ff6b35',
      '--accent2':  '#ffd700',
      '--text1':    '#f5f5f5',
      '--text2':    '#888888',
      '--text3':    '#707070',
      '--danger':   '#ff4444',
      '--success':  '#44ff88',
      '--amber':    '#ffcc00',
      '--shadow-color': '#000000',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#080808', pattern: 'grid', patternColor: '#ffffff', patternOpacity: 0.03 },
    widgetStyle: { bgColor: '#111111', borderColor: '#2e2e2e', borderWidth: 1, borderRadius: 8, shadow: 'md', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  // ── Light themes ──────────────────────────────────────────────────────────
  {
    id: 'light', name: 'Soft Light',
    cssVars: {
      '--bg':       '#f0f2f8',
      '--surface':  '#ffffff',
      '--surface2': '#f6f7fb',
      '--surface3': '#eef0f8',
      '--border':   '#dde0ef',
      '--accent':   '#5d5fef',
      '--accent2':  '#06b6d4',
      '--text1':    '#1a1b2e',
      '--text2':    '#595a76',
      '--text3':    '#9292b0',
      '--danger':   '#ef4444',
      '--success':  '#22c55e',
      '--amber':    '#f59e0b',
      '--shadow-color': 'rgba(70, 65, 110, 0.30)',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#f0f2f8', pattern: 'dots', patternColor: '#000000', patternOpacity: 0.04 },
    widgetStyle: { bgColor: '#ffffff', borderColor: '#dde0ef', borderWidth: 1, borderRadius: 14, shadow: 'sm', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'paper', name: 'Paper',
    cssVars: {
      '--bg':       '#faf6f0',
      '--surface':  '#fffdf8',
      '--surface2': '#f5ede0',
      '--surface3': '#ece0cc',
      '--border':   '#ddd0ba',
      '--accent':   '#c2621a',
      '--accent2':  '#6b8f62',
      '--text1':    '#2c1c0a',
      '--text2':    '#7a5a32',
      '--text3':    '#b89870',
      '--danger':   '#c0392b',
      '--success':  '#27ae60',
      '--amber':    '#e67e22',
      '--shadow-color': 'rgba(70, 65, 110, 0.30)',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#faf6f0', pattern: 'dots', patternColor: '#000000', patternOpacity: 0.03 },
    widgetStyle: { bgColor: '#fffdf8', borderColor: '#ddd0ba', borderWidth: 1, borderRadius: 10, shadow: 'sm', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'arctic', name: 'Arctic',
    cssVars: {
      '--bg':       '#f2f5fc',
      '--surface':  '#ffffff',
      '--surface2': '#eaeff8',
      '--surface3': '#dde4f4',
      '--border':   '#c8d3ea',
      '--accent':   '#2563eb',
      '--accent2':  '#0891b2',
      '--text1':    '#0c1629',
      '--text2':    '#3d4e72',
      '--text3':    '#8898bc',
      '--danger':   '#dc2626',
      '--success':  '#16a34a',
      '--amber':    '#d97706',
      '--shadow-color': 'rgba(70, 65, 110, 0.30)',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#f2f5fc', pattern: 'dots', patternColor: '#2563eb', patternOpacity: 0.04 },
    widgetStyle: { bgColor: '#ffffff', borderColor: '#c8d3ea', borderWidth: 1, borderRadius: 14, shadow: 'sm', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'blossom', name: 'Blossom',
    cssVars: {
      '--bg':       '#fdf4f2',
      '--surface':  '#ffffff',
      '--surface2': '#fce8e4',
      '--surface3': '#f8d8d2',
      '--border':   '#f0c4bc',
      '--accent':   '#e05252',
      '--accent2':  '#e8914a',
      '--text1':    '#2c0c0a',
      '--text2':    '#8a4038',
      '--text3':    '#c8887e',
      '--danger':   '#b91c1c',
      '--success':  '#15803d',
      '--amber':    '#b45309',
      '--shadow-color': 'rgba(70, 65, 110, 0.30)',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#fdf4f2', pattern: 'none', patternColor: '#e05252', patternOpacity: 0.04 },
    widgetStyle: { bgColor: '#ffffff', borderColor: '#f0c4bc', borderWidth: 1, borderRadius: 16, shadow: 'sm', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'mint', name: 'Mint',
    cssVars: {
      '--bg':       '#f0faf5',
      '--surface':  '#ffffff',
      '--surface2': '#e4f5ec',
      '--surface3': '#d0ecda',
      '--border':   '#b8e0c6',
      '--accent':   '#059669',
      '--accent2':  '#0284c7',
      '--text1':    '#042c18',
      '--text2':    '#2a6646',
      '--text3':    '#72aa88',
      '--danger':   '#dc2626',
      '--success':  '#16a34a',
      '--amber':    '#d97706',
      '--shadow-color': 'rgba(70, 65, 110, 0.30)',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#f0faf5', pattern: 'dots', patternColor: '#059669', patternOpacity: 0.04 },
    widgetStyle: { bgColor: '#ffffff', borderColor: '#b8e0c6', borderWidth: 1, borderRadius: 14, shadow: 'sm', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'lavender', name: 'Lavender',
    cssVars: {
      '--bg':       '#f5f0fc',
      '--surface':  '#ffffff',
      '--surface2': '#ede6f8',
      '--surface3': '#e0d4f2',
      '--border':   '#cfc0ea',
      '--accent':   '#7c3aed',
      '--accent2':  '#db2777',
      '--text1':    '#1a0830',
      '--text2':    '#5a3880',
      '--text3':    '#9a78be',
      '--danger':   '#be123c',
      '--success':  '#15803d',
      '--amber':    '#a16207',
      '--shadow-color': 'rgba(70, 65, 110, 0.30)',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'color', color: '#f5f0fc', pattern: 'dots', patternColor: '#7c3aed', patternOpacity: 0.04 },
    widgetStyle: { bgColor: '#ffffff', borderColor: '#cfc0ea', borderWidth: 1, borderRadius: 16, shadow: 'sm', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
  {
    id: 'sand', name: 'Sand',
    cssVars: {
      '--bg':       '#faf8f0',
      '--surface':  '#ffffff',
      '--surface2': '#f4f0e2',
      '--surface3': '#ece6ce',
      '--border':   '#ddd4b0',
      '--accent':   '#a16207',
      '--accent2':  '#057a6b',
      '--text1':    '#1c1408',
      '--text2':    '#786028',
      '--text3':    '#b8a060',
      '--danger':   '#b91c1c',
      '--success':  '#15803d',
      '--amber':    '#b45309',
      '--shadow-color': 'rgba(70, 65, 110, 0.30)',
      '--popover-bg':   'var(--surface)',
    },
    bg: { type: 'gradient', gradient: ['#faf8f0', '#f0ead8'], gradientDir: 'to-br', pattern: 'none' },
    widgetStyle: { bgColor: '#ffffff', borderColor: '#ddd4b0', borderWidth: 1, borderRadius: 12, shadow: 'sm', blur: 0, opacity: 1, gradient: null, gradientDir: 'to-br', glowColor: null, glowSize: 0 },
  },
]

export const LIGHT_THEME_IDS = ['light', 'paper', 'arctic', 'blossom', 'mint', 'lavender', 'sand']

export const DEFAULT_THEME = THEMES[0]

// Aufgelöstes Theme — wie ThemePreset, aber mit freier ID (Custom-Themes)
export interface ResolvedTheme {
  id:          string
  name:        string
  cssVars:     Record<string, string>
  bg?:         Partial<BoardBg>
  widgetStyle?: Partial<WidgetStyle>
}

// Nutzer-Theme → vollständiges Theme: fehlende cssVars kommen vom Default,
// damit Teil-Definitionen ("nur Akzent + Hintergrund") funktionieren.
//
// bg/widgetStyle müssen hier ebenfalls VOLLSTÄNDIG aufgefüllt werden, nicht
// nur mit einem Teilobjekt ersetzt werden — applyTheme() in boardStore.ts
// mischt sie nur per Shallow-Merge in den bisherigen Board-Zustand
// (`{...b.bg, ...theme.bg}`), genau wie bei den eingebauten Themes, deren
// bg/widgetStyle immer komplett sind. Ein Custom-Theme, das nur "name" +
// "cssVars" angibt (dokumentiertes Minimum), lieferte hier bisher gar kein
// `widgetStyle` und nur eine einzelne Farbe für `bg` — der Merge ließ dann
// Felder wie `type` (z. B. noch "image" vom vorherigen Theme) unverändert
// stehen, wodurch Board-Hintergrund UND Widget-Stil beim Wechsel zu einem
// Custom-Theme sichtbar beim vorherigen Theme hängen blieben, während ein
// Wechsel zwischen zwei eingebauten Themes immer alles vollständig ersetzte.
export function resolveCustomTheme(t: CustomTheme): ResolvedTheme {
  return {
    id:      t.id,
    name:    t.name,
    cssVars: { ...DEFAULT_THEME.cssVars, ...t.cssVars },
    bg:      t.bg
      ? { ...DEFAULT_THEME.bg, ...t.bg }
      : { ...DEFAULT_THEME.bg, type: 'color', color: t.cssVars['--bg'] ?? DEFAULT_THEME.cssVars['--bg'] },
    widgetStyle: { ...DEFAULT_THEME.widgetStyle, ...t.widgetStyle },
  }
}

// Findet ein Theme (eingebaut oder eigenes); undefined wenn unbekannt.
export function findTheme(id: string): ResolvedTheme | undefined {
  const builtin = THEMES.find(t => t.id === id)
  if (builtin) return builtin
  const custom = useSettings.getState().customThemes.find(t => t.id === id)
  return custom ? resolveCustomTheme(custom) : undefined
}

export function getTheme(id: string): ResolvedTheme {
  return findTheme(id) ?? DEFAULT_THEME
}
