'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import ePub from 'epubjs'
import type Book from 'epubjs/types/book'
import type Rendition from 'epubjs/types/rendition'
import type Contents from 'epubjs/types/contents'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { saveBlob, getBlob, useBlobUrl } from '@/lib/blobStore'
import { registerReader, unregisterReader } from '@/lib/ai/readerRegistry'
import { LIGHT_THEME_IDS } from '@/lib/themes'
import { extractNoteTitle } from '@/lib/noteTitle'
import { useT } from '@/hooks/useT'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Widget, ReaderHighlight, ReaderFileType } from '@/types'

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}

const HIGHLIGHT_COLORS = [
  { label: 'Yellow',  value: '#ffd166' },
  { label: 'Green',  value: '#95e06c' },
  { label: 'Pink',  value: '#ff6b9d' },
  { label: 'Blue',  value: '#52b5d4' },
]

const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200]
// Zeichen pro "Seite" bei der Locations-Generierung. Kleiner = feinere
// Granularität → ein "Weiterblättern" bewegt die Seitenzahl im Schnitt um
// weniger und gleichmäßigere Schritte (die tatsächlich gerenderte Seite hängt
// von Widget-Breite/Zoom/Spalten ab, deshalb bleibt es eine Annäherung, egal
// wie fein — 300 statt 1024 verkleinert nur den typischen Sprung spürbar).
const EPUB_LOCATION_CHARS = 300

type ScrollDir = 'vertical' | 'horizontal'

interface HighlightRect { x: number; y: number; w: number; h: number }
interface SelectionState { text: string; x: number; y: number; rects?: HighlightRect[]; cfiRange?: string }

function fileTypeOf(fileName: string | undefined, stored?: ReaderFileType): ReaderFileType {
  if (stored) return stored
  return fileName?.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf'
}

// ── SVG icon helpers ──────────────────────────────────────────────────────────

function Svg({ children, size = 14 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const IcoChevLeft   = () => <Svg><polyline points="15,18 9,12 15,6"/></Svg>
const IcoChevRight  = () => <Svg><polyline points="9,18 15,12 9,6"/></Svg>
const IcoSkipLeft   = () => <Svg><polyline points="19,18 13,12 19,6"/><line x1="5" y1="6" x2="5" y2="18"/></Svg>
const IcoSkipRight  = () => <Svg><polyline points="5,18 11,12 5,6"/><line x1="19" y1="6" x2="19" y2="18"/></Svg>
const IcoZoomIn     = () => <Svg><circle cx="11" cy="11" r="7"/><line x1="18" y1="18" x2="14.35" y2="14.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></Svg>
const IcoZoomOut    = () => <Svg><circle cx="11" cy="11" r="7"/><line x1="18" y1="18" x2="14.35" y2="14.35"/><line x1="8" y1="11" x2="14" y2="11"/></Svg>
const IcoUpload     = () => <Svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></Svg>
const IcoHighlight  = () => <Svg size={13}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></Svg>
const IcoBurger     = () => <Svg size={13}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></Svg>
// Scroll direction icons — ↕ vertical, ↔ horizontal
const IcoScrollV    = () => <Svg size={13}><path d="M12 3v18"/><polyline points="8,7 12,3 16,7"/><polyline points="8,17 12,21 16,17"/></Svg>
const IcoScrollH    = () => <Svg size={13}><path d="M3 12h18"/><polyline points="7,8 3,12 7,16"/><polyline points="17,8 21,12 17,16"/></Svg>
const IcoLink       = () => <Svg size={11}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>
// Zweiseiten-Symbol: zwei nebeneinanderliegende Blätter, wie ein aufgeschlagenes Buch
const IcoSpread     = () => <Svg size={13}><path d="M12 4v17"/><path d="M4 6c3-1.5 6-1.5 8 0v15c-2-1.5-5-1.5-8 0z"/><path d="M20 6c-3-1.5-6-1.5-8 0v15c2-1.5 5-1.5 8 0z"/></Svg>

// ── Page transition variants ──────────────────────────────────────────────────

type PageCustom = { dir: 1 | -1; mode: ScrollDir }

const pageVariants = {
  enter: (c: PageCustom) => ({
    x: c.mode === 'horizontal' ? (c.dir > 0 ?  '55%' : '-55%') : 0,
    y: c.mode === 'vertical'   ? (c.dir > 0 ?  '55%' : '-55%') : 0,
    opacity: 0,
  }),
  center: { x: 0, y: 0, opacity: 1 },
  exit: (c: PageCustom) => ({
    x: c.mode === 'horizontal' ? (c.dir > 0 ? '-55%' :  '55%') : 0,
    y: c.mode === 'vertical'   ? (c.dir > 0 ? '-55%' :  '55%') : 0,
    opacity: 0,
    pointerEvents: 'none' as const,
  }),
}

// ── Lazy page thumbnail ───────────────────────────────────────────────────────
// Rendering every page of a large PDF as a live react-pdf <Page> canvas at once
// (previously the whole sidebar) is expensive for anything beyond a handful of
// pages. Each thumbnail defers its own <Page> mount until it first scrolls
// into view (IntersectionObserver, default root = clipped viewport rect —
// this already respects the panel's own overflow:auto ancestor), then stays
// mounted so it doesn't re-render on every scroll pass.
function PdfThumbnail({ pageNum, isCurrent, onClick }: { pageNum: number; isCurrent: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { rootMargin: '300px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  return (
    <button
      ref={ref}
      onClick={onClick}
      style={{
        display: 'block', width: '100%', border: `2px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
        background: 'transparent', font: 'inherit', padding: 0,
        marginBottom: 4, cursor: 'pointer', borderRadius: 3,
        overflow: 'hidden', flexShrink: 0, position: 'relative',
        transition: 'border-color 0.12s',
      }}
    >
      {visible
        ? <Page pageNumber={pageNum} width={72} renderTextLayer={false} renderAnnotationLayer={false} />
        : <div style={{ width: 72, aspectRatio: '1 / 1.414', background: 'var(--surface)' }} />}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        fontSize: 8, textAlign: 'center', padding: '1px 0',
        background: 'rgba(0,0,0,0.45)', color: 'white',
        fontWeight: isCurrent ? 700 : 400,
      }}>{pageNum}</div>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReaderWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const d = widget.data as {
    fileName?: string; fileData?: string; fileType?: ReaderFileType
    highlights?: Record<string, ReaderHighlight>; currentPage?: number
    currentCfi?: string; epubLocations?: string; epubLocationsRef?: string
    scrollDir?: ScrollDir; twoPageSpread?: boolean
  }
  const updateWidget      = useBoardStore(s => s.updateWidget)
  const updateWidgetQuiet = useBoardStore(s => s.updateWidgetQuiet)
  const allWidgets   = useBoardStore(useShallow(s => selectBoard(s)?.widgets ?? {}))
  const mode         = useUIStore(s => s.mode)
  // Das Board wird per CSS transform:scale gezoomt (InfiniteCanvas.tsx) — anders
  // als Text/Vektor-Inhalte wird ein <canvas> dabei vom Browser NICHT neu
  // gerastert, sondern nur als Bitmap hochskaliert (Unschärfe bei Board-Zoom).
  // react-pdf berücksichtigt window.devicePixelRatio bereits automatisch für
  // normale Bildschirmschärfe (node_modules/react-pdf Canvas.js) — hier wird
  // zusätzlich der aktuelle Board-Zoom eingerechnet, damit die PDF-Seite auch
  // bei reingezoomtem Board in voller Auflösung gerendert wird.
  const boardZoom    = useUIStore(s => s.canvasView.zoom)
  // Ein Floor von 2x, unabhängig vom tatsächlichen devicePixelRatio: auf einem
  // ganz normalen 1x-Monitor sah die Seite mit pdfDpr=1 (native, unskalierte
  // Canvas-Auflösung) spürbar weicher aus als ein echter PDF-Reader — PDF.js'
  // Canvas-Rendering (Kantenglättung von Vektor-Text) braucht zum "scharf"
  // wirken Supersampling, reines 1:1-Rastern reicht nicht, selbst wenn es
  // technisch korrekt der Bildschirmauflösung entspricht. Nach oben gedeckelt,
  // damit ein bereits hochauflösendes Display (3x) kombiniert mit starkem
  // Board-Zoom keine unnötig riesige Canvas-Fläche erzeugt.
  const pdfDpr       = Math.min(4, Math.max(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) * Math.max(1, boardZoom)))
  // Manche EPUBs setzen selbst keinen Hintergrund (transparent) — bei dunklem
  // Board-Theme würde dann der (meist dunkle) Standardtext auf der dunklen
  // Widget-Fläche unlesbar. Bei dunklen Themes erzwingen wir deshalb einen
  // weißen Hintergrund für den EPUB-Inhalt, unabhängig vom eigenen Stylesheet
  // des Buchs (s. Effekt weiter unten, der rendition.themes.override nutzt).
  const boardThemeId    = useBoardStore(s => selectBoard(s)?.themeId)
  const isDarkBoardTheme = !LIGHT_THEME_IDS.includes(boardThemeId ?? 'dark')
  // idb-blob://-Referenz → Objekt-URL; alte DataURL-Boards werden durchgereicht
  const resolvedFile = useBlobUrl(d.fileData)
  const fileType = fileTypeOf(d.fileName, d.fileType)

  const [numPages,    setNumPages]    = useState(0)
  const [currentPage, setCurrentPage] = useState(d.currentPage ?? 1)
  const [selection,    setSelection]    = useState<SelectionState | null>(null)
  const suppressSelectionRef = useRef(false)
  const [showSidebar,   setShowSidebar]   = useState(true)
  const [showPagePanel, setShowPagePanel] = useState(false)
  const [fitWidth,    setFitWidth]    = useState(400)
  const [zoom,        setZoom]        = useState(100)
  const [scrollDir,   setScrollDir]   = useState<ScrollDir>(d.scrollDir ?? 'vertical')
  const [twoPageSpread, setTwoPageSpread] = useState(!!d.twoPageSpread)
  const [direction,   setDirection]   = useState<1 | -1>(1)
  const [linkingHighlightId, setLinkingHighlightId] = useState<string | null>(null)
  const [pendingFile,       setPendingFile]       = useState<File | null>(null)
  const [confirmDeleteHl,   setConfirmDeleteHl]   = useState<{ id: string; count: number } | null>(null)
  const [expandedHls,       setExpandedHls]       = useState<Set<string>>(new Set())
  const [epubLoading,       setEpubLoading]       = useState(true)
  const [epubError,         setEpubError]         = useState(false)
  // Inhaltsverzeichnis des EPUBs (verschachtelte Einträge flach mit Ebene)
  const [epubToc,           setEpubToc]           = useState<{ label: string; href: string; depth: number }[]>([])
  const [epubHref,          setEpubHref]          = useState('')
  const [importToast,      setImportToast]      = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const containerRef     = useRef<HTMLDivElement>(null)
  const viewerRef        = useRef<HTMLDivElement>(null)
  const pageRef          = useRef<HTMLDivElement>(null)
  const epubContainerRef = useRef<HTMLDivElement>(null)
  const bookRef          = useRef<Book | null>(null)
  const renditionRef     = useRef<Rendition | null>(null)
  const pdfDocRef        = useRef<PDFDocumentProxy | null>(null)
  const selectedContentsRef = useRef<Contents | null>(null)

  // AnimatePresence keeps the exiting page copy mounted during the transition.
  // When that copy finally unmounts, React nulls its ref object — which would
  // wipe pageRef even though it already points at the NEW page's element and
  // silently break highlighting on every page after the first transition.
  // Guard: only accept real elements; the next page's mount overwrites it.
  const setPageRef = useCallback((el: HTMLDivElement | null) => {
    if (el) pageRef.current = el
  }, [])

  // Refs to prevent stale closures in the wheel handler
  const dRef             = useRef(d);           dRef.current           = d
  const zoomRef          = useRef(zoom);        zoomRef.current        = zoom
  const scrollDirRef     = useRef(scrollDir);   scrollDirRef.current   = scrollDir
  const currentPageRef   = useRef(currentPage); currentPageRef.current = currentPage
  const numPagesRef      = useRef(numPages);    numPagesRef.current    = numPages
  const fileTypeRef      = useRef(fileType);    fileTypeRef.current    = fileType
  const twoPageRef       = useRef(twoPageSpread); twoPageRef.current   = twoPageSpread
  const isDarkBoardThemeRef = useRef(isDarkBoardTheme); isDarkBoardThemeRef.current = isDarkBoardTheme
  const wheelCooldownRef = useRef(false)

  // Erzwungenen hellen Hintergrund an- oder abschalten — als eigene Funktion,
  // weil sie sowohl direkt nach dem Rendition-Aufbau als auch reaktiv bei
  // einem Theme-Wechsel während des Lesens aufgerufen werden muss.
  const applyDarkFix = useCallback((rendition: Rendition, dark: boolean) => {
    // epubjs' Themes-Typdefinitionen kennen kein removeOverride() (existiert
    // im JS zwar, fehlt aber im .d.ts) — ein leerer Wert bewirkt intern
    // dasselbe (Content.css() entfernt die Eigenschaft bei leerem value).
    rendition.themes.override('background', dark ? '#ffffff' : '', true)
  }, [])

  // Reaktiv: Board-Theme wird gewechselt, während das EPUB schon offen ist
  useEffect(() => {
    if (fileType === 'epub' && renditionRef.current) applyDarkFix(renditionRef.current, isDarkBoardTheme)
  }, [isDarkBoardTheme, fileType, applyDarkFix])

  // Mausrad-Blättern für EPUB: epub.js rendert jedes Kapitel in einem eigenen
  // <iframe> — Wheel-Events darin erreichen NIE den äußeren Container-Listener
  // (iframes bubbeln grundsätzlich nicht über die Dokumentgrenze, und epub.js
  // leitet nur eine feste Liste an Events weiter, "wheel" ist nicht dabei, s.
  // contents.js/DOM_EVENTS). Ohne diesen Handler würde Scrollen über dem
  // eigentlichen Buchtext also nie umblättern, sondern nur über dem schmalen
  // Rand-Padding um den Inhalt herum. Wird pro gerendertem Kapitel über
  // rendition.hooks.content direkt auf dessen iframe-Dokument registriert.
  const handleEpubWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault()
      setZoom(prev => {
        const idx  = ZOOM_STEPS.indexOf(prev)
        const next = idx === -1 ? 2 : Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + (e.deltaY < 0 ? 1 : -1)))
        return ZOOM_STEPS[next]
      })
      return
    }
    // Im vertikalen Modus ist der Inhalt ein durchgehender Fließtext — dort
    // soll das Mausrad ganz normal nativ scrollen (wie auf einer Webseite),
    // epub.js aktualisiert die aktuelle Position dabei selbst über sein
    // eigenes Scroll-Tracking. Nur im horizontalen (paginierten) Modus
    // entspricht ein Wheel-Tick sinnvoll einem diskreten Seitenwechsel.
    if (scrollDirRef.current !== 'horizontal') return
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Math.abs(delta) < 5) return
    e.preventDefault()
    if (wheelCooldownRef.current) return
    wheelCooldownRef.current = true
    setTimeout(() => { wheelCooldownRef.current = false }, 420)
    if (delta > 0) renditionRef.current?.next()?.catch?.(() => {})
    else           renditionRef.current?.prev()?.catch?.(() => {})
  }, [])

  const highlights = d.highlights ?? {}

  // Fit viewer width/height (Höhe wird für die EPUB-Rendition gebraucht)
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setFitWidth(Math.max(180, el.offsetWidth - 24))
      if (fileTypeRef.current === 'epub') renditionRef.current?.resize(el.offsetWidth, el.offsetHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Kapitel-/Seiten-Panel oder Markierungs-Sidebar auf-/zuklappen ändert die
  // Breite des Viewers sofort (Flexbox), aber der ResizeObserver oben feuert
  // erst asynchron im nächsten Frame — bis dahin bleibt der bereits gerenderte
  // EPUB-Inhalt (zwei CSS-Spalten) auf die alte Breite umbrochen, während der
  // "Buchrücken"-Schatten (der sich rein aus CSS-Prozenten ergibt) sofort
  // springt. Ergebnis: die Mittellinie sitzt bis zum nächsten Seitenwechsel
  // sichtbar daneben. Ein expliziter, synchroner resize() direkt bei diesem
  // State-Wechsel schließt die Lücke.
  useEffect(() => {
    if (fileType !== 'epub') return
    const el = viewerRef.current
    if (!el || !renditionRef.current) return
    renditionRef.current.resize(el.offsetWidth, el.offsetHeight)
  }, [showPagePanel, showSidebar, fileType])

  // Sync currentPage from store (allows external navigation from NoteWidget)
  useEffect(() => {
    const stored = d.currentPage ?? 1
    if (stored !== currentPage) {
      setDirection(stored > currentPage ? 1 : -1)
      setCurrentPage(stored)
      if (fileType === 'epub') {
        // Der Klick aus dem NoteWidget (PdfRef-Mark) patcht nur `currentPage`
        // im Store, nicht `currentCfi` — d.currentCfi zeigt hier also noch auf
        // die ALTE, bereits angezeigte Stelle. Die neue Seitenzahl muss daher
        // genau wie in goTo() selbst in eine CFI umgerechnet werden, sonst
        // zeigt rendition.display() wieder nur die aktuelle Stelle erneut an
        // (sichtbar keine Bewegung — genau der gemeldete Bug).
        const cfi = bookRef.current?.locations.cfiFromLocation(stored)
        if (typeof cfi === 'string' && cfi) renditionRef.current?.display(cfi).catch(() => {})
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.currentPage])

  function patch(partial: Record<string, unknown>) {
    updateWidget(widget.id, { data: { ...d, ...partial } })
  }

  // Lesezustand (Seite/CFI) still persistieren: kein Undo-Schritt, kein
  // lastEdited-Bump — bloßes Lesen ist keine Bearbeitung. Beim EPUB-Scrollen
  // feuert "relocated" im Sekundentakt, deshalb zusätzlich entprellt: sonst
  // serialisiert zustand-persist die komplette Boards-Map pro Scroll-Tick.
  const posFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPosRef = useRef<Record<string, unknown> | null>(null)
  const patchQuiet = useCallback((partial: Record<string, unknown>, debounce = false) => {
    pendingPosRef.current = { ...(pendingPosRef.current ?? {}), ...partial }
    const flush = () => {
      const p = pendingPosRef.current
      pendingPosRef.current = null
      posFlushTimer.current = null
      if (p) updateWidgetQuiet(widget.id, { data: { ...dRef.current, ...p } })
    }
    if (posFlushTimer.current) clearTimeout(posFlushTimer.current)
    if (debounce) posFlushTimer.current = setTimeout(flush, 1000)
    else flush()
  }, [updateWidgetQuiet, widget.id])
  // Ausstehende Position beim Unmount noch wegschreiben
  useEffect(() => () => {
    if (posFlushTimer.current) clearTimeout(posFlushTimer.current)
    const p = pendingPosRef.current
    if (p) updateWidgetQuiet(widget.id, { data: { ...dRef.current, ...p } })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── KI-Markierungen: alle Vorkommen eines Suchtexts markieren ──────────────
  // Über die readerRegistry vom highlight_in_reader-Tool aufrufbar (lib/ai).
  // Greift nur auf Refs zu — keine veralteten Closures, eine Registrierung
  // pro Widget-Lebensdauer genügt.
  const pdfHighlightAll = useCallback(async (query: string, color: string): Promise<number> => {
    const doc = pdfDocRef.current
    if (!doc) throw new Error('PDF not loaded')
    const q = query.toLowerCase()
    const newHls: Record<string, ReaderHighlight> = {}
    let total = 0
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const vp   = page.getViewport({ scale: 1 })
      const tc   = await page.getTextContent()
      const rects: HighlightRect[] = []
      let n = 0
      for (const item of tc.items) {
        if (!('str' in item) || !item.str) continue
        const s  = item.str
        const ls = s.toLowerCase()
        let idx = ls.indexOf(q)
        while (idx !== -1) {
          n++
          // Rechteck aus dem Textitem ableiten: transform[4/5] = Ursprung
          // (PDF-y zählt von unten), Breite anteilig zur Trefferposition
          const x0 = item.transform[4] as number
          const y0 = item.transform[5] as number
          const x  = x0 + item.width * (idx / s.length)
          const w  = item.width * (q.length / s.length)
          rects.push({
            x: Math.max(0, x / vp.width * 100),
            y: Math.max(0, (vp.height - y0 - item.height) / vp.height * 100),
            w: Math.min(100, w / vp.width * 100),
            h: Math.min(100, (item.height * 1.25) / vp.height * 100),
          })
          idx = ls.indexOf(q, idx + Math.max(1, q.length))
        }
      }
      if (n > 0) {
        total += n
        const id = `h_${Date.now()}_p${p}`
        newHls[id] = { id, page: p, text: `„${query}" (${n}×)`, color, createdAt: Date.now(), rects }
      }
    }
    if (total > 0) {
      updateWidget(widget.id, { data: { ...dRef.current, highlights: { ...(dRef.current.highlights ?? {}), ...newHls } } })
    }
    return total
  }, [updateWidget, widget.id])

  const epubHighlightAll = useCallback(async (query: string, color: string): Promise<number> => {
    const book = bookRef.current
    if (!book) throw new Error('EPUB not loaded')
    type SpineItem = {
      load:   (loader: unknown) => Promise<unknown>
      unload: () => void
      find:   (q: string) => { cfi: string; excerpt?: string }[]
    }
    const items: SpineItem[] = []
    ;(book.spine as unknown as { each: (cb: (i: SpineItem) => void) => void }).each(i => items.push(i))
    const newHls: Record<string, ReaderHighlight> = {}
    let total = 0
    for (const item of items) {
      try {
        await item.load(book.load.bind(book))
        for (const m of item.find(query)) {
          total++
          const id = `h_${Date.now()}_${total}`
          const pageIdx = Math.max(1, (book.locations.locationFromCfi(m.cfi) as unknown as number) || 1)
          newHls[id] = { id, page: pageIdx, text: m.excerpt?.trim() || query, color, createdAt: Date.now(), cfiRange: m.cfi }
          try {
            renditionRef.current?.annotations.add('highlight', m.cfi, {}, undefined, 'epub-hl',
              { fill: color, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' })
          } catch { /* Abschnitt evtl. nicht gerendert */ }
        }
      } catch { /* einzelnes Kapitel unlesbar → weiter */ }
      finally { try { item.unload() } catch { /* ignore */ } }
    }
    if (total > 0) {
      updateWidget(widget.id, { data: { ...dRef.current, highlights: { ...(dRef.current.highlights ?? {}), ...newHls } } })
    }
    return total
  }, [updateWidget, widget.id])

  // Datei entfernt/gewechselt → alter PDF-Proxy darf nicht weiterleben
  useEffect(() => {
    if (fileType !== 'pdf' || !resolvedFile) pdfDocRef.current = null
  }, [fileType, resolvedFile])

  useEffect(() => {
    registerReader(widget.id, {
      highlightAll: (q, c) => (fileTypeRef.current === 'epub' ? epubHighlightAll(q, c) : pdfHighlightAll(q, c)),
    })
    return () => unregisterReader(widget.id)
  }, [widget.id, pdfHighlightAll, epubHighlightAll])

  // ── EPUB: Book + Rendition anlegen/abbauen ─────────────────────────────────
  // Eigener Lebenszyklus, komplett getrennt von der PDF-Logik. Läuft neu an,
  // sobald sich Datei oder Dateityp ändert; räumt beim Verlassen sauber auf.
  useEffect(() => {
    if (fileType !== 'epub' || !resolvedFile || !epubContainerRef.current) return
    let cancelled = false
    setEpubLoading(true)
    setEpubError(false)

    // Als ArrayBuffer laden statt die Blob-URL zu übergeben: blob:-URLs haben
    // keine .epub-Endung, weshalb epub.js sie als entpacktes VERZEICHNIS
    // interpretiert und vergeblich blobUrl/META-INF/container.xml anfragt.
    const book = ePub()
    bookRef.current = book

    fetch(resolvedFile)
      .then(r => r.arrayBuffer())
      .then(buf => {
        if (cancelled) return Promise.reject(new Error('cancelled'))
        book.open(buf, 'binary')
        return book.ready
      })
      .then(async () => {
        if (cancelled) return
        // Locations-Cache aus der Blob-DB (bei dicken Büchern hunderte KB —
        // im Board-JSON würde er bei JEDEM Persist mitserialisiert)
        const saveLocations = async () => {
          const ref = await saveBlob(new Blob([book.locations.save()], { type: 'application/json' }))
          patch({ epubLocationsRef: ref, epubLocations: undefined })
        }
        const cachedRef = dRef.current.epubLocationsRef
        const cachedBlob = cachedRef ? await getBlob(cachedRef) : null
        if (cancelled) return
        if (cachedBlob) {
          book.locations.load(await cachedBlob.text())
        } else if (dRef.current.epubLocations) {
          // Legacy-Boards: Inline-Cache nutzen und in die Blob-DB migrieren
          book.locations.load(dRef.current.epubLocations)
          await saveLocations()
        } else {
          await book.locations.generate(EPUB_LOCATION_CHARS)
          if (cancelled) return
          await saveLocations()
        }
        if (cancelled) return
        setNumPages(book.locations.length())

        // Inhaltsverzeichnis fürs Kapitel-Panel (verschachtelt → flach mit Ebene)
        try {
          const nav = await book.loaded.navigation
          if (cancelled) return
          type NavItem = { label: string; href: string; subitems?: NavItem[] }
          const flatten = (items: NavItem[], depth: number): { label: string; href: string; depth: number }[] =>
            items.flatMap(i => [
              { label: (i.label ?? '').trim() || i.href, href: i.href, depth },
              ...flatten(i.subitems ?? [], depth + 1),
            ])
          setEpubToc(flatten((nav?.toc ?? []) as NavItem[], 0))
        } catch { setEpubToc([]) }

        // Ohne diesen Check könnte zwischen dem letzten await (book.loaded.navigation)
        // und hier die Cleanup schon gelaufen sein (Datei-/Board-Wechsel, Unmount) —
        // book.renderTo() würde dann eine neue, nie zerstörte Rendition an einen
        // eventuell schon fremden/entfernten Container hängen (Leak + Fehlbindung).
        if (cancelled) return
        const el = epubContainerRef.current
        if (!el) return
        const rendition = book.renderTo(el, {
          width: '100%', height: '100%',
          flow: scrollDirRef.current === 'horizontal' ? 'paginated' : 'scrolled-doc',
          spread: twoPageRef.current ? 'auto' : 'none',
          // epub.js aktiviert "auto"-Spread nur ab minSpreadWidth (Default 800px) —
          // Reader-Widgets sind im Grid meist schmaler, wodurch der Zwei-Seiten-
          // Umschalter sonst nie sichtbar greifen würde. 0 heißt: sobald der Nutzer
          // den Umschalter aktiviert, wird die Spread-Ansicht unabhängig von der
          // Containerbreite gezeigt.
          minSpreadWidth: 0,
        })
        renditionRef.current = rendition
        // Direkt auf dem iframe-Dokument jedes gerenderten Kapitels registriert
        // (s. Kommentar bei handleEpubWheel) — läuft für jedes Kapitel neu, das
        // iframe-Element (und damit dieser Listener) wird beim Section-Wechsel
        // von epub.js selbst entsorgt.
        rendition.hooks.content.register((contents: Contents) => {
          contents.document.addEventListener('wheel', handleEpubWheel, { passive: false })
        })

        // Vorhandene Markierungen wieder als sichtbare Annotationen anzeigen
        for (const h of Object.values(dRef.current.highlights ?? {})) {
          if (h.cfiRange) {
            try {
              rendition.annotations.add('highlight', h.cfiRange, {}, undefined, 'epub-hl',
                { fill: h.color, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' })
            } catch { /* CFI gehört evtl. zu einer inzwischen anderen Locations-Version */ }
          }
        }

        rendition.on('relocated', (loc: { start: { cfi: string; href?: string } }) => {
          const idx = Math.max(1, book.locations.locationFromCfi(loc.start.cfi) as unknown as number ?? 1)
          setCurrentPage(idx)
          setEpubHref(loc.start.href ?? '')
          patchQuiet({ currentPage: idx, currentCfi: loc.start.cfi }, true)
        })
        rendition.on('selected', (cfiRange: string, contents: Contents) => {
          if (useUIStore.getState().mode !== 'edit') return
          selectedContentsRef.current = contents
          const text = contents.window.getSelection()?.toString().trim() ?? ''
          if (!text) return
          setTimeout(() => {
            if (suppressSelectionRef.current) { suppressSelectionRef.current = false; return }
            setSelection({ text, x: 0, y: 0, cfiRange })
          }, 0)
        })

        rendition.themes.fontSize(zoomRef.current + '%')
        applyDarkFix(rendition, isDarkBoardThemeRef.current)
        // Gespeicherte Position kann veraltet/ungültig sein ("No Section
        // Found") → dann am Buchanfang öffnen statt gar nicht
        try {
          await rendition.display(dRef.current.currentCfi || undefined)
        } catch {
          await rendition.display().catch(() => {})
        }
        if (cancelled) return
        setEpubLoading(false)
      })
      .catch(() => { if (!cancelled) { setEpubLoading(false); setEpubError(true) } })

    return () => {
      cancelled = true
      if (renditionRef.current) {
        // epub.js-Bug/Race: Rendition.destroy() setzt this.book auf
        // undefined, räumt die interne Task-Queue aber NICHT auf. Der
        // Rendition-Konstruktor stellt rendition.start dort ein, sobald
        // book.opened aufgelöst ist — ist das beim Zerstören (schnelles
        // Wegnavigieren/Board-Wechsel direkt nach dem Öffnen, oder React
        // Strict-Mode-Doppel-Mount) noch nicht gelaufen, feuert es später
        // trotzdem und crasht auf `this.book.package` (this.book ist dann
        // schon undefined). Vor dem Zerstören zum No-op machen schließt
        // exakt diese Lücke, ohne epub.js selbst patchen zu müssen.
        renditionRef.current.start = () => {}
        renditionRef.current.destroy()
      }
      renditionRef.current = null
      bookRef.current?.destroy()
      bookRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileType, resolvedFile])

  // EPUB: Fließrichtung/Doppelseite ändern, ohne die Rendition neu aufzubauen
  useEffect(() => {
    if (fileType !== 'epub' || !renditionRef.current) return
    renditionRef.current.flow(scrollDir === 'horizontal' ? 'paginated' : 'scrolled-doc')
    renditionRef.current.spread(twoPageSpread ? 'auto' : 'none', 0)
  }, [fileType, scrollDir, twoPageSpread])

  // EPUB: Zoom = Schriftgröße bei fließendem Text
  useEffect(() => {
    if (fileType !== 'epub' || !renditionRef.current) return
    renditionRef.current.themes.fontSize(zoom + '%')
  }, [fileType, zoom])

  function stepZoom(delta: 1 | -1) {
    setZoom(prev => {
      const idx  = ZOOM_STEPS.indexOf(prev)
      const next = idx === -1 ? 2 : Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + delta))
      return ZOOM_STEPS[next]
    })
  }

  // Schrittweite pro "Blättern": 2 im Doppelseiten-Modus, sonst 1 (nur PDF —
  // EPUB blättert im Spread-Modus intern selbst über zwei Seiten pro Schritt)
  const pageStep = fileType === 'pdf' && scrollDir === 'horizontal' && twoPageSpread ? 2 : 1

  function goTo(page: number) {
    if (fileType === 'epub') {
      // Auch für EPUB einklemmen: cfiFromLocation liefert für ungültige
      // Werte (NaN aus leerem Eingabefeld, außerhalb des Bereichs) -1 —
      // ungeprüft an display() gereicht wirft das "No Section Found".
      const p = Math.max(1, Math.min(numPages || 1, Math.round(page) || 1))
      const cfi = bookRef.current?.locations.cfiFromLocation(p)
      if (typeof cfi === 'string' && cfi) renditionRef.current?.display(cfi).catch(() => {})
      return
    }
    const p = Math.max(1, Math.min(numPages || 1, page))
    if (p === currentPage) return
    setDirection(p > currentPage ? 1 : -1)
    setCurrentPage(p)
    patchQuiet({ currentPage: p })
  }

  function stepPage(dir: 1 | -1) {
    if (fileType === 'epub') {
      if (dir > 0) renditionRef.current?.next()?.catch?.(() => {})
      else         renditionRef.current?.prev()?.catch?.(() => {})
      return
    }
    goTo(currentPage + dir * pageStep)
  }

  function toggleScrollDir() {
    const next: ScrollDir = scrollDir === 'vertical' ? 'horizontal' : 'vertical'
    setScrollDir(next)
    patch({ scrollDir: next })
  }

  function toggleTwoPageSpread() {
    const next = !twoPageSpread
    setTwoPageSpread(next)
    patch({ twoPageSpread: next })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey) {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1) }
      if (e.key === '-')                  { e.preventDefault(); stepZoom(-1) }
      if (e.key === '0')                  { e.preventDefault(); setZoom(100) }
      return
    }
    const isH = scrollDir === 'horizontal'
    if ((isH ? e.key === 'ArrowRight' : e.key === 'ArrowDown') || e.key === 'PageDown') {
      e.preventDefault(); stepPage(1)
    }
    if ((isH ? e.key === 'ArrowLeft'  : e.key === 'ArrowUp')   || e.key === 'PageUp') {
      e.preventDefault(); stepPage(-1)
    }
    if (e.key === 'Home') { e.preventDefault(); goTo(1) }
    if (e.key === 'End')  { e.preventDefault(); goTo(numPages) }
  }

  // Mausrad — als Callback-Ref registriert statt in einem eigenen useEffect mit
  // containerRef.current: beim allerersten Render (bevor eine Datei geladen
  // ist) zeigt containerRef noch auf nichts, denn dieser Container existiert
  // erst im "Datei geladen"-Zweig weiter unten. Ein useEffect mit leeren Deps
  // läuft aber nur EIN einziges Mal direkt nach dem allerersten Mount — findet
  // er containerRef.current dort null vor, bricht er ab und wird nie wieder
  // ausgeführt, auch nicht nachdem die Datei geladen ist und der Container
  // real existiert. Ergebnis: das Mausrad scrollte nur noch nativ innerhalb
  // der Seite, blätterte aber nie um. Ein Callback-Ref feuert dagegen genau
  // dann, wenn der echte DOM-Knoten entsteht — unabhängig von Render-Reihenfolge.
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    wheelCleanupRef.current?.()
    wheelCleanupRef.current = null
    containerRef.current = el
    if (!el) return

    function onWheel(e: WheelEvent) {
      // Der Wheel-Listener hängt am äußersten Widget-Container (er muss auch
      // dann funktionieren, wenn noch keine Datei geladen ist) und würde ohne
      // diesen Check auch beim Scrollen über dem Kapitel-/Seiten-Panel oder
      // der Markierungs-Sidebar auslösen. Nur innerhalb des eigentlichen
      // Datei-Viewers (PDF/EPUB) soll das Mausrad blättern/zoomen — die
      // Seitenpanele sollen stattdessen ganz normal nativ scrollen. Wichtig:
      // nur stopPropagation (nicht preventDefault), sonst würde das native
      // Scrollen im Panel selbst auch unterdrückt; ohne stopPropagation würde
      // das Event dagegen bis zur Board-Leinwand durchbubbeln und diese
      // wegscrollen/zoomen (das Widget verschwindet dann aus dem Blickfeld).
      if (viewerRef.current && e.target instanceof Node && !viewerRef.current.contains(e.target)) {
        e.stopPropagation()
        return
      }
      // Ctrl+Rad → Zoom
      if (e.ctrlKey) {
        e.stopPropagation()
        e.preventDefault()
        setZoom(prev => {
          const idx  = ZOOM_STEPS.indexOf(prev)
          const next = idx === -1 ? 2 : Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + (e.deltaY < 0 ? 1 : -1)))
          return ZOOM_STEPS[next]
        })
        return
      }
      // Reingezoomte PDF-Seiten: natives Scrollen zulassen (Bubbling trotzdem stoppen)
      if (fileTypeRef.current === 'pdf' && zoomRef.current > 100) {
        e.stopPropagation()
        return
      }

      const isH  = scrollDirRef.current === 'horizontal'
      // EPUB im vertikalen Modus: durchgehender Fließtext soll nativ scrollen,
      // nicht seitenweise springen (s. handleEpubWheel für die ausführliche
      // Begründung — dieselbe Regel gilt hier für den schmalen Rand um den
      // eigentlichen Buchinhalt, über den dieser Container-Listener greift).
      if (fileTypeRef.current === 'epub' && !isH) return
      const delta = isH
        ? (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY)
        : e.deltaY
      if (Math.abs(delta) < 5) return

      e.preventDefault()
      e.stopPropagation()
      if (wheelCooldownRef.current) return
      wheelCooldownRef.current = true
      setTimeout(() => { wheelCooldownRef.current = false }, 420)

      const dir: 1 | -1 = delta > 0 ? 1 : -1
      if (fileTypeRef.current === 'epub') {
        if (dir > 0) renditionRef.current?.next()?.catch?.(() => {})
        else         renditionRef.current?.prev()?.catch?.(() => {})
        return
      }
      const step = fileTypeRef.current === 'pdf' && scrollDirRef.current === 'horizontal' && twoPageRef.current ? 2 : 1
      const next = Math.max(1, Math.min(numPagesRef.current, currentPageRef.current + dir * step))
      if (next === currentPageRef.current) return
      setDirection(dir)
      setCurrentPage(next)
      patchQuiet({ currentPage: next })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    wheelCleanupRef.current = () => el.removeEventListener('wheel', onWheel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setImportToast(msg)
    toastTimerRef.current = setTimeout(() => setImportToast(null), 3500)
  }

  async function handleFileUpload(file: File) {
    // Datei als Blob in IndexedDB — im Board-JSON steht nur die Referenz
    try {
      const ref  = await saveBlob(file)
      const type = fileTypeOf(file.name)
      patch({
        fileName: file.name, fileData: ref, fileType: type,
        currentPage: 1, highlights: {}, currentCfi: undefined, epubLocations: undefined, epubLocationsRef: undefined,
      })
      setCurrentPage(1)
      showToast(`${file.name} - ${t('added')}`)
    } catch { /* Blob-Speicher nicht verfügbar */ }
  }

  function handleFileChange(file: File) {
    const hasHighlights = Object.keys(d.highlights ?? {}).length > 0
    if (hasHighlights) {
      setPendingFile(file)
    } else {
      handleFileUpload(file)
    }
  }

  function cleanupLinkedNotes() {
    const readerId  = widget.id
    const escapedId = readerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const spanRe    = new RegExp(`<span[^>]*data-pdf-reader="${escapedId}"[^>]*>[\\s\\S]*?<\\/span>`, 'g')
    for (const [id, w] of Object.entries(allWidgets)) {
      if (w.type !== 'note') continue
      const content = (w.data.content ?? '') as string
      if (!content.includes(`data-pdf-reader="${readerId}"`)) continue
      const cleaned = content.replace(spanRe, '').replace(/\n{3,}/g, '\n\n')
      updateWidget(id, { data: { ...w.data, content: cleaned } })
    }
  }

  // Listen for pointerup on document (bubble phase) — nur für PDF-Markierungen.
  // IMPORTANT: all selection data is captured SYNCHRONOUSLY here, before any
  // React re-render or DOM mutation (e.g. an AnimatePresence page exit) can
  // detach the text-layer nodes and make window.getSelection() return garbage.
  // The setTimeout(0) only serves to let a colour-button click (saveHighlight →
  // removeAllRanges) clear suppressSelectionRef before we commit state.
  useEffect(() => {
    function onPointerUp() {
      if (fileTypeRef.current !== 'pdf') return
      // Markieren ist nur im Bearbeiten-Modus aktiv
      if (useUIStore.getState().mode !== 'edit') { setSelection(null); return }
      // Capture selection immediately — do NOT defer this part.
      const sel = window.getSelection()
      const collapsed = !sel || sel.rangeCount === 0 || sel.isCollapsed
      if (collapsed) { setSelection(null); return }

      const text = sel.toString().trim()
      if (!text) { setSelection(null); return }

      // Accept nodes inside the widget container OR inside any react-pdf Page
      // element (belt-and-suspenders: containerRef may be stale during transitions).
      const nodeInPage = (n: Node | null) => {
        const el = n instanceof Element ? n : (n as ChildNode | null)?.parentElement
        return el?.closest('.react-pdf__Page') != null
      }
      const inWidget = Boolean(
        containerRef.current?.contains(sel.anchorNode) ||
        containerRef.current?.contains(sel.focusNode) ||
        nodeInPage(sel.anchorNode) ||
        nodeInPage(sel.focusNode),
      )
      if (!inWidget) { setSelection(null); return }

      // Capture geometry NOW, while nodes are still attached.
      let range: Range
      try { range = sel.getRangeAt(0) } catch { setSelection(null); return }

      // Prefer the tracked page wrapper; if it's missing or detached, derive the
      // page element from the selection itself (.react-pdf__Page has the same
      // bounding box as the wrapper the highlight overlays are positioned in).
      let pageEl: Element | null = pageRef.current
      if (!pageEl || !pageEl.isConnected) {
        const n  = sel.anchorNode
        const el = n instanceof Element ? n : n?.parentElement ?? null
        pageEl   = el?.closest('.react-pdf__Page') ?? null
      }
      if (!pageEl) { setSelection(null); return }
      const pRect = pageEl.getBoundingClientRect()
      if (!pRect.width || !pRect.height) { setSelection(null); return }

      const selRect  = range.getBoundingClientRect()
      const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0)

      let rects: HighlightRect[]
      if (rawRects.length > 0) {
        rects = rawRects.map(r => ({
          x: Math.max(0, (r.left  - pRect.left) / pRect.width  * 100),
          y: Math.max(0, (r.top   - pRect.top)  / pRect.height * 100),
          w: Math.min(100, r.width  / pRect.width  * 100),
          h: Math.min(100, r.height / pRect.height * 100),
        }))
      } else if (selRect.width > 0 && selRect.height > 0) {
        rects = [{
          x: Math.max(0, (selRect.left  - pRect.left) / pRect.width  * 100),
          y: Math.max(0, (selRect.top   - pRect.top)  / pRect.height * 100),
          w: Math.min(100, selRect.width  / pRect.width  * 100),
          h: Math.min(100, selRect.height / pRect.height * 100),
        }]
      } else {
        setSelection(null); return
      }

      // Bei 2 nebeneinander liegenden Seiten muss die tatsächliche Seitenzahl
      // aus dem getroffenen Seiten-Element kommen, nicht aus currentPage
      // (das ist im Spread-Modus nur die LINKE Seite).
      const pageAttr = pageEl.getAttribute('data-page-number')
      const hitPage  = pageAttr ? Number(pageAttr) : currentPageRef.current

      const captured = { text, x: selRect.left + selRect.width / 2, y: selRect.top, rects, page: hitPage }

      // Tiny deferral: lets the click event from a colour button (saveHighlight)
      // set suppressSelectionRef before we show the toolbar.
      setTimeout(() => {
        if (suppressSelectionRef.current) { suppressSelectionRef.current = false; return }
        setSelection(captured)
      }, 0)
    }
    document.addEventListener('pointerup', onPointerUp)
    return () => document.removeEventListener('pointerup', onPointerUp)
  }, [])

  function saveHighlight(color: string) {
    if (!selection) return
    suppressSelectionRef.current = true

    if (fileType === 'epub' && selection.cfiRange) {
      const h: ReaderHighlight = {
        id: `h_${Date.now()}`, page: currentPage,
        text: selection.text, color, createdAt: Date.now(), cfiRange: selection.cfiRange,
      }
      patch({ highlights: { ...highlights, [h.id]: h } })
      try {
        renditionRef.current?.annotations.add('highlight', selection.cfiRange, {}, undefined, 'epub-hl',
          { fill: color, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' })
      } catch { /* ignore */ }
      selectedContentsRef.current?.window.getSelection()?.removeAllRanges()
      setSelection(null)
      return
    }

    const h: ReaderHighlight = {
      id: `h_${Date.now()}`, page: (selection as SelectionState & { page?: number }).page ?? currentPage,
      text: selection.text, color,
      createdAt: Date.now(), rects: selection.rects,
    }
    patch({ highlights: { ...highlights, [h.id]: h } })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  function jumpToHighlight(h: ReaderHighlight) {
    if (h.cfiRange) { renditionRef.current?.display(h.cfiRange).catch(() => {}); return }
    goTo(h.page)
  }

  const noteWidgets = Object.values(allWidgets).filter(w => w.type === 'note')

  // ── Verlinkte Notiz-Referenzen einer Markierung finden/entfernen ────────────
  // Spans tragen keine Highlight-ID (geht bei Notiz-Bearbeitung verloren) —
  // Matching daher über Reader-ID + Seite + exakten Text.
  function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

  function highlightSpanRegex(h: ReaderHighlight): RegExp {
    const text = h.text.replace(/[\r\n\t]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
    const rid  = escapeRegex(widget.id)
    return new RegExp(
      `<span[^>]*data-pdf-reader="${rid}"[^>]*data-pdf-page="${h.page}"[^>]*>${escapeRegex(text)}<\\/span>`,
      'g',
    )
  }

  function countLinkedRefs(h: ReaderHighlight): number {
    const re = highlightSpanRegex(h)
    let n = 0
    for (const w of noteWidgets) {
      const content = (w.data.content ?? '') as string
      n += (content.match(re) ?? []).length
    }
    return n
  }

  function removeLinkedRefs(h: ReaderHighlight) {
    const re = highlightSpanRegex(h)
    for (const w of noteWidgets) {
      const content = (w.data.content ?? '') as string
      if (!re.test(content)) { re.lastIndex = 0; continue }
      re.lastIndex = 0
      const cleaned = content.replace(re, '').replace(/\n{3,}/g, '\n\n').trim()
      updateWidget(w.id, { data: { ...w.data, content: cleaned } })
    }
  }

  function doDeleteHighlight(id: string, alsoNotes: boolean) {
    const h = highlights[id]
    if (h && alsoNotes) removeLinkedRefs(h)
    if (h?.cfiRange) { try { renditionRef.current?.annotations.remove(h.cfiRange, 'highlight') } catch { /* ignore */ } }
    const next = { ...highlights }; delete next[id]; patch({ highlights: next })
    setConfirmDeleteHl(null)
  }

  function deleteHighlight(id: string) {
    const h = highlights[id]
    if (!h) return
    const linked = countLinkedRefs(h)
    if (linked > 0) {
      // Warnung: Markierung ist in Notizen verlinkt — erst bestätigen lassen
      setConfirmDeleteHl({ id, count: linked })
    } else {
      doDeleteHighlight(id, false)
    }
  }

  function linkHighlightToNote(noteWidgetId: string, highlight: ReaderHighlight) {
    const noteWidget = allWidgets[noteWidgetId]
    if (!noteWidget) return
    const text  = highlight.text.replace(/[\r\n\t]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
    const c     = highlight.color
    // Insert as a <span data-pdf-reader> so NoteWidget's PdfRef mark handles clicks —
    // no <a href> means no browser navigation.
    const span  = `<span class="pdf-ref" data-pdf-reader="${widget.id}" data-pdf-page="${highlight.page}" data-pdf-color="${c}" style="background:${c}22;border-bottom:2px solid ${c};border-radius:3px;padding:0 3px">${text}</span>`
    const current = ((noteWidget.data.content ?? '') as string).trimEnd()
    updateWidget(noteWidgetId, { data: { ...noteWidget.data, content: current ? current + '\n\n' + span : span } })
    setLinkingHighlightId(null)
  }

  const byPage      = Object.values(highlights).reduce<Record<number, ReaderHighlight[]>>((acc, h) => { ;(acc[h.page] ??= []).push(h); return acc }, {})
  const sortedPages = Object.keys(byPage).map(Number).sort((a, b) => a - b)
  const total       = Object.keys(highlights).length
  const pageCustom: PageCustom = { dir: direction, mode: scrollDir }

  const showSpread = fileType === 'pdf' && scrollDir === 'horizontal' && twoPageSpread
  const secondPage = showSpread && currentPage + 1 <= numPages ? currentPage + 1 : null

  if (!d.fileData) return <UploadZone onFile={handleFileUpload} />

  // Blob wird noch aus IndexedDB geladen
  if (resolvedFile === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </div>
    )
  }

  // Referenz ließ sich nicht auflösen (z. B. Backup ohne eingebettete Daten) → neu hochladen
  if (resolvedFile === '') return <UploadZone onFile={handleFileUpload} />

  return (
    <div ref={setContainerRef} tabIndex={0} onKeyDown={handleKeyDown}
      style={{ display: 'flex', height: '100%', position: 'relative', overflow: 'hidden', userSelect: 'text', flexDirection: 'column', outline: 'none' }}>

      {/* ── Confirm file-replace dialog ── */}
      {pendingFile && (() => {
        const hlCount   = Object.keys(d.highlights ?? {}).length
        const noteCount = Object.values(allWidgets).filter(w =>
          w.type === 'note' &&
          ((w.data.content ?? '') as string).includes(`data-pdf-reader="${widget.id}"`)
        ).length
        return (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '24px 28px', maxWidth: 360, width: '90%',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', marginBottom: 12 }}>
                {t('Replace file?')}
              </div>

              {/* What gets deleted */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#e53e3e' }}>
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  <span>
                    <strong style={{ color: 'var(--text1)' }}>{hlCount}</strong> {hlCount !== 1 ? t('highlights') : t('highlight')} {t('in this file')}
                  </span>
                </div>
                {noteCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#e53e3e' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <span>
                      <strong style={{ color: 'var(--text1)' }}>{noteCount}</strong> {noteCount !== 1 ? t('linked references') : t('linked reference')} {t('in')} {noteCount !== 1 ? t('note widgets') : t('a note widget')}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', lineHeight: 1.4, display: 'flex', gap: 4, minWidth: 0 }}>
                <span style={{ flexShrink: 0 }}>{t('New file:')}</span>
                <strong style={{ color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{pendingFile.name}</strong>
              </div>

              <div style={{ fontSize: 12, color: '#e53e3e', marginBottom: 20, lineHeight: 1.4 }}>
                {t('This action cannot be undone.')}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setPendingFile(null)}
                  style={{ padding: '7px 16px', fontSize: 13, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text1)', cursor: 'pointer' }}
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={() => { cleanupLinkedNotes(); handleFileUpload(pendingFile); setPendingFile(null) }}
                  style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 999, border: 'none', background: '#e53e3e', color: 'white', cursor: 'pointer' }}
                >
                  {t('Replace & delete everything')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Markierung-löschen-Warnung (Markierung ist in Notizen verlinkt) ── */}
      {confirmDeleteHl && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onPointerDown={e => e.stopPropagation()}
        >
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '22px 26px', maxWidth: 340, width: '90%',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 10 }}>
              {t('Delete highlight?')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
              {t('This highlight is linked {n} time(s) in a note.').replace('{n}', String(confirmDeleteHl.count))}{' '}
              {t('The linked passages will be removed as well.')}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDeleteHl(null)}
                style={{ padding: '6px 14px', fontSize: 12, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text1)', cursor: 'pointer' }}
              >{t('Cancel')}</button>
              <button
                onClick={() => doDeleteHighlight(confirmDeleteHl.id, true)}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 999, border: 'none', background: '#e53e3e', color: 'white', cursor: 'pointer' }}
              >{t('Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '5px 8px', borderBottom: '1px solid var(--border)',
        background: 'color-mix(in srgb, var(--surface2) 60%, transparent)',
      }}>

        {/* LEFT: burger (page panel) + filename */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, paddingRight: 16 }}>
          {(fileType === 'pdf' || epubToc.length > 0) && (
            <button
              onClick={() => setShowPagePanel(s => !s)}
              title={fileType === 'pdf'
                ? (showPagePanel ? t('Hide page preview') : t('Show page preview'))
                : (showPagePanel ? t('Hide chapters') : t('Show chapters'))}
              style={{ ...iconBtnStyle, flexShrink: 0, background: showPagePanel ? 'var(--accent)' : 'var(--surface2)', color: showPagePanel ? 'white' : 'var(--text2)', borderColor: showPagePanel ? 'var(--accent)' : 'var(--border)' }}
            >
              <IcoBurger />
            </button>
          )}
          {d.fileName && (
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.fileName}
            </span>
          )}
        </div>

        {/* CENTER: page navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Btn onClick={() => goTo(1)}              disabled={currentPage <= 1}        title={t('First page')}><IcoSkipLeft /></Btn>
          <Btn onClick={() => stepPage(-1)}         disabled={currentPage <= 1}        title={t('Previous page [↑/←]')}><IcoChevLeft /></Btn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
            <input
              type="number" min={1} max={numPages || 1} value={currentPage}
              onChange={e => goTo(Number(e.target.value))}
              onPointerDown={e => e.stopPropagation()}
              style={{ width: 36, textAlign: 'center', fontSize: 11, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text1)', padding: '2px 4px' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>/ {numPages || '…'}</span>
          </div>
          <Btn onClick={() => stepPage(1)}          disabled={currentPage >= numPages} title={t('Next page [↓/→]')}><IcoChevRight /></Btn>
          <Btn onClick={() => goTo(numPages)}        disabled={currentPage >= numPages} title={t('Last page')}><IcoSkipRight /></Btn>
        </div>

        {/* RIGHT: marker palette + highlights toggle + upload */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>

          {/* Highlight palette — nur im Bearbeiten-Modus */}
          {mode === 'edit' && (
            <div onMouseDown={e => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 4px' }}>
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => { if (selection) saveHighlight(c.value) }}
                  title={selection ? t(c.label) : `${t(c.label)} (${t('select text first')})`}
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: c.value, border: '2.5px solid var(--surface)',
                    cursor: selection ? 'pointer' : 'default',
                    padding: 0,
                    boxShadow: '0 0 0 1.5px ' + c.value + (selection ? 'cc' : '44'),
                    opacity: selection ? 1 : 0.3,
                    transition: 'opacity 0.15s, box-shadow 0.15s',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => setShowSidebar(s => !s)}
            title={showSidebar ? t('Hide highlights') : t('Show highlights')}
            style={{ ...iconBtnStyle, background: showSidebar ? 'var(--accent)' : 'var(--surface2)', color: showSidebar ? 'white' : 'var(--text2)', borderColor: showSidebar ? 'var(--accent)' : 'var(--border)' }}
          >
            <IcoHighlight />
          </button>
          {mode === 'edit' && (
            <label title={t('Replace file')} style={{ display: 'flex' }}>
              <span style={iconBtnStyle}><IcoUpload /></span>
              <input type="file" accept=".pdf,.epub" style={visuallyHiddenStyle}
                onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])} />
            </label>
          )}
        </div>
      </div>

      {/* ── Content row ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* ── Page thumbnail panel (nur PDF) ── */}
        {fileType === 'pdf' && showPagePanel && numPages > 0 && (
          <div onPointerDown={e => e.stopPropagation()} style={{
            flexShrink: 0, width: 88,
            borderRight: '1px solid var(--border)',
            overflowY: 'auto', overflowX: 'hidden',
            background: 'var(--surface2)',
            display: 'flex', flexDirection: 'column',
            padding: '6px 6px', gap: 4,
          }}>
            <Document file={resolvedFile} loading={null} error={null}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                <PdfThumbnail key={pageNum} pageNum={pageNum} isCurrent={pageNum === currentPage} onClick={() => goTo(pageNum)} />
              ))}
            </Document>
          </div>
        )}

        {/* ── Kapitel-Panel (nur EPUB): Inhaltsverzeichnis, Klick springt hin ── */}
        {fileType === 'epub' && showPagePanel && epubToc.length > 0 && (
          <div onPointerDown={e => e.stopPropagation()} style={{
            flexShrink: 0, width: 148,
            borderRight: '1px solid var(--border)',
            overflowY: 'auto', overflowX: 'hidden',
            background: 'var(--surface2)',
            display: 'flex', flexDirection: 'column',
            padding: '6px 4px', gap: 1,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 6px 6px' }}>
              {t('Chapters')}
            </div>
            {epubToc.map((c, i) => {
              // Aktives Kapitel: Spine-Href und TOC-Href können sich durch
              // Pfad-Präfix/Fragment unterscheiden — über Basisnamen abgleichen
              const base   = (s: string) => s.split('#')[0].split('/').pop() ?? s
              const active = epubHref !== '' && base(epubHref) === base(c.href)
              return (
                <button
                  key={`${c.href}-${i}`}
                  onClick={() => renditionRef.current?.display(c.href).catch(() => {})}
                  title={c.label}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none',
                    padding: `5px 6px 5px ${6 + c.depth * 10}px`, borderRadius: 6, cursor: 'pointer',
                    fontSize: 10, lineHeight: 1.4, fontWeight: active ? 700 : 500,
                    color: active ? 'var(--accent)' : 'var(--text2)',
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--text3) 12%, transparent)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Viewer with animated page transitions */}
        <div ref={viewerRef} style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', userSelect: 'text' }}>

          {/* ── Floating bottom-right: zoom + scroll direction + spread ── */}
          <div style={{
            position: 'absolute', bottom: 10, right: 10, zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 3,
            // Mit --bg gemischt statt transparent: bleibt auf der weißen Seite
            // in jedem Theme deckend & lesbar (Glass-Theme-Fix)
            background: 'color-mix(in srgb, var(--surface2) 45%, var(--bg))',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '3px 5px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}>
            <Btn onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]} title={t('Zoom out (Ctrl+−)')}><IcoZoomOut /></Btn>
            <button onClick={() => setZoom(100)} title={t('Reset zoom')}
              style={{ fontSize: 10, fontWeight: 700, color: zoom !== 100 ? 'var(--accent)' : 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', minWidth: 32, textAlign: 'center' }}>
              {zoom}%
            </button>
            <Btn onClick={() => stepZoom(1)}  disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} title={t('Zoom in (Ctrl++)')}><IcoZoomIn /></Btn>
            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
            <button
              onClick={toggleScrollDir}
              title={scrollDir === 'vertical' ? t('Switch to horizontal scrolling') : t('Switch to vertical scrolling')}
              style={{ ...iconBtnStyle, background: 'var(--surface2)', color: 'var(--text2)', borderColor: 'var(--border)' }}
            >
              {scrollDir === 'vertical' ? <IcoScrollV /> : <IcoScrollH />}
            </button>
            {scrollDir === 'horizontal' && (
              <button
                onClick={toggleTwoPageSpread}
                title={twoPageSpread ? t('Switch to single page') : t('Switch to two-page spread')}
                style={{ ...iconBtnStyle, background: twoPageSpread ? 'var(--accent)' : 'var(--surface2)', color: twoPageSpread ? 'white' : 'var(--text2)', borderColor: twoPageSpread ? 'var(--accent)' : 'var(--border)' }}
              >
                <IcoSpread />
              </button>
            )}
          </div>

          {fileType === 'epub' ? (
            <>
              {/* Lade-/Fehlerzustand als Overlay ÜBER dem Container statt ihn
                  per display:none zu verstecken — sonst baut epub.js die
                  Rendition mit 0×0 auf und der Inhalt bleibt unsichtbar */}
              {(epubLoading || epubError) && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {epubError
                    ? <StateMsg text={t('File could not be loaded')} color="var(--danger)" />
                    : <StateMsg text={t('Loading…')} />}
                </div>
              )}
              <div ref={epubContainerRef} style={{
                position: 'absolute', inset: 0, padding: '10px 8px',
                visibility: epubLoading || epubError ? 'hidden' : 'visible',
                // Ohne diesen Rahmen läuft der Buchinhalt randlos bis an die
                // Widget-Kante — wirkt dann wie eine beliebige Textfläche statt
                // wie ein Buch. Schatten+Rundung geben ihm dieselbe "liegende
                // Seite"-Optik wie die PDF-Ansicht.
                boxShadow: '0 4px 24px rgba(0,0,0,0.35)', borderRadius: 2,
              }} />
              {/* Bruchkante zwischen den beiden Seiten einer Doppelseite: epub.js
                  rendert den Spread technisch als EINE fließende Fläche mit
                  zwei Textspalten (ein Wechsel des internen Rendering-Modells
                  wäre unverhältnismäßig) — der Schatten in der Mitte simuliert
                  den Buchrücken, damit es wie zwei einzelne Seiten aussieht statt
                  wie eine Seite mit zwei Textspalten. */}
              {scrollDir === 'horizontal' && twoPageSpread && !epubLoading && !epubError && (
                <div style={{
                  position: 'absolute', top: 10, bottom: 10, left: '50%', width: 28,
                  transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 4,
                  background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.16) 45%, rgba(0,0,0,0.22) 50%, rgba(0,0,0,0.16) 55%, transparent)',
                }} />
              )}
            </>
          ) : (
            <Document
              file={resolvedFile}
              onLoadSuccess={doc => { setNumPages(doc.numPages); pdfDocRef.current = doc }}
              loading={<StateMsg text={t('Loading…')} />}
              error={<StateMsg text={t('File could not be loaded')} color="var(--danger)" />}
            >
              <AnimatePresence mode="sync" custom={pageCustom}>
                <motion.div
                  key={currentPage}
                  custom={pageCustom}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  style={{ userSelect: 'text',
                    position: 'absolute', inset: 0,
                    overflow: 'auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '10px 8px',
                  }}
                >
                  {[currentPage, ...(secondPage ? [secondPage] : [])].map(pageNum => (
                    <div key={pageNum} ref={pageNum === currentPage ? setPageRef : undefined} data-page-number={pageNum}
                      style={{ position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.35)', borderRadius: 2, overflow: 'hidden', display: 'inline-block', flexShrink: 0 }}>
                      <Page
                        pageNumber={pageNum}
                        width={Math.round((showSpread ? fitWidth / 2 - 4 : fitWidth) * zoom / 100)}
                        devicePixelRatio={pdfDpr}
                        renderTextLayer
                        renderAnnotationLayer={false}
                      />
                      {/* Highlight overlays */}
                      {Object.values(highlights)
                        .filter(h => h.page === pageNum && h.rects && h.rects.length > 0)
                        .map(h => h.rects!.map((r, i) => (
                          <div key={`${h.id}-${i}`} style={{
                            position: 'absolute',
                            left: r.x + '%', top: r.y + '%',
                            width: r.w + '%', height: r.h + '%',
                            background: h.color, opacity: 0.35,
                            mixBlendMode: 'multiply', pointerEvents: 'none', zIndex: 3,
                          }} />
                        )))
                      }
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </Document>
          )}
        </div>

        {/* Highlights sidebar */}
        {showSidebar && (
          <div onPointerDown={e => e.stopPropagation()} style={{ flexShrink: 0, width: 168, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <IcoHighlight />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t('Highlights')}</span>
              {total > 0 && (
                <span style={{ fontSize: 8, fontWeight: 700, lineHeight: 1, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: 10, padding: '0 5px', height: 16, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{total}</span>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowSidebar(false)} title={t('Close')}
                style={{ width: 18, height: 18, borderRadius: 5, border: 'none', background: 'var(--surface)', color: 'var(--text3)', fontSize: 13, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedPages.length === 0 ? (
                <div style={{ color: 'var(--text3)', fontSize: 9, textAlign: 'center', padding: '20px 8px', lineHeight: 1.6 }}>
                  {mode === 'edit'
                    ? <>{t('Select text,')}<br />{t('then tap a color')}</>
                    : <>{t('Highlighting is only')}<br />{t('available in edit mode')}</>}
                </div>
              ) : sortedPages.map(page => (
                <div key={page}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                    {t('Page')} {page}
                  </div>
                  {byPage[page].sort((a, b) => a.createdAt - b.createdAt).map(h => {
                    const isLong     = h.text.length > 100
                    const isExpanded = expandedHls.has(h.id)
                    return (
                    <div key={h.id} style={{ marginBottom: 4, position: 'relative' }}>
                      <div onClick={() => jumpToHighlight(h)}
                        role="button" tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToHighlight(h) } }}
                        style={{ padding: '5px 7px', borderRadius: 7, cursor: 'pointer', background: h.color + '18', borderLeft: `3px solid ${h.color}` }}>
                        <div style={{ fontSize: 8.5, color: 'var(--text1)', lineHeight: 1.5, wordBreak: 'break-word', paddingRight: 28 }}>
                          {isExpanded || !isLong ? h.text : h.text.slice(0, 100) + '…'}
                          {isLong && (
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setExpandedHls(prev => {
                                  const next = new Set(prev)
                                  if (next.has(h.id)) next.delete(h.id); else next.add(h.id)
                                  return next
                                })
                              }}
                              title={isExpanded ? t('Show less') : t('Show more')}
                              style={{
                                display: 'inline-flex', verticalAlign: 'middle', marginLeft: 3,
                                width: 13, height: 13, borderRadius: 4, border: 'none',
                                background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0,
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Link + delete buttons — nur im Bearbeiten-Modus */}
                        {mode === 'edit' && (
                        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
                          {noteWidgets.length > 0 && (
                            <button
                              onClick={e => { e.stopPropagation(); setLinkingHighlightId(linkingHighlightId === h.id ? null : h.id) }}
                              title={t('Link to note')}
                              style={{ width: 14, height: 14, borderRadius: 4, background: linkingHighlightId === h.id ? 'var(--accent)' : 'none', border: 'none', color: linkingHighlightId === h.id ? 'white' : 'var(--text3)', fontSize: 9, lineHeight: 1, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <IcoLink />
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); deleteHighlight(h.id) }}
                            title={t('Delete highlight')}
                            style={{ width: 14, height: 14, borderRadius: 4, background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ×
                          </button>
                        </div>
                        )}
                      </div>
                      {/* Note picker dropdown */}
                      {linkingHighlightId === h.id && (
                        <div style={{ marginTop: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text3)', padding: '4px 7px 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {t('Choose note:')}
                          </div>
                          {noteWidgets.map(nw => (
                            <button key={nw.id}
                              onClick={e => { e.stopPropagation(); linkHighlightToNote(nw.id, h) }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 7px', fontSize: 9, color: 'var(--text1)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                            >
                              {extractNoteTitle(nw.data.content as string | undefined) ?? t('Note')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Import-Toast ── */}
      {importToast && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          zIndex: 200, pointerEvents: 'none',
          fontSize: 12, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          {importToast}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Btn({ onClick, disabled, title, children }: { onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ ...iconBtnStyle, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      {children}
    </button>
  )
}

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const t = useT()
  const [drag, setDrag] = useState(false)
  function isAccepted(f: File) {
    return f.type === 'application/pdf' || f.type === 'application/epub+zip' ||
      /\.(pdf|epub)$/i.test(f.name)
  }
  return (
    <label
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && isAccepted(f)) onFile(f) }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, cursor: 'pointer', borderRadius: 10, border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`, background: drag ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent', transition: 'all 0.15s' }}
    >
      <div style={{ width: 52, height: 52, borderRadius: 14, background: drag ? 'color-mix(in srgb, var(--accent) 15%, var(--surface2))' : 'var(--surface2)', border: `1px solid ${drag ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: drag ? 'var(--accent)' : 'var(--text3)', transition: 'all 0.15s' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <polyline points="9,15 12,12 15,15"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: drag ? 'var(--accent)' : 'var(--text2)' }}>{t('Drop a PDF or EPUB here')}</div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>{t('or click to choose')}</div>
      </div>
      <input type="file" accept=".pdf,.epub" style={visuallyHiddenStyle} onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  )
}

function StateMsg({ text, color = 'var(--text3)' }: { text: string; color?: string }) {
  return <div style={{ padding: 40, color, fontSize: 11, textAlign: 'center' }}>{text}</div>
}

const iconBtnStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0, padding: 0, gap: 2, transition: 'background 0.12s, border-color 0.12s',
}

// Visuell versteckt, aber im Tab-Fokus erreichbar — anders als display:'none'
// (das aus der Tab-Reihenfolge entfernt), damit Tastaturnutzer das umgebende
// <label> per Fokus + Enter/Space erreichen und die Dateiauswahl auslösen können.
const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
}
