import type { WidgetType } from '@/types'
import {
  IconTask, IconNote, IconTimer, IconWater, IconImage,
  IconCalendar, IconChart, IconTable, IconDraw, IconClock, IconWeather, IconMap, IconReader,
  IconSleep, IconAgenda, IconLinks, IconHtml,
} from '@/components/ui/Icons'

// Reihenfolge + Beschreibung der einzeln in der Einstellungs-Sidebar gelisteten
// Widgets (eigene Unterseite je Typ). `desc` ist der englische Quelltext
// (Default-Sprache) — an Verwendungsstellen mit t() übersetzen.
//
// ⚠️ Jeder Widget-Typ aus TILES (src/components/board/TilePicker.tsx) braucht
// hier einen Eintrag — sonst fehlt ihm eine eigene Settings-Seite. Ist bereits
// einmal auseinandergelaufen (Reader fehlte hier). Siehe KONZEPT.md §5.2.
export const BUILT_IN_WIDGETS: { type: WidgetType; icon: React.ReactNode; desc: string }[] = [
  { type: 'weather',     icon: <IconWeather size={18} />,    desc: 'Location & forecast' },
  { type: 'map',         icon: <IconMap size={18} />,        desc: 'OpenStreetMap, markers & routes' },
  { type: 'task',        icon: <IconTask size={18} />,       desc: 'Tasks & habit tracking' },
  { type: 'note',        icon: <IconNote size={18} />,       desc: 'Markdown notes with custom fonts, color, shadow & outline' },
  { type: 'timer',       icon: <IconTimer size={18} />,      desc: 'Countdown & time tracking' },
  { type: 'water',       icon: <IconWater size={18} />,      desc: 'Track daily water intake' },
  { type: 'image',       icon: <IconImage size={18} />,      desc: 'Embed a photo or graphic' },
  { type: 'calendar',    icon: <IconCalendar size={18} />,   desc: 'Month view with events' },
  { type: 'spreadsheet', icon: <IconTable size={18} />,      desc: 'Spreadsheet with formulas' },
  { type: 'drawboard',   icon: <IconDraw size={18} />,       desc: 'Draw sketches & diagrams' },
  { type: 'clock',       icon: <IconClock size={18} />,      desc: 'Digital, analog & more' },
  { type: 'chart',       icon: <IconChart size={18} />,      desc: 'Bar, line, pie & more' },
  { type: 'reader',      icon: <IconReader size={18} />,     desc: 'Read & highlight PDFs and EPUBs' },
  { type: 'sleep',       icon: <IconSleep size={18} />,      desc: 'Track daily sleep duration' },
  { type: 'agenda',      icon: <IconAgenda size={18} />,     desc: 'Upcoming events at a glance' },
  { type: 'quicklinks',  icon: <IconLinks size={18} />,      desc: 'Quick access to websites' },
  { type: 'html',        icon: <IconHtml size={18} />,       desc: 'Paste your own HTML page — rendered live' },
]
