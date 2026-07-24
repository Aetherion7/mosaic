// ─── Reader-Registry für KI-Markierungen ─────────────────────────────────────
// Das highlight_in_reader-Tool (tools.ts) braucht Zugriff auf das GELADENE
// Dokument (pdfjs-Proxy bzw. epubjs-Book) — das lebt nur im gemounteten
// ReaderWidget. Jedes ReaderWidget registriert sich hier mit einer
// highlightAll-Funktion und meldet sich beim Unmount wieder ab.

export interface ReaderHighlighter {
  // Markiert alle Vorkommen von query (case-insensitiv) im offenen Dokument
  // und liefert die Trefferzahl zurück.
  highlightAll(query: string, color: string): Promise<number>
}

const registry = new Map<string, ReaderHighlighter>()

export function registerReader(widgetId: string, h: ReaderHighlighter) {
  registry.set(widgetId, h)
}

export function unregisterReader(widgetId: string) {
  registry.delete(widgetId)
}

export function getReader(widgetId: string): ReaderHighlighter | undefined {
  return registry.get(widgetId)
}
