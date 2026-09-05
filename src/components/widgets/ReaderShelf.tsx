'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { pdfjs } from 'react-pdf'
import ePub from 'epubjs'
import type Book from 'epubjs/types/book'
import { saveBlob, getBlob, useBlobUrl } from '@/lib/blobStore'
import { useT } from '@/hooks/useT'
import type { ReaderBook, ReaderFileType } from '@/types'

function timeAgo(ts: number, t: (s: string) => string) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return t('Just now')
  if (s < 3600)  return t('{n} min ago').replace('{n}', String(Math.floor(s / 60)))
  if (s < 86400) return t('{n} hr ago').replace('{n}', String(Math.floor(s / 3600)))
  const days = Math.floor(s / 86400)
  return days === 1 ? t('1 day ago') : t('{n} days ago').replace('{n}', String(days))
}

// ── Cover generation ──────────────────────────────────────────────────────────
// Headless — no react-pdf/DOM component needed for PDF (pdfjs.getDocument runs
// fully off-screen), and epub.js exposes a ready-to-use book.coverUrl() so no
// manual archive access is needed for EPUB either. Runs once per book, either
// right after upload (ReaderWidget.tsx) or lazily here when a card is missing
// a cover (e.g. a migrated legacy book).
export async function generateCover(source: Blob, fileType: ReaderFileType): Promise<string | undefined> {
  try {
    if (fileType === 'pdf') {
      const buf = await source.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: buf }).promise
      const page = await doc.getPage(1)
      const targetW = 240
      const baseVp = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: targetW / baseVp.width })
      const canvas = document.createElement('canvas')  // never appended to the DOM
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return undefined
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/webp', 0.85))
      return blob ? await saveBlob(blob) : undefined
    }
    const buf = await source.arrayBuffer()
    const book = ePub(buf)
    await book.ready
    const url = await book.coverUrl()
    // book.ready resolves before book.open()'s own automatic, internal
    // chain (book.replacements() → … → this.opening.resolve(), tracked by
    // book.opened) has necessarily finished — that chain keeps reading/
    // decoding the archive's CSS/image assets in the background
    // regardless. destroy() nulls several fields (resources, loaded, …)
    // that chain's own .then() steps still read; if it's still running
    // when destroy() fires, the next step throws deep inside epub.js'
    // bundled code ("Cannot read properties of undefined", observed at
    // both resources.replaceCss and loaded.displayOptions) — this was the
    // actual cause of the epub crashes reported after upload/navigation,
    // not a concurrency issue between separate ePub() instances. Waiting
    // for book.opened (which resolves once that whole chain is done)
    // before destroying avoids the race outright, same fix as
    // ReaderWidget.tsx's own book-close cleanup. epub.js swallows a failed
    // chain via console.error without ever settling book.opened, so a
    // timeout still destroys after a short grace period rather than
    // leaking the book forever.
    await Promise.race([
      book.opened.catch(() => {}),
      new Promise<void>(resolve => setTimeout(resolve, 4000)),
    ])
    book.destroy()
    // Backstop for the timeout path: if the chain genuinely wasn't done
    // yet, a late continuation still finds harmless no-op values here
    // instead of undefined.
    book.resources = {
      replaceCss: () => Promise.resolve([]),
      replacements: () => Promise.resolve([]),
      substitute: (content: string) => content,
      replacementUrls: [],
      urls: [],
      cssUrls: [],
    } as unknown as Book['resources']
    if (!url) return undefined
    const res = await fetch(url)
    return await saveBlob(await res.blob())
  } catch {
    return undefined
  }
}

// epub.js's own bundled code isn't safe for concurrent instantiation — two
// ePub() instances parsing at once (even different files) can crash inside
// its internal regex-substitution helper (observed directly, not theoretical).
// Serialize every cover generation through one queue instead of just
// deduping per book, and keep the per-book Set so re-renders/StrictMode
// double-invocation don't needlessly queue the same book twice.
const generatingCovers = new Set<string>()
let coverQueue: Promise<unknown> = Promise.resolve()
function queueGenerateCover(source: Blob, fileType: ReaderFileType): Promise<string | undefined> {
  const run = coverQueue.then(() => generateCover(source, fileType))
  coverQueue = run.catch(() => undefined)
  return run
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IcoBook({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  )
}
function IcoPlus({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
}
function IcoTrash({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
function IcoPencil({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>
    </svg>
  )
}
function IcoTag({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83Z"/>
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function IcoUpload() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <polyline points="9,15 12,12 15,15"/>
    </svg>
  )
}

const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
}

// ── One book card ─────────────────────────────────────────────────────────────

const CATEGORY_PANEL_W = 180

function BookCard({ book, existingCategories, containerRef, onOpen, onDelete, onRename, onSetCategory, onCoverGenerated }: {
  book: ReaderBook
  existingCategories: string[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onOpen: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onSetCategory: (category: string | undefined) => void
  onCoverGenerated: (coverRef: string) => void
}) {
  const t = useT()
  const coverUrl = useBlobUrl(book.coverRef)
  const [renaming, setRenaming] = useState(false)
  const [nameVal, setNameVal] = useState(book.fileName)
  const [categoryOpen, setCategoryOpen] = useState(false)
  // Horizontal offset (px, relative to the card's own left edge) for the
  // category panel — the panel is wider than a shelf card, so a naive
  // "anchor to the card's corner" position clips off-screen for cards near
  // either edge of the grid. Measured against the shelf's own scroll
  // container (not the viewport) once the panel opens.
  const [panelLeft, setPanelLeft] = useState<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const categoryPopoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!categoryOpen) { setPanelLeft(null); return }
    const card = cardRef.current
    const container = containerRef.current
    if (!card || !container) return
    const cardRect = card.getBoundingClientRect()
    const contRect = container.getBoundingClientRect()
    let left = cardRect.width - CATEGORY_PANEL_W  // default: right-align with the card, like a normal dropdown
    const MARGIN = 6
    const absLeft  = cardRect.left + left
    const absRight = absLeft + CATEGORY_PANEL_W
    if (absLeft < contRect.left + MARGIN)  left += (contRect.left + MARGIN) - absLeft
    if (absRight > contRect.right - MARGIN) left -= absRight - (contRect.right - MARGIN)
    setPanelLeft(left)
  }, [categoryOpen, containerRef])

  // Missing cover (e.g. a migrated legacy book) — generate one lazily, once.
  useEffect(() => {
    if (book.coverRef || generatingCovers.has(book.id)) return
    generatingCovers.add(book.id)
    getBlob(book.fileData).then(blob => {
      if (!blob) return
      return queueGenerateCover(blob, book.fileType)
    }).then(ref => { if (ref) onCoverGenerated(ref) })
      .finally(() => generatingCovers.delete(book.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.coverRef])

  const progress = book.totalPages && book.totalPages > 0
    ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100))
    : null

  function commitRename() {
    setRenaming(false)
    const v = nameVal.trim()
    if (v && v !== book.fileName) onRename(v)
    else setNameVal(book.fileName)
  }

  // Picking a category from the existing list toggles it: clicking the
  // book's current category again clears it, clicking a different one
  // switches to it. Creating/renaming/deleting categories themselves
  // happens from the toolbar above (the single place that manages what
  // categories exist) — this popover is purely an assignment picker.
  function selectCategory(name: string) {
    onSetCategory(book.category === name ? undefined : name)
    setCategoryOpen(false)
  }

  useEffect(() => {
    if (!categoryOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (categoryPopoverRef.current && !categoryPopoverRef.current.contains(e.target as Node)) setCategoryOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [categoryOpen])

  return (
    <motion.div
      ref={cardRef}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      style={{
        // No overflow:hidden here (unlike before) — the category panel below
        // needs to be able to extend past the cover's edge without getting
        // clipped by it. The cover and footer each round their own corners
        // instead, so the card still reads as one rounded block.
        position: 'relative', borderRadius: 14,
        background: 'var(--surface)', border: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)', cursor: 'pointer',
      }}
      onClick={() => !renaming && !categoryOpen && onOpen()}
    >
      {/* Cover */}
      <div style={{
        height: 130, position: 'relative', overflow: 'hidden',
        borderRadius: '14px 14px 0 0',
        background: coverUrl ? 'var(--bg)' : 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--accent2)))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {coverUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', padding: '0 12px' }}>
              <IcoBook />
              <div style={{ fontSize: 10, fontWeight: 700, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {book.fileName}
              </div>
            </div>
        }

        {/* Hover actions */}
        <div
          className="reader-card-actions"
          style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.12s' }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => setCategoryOpen(v => !v)} title={t('Set category')}
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
            <IcoTag />
          </button>
          <button onClick={() => { setRenaming(true); setNameVal(book.fileName) }} title={t('Rename book')}
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
            <IcoPencil />
          </button>
          <button onClick={onDelete} title={t('Delete book?')}
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#ff8080', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
            <IcoTrash />
          </button>
        </div>

        {book.category && (
          <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: 'white', backdropFilter: 'blur(4px)' }}>
            {book.category}
          </div>
        )}
      </div>

      {/* Category picker: assign one of the existing categories to this
          book. Categories themselves are created/renamed/deleted from the
          toolbar above, not here — this popover only assigns. */}
      {categoryOpen && (
        <div
          ref={categoryPopoverRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 34, zIndex: 20, width: CATEGORY_PANEL_W,
            ...(panelLeft === null ? { right: 6 } : { left: panelLeft }),
            background: 'var(--popover-bg)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)', backdropFilter: 'blur(16px)', overflow: 'hidden',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 10px 6px' }}>
            {t('Category')}
          </div>

          {existingCategories.length > 0 ? (
            <div style={{ maxHeight: 168, overflowY: 'auto', padding: '0 4px 6px' }}>
              {existingCategories.map(c => (
                <button
                  key={c}
                  onClick={() => selectCategory(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                    fontSize: 11.5, fontWeight: book.category === c ? 700 : 500,
                    color: book.category === c ? 'var(--accent)' : 'var(--text1)',
                    background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
                    padding: '6px 8px', margin: '1px 0',
                  }}
                >
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    border: book.category === c ? 'none' : '1.5px solid var(--border)',
                    background: book.category === c ? 'var(--accent)' : 'transparent',
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.5, padding: '0 10px 10px' }}>
              {t('No categories yet — create one from the toolbar above.')}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '10px 12px', borderRadius: '0 0 14px 14px' }} onClick={e => renaming && e.stopPropagation()}>
        {renaming ? (
          <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenaming(false); setNameVal(book.fileName) } }}
            onBlur={commitRename}
            style={{ fontSize: 13, fontWeight: 600, width: '100%', boxSizing: 'border-box', background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 5, color: 'var(--text1)', padding: '2px 6px', outline: 'none' }}
          />
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {book.fileName}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {progress === null ? (
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{t('Not started')}</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{progress}%</span>
              </div>
            )}
          </div>
        </div>
        {book.lastOpenedAt && (
          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>{timeAgo(book.lastOpenedAt, t)}</div>
        )}
      </div>

      <style>{`
        div:hover > .reader-card-actions, .reader-card-actions:hover { opacity: 1 !important; }
      `}</style>
    </motion.div>
  )
}

// ── Shelf ─────────────────────────────────────────────────────────────────────

type SortMode = 'recent' | 'title' | 'progress'

export default function ReaderShelf({ books, categories: categoryList, onOpen, onAdd, onDelete, onRename, onSetCategory, onAddCategory, onRenameCategory, onDeleteCategory, onCoverGenerated }: {
  books: Record<string, ReaderBook>
  categories: string[]
  onOpen: (id: string) => void
  onAdd: (file: File) => void
  onDelete: (id: string) => void
  onRename: (id: string, fileName: string) => void
  onSetCategory: (id: string, category: string | undefined) => void
  onAddCategory: (name: string) => void
  onRenameCategory: (oldName: string, newName: string) => void
  onDeleteCategory: (name: string) => void
  onCoverGenerated: (id: string, coverRef: string) => void
}) {
  const t = useT()
  const [drag, setDrag] = useState(false)
  const [category, setCategory] = useState<string>('all')
  const [sort, setSort] = useState<SortMode>('recent')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCatVal, setNewCatVal] = useState('')
  const newCatValRef = useRef(newCatVal); newCatValRef.current = newCatVal
  const newCatRef = useRef<HTMLDivElement>(null)
  const dragCounter = useRef(0)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  function commitNewCategory() {
    const v = newCatValRef.current.trim()
    setAddingCategory(false)
    setNewCatVal('')
    if (v) onAddCategory(v)
  }

  useEffect(() => {
    if (!addingCategory) return
    function onDocMouseDown(e: MouseEvent) {
      if (newCatRef.current && !newCatRef.current.contains(e.target as Node)) commitNewCategory()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingCategory])

  const all = Object.values(books)
  // Union of the explicit (toolbar-managed) list with any category value
  // still present on a book — defensive: keeps an orphaned/legacy value
  // (from before categories were tracked independently) visible and
  // manageable instead of silently hiding it.
  const categories = Array.from(new Set([...categoryList, ...all.map(b => b.category).filter((c): c is string => !!c)])).sort()

  function isAccepted(f: File) {
    return f.type === 'application/pdf' || f.type === 'application/epub+zip' || /\.(pdf|epub)$/i.test(f.name)
  }

  let visible = category === 'all' ? all : all.filter(b => b.category === category)
  visible = [...visible].sort((a, b) => {
    if (sort === 'title') return a.fileName.localeCompare(b.fileName)
    if (sort === 'progress') {
      const pa = a.totalPages ? a.currentPage / a.totalPages : -1
      const pb = b.totalPages ? b.currentPage / b.totalPages : -1
      return pb - pa
    }
    return (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt)
  })

  if (all.length === 0) {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && isAccepted(f)) onAdd(f) }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, padding: 20 }}
      >
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '32px 40px', borderRadius: 14,
          border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`,
          background: drag ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
          transition: 'all 0.15s',
        }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: drag ? 'color-mix(in srgb, var(--accent) 15%, var(--surface2))' : 'var(--surface2)', border: `1px solid ${drag ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: drag ? 'var(--accent)' : 'var(--text3)' }}>
            <IcoUpload />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{t('Your library is empty')}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{t('Add a PDF or EPUB to get started')}</div>
          </div>
          <input type="file" accept=".pdf,.epub" style={visuallyHiddenStyle} onChange={e => e.target.files?.[0] && onAdd(e.target.files[0])} />
        </label>
      </div>
    )
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); dragCounter.current++; setDrag(true) }}
      onDragLeave={() => { dragCounter.current--; if (dragCounter.current <= 0) setDrag(false) }}
      onDrop={e => { e.preventDefault(); dragCounter.current = 0; setDrag(false); const f = e.dataTransfer.files[0]; if (f && isAccepted(f)) onAdd(f) }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {/* Filter + category management + sort row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
        <button onClick={() => setCategory('all')} style={pillStyle(category === 'all')}>{t('All')}</button>
        {categories.map(c => (
          <CategoryPill
            key={c}
            name={c}
            active={category === c}
            onSelect={() => setCategory(c)}
            onRename={newName => {
              onRenameCategory(c, newName)
              if (category === c) setCategory(newName)
            }}
            onDelete={() => {
              onDeleteCategory(c)
              if (category === c) setCategory('all')
            }}
          />
        ))}
        {addingCategory ? (
          <div ref={newCatRef} style={{ flexShrink: 0 }}>
            <input
              autoFocus value={newCatVal} onChange={e => setNewCatVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitNewCategory()
                if (e.key === 'Escape') { setNewCatVal(''); setAddingCategory(false) }
              }}
              placeholder={t('New category…')}
              style={{ fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--accent)', background: 'var(--surface2)', color: 'var(--text1)', outline: 'none', width: 110 }}
            />
          </div>
        ) : (
          <button onClick={() => setAddingCategory(true)} title={t('New category…')} style={{
            flexShrink: 0, width: 24, height: 24, borderRadius: '50%', border: '1px dashed var(--border)',
            background: 'none', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <IcoPlus size={13} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <select value={sort} onChange={e => setSort(e.target.value as SortMode)}
          style={{ fontSize: 10, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', padding: '4px 6px', flexShrink: 0 }}>
          <option value="recent">{t('Recently opened')}</option>
          <option value="title">{t('Title')}</option>
          <option value="progress">{t('Progress')}</option>
        </select>
      </div>

      <div ref={gridScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
          {visible.map(book => (
            <BookCard
              key={book.id}
              book={book}
              existingCategories={categories}
              containerRef={gridScrollRef}
              onOpen={() => onOpen(book.id)}
              onDelete={() => onDelete(book.id)}
              onRename={name => onRename(book.id, name)}
              onSetCategory={c => onSetCategory(book.id, c)}
              onCoverGenerated={ref => onCoverGenerated(book.id, ref)}
            />
          ))}

          {/* + Add book tile */}
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
            minHeight: 130 + 52, cursor: 'pointer', borderRadius: 14,
            border: '1.5px dashed var(--border)', color: 'var(--text3)', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
          >
            <IcoPlus />
            <span style={{ fontSize: 11, fontWeight: 600 }}>{t('Add book')}</span>
            <input type="file" accept=".pdf,.epub" style={visuallyHiddenStyle} onChange={e => e.target.files?.[0] && onAdd(e.target.files[0])} />
          </label>
        </div>
      </div>

      {drag && (
        <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '2px dashed var(--accent)', borderRadius: 10, pointerEvents: 'none' }} />
      )}
    </div>
  )
}

// ── One category filter pill, with hover-revealed rename/delete ────────────────
// The toolbar is the one place categories are created, renamed, and deleted;
// the per-book tag icon is purely an assignment picker over this same list.

function CategoryPill({ name, active, onSelect, onRename, onDelete }: {
  name: string
  active: boolean
  onSelect: () => void
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  const valRef = useRef(val); valRef.current = val
  const editRef = useRef<HTMLDivElement>(null)

  function commit() {
    setEditing(false)
    const v = valRef.current.trim()
    if (v && v !== name) onRename(v)
    else setVal(name)
  }

  // Click-outside dismiss rather than onBlur — onBlur alone can close the
  // field before the user gets a chance to type (a stray re-render/layout
  // shift steals focus first).
  useEffect(() => {
    if (!editing) return
    function onDocMouseDown(e: MouseEvent) {
      if (editRef.current && !editRef.current.contains(e.target as Node)) commit()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (editing) {
    return (
      <div ref={editRef} onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
        <input
          autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setVal(name); setEditing(false) }
          }}
          style={{
            fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
            border: '1px solid var(--accent)', background: 'var(--surface2)', color: 'var(--text1)',
            outline: 'none', width: Math.max(64, name.length * 7 + 24),
          }}
        />
      </div>
    )
  }

  return (
    <div className="reader-category-pill" style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={onSelect} style={pillStyle(active)}>{name}</button>
      <div
        className="reader-category-pill-actions"
        style={{ position: 'absolute', top: -5, right: -5, display: 'flex', gap: 2, opacity: 0, transition: 'opacity 0.12s' }}
      >
        <button
          onClick={e => { e.stopPropagation(); setVal(name); setEditing(true) }}
          title={t('Rename category')}
          style={{ width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface3)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
        >
          <IcoPencil size={7} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title={t('Delete category')}
          style={{ width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface3)', color: '#ff8080', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
        >
          <IcoTrash size={7} />
        </button>
      </div>
      <style>{`
        .reader-category-pill:hover > .reader-category-pill-actions { opacity: 1 !important; }
      `}</style>
    </div>
  )
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? 'var(--on-accent, white)' : 'var(--text2)',
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  }
}
