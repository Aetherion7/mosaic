# mosaic — Projektkonzeption

> **mosaic** (Projektname: *planboard*) ist ein modulares, vollständig lokales Widget-Dashboard für den Browser.
> Kein Account, kein Server, kein Abo — alle Daten bleiben auf dem Gerät des Nutzers.

Stand: Juli 2026 · Sprache der Oberfläche: Deutsch

---

## 1. Vision & Leitprinzipien

mosaic entstand aus dem Wunsch nach einem persönlichen Dashboard, das dem Nutzer wirklich gehört.
Daraus leiten sich vier nicht verhandelbare Prinzipien ab:

1. **Local-first.** Die gesamte App läuft im Browser. Alle Nutzdaten liegen in IndexedDB auf dem Gerät.
   Es gibt keinen Server, keine Registrierung, keine Telemetrie. Externe Dienste werden nur dort
   angefragt, wo es fachlich unvermeidbar ist (siehe [Abschnitt 9](#9-externe-dienste)).
2. **Modular.** Der Nutzer entscheidet, welche Widgets er braucht, wie sie angeordnet sind und wie
   sie aussehen. Kein Bloat, keine erzwungenen Features.
3. **Täglicher Nutzen.** Das Produktziel ist langfristige Nutzerbindung durch echte tägliche
   Anwendungsfälle: Gewohnheiten abhaken, Wasser tracken, Termine sehen, Notizen führen.
   Neue Widgets werden primär daran gemessen, ob sie einen täglichen Öffnungsgrund schaffen.
4. **Deutsche Oberfläche.** Die UI ist durchgängig deutsch; Datums-, Zahlen- und Zeitformate
   folgen deutschen Konventionen (z. B. „7,5 h", „4. Jul").

---

## 2. Technologie-Stack

| Bereich | Technologie |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| State | Zustand (+ `persist`-Middleware) |
| Persistenz | IndexedDB über eigenen Storage-Adapter ([`src/lib/idbStorage.ts`](src/lib/idbStorage.ts)) |
| Drag & Drop | dnd-kit |
| Animation | framer-motion |
| Rich-Text | TipTap (+ tiptap-markdown, lowlight für Code-Highlighting) |
| PDF | react-pdf / pdf.js |
| Karten | Leaflet / OpenStreetMap |
| Export | html-to-image (PNG-Export) |

Es gibt bewusst **kein Backend** und keine Datenbank außerhalb des Browsers.

---

## 3. Architektur

### 3.1 Verzeichnisstruktur

```
src/
├── app/                    # Next.js-Routen
│   ├── page.tsx            # Board-Übersicht (Startseite)
│   └── board/[id]/page.tsx # Einzelnes Board
├── components/
│   ├── board/              # Grid, Canvas, TileWrapper, TilePicker, MultiSelect
│   ├── widgets/            # Ein Ordner-flacher Satz Widget-Komponenten
│   ├── ui/                 # TopBar, Modals, Panels, Icons, Toasts
│   └── canvas/             # Board-Hintergrund (Farbe/Gradient/Bild/Muster)
├── store/
│   ├── boardStore.ts       # Boards + Widgets + Undo/Redo (persistiert)
│   ├── settingsStore.ts    # App-Einstellungen (persistiert, localStorage)
│   └── uiStore.ts          # Flüchtiger UI-Zustand (Modus, Auswahl, Panels)
├── lib/
│   ├── defaults.ts         # Widget-Defaults, Platzierungslogik, uid()
│   ├── constants.ts        # Grid-Geometrie (einzige Quelle!)
│   ├── dates.ts            # Lokale Datums-Helfer (kein toISOString!)
│   ├── events.ts           # Geteilte Kalender-Terminlogik (Wiederholungen)
│   ├── idbStorage.ts       # IndexedDB-Adapter für zustand/persist
│   ├── themes.ts           # 18 Theme-Presets (CSS-Variablen)
│   ├── exportImage.ts      # PNG-Export mit Zuschnitt auf Widget-Bereich
│   └── imageUtils.ts       # Client-seitige Bildkompression
└── types/index.ts          # Alle Interfaces & der WidgetType-Union
```

### 3.2 State-Management

Drei Zustand-Stores mit klarer Trennung:

- **`boardStore`** — die eigentlichen Daten: `boards: Record<id, Board>`, `currentBoardId`,
  Undo-/Redo-History (30 Schritte, nicht persistiert). Persistiert als `planboard-v2` (Version 2)
  in IndexedDB; `partialize` speichert nur `boards` + `currentBoardId`.
  Generische Mutation über `patchWidget`/`patchCur`-Helfer; `updateTaskData(id, patch)` ist der
  universelle Daten-Patcher für alle Widget-Typen (Name historisch).
- **`settingsStore`** — geräteweite Einstellungen (Labels, Tastatur-Hinweise, Animationen,
  Lösch-Bestätigung, Header-Stil, deaktivierte Widget-Typen, installierte Plugins,
  letztes Theme, Backup-Zeitstempel). Persistiert in localStorage.
- **`uiStore`** — flüchtig: Edit/View-Modus, Selektion, Multi-Selektion, offene Panels,
  Undo-Toast, Canvas-Viewport, pendente Canvas-Fokusfahrt.

### 3.3 Persistenz & Datensicherheit

- IndexedDB (`planboard-store` / Store `kv`) mit einmaliger Migration alter
  localStorage-Daten.
- **Blob-Store** (`planboard-blobs`, `lib/blobStore.ts`): Bilder und PDFs liegen als
  Blobs in einer eigenen IndexedDB; im Board-JSON steht nur eine Referenz
  (`idb-blob://…`). Alte DataURL-Boards funktionieren unverändert (`useBlobUrl`
  reicht sie durch). Verwaiste Blobs räumt `pruneBlobs` einmal pro Sitzung auf.
- Da alles lokal liegt, ist **Backup Verantwortung des Nutzers** — die App unterstützt das aktiv:
  - Warnbanner beim ersten Besuch („Daten liegen nur in diesem Browser")
  - Export einzelner Boards (`mosaic-board`) oder vollständiges Backup
    (`mosaic-backup` v2: Boards + eigene Themes/Vorlagen/Plugins + eingebettete
    Binärdaten); Struktur-Validierung und **Überschreib-Warnung** bei ID-Kollisionen
    beim Import
  - Anzeige des letzten Backup-Zeitpunkts in den Einstellungen
  - Speicherplatz-Warnung bei > 80 % Quota-Auslastung
- Board-Export als **PNG** (zugeschnitten auf den tatsächlich belegten Widget-Bereich).
- **Unit-Tests** (Vitest, `src/__tests__/`): Datums-Helfer, Termin-Wiederholung,
  Board-Store (Papierkorb, Undo, Transfer, Ordner). Ausführen mit `npm test`.

---

## 4. Board-Konzept

Ein **Board** ist eine benannte Arbeitsfläche mit eigenem Theme, Hintergrund und Widget-Satz.
Nutzer können beliebig viele Boards anlegen (Arbeit, Privat, Projekte …) und zwischen ihnen
über die Startseite oder die globale Suche wechseln.

### 4.1 Zwei Layout-Modi

| | **Grid-Modus** | **Infinite Canvas** (Standard) |
|---|---|---|
| Fläche | 12 Spalten × wachsende Zeilen | 100 × 100 Zellen à 120 px |
| Navigation | vertikales Scrollen | Pan (Space/Mitteltaste) + Zoom (Strg+Rad, 10–300 %) |
| Einsatz | klassisches Dashboard | freies „Whiteboard"-Gefühl |

Die Grid-Geometrie (`GRID_COLS`, `GRID_ROW_H`, `GRID_GAP`, `INFINITE_*`) lebt **ausschließlich**
in [`src/lib/constants.ts`](src/lib/constants.ts).

### 4.2 Widget-Platzierung

- Neue Widgets werden im Infinite-Modus **zufällig angrenzend** an bestehende Widgets platziert
  (bzw. im Viewport-Zentrum, wenn das Board leer ist); im Grid-Modus in die erste freie Lücke.
- Drag & Drop (dnd-kit) mit Drop-Preview, Multi-Drag für Mehrfachauswahl,
  Resize über Griffe an allen vier Seiten + Ecke (mit `MIN_SPANS` je Widget-Typ).
- **Gesperrte Widgets** (`locked`) sind von Drag, Resize, Duplizieren und Löschen ausgenommen —
  auch über Tastatur und Rubber-Band-Auswahl.

### 4.3 Edit- vs. View-Modus

Der globale Modus (Taste `E`) trennt Konsum von Konfiguration:

- **View:** Widgets sind interaktiv (Haken setzen, Wasser tippen, PDF lesen), aber Layout,
  Stile und Inhalte-Verwaltung sind eingefroren.
- **Edit:** Drag/Resize/Löschen, Widget-Stil-Panel, Hinzufügen-Panel, Multi-Selektion
  per Rubber-Band oder Strg+Klick, Bulk-Löschen mit Bestätigungsleiste.

Die App startet bewusst immer im **Ansichtsmodus** (nicht persistiert):
Alltagsnutzung ist der Normalfall, Bearbeiten die Ausnahme.

### 4.4 Löschen & Undo

- Jede strukturelle Änderung (Hinzufügen, Verschieben, Resize, Löschen, Stil) landet in der
  Undo-History (Strg+Z / Strg+Y, 30 Schritte).
- Einzellöschung zeigt zusätzlich einen **Undo-Toast** (5 s).
- Die Einstellung „Löschen bestätigen" wird von allen drei Löschwegen respektiert
  (Widget-Button, Entf-Taste, MultiSelect-Leiste).
- Undo/Redo umfasst neben Widgets auch **Hintergrund- und Theme-Wechsel**;
  schnelle Folgeänderungen (Slider) werden zu einem Schritt zusammengefasst.
- **Widget-Transfer**: ausgewählte Widgets lassen sich über die Widget-Toolbar auf
  ein anderes Board verschieben oder kopieren (behält Größe, sucht freien Platz).
- **Fokus-Modus**: Doppelklick im Ansichtsmodus öffnet ein Widget als großes
  Overlay (Esc/X schließt); Editoren, Karten und Zeichenfläche sind ausgenommen.

---

## 5. Widget-System

### 5.1 Datenmodell

```ts
interface Widget {
  id:        string          // uid()
  type:      WidgetType      // Diskriminator
  data:      WidgetData      // typspezifisch (Record<string, any>)
  pos:       TilePos         // col/row/colSpan/rowSpan (Desktop)
  mobilePos: MobilePos       // Spalte 1|2, Span 1|2, Reihenfolge, opt. Höhe
  zIndex:    number          // beim Draggen erhöht ("zuletzt bewegt liegt oben")
  style:     WidgetStyle     // s. Abschnitt 6
  locked?:   boolean
}
```

Für jeden Typ existiert ein präzises Daten-Interface in [`src/types/index.ts`](src/types/index.ts)
(z. B. `SleepData`, `CalendarEvent`), auf das die Widget-Komponente ihr `widget.data` castet.

### 5.2 Registrierungs-Checkliste für neue Widgets

Ein neuer Widget-Typ berührt immer dieselben Stellen — in dieser Reihenfolge:

1. `types/index.ts` — Daten-Interface + Eintrag im `WidgetType`-Union
2. `lib/defaults.ts` — `DEFAULT_SPANS` + `case` in `defaultWidget()`
3. `components/ui/Icons.tsx` — 16×16-Icon im Hausstil (Stroke, `currentColor`)
4. `components/widgets/<Name>Widget.tsx` — die Komponente
5. `components/board/TileWrapper.tsx` — Import, `TileContent`-Case, `TYPE_ICONS`,
   `TYPE_LABELS`, ggf. `MIN_SPANS`, `MOBILE_MIN_H`, `MOBILE_MIN_H_HALF`
6. `components/board/TilePicker.tsx` — Kachel im Hinzufügen-Panel
7. `components/ui/SettingsModal.tsx` — `BUILT_IN_WIDGETS` (De-/Aktivierbarkeit)
8. `components/ui/SearchModal.tsx` — `TYPE_ICON_MAP`

### 5.3 Die 16 Widgets

**Produktivität**

| Widget | Kern | Besonderheiten |
|---|---|---|
| **Aufgabe** | Mehrere Gewohnheiten mit Mo–So-Wochenkacheln | Wochenarchiv (`weeklyLog`, ISO-Wochen), 3 Chart-Ansichten (Kachel/Balken/Verlauf) mit Wochennavigation, vergangene Tage nicht klickbar, stündlicher Wochen-Reset |
| **Notiz** | TipTap-Markdown-Editor | Task-Listen, Code-Blöcke mit Syntax-Highlighting, Tab-Handling, PDF-Referenz-Spans (klickbar → springt zur PDF-Seite); eigene Schrift/Größe/Farbe/Zeilenhöhe/Schatten/Kontur/transparenter Hintergrund (übernommen vom entfernten Text-Widget), B/I/U und Ausrichtung als echte Tiptap-Marks pro Auswahl |
| **Tabelle** | Kalkulationsblatt | Formel-Engine (`=SUMME(...)`-Stil: SUM/AVERAGE/IF/COUNTIF/VLOOKUP-artige Funktionen), Zellformate, Spaltenbreiten |
| **Timer** | Countdown mit Fortschrittsring | Abschluss-Sound (WebAudio), läuft über Reloads hinweg korrekt weiter (`startedAt`-basiert) |
| **Agenda** | Nächste N Tage aller Kalender-Widgets des Boards | Gruppiert nach Heute/Morgen/Datum, Zeitraum 3/7/14/30 Tage, nutzt geteilte Wiederholungslogik |
| **Quicklinks** | Favoriten-Kacheln | Favicons (DuckDuckGo-Service, Fallback Buchstaben-Kachel), öffnet in neuem Tab |

**Tracking & Zeit**

| Widget | Kern | Besonderheiten |
|---|---|---|
| **Wasser** | Klickbare Flasche in Abschnitten | Tagesziel + ml/Abschnitt, tägliches Log, Mini-Flaschen-Wochenchart mit Navigation, automatischer Tagesreset |
| **Schlaf** | Zubett-/Aufwachzeit pro Tag | Dauer über Mitternacht korrekt, Wochen-Balkenchart mit gestrichelter Ziellinie |
| **Kalender** | Monat/Woche/Tag | Drag-Erstellen & Drag-Verschieben von Terminen, mehrtägige Termine, Wiederholungen (täglich/wöchentlich/monatlich/jährlich inkl. UNTIL), ICS-Import, Zoom der Stundenhöhe |
| **Diagramm** | 5 Chart-Typen (Säulen/Balken/Linie/Netz/Kreis) | Frei editierbare Datenreihen & -punkte mit Farben |
| **Uhr** | 4 Stile | digital, analog, minimal, Flip |

**Infos & Medien**

| Widget | Kern | Besonderheiten |
|---|---|---|
| **Wetter** | Open-Meteo + Geolocation oder Wunschstadt | WMO-Code-Icons, Offline-Cache (sessionStorage), 30-min-Refresh, °C/°F |
| **Karte** | Leaflet/OSM | Eigene Marker & Routen |
| **PDF-Leser** | react-pdf | Textmarkierungen in 4 Farben (positionsgenau als %-Rects), Markierungs-Seitenleiste, **Verknüpfung von Markierungen in Notiz-Widgets** (Klick in der Notiz springt zur PDF-Seite), Seiten-Thumbnails, Zoom, Blätter-Animation |
| **Zeichenbrett** | Freies Zeichnen/Skizzieren | |
| **Bild** | Foto/Grafik | Automatische Client-Kompression (max. 1920 px, JPEG/PNG-Erkennung), Cover/Contain, rahmenloser Modus |

Dazu existiert ein **Plugin-Widget** als experimentelles Konzept: In den Einstellungen lassen sich
Plugin-Definitionen (JSON mit `embedUrl`) installieren, die als iframe-Kachel erscheinen.

---

## 6. Designsprache

Die App ist dunkel-first und token-basiert. Themes setzen CSS-Variablen
(`--bg`, `--surface`, `--surface2`, `--surface3`, `--border`, `--text1..3`, `--accent`,
`--accent2`, `--danger`, `--success`, `--amber`) auf `document.documentElement`.

**Wiederkehrende Muster (verbindlich für neue UI):**

- **Karten:** `background: var(--surface2)`, `border: 1px solid var(--border)`, `borderRadius: 7–10`
- **Labels:** 8–9 px, `fontWeight: 700`, `textTransform: uppercase`, `letterSpacing: 0.06em`, `--text3`
- **Akzent-Pills:** `color-mix(in srgb, var(--accent) 12–15%, transparent)` als Fläche,
  28 %-Mix als Rand, `borderRadius: 20`
- **Icon-Buttons:** 22 × 22 px, Radius 5–7, Rand `--border`, Fläche `--surface2`
- **Aktions-Pills:** `borderRadius: 50` (z. B. Reset-Buttons)
- **Wochencharts:** SVG mit `viewBox` ~260 breit, Y-Ticks 6 px, Navigation
  „← Diese Woche →" zentriert (Muster in Wasser/Schlaf/Aufgabe)
- **Schreibweise:** Inline-Styles (keine CSS-Frameworks), Icons als eigene
  16×16-Stroke-SVGs in [`Icons.tsx`](src/components/ui/Icons.tsx) — keine Emojis als UI-Icons
- Widgets stoppen `onPointerDown`-Propagation, damit Interaktion nicht als Board-Drag zählt

**Themes:** 18 Presets (dunkel: dark, glass, cyber, nature, neon, aurora, sunset, ocean, rose,
nordic, carbon · hell: light, paper, arctic, blossom, mint, lavender, sand). Beim Theme-Wechsel
werden Widget-Stile intelligent migriert: Nur Werte, die noch dem alten Theme-Default entsprechen,
werden ersetzt — Nutzer-Anpassungen bleiben erhalten.

**Widget-Stil:** Jedes Widget hat individuell einstellbar: Hintergrund/Gradient, Deckkraft, Blur,
Rand (Farbe/Breite/Radius), Schatten (5 Stufen), Glow (Farbe/Größe).

---

## 7. Interaktion & Tastatur

| Kürzel | Aktion |
|---|---|
| `E` | Edit-/View-Modus umschalten |
| `A` | Widget-Picker (im Edit-Modus) |
| `T` | Theme-Panel |
| `S` | Einstellungen |
| `Strg+K` | Widget-Suche auf dem aktuellen Board (mit Canvas-Fokusfahrt zum Treffer) |
| `Strg+Z` / `Strg+Y` | Undo / Redo |
| `Entf`/`Backspace` | Auswahl löschen (respektiert Sperre & Bestätigungs-Einstellung) |
| `Space` + Ziehen | Canvas pannen |
| `Strg+Rad` | Canvas zoomen |

Kürzel feuern nicht, während der Fokus in Eingabefeldern oder Widget-Inhalten liegt.

---

## 8. Datums- & Zeitlogik (wichtig!)

Alle Kalenderdaten werden **in lokaler Zeit** berechnet und als `YYYY-MM-DD`-Strings gespeichert.

- **Niemals `toISOString()`** für Kalenderdaten verwenden — es konvertiert nach UTC und
  verschiebt in UTC+-Zeitzonen den Tag. Stattdessen: [`src/lib/dates.ts`](src/lib/dates.ts)
  (`toDateStr`, `todayStr`, `getWeekDates`, `weekRangeLabel`).
- Wochen laufen **Mo–So**; das Aufgaben-Widget archiviert per ISO-Wochenschlüssel (`2026-W27`).
- Tages-/Wochenresets laufen beim Mount **und** stündlich per Interval (Tab kann über
  Mitternacht offen bleiben).
- Terminwiederholungen zentral in [`src/lib/events.ts`](src/lib/events.ts) (`eventOccursOn`).

---

## 9. Externe Dienste

Local-first heißt: so wenig extern wie möglich, und nichts davon persistiert Nutzerdaten.

| Dienst | Zweck | Widget |
|---|---|---|
| Open-Meteo | Wetterdaten (kein API-Key) | Wetter |
| Nominatim (OSM) | Geocoding Stadt ↔ Koordinaten | Wetter |
| OSM-Tileserver | Kartenkacheln | Karte |
| DuckDuckGo Icons | Favicons | Quicklinks |
| Google Fonts | Schriften der Landing-Page | landing.html |

Alle Widget-Daten (auch PDFs und Bilder, als DataURLs) liegen ausschließlich in IndexedDB.

---

## 10. Mobile

Unter 768 px wechselt das Board in ein eigenes **2-Spalten-Layout**:

- `mobilePos` pro Widget: Spalte (1/2), Breite (halb/voll), Reihenfolge, optionale Höhe
- Komplexe Widgets (Kalender, Diagramm, Tabelle, Zeichenbrett, Karte, PDF) sind
  erzwungen vollbreit (`MOBILE_FORCE_FULL`)
- Umsortieren per Drag-Handle mit Ghost-Vorschau, Resize über Griffe (Höhe, Spaltenwechsel)

---

## 11. Startseite & Landing

- **`/`** — Board-Übersicht: Karten mit Hintergrund-Vorschau, Umbenennen, Duplizieren,
  Löschen (mit Bestätigung), „Neues Board", Backup-Hinweis.
- **`/board/[id]`** — das Board selbst; Titel im Dokument-Tab, Theme-Anwendung,
  Speicher-Warnung.
- **Papierkorb** — gelöschte Boards sind 30 Tage wiederherstellbar (Sektion unten auf
  der Übersicht; `boardStore.trash`, max. 20 Einträge).
- **Ordner** — Boards lassen sich über das Karten-Kontextmenü („In Ordner…") in
  auf-/zuklappbare Sektionen gruppieren (`Board.folder`); Zuklapp-Zustand wird
  lokal gemerkt. Bei aktiver Suche wird flach angezeigt.
- **Eigene Vorlagen** — „Als Vorlage speichern" im Karten-Kontextmenü sichert das
  Layout (Typen + Positionen, ohne Inhalte) als Vorlage für den Erstellen-Dialog
  (`settingsStore.customTemplates`).
- **Einführungstour** — beim ersten Board-Besuch startet eine geführte Spotlight-Tour
  (8 Schritte: Modi, Widget-Katalog, Board-Bedienung, Themes, Suche, Backup).
  Überspringbar per Esc, neu startbar unter Einstellungen → Über mosaic.
  Flag: `settingsStore.hasSeenTutorial`.
- **`/landing.html`** — statische Produktseite (eigenständiges HTML im `public/`-Ordner),
  gleiche Markenfarbe (`#7c6fe8`), stellt Konzept und alle 16 Widgets vor.

---

## 12. Bekannte Entscheidungen & Grenzen

- **Tabellen-Formeln** werden client-seitig als JavaScript ausgewertet (`new Function`).
  Das ist bei einer local-first Einzelnutzer-App akzeptiert, bedeutet aber: fremde Formeln
  nicht ungeprüft einfügen (Self-XSS-Potenzial).
- **Monatliche Wiederholung** am 29.–31. wird in kürzeren Monaten übersprungen (bewusster Quirk).
- **RSS/News-Widget** wurde verworfen: Browser-CORS macht Feeds ohne Proxy unzuverlässig,
  und ein Proxy widerspräche dem No-Server-Prinzip.
- Der **Infinite Canvas** ist hart auf 100 × 100 Zellen begrenzt; Drags werden entsprechend geklemmt.
- Undo-History überlebt Reloads bewusst nicht (Speicher & Einfachheit).

---

## 13. Roadmap-Ideen (nicht committed)

Priorisiert nach Retention-Wirkung und Aufwand:

- **Stimmungs-Tracker / Year-in-Pixels** — täglicher Check-in, Monats-/Jahres-Heatmap
- **Streak-Widget** — „🔥 X Tage in Folge" auf Basis der bestehenden `weeklyLog`-Daten
- **„Tage ohne …"** — Verzichts-Counter mit Bestwert
- **Messwert-Tracker** — generisch (Gewicht, Kilometer, Seiten) mit Trendlinie und Ziel
- **Budget / Sparziel** — Ausgabenerfassung bzw. Fortschritt zum Zielbetrag
- **Pomodoro-Erweiterung** des Timers (Zyklen, Sessions/Tag)
- **Sonnenauf-/-untergang & Mondphase** — offline berechenbar, Ergänzung zum Wetter
- **Desktop-App** (auf der Landing-Page als „coming soon" angekündigt)

---

## 14. Qualitätsregeln für Beiträge

1. Designsprache aus Abschnitt 6 einhalten — neue UI soll aussehen wie bestehende.
2. Datumslogik ausschließlich über `lib/dates.ts` / `lib/events.ts`.
3. Grid-Konstanten nur aus `lib/constants.ts` beziehen.
4. Neue Widgets vollständig registrieren (Checkliste 5.2) — halbe Features vermeiden;
   toter Code wird konsequent entfernt.
5. Keine neuen externen Dienste ohne guten Grund; niemals Nutzerdaten nach außen senden.
6. Vor Abschluss: `npx tsc --noEmit` und `npm run build` müssen sauber durchlaufen.
7. **Zweisprachigkeit (Englisch/Deutsch, Englisch = Default):** Jeder neue sichtbare
   Text (Label, Button, Platzhalter, Tooltip, Fehlermeldung, Toast …) muss über den
   `useT()`-Hook (`lib/i18n.ts`) laufen und in beiden Sprachen vorliegen — nie
   hartkodierten Text direkt in JSX schreiben. Das gilt auch für neue Widgets,
   Panels und Einstellungen: beim Anlegen sofort den englischen Quelltext als
   `t('…')`-Schlüssel verwenden und den deutschen Eintrag im `de`-Wörterbuch ergänzen.

---

## 15. KI-Assistent (Board-Copilot)

### 15.1 Grundprinzip

mosaic bleibt local-first — es gibt keinen mosaic-Server, der KI-Anfragen
weiterleitet. Deshalb **BYOK** (Bring Your Own Key): Die Nutzerin hinterlegt
ihren eigenen API-Schlüssel in den Einstellungen, der Browser ruft die
KI-API direkt auf. Der Schlüssel liegt ausschließlich in `localStorage`
(planboard-settings) und verlässt das Gerät nur Richtung des gewählten
Anbieters.

Zwei Provider-Adapter decken praktisch alle Anbieter ab:

| Adapter | Anbieter | Anmerkung |
|---|---|---|
| `anthropic` | Claude | offiziell browserfähig via `anthropic-dangerous-direct-browser-access` |
| `openai` | OpenAI, Groq, Mistral, Ollama (lokal), … | Chat-Completions-Format, Base-URL konfigurierbar |

### 15.2 Agent-Loop mit Werkzeugen

Die KI arbeitet nicht auf Rohtext, sondern über **Tool-Calling** gegen die
bestehenden Store-Actions — dadurch greift automatisch die Undo-Historie.
Auch `updateWidget` erzeugt Undo-Schritte; schnelle Folgeänderungen am selben
Widget (mehrere Tool-Runden, Tipp-Bursts) werden über den Merge-Mechanismus
in `snap()` zu einem Schritt zusammengefasst:

- `add_widget` — Widget-Typ + optionale Position/Daten; Platzierung sonst über `findNextPos`/`findPosNear`
- `update_widget` — Daten-Patch (flacher Merge auf `widget.data`), Position, Größe
- `delete_widget`
- `rename_board`, `set_theme`
- `get_board` — vollständiger Board-Zustand, wenn die Kurzfassung im Systemprompt nicht reicht

Ablauf pro Nutzer-Nachricht: Systemprompt wird mit einer **frischen
Board-Zusammenfassung** (Widgets mit id/Typ/Position/Inhalts-Digest, Theme,
verfügbare Typen & Themes, Datenschemata) neu erzeugt → Anfrage mit
Tool-Definitionen → solange die Antwort Tool-Aufrufe enthält, werden sie
ausgeführt und die Ergebnisse zurückgeschickt (max. 15 Runden, AbortController
zum Abbrechen). In der Chat-Historie über Nachrichten hinweg bleiben nur
Nutzer-/Assistententexte — der Board-Zustand kommt jede Runde frisch aus dem
Store, nie aus dem Gedächtnis der KI.

### 15.3 UI

- **✨-Button in der TopBar** (rechts, neben Theme) öffnet ein rechtes
  Seitenpanel (Muster ThemePanel: desktop 360 px schwebend, mobil Bottom-Sheet).
  Das Board bleibt sichtbar; Änderungen erscheinen live.
- Jede ausgeführte Aktion wird als kleiner Chip im Verlauf angezeigt
  („+ Notiz erstellt", „Theme → Ocean").
- Ohne Schlüssel zeigt das Panel eine Einrichtungsaufforderung mit Sprung zu
  Einstellungen → „AI Assistant" (Anbieter, Schlüssel, Modell, Base-URL).
- Chatverlauf lebt in einem **nicht persistierten** Store (`aiStore`) —
  bleibt beim Panel-Schließen erhalten, verschwindet beim Reload.

### 15.4 Dateien

| Datei | Zweck |
|---|---|
| `lib/ai/tools.ts` | Tool-Definitionen (JSON-Schema) + Executor gegen boardStore |
| `lib/ai/client.ts` | Provider-Adapter + Agent-Loop |
| `store/aiStore.ts` | Chatverlauf, Running-Flag, Abort |
| `components/ui/AiPanel.tsx` | Chat-Seitenpanel |
| `components/ui/settings/AiSettingsPanel.tsx` | Einstellungs-Sektion |
