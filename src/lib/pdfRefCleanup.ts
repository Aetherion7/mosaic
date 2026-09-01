// ─── Shared cleanup logic for Reader ↔ Note "pdf-ref" link spans ────────────
// A link is a raw HTML span embedded in a Note widget's markdown content —
// see NoteWidget.tsx's `PdfRef` Tiptap mark and `pdfRefHtml()`, and
// ReaderWidget.tsx's `linkHighlightToNote()` (the only three places that
// EMIT this HTML; keep them byte-identical to what these regexes expect).
// Used from two places that must not drift apart: ReaderWidget.tsx (per-book
// count/cleanup when deleting a single highlight or book) and
// boardStore.ts's deleteWidget/deleteWidgets (reader-wide cleanup when the
// whole widget is removed).

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Removes every link span for a given reader widget, regardless of which
// book it pointed at — used when the whole Reader widget is deleted.
export function stripPdfRefSpans(content: string, readerId: string): string {
  const rid = escapeRegex(readerId)
  const spanRe = new RegExp(`<span[^>]*data-pdf-reader="${rid}"[^>]*>[\\s\\S]*?<\\/span>`, 'g')
  return content.replace(spanRe, '').replace(/\n{3,}/g, '\n\n')
}

// Two patterns to check against a note's content for one highlight in one
// book: (1) the current, book-scoped span format, and (2) the pre-migration
// format that has no data-pdf-book attribute at all (links created before a
// widget's single book became a library). Checking both unconditionally is
// safe — a book that never had legacy links simply never matches pattern 2.
export function bookSpanRegexes(readerId: string, bookId: string, page: number, text: string): RegExp[] {
  const rid = escapeRegex(readerId)
  const bid = escapeRegex(bookId)
  const t   = escapeRegex(text.replace(/[\r\n\t]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim())
  const scoped = new RegExp(
    `<span[^>]*data-pdf-reader="${rid}"[^>]*data-pdf-book="${bid}"[^>]*data-pdf-page="${page}"[^>]*>${t}<\\/span>`,
    'g',
  )
  const legacy = new RegExp(
    `<span(?![^>]*data-pdf-book)[^>]*data-pdf-reader="${rid}"[^>]*data-pdf-page="${page}"[^>]*>${t}<\\/span>`,
    'g',
  )
  return [scoped, legacy]
}
