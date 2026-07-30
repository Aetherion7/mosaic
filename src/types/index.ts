// ─── Grid position ────────────────────────────────────────────────────────────
export interface TilePos {
  col:     number   // 1-12
  row:     number   // 1+
  colSpan: number   // 1-12
  rowSpan: number   // 1+
}

// ─── Widget style ─────────────────────────────────────────────────────────────
export type GradientDir = 'to-r' | 'to-br' | 'to-b' | 'to-bl' | 'to-l' | 'to-tl' | 'to-t' | 'to-tr'

export interface WidgetStyle {
  bgColor:      string
  gradient:     [string, string] | null
  gradientDir:  GradientDir
  opacity:      number
  blur:         number
  borderColor:  string
  borderWidth:  number
  borderRadius: number
  // Optional: die 4 Ecken einzeln überschreiben (Reihenfolge wie CSS
  // border-radius: oben-links, oben-rechts, unten-rechts, unten-links).
  // Fehlt dieses Feld (ältere Boards/Themes), gilt weiterhin `borderRadius`
  // einheitlich für alle vier Ecken.
  cornerRadii?: [number, number, number, number]
  shadow:       'none' | 'sm' | 'md' | 'lg' | 'xl'
  glowColor:    string | null
  glowSize:     number
}

// ─── Widget data payloads ─────────────────────────────────────────────────────
export interface HabitEntry {
  id:         string
  name:       string
  color:      string
  weekDays:   string[]
  lastWeek?:  string
  weeklyLog?: Record<string, string[]>
}

export interface TaskData {
  habits?:    HabitEntry[]
  statsOpen?: boolean   // Wochenstatistik auf-/eingeklappt
}

// Font/color/shadow/stroke fields are optional — pre-existing notes on
// people's boards don't have them (undefined = NoteWidget falls back to the
// theme's fixed typography, same as before this was added).
export interface NoteData {
  title:           string
  content:         string
  fontFamily?:     string
  fontSize?:       number
  color?:          string
  colorPalette?:   string[]
  textShadow?:      boolean
  textShadowColor?: string
  textShadowBlur?:  number
  textShadowX?:     number
  textShadowY?:     number
  textStroke?:      boolean
  textStrokeColor?: string
  textStrokeWidth?: number
  lineHeight?:      number
  noBg?:            boolean
}

// Hochgeladene Alarmtöne — nur die idb-blob://-Referenz wird gespeichert
// (s. lib/blobStore.ts), nicht die Audiodaten selbst; collectBlobRefs()/
// pruneBlobs() finden `ref` automatisch, weil es rekursiv das ganze
// Board-JSON nach idb-blob://-Strings durchsucht.
export interface TimerCustomSound {
  id:   string
  name: string
  ref:  string
}

export interface TimerData {
  name:        string
  durationMin: number
  startedAt:   number | null
  running:     boolean
  elapsed:     number
  // Ausgewählter Ton: eine der SOUND_PRESETS-IDs oder die id eines Eintrags
  // aus customSounds; fehlt = erster Preset ("chime").
  soundId?:      string
  customSounds?: TimerCustomSound[]
}

export interface WaterData { goalMl: number; loggedMl: number; mlPerSection: number; lastDate?: string; dailyLog?: Record<string, number>; statsOpen?: boolean }

// ─── Sleep tracker ────────────────────────────────────────────────────────────
export interface SleepEntry { bed: string; wake: string }   // HH:MM
export interface SleepData {
  goalH:      number
  log:        Record<string, SleepEntry>   // key = Aufwach-Datum YYYY-MM-DD
  statsOpen?:  boolean   // Wochenstatistik auf-/eingeklappt
  // Zuletzt angezeigte Woche (0 = aktuell, negativ = zurück) — persistiert,
  // damit der Fokus-Modus (zweites, gleichzeitiges Mounting desselben
  // Widgets) dieselbe Woche zeigt statt bei der aktuellen neu zu starten.
  weekOffset?: number
}

// ─── Agenda ───────────────────────────────────────────────────────────────────
export interface AgendaData { daysAhead: number }

// ─── Quicklinks ───────────────────────────────────────────────────────────────
export interface QuickLink { id: string; url: string; label: string }
export interface QuicklinksData { links: QuickLink[] }

export interface ImageData {
  src:       string
  alt:       string
  objectFit: 'cover' | 'contain'
  noBar:     boolean
}

export type CalendarRecurrence = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface CalendarEvent {
  id:           string
  date:         string    // YYYY-MM-DD (Startdatum)
  dateEnd?:     string    // YYYY-MM-DD (Enddatum, optional)
  timeStart?:   string    // HH:MM
  timeEnd?:     string    // HH:MM
  title:        string
  color:        string
  location?:    string
  description?: string
  recurrence?:  CalendarRecurrence
  recurrenceUntil?: string  // YYYY-MM-DD — letzte Wiederholung (ICS UNTIL)
  copyShadow?:  boolean     // frische Kopie: mit Schatten gerendert, bis sie erstmals bewegt wird
  reminderMinutesBefore?: number  // fehlt = keine Erinnerung; 0 = zum Zeitpunkt des Termins
}

export interface CalendarData {
  events: CalendarEvent[]
  // Zuletzt angezeigter Ausschnitt (Monat/Woche/Tag) — persistiert, damit ein
  // zweites gleichzeitiges Mounting desselben Widgets (Fokus-Modus) exakt
  // denselben Ausschnitt zeigt statt bei "heute" neu zu starten.
  viewYear?:  number
  viewMonth?: number
  weekStart?: string   // YYYY-MM-DD, bereits auf Montag normalisiert
  dayDate?:   string   // YYYY-MM-DD
}

// ─── Chart widget ─────────────────────────────────────────────────────────────
export type ChartType = 'column' | 'bar' | 'line' | 'radar' | 'pie'

export interface ChartDataset {
  label:  string
  values: number[]
  color:  string
}

export interface ChartData {
  title:     string
  chartType: ChartType
  labels:    string[]
  datasets:  ChartDataset[]
}

// ─── Widget discriminated union ───────────────────────────────────────────────
export interface TextData {
  content:         string
  fontSize:        number
  fontWeight:      'normal' | 'bold'
  fontStyle:       'normal' | 'italic'
  textDecoration:  'none' | 'underline'
  textAlign:       'left' | 'center' | 'right'
  color:           string
  colorPalette:    string[]
  fontFamily:      string
  lineHeight:      number
  textShadow:      boolean
  textShadowColor: string
  textShadowBlur:  number
  textShadowX:     number
  textShadowY:     number
  textStroke:      boolean
  textStrokeColor: string
  textStrokeWidth: number
  noBg:            boolean
}

export type ClockStyle = 'digital' | 'analog' | 'minimal' | 'flip'

export interface ClockData {
  clockStyle: ClockStyle
  showSeconds: boolean
  noBg?: boolean   // Leiste + Rahmen ausblenden (wie NoteWidget)
}

export interface WeatherWidgetData {
  manualCity: string
  unit: 'celsius' | 'fahrenheit'
}

export interface MapMarker {
  id:    string
  lat:   number
  lng:   number
  label: string
  color: string
}

export interface MapRoute {
  id:     string
  points: Array<{ lat: number; lng: number }>
  color:  string
  label:  string
}

export interface MapData {
  centerLat: number
  centerLng: number
  zoom:      number
  markers:   MapMarker[]
  routes:    MapRoute[]
}

export interface ReaderHighlight {
  id:        string
  page:      number
  text:      string
  color:     string
  createdAt: number
  rects?:     Array<{ x: number; y: number; w: number; h: number }>  // PDF: % of page dimensions
  cfiRange?:  string  // EPUB: epub.js CFI range instead of pixel rects
}

export interface NotePdfLink {
  id:             string
  highlightId:    string
  readerWidgetId: string
  page:           number
  text:           string
  color:          string
}

export type ReaderFileType = 'pdf' | 'epub'

export interface ReaderData {
  fileName?:     string
  fileData?:     string
  fileType?:     ReaderFileType
  highlights:    Record<string, ReaderHighlight>
  currentPage:   number
  currentCfi?:   string   // EPUB: exact position (survives across "location" regeneration)
  epubLocations?: string  // Legacy: Locations-Cache inline im Board-JSON (wird beim Laden in die Blob-DB migriert)
  epubLocationsRef?: string  // EPUB: idb-blob://-Referenz auf den Locations-Cache (book.locations.save())
  twoPageSpread?: boolean
}

export interface SpreadsheetData {
  rows:  number
  cols:  number
  cells: Record<string, unknown>
  colW:  number[]
  title: string
}

// ─── Drawboard ────────────────────────────────────────────────────────────────
export interface DrawPoint { x: number; y: number }

export interface DrawElement {
  id: string
  type: 'freedraw' | 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'text' | 'fill'
  x: number; y: number; x2: number; y2: number
  points?: DrawPoint[]
  color: string
  strokeWidth: number
  opacity: number
  filled: boolean
  text?: string
  fontSize?: number
  fillImageUrl?: string
  brushType?: string
}

export interface DrawboardData {
  elements: DrawElement[]
}

export interface PluginWidgetData {
  pluginId:   string
  pluginName: string
  pluginIcon: string
  pluginDesc: string
  embedUrl?:  string
}

// Specific data types exist for individual widget components to import and cast to.
// WidgetData enforces "must be an object" while staying compatible with all widget patterns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WidgetData = Record<string, any>

export type WidgetType =
  | 'task' | 'note' | 'timer'
  | 'water' | 'image' | 'calendar' | 'chart' | 'spreadsheet' | 'drawboard'
  | 'clock' | 'weather' | 'map' | 'plugin' | 'reader'
  | 'sleep' | 'agenda' | 'quicklinks'

export interface Widget {
  id:        string
  type:      WidgetType
  data:      WidgetData
  pos:       TilePos
  zIndex:    number
  style:     WidgetStyle
  locked?:   boolean
}

// ─── Board background ─────────────────────────────────────────────────────────
export type BgType = 'color' | 'gradient' | 'image'
export type PatternType = 'columns' | 'dots' | 'grid' | 'none'

export interface BoardBg {
  type:            BgType
  color:           string
  gradient:        [string, string]
  gradientDir:     GradientDir
  imageUrl:        string | null
  imageName:       string | null
  imageBlur:       number
  imageBrightness: number
  pattern:         PatternType
  patternColor:    string
  patternOpacity:  number
}

// ─── Theme ────────────────────────────────────────────────────────────────────
export type ThemeId =
  | 'dark' | 'glass' | 'cyber' | 'nature' | 'neon'
  | 'aurora' | 'sunset' | 'ocean' | 'rose' | 'nordic' | 'carbon'
  | 'light' | 'paper' | 'arctic' | 'blossom' | 'mint' | 'lavender' | 'sand'

export interface ThemePreset {
  id:          ThemeId
  name:        string
  cssVars:     Record<string, string>
  bg:          Partial<BoardBg>
  widgetStyle: Partial<WidgetStyle>
}

// ─── Board ────────────────────────────────────────────────────────────────────
export interface Board {
  id:          string
  name:        string
  icon:        string | null
  widgets:     Record<string, Widget>
  bg:          BoardBg
  themeId:     string   // ThemeId oder Custom-Theme-ID
  lastEdited:  number
  createdAt?:  number
  pinned?:     boolean
  folder?:     string   // Gruppierung in der Board-Uebersicht (optional)
  layoutMode?: 'grid' | 'infinite'
  fontFamily?: string   // Überschreibt die Programm-Schrift nur für dieses Board (optional)
}

// ─── UI ────────────────────────────────────────────────────────────────────────
export type UIMode = 'edit' | 'view'
export type PanelId = 'addWidget' | 'theme' | 'widgetStyle' | 'ai' | null
