'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BoardBg, WidgetStyle, WidgetType } from '@/types'

export interface InstalledPlugin {
  id:       string
  name:     string
  icon:     string
  desc:     string
  version:  string
  author?:  string
  embedUrl?: string
}

// Eigenes Theme des Nutzers — wie ThemePreset, aber mit freier ID.
// Fehlende cssVars werden beim Anwenden vom Deep-Space-Default aufgefüllt.
export interface CustomTheme {
  id:           string
  name:         string
  cssVars:      Record<string, string>
  bg?:          Partial<BoardBg>
  widgetStyle?: Partial<WidgetStyle>
}

// Eigene Board-Vorlage: nur das Layout (Widget-Typen + Positionen), keine Inhalte.
// Wird über „Als Vorlage speichern" aus einem bestehenden Board erzeugt.
export interface CustomTemplate {
  id:      string
  name:    string
  widgets: { type: WidgetType; col: number; row: number; colSpan: number; rowSpan: number }[]
}

// Eigene, vom Nutzer hochgeladene Schriftart (Einstellungen → Erscheinungsbild
// → Schrift). Nur Metadaten + Blob-Referenz werden persistiert — die
// eigentliche Font-Datei liegt im blobStore (IndexedDB), s. CustomFontLoader.
export interface CustomFont {
  id:      string
  name:    string
  blobRef: string
}

export type AiProvider = 'anthropic' | 'openai' | 'gemini'

export interface AppSettings {
  showKbdHints:           boolean
  animations:             boolean
  compactHeader:          boolean
  headerStyle:            'default' | 'island'
  programFont:            string   // Schrift der gesamten Oberfläche (Startseite, Einstellungen, Boards ohne eigene Board-Schrift)
  disabledWidgetTypes:    string[]
  installedPlugins:       InstalledPlugin[]
  customThemes:           CustomTheme[]
  customTemplates:        CustomTemplate[]
  customFonts:            CustomFont[]
  calendarFadePastEvents: boolean
  statsDisabledTypes:     string[]  // Widget-Typen, deren Statistik-Bereich ausgeblendet ist (task/water/sleep)
  lastThemeId:            string | null
  defaultThemeId:         string   // Theme für neu erstellte Boards
  // Look der Board-Übersicht (Startseite) — unabhängig von den Themes der
  // einzelnen Boards. 'system' folgt prefers-color-scheme des Geräts live.
  homeThemeMode:          'dark' | 'light' | 'system'
  folders:                string[]                 // Existierende Ordner der Board-Übersicht (auch leere)
  folderColors:           Record<string, string>   // Ordnerfarben der Board-Übersicht (Name → Hex)
  hasSeenBackupWarning:   boolean
  hasSeenTutorial:        boolean
  hasSeenHomeTutorial:    boolean
  lastExportAt:           number | null
  language:               'de' | 'en'
  // ── KI-Assistent (BYOK — Schlüssel bleibt lokal, s. KONZEPT.md §15) ──
  aiEnabled:              boolean   // aus = Button & Funktion komplett ausgeblendet
  aiProvider:             AiProvider
  aiApiKey:               string
  aiModel:                string   // leer = Default des Providers
  aiBaseUrl:              string   // nur für OpenAI-kompatible Endpunkte
}

interface SettingsStore extends AppSettings {
  setSetting:        (patch: Partial<AppSettings>) => void
  toggleWidgetType:  (type: string) => void
  installPlugin:     (plugin: InstalledPlugin) => void
  uninstallPlugin:   (id: string) => void
  addCustomTheme:    (theme: CustomTheme) => void
  removeCustomTheme: (id: string) => void
  addCustomTemplate:    (tpl: CustomTemplate) => void
  removeCustomTemplate: (id: string) => void
  addCustomFont:        (font: CustomFont) => void
  removeCustomFont:     (id: string) => void
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      showKbdHints:           true,
      animations:             true,
      compactHeader:          false,
      headerStyle:            'default',
      programFont:            'inter',
      disabledWidgetTypes:    [],
      installedPlugins:       [],
      customThemes:           [],
      customTemplates:        [],
      customFonts:            [],
      calendarFadePastEvents: false,
      statsDisabledTypes:     [],
      lastThemeId:            null,
      defaultThemeId:         'dark',
      homeThemeMode:          'dark',
      folders:                [],
      folderColors:           {},
      hasSeenBackupWarning:   false,
      hasSeenTutorial:        false,
      hasSeenHomeTutorial:    false,
      lastExportAt:           null,
      language:               'en',
      aiEnabled:              true,
      aiProvider:             'anthropic',
      aiApiKey:               '',
      aiModel:                '',
      aiBaseUrl:              '',
      setSetting:       (patch) => set(patch),
      toggleWidgetType: (type)  => set(s => ({
        disabledWidgetTypes: s.disabledWidgetTypes.includes(type)
          ? s.disabledWidgetTypes.filter(t => t !== type)
          : [...s.disabledWidgetTypes, type],
      })),
      installPlugin:    (plugin) => set(s => ({
        installedPlugins: [...s.installedPlugins.filter(p => p.id !== plugin.id), plugin],
      })),
      uninstallPlugin:  (id) => set(s => ({
        installedPlugins: s.installedPlugins.filter(p => p.id !== id),
      })),
      addCustomTheme:   (theme) => set(s => ({
        customThemes: [...s.customThemes.filter(t => t.id !== theme.id), theme],
      })),
      removeCustomTheme: (id) => set(s => ({
        customThemes: s.customThemes.filter(t => t.id !== id),
        lastThemeId:  s.lastThemeId === id ? null : s.lastThemeId,
      })),
      addCustomTemplate: (tpl) => set(s => ({
        customTemplates: [...s.customTemplates.filter(t => t.id !== tpl.id), tpl],
      })),
      removeCustomTemplate: (id) => set(s => ({
        customTemplates: s.customTemplates.filter(t => t.id !== id),
      })),
      addCustomFont: (font) => set(s => ({
        customFonts: [...s.customFonts.filter(f => f.id !== font.id), font],
      })),
      removeCustomFont: (id) => set(s => ({
        customFonts: s.customFonts.filter(f => f.id !== id),
      })),
    }),
    { name: 'planboard-settings' }
  )
)
