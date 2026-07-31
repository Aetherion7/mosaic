import MarkdownIt from 'markdown-it'

// Der "Name" eines Notizwidgets wird nicht separat gespeichert, sondern aus
// der ersten Markdown-Überschrift im Notizinhalt abgeleitet ("# Titel" ganz
// am Zeilenanfang, jede Ebene zählt) — dadurch bleibt er immer automatisch
// aktuell und es gibt kein zweites, aus dem Ruder laufendes Titel-Feld zum
// Pflegen. Wird an mehreren Stellen gebraucht (Board-Kachel-Kopfzeile,
// Notiz-Auswahl im ReaderWidget, Suche per Strg/Cmd+K) — daher zentral hier.
export function extractNoteTitle(content: string | undefined | null): string | null {
  if (!content) return null
  const match = content.match(/^#{1,6}[ \t]+(.+)$/m)
  const title = match?.[1]?.trim()
  return title || null
}

// Der Titel ist selbst Markdown/HTML-Quelltext (**bold**, <u>...</u>, farbige
// <span>s, …) — dieselbe Engine, die NoteWidget.tsx zum Speichern benutzt
// (tiptap-markdown), rendert intern mit genau dieser Bibliothek. Ohne dieses
// Rendering zeigen Kachel-Kopfzeile/Notiz-Auswahl/Suche die rohen Tags/
// Sternchen statt der eigentlichen Formatierung an.
const titleMd = new MarkdownIt({ html: true })

export function renderNoteTitleHtml(title: string): string {
  return titleMd.renderInline(title)
}
