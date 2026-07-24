'use client'
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { mergeAttributes, Extension, Mark } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { createLowlight, common } from 'lowlight'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/hooks/useT'
import { compressImage } from '@/lib/imageUtils'
import { saveBlob, useBlobUrl } from '@/lib/blobStore'
import { IconImage } from '@/components/ui/Icons'
import type { Widget, NotePdfLink } from '@/types'

const lowlight = createLowlight(common)

// ── Bild-Node ─────────────────────────────────────────────────────────────────
// @tiptap/extension-image speichert `src` normal im Markdown (kein eigener
// serialize-Hook nötig, anders als bei PdfRef unten). Die eingebettete
// idb-blob://-Referenz ist aber kein direkt ladbares Bild — die NodeView löst
// sie beim Rendern über useBlobUrl() zur echten Object-URL auf (identisches
// Muster zu ImageWidget.tsx).
function NoteImageView({ node }: ReactNodeViewProps) {
  const resolved = useBlobUrl(node.attrs.src as string)
  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block', maxWidth: '100%' }}>
      {resolved
        ? <img src={resolved} alt={(node.attrs.alt as string) ?? ''} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
        : <span style={{ display: 'block', width: 160, height: 100, borderRadius: 8, background: 'var(--surface2)' }} />}
    </NodeViewWrapper>
  )
}

const NoteImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView)
  },
})

// Fallback: consume Tab/Shift-Tab so they never escape the editor.
// Runs at low priority (50) so CodeBlockHighlight's Tab handler (priority 100) fires first.
const PreventTabEscape = Extension.create({
  name: 'preventTabEscape',
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab:       () => true,
      'Shift-Tab': () => true,
    }
  },
})

// Extends CodeBlockLowlight:
// - sets data-language on <pre> so the CSS badge can read it
// - intercepts Tab / Shift+Tab inside code blocks (prevents focus-escape)
const CodeBlockHighlight = CodeBlockLowlight.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),

      // Tab inside code block → insert 2 spaces, never escape the widget
      Tab: () => {
        if (!this.editor.isActive('codeBlock')) return false
        this.editor.commands.insertContent('  ')
        return true
      },

      // Shift+Tab → remove up to 2 leading spaces on current line
      'Shift-Tab': () => {
        if (!this.editor.isActive('codeBlock')) return false
        const { state, dispatch } = this.editor.view
        const { $from } = state.selection
        const lineStart = $from.start()
        const lineText  = state.doc.textBetween(lineStart, $from.pos)
        const spaces    = lineText.match(/^ {1,2}/)?.[0]?.length ?? 0
        if (spaces > 0 && dispatch) {
          dispatch(state.tr.delete(lineStart, lineStart + spaces))
        }
        return true
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, { 'data-language': node.attrs.language || '' }),
      ['code', { class: node.attrs.language ? `language-${node.attrs.language}` : '' }, 0],
    ]
  },
})

// ── PdfRef mark ───────────────────────────────────────────────────────────────
// Renders highlighted PDF text as a coloured inline span inside the note.
// Uses <span data-pdf-reader> so there is NO <a href> and no browser navigation.
// Serialised to/from Markdown as raw HTML (requires html:true in Markdown extension).

function pdfRefHtml(readerId: string, page: number | string, color: string) {
  const c = color || '#ffd166'
  return `<span class="pdf-ref" data-pdf-reader="${readerId}" data-pdf-page="${page}" data-pdf-color="${c}" style="background:${c}22;border-bottom:2px solid ${c};border-radius:3px;padding:0 3px">`
}

const PdfRef = Mark.create<{ onNavigate: (readerId: string, page: number) => void }>({
  name: 'pdfRef',

  addOptions() {
    return { onNavigate: () => {} }
  },

  addAttributes() {
    return {
      readerId: { default: null },
      page:     { default: 1 },
      color:    { default: '#ffd166' },
    }
  },

  renderHTML({ HTMLAttributes }) {
    const { readerId, page, color } = HTMLAttributes
    return ['span', {
      class: 'pdf-ref',
      'data-pdf-reader': readerId,
      'data-pdf-page': String(page),
      'data-pdf-color': color,
      style: `background:${color}22;border-bottom:2px solid ${color};border-radius:3px;padding:0 3px`,
    }, 0]
  },

  parseHTML() {
    return [{
      tag: 'span[data-pdf-reader]',
      getAttrs(dom) {
        const el = dom as HTMLElement
        return {
          readerId: el.getAttribute('data-pdf-reader'),
          page:     parseInt(el.getAttribute('data-pdf-page') ?? '1', 10),
          color:    el.getAttribute('data-pdf-color') ?? '#ffd166',
        }
      },
    }]
  },

  // tiptap-markdown reads storage.markdown.serialize for custom mark serialisation.
  addStorage() {
    return {
      markdown: {
        serialize: {
          open(_state: unknown, mark: { attrs: Record<string, unknown> }) {
            const { readerId, page, color } = mark.attrs
            return pdfRefHtml(String(readerId), String(page), String(color))
          },
          close: () => '</span>',
        },
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      Space: ({ editor }) => {
        const { state, dispatch } = editor.view
        const { $from, empty } = state.selection
        if (!empty) return false

        const pdfRefType = state.schema.marks[this.name]
        if (!pdfRefType) return false

        // Cursor must be at the RIGHT boundary of a pdfRef span:
        // the character before has pdfRef, the character after does not.
        const hasBefore = $from.marks().some(m => m.type === pdfRefType)
        if (!hasBefore) return false
        const hasAfter  = !!$from.nodeAfter?.marks.some(m => m.type === pdfRefType)
        if (hasAfter) return false   // still inside the span → normal space

        // Insert a space that is NOT inside the pdfRef mark
        dispatch(state.tr.removeStoredMark(pdfRefType).insertText(' '))
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick: (view, _pos, event) => {
            // In edit mode let ProseMirror place the cursor normally.
            if (view.editable) return false
            const ref = (event.target as Element).closest?.('[data-pdf-reader]')
            if (!ref) return false
            const readerId = ref.getAttribute('data-pdf-reader')
            const page     = parseInt(ref.getAttribute('data-pdf-page') ?? '1', 10)
            if (!readerId || isNaN(page)) return false
            this.options.onNavigate(readerId, page)
            return true
          },
        },
      }),
    ]
  },
})

export default function NoteWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateNoteContent = useBoardStore(s => s.updateNoteContent)
  const updateWidget = useBoardStore(s => s.updateWidget)
  const allWidgets = useBoardStore(useShallow(s => selectBoard(s)?.widgets ?? {}))
  const mode = useUIStore(s => s.mode)
  const d = widget.data

  // Tracks the last Markdown content generated by THIS editor so we can distinguish
  // our own keystrokes (skip re-render) from external content changes.
  const editorGeneratedContent = useRef((d.content ?? '') as string)

  // Always-fresh navigation callback for the PdfRef ProseMirror plugin.
  const navigateRef = useRef<(readerId: string, page: number) => void>(() => {})
  navigateRef.current = (readerId: string, page: number) => {
    const rw = allWidgets[readerId]
    if (!rw) return
    updateWidget(readerId, { data: { ...rw.data, currentPage: page } })
  }

  // Checkboxen auch im Ansichtsmodus abhakbar: Ohne onReadOnlyChecked setzt
  // TipTap den Klick im read-only-Editor sofort zurück. Der Callback muss die
  // Änderung selbst ins Dokument schreiben — der Dispatch feuert onUpdate,
  // wodurch der neue Stand ganz normal persistiert wird.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)

  // TipTap v3 compares extension references on every render (compareOptions uses ===).
  // If extensions are new objects each render, it calls editor.setOptions() every render
  // → cascading re-renders → laggy UI. useState ensures stable references.
  const [extensions] = useState(() => [
    StarterKit.configure({ codeBlock: false }),
    TaskList,
    TaskItem.configure({
      nested: true,
      onReadOnlyChecked: (node, checked) => {
        const ed = editorRef.current
        if (!ed) return false
        // Identitätsvergleich reicht nicht: die NodeView hält den Node vom
        // Zeitpunkt ihrer Erstellung fest — nach setContent/Transaktionen ist
        // der veraltet. node.eq() vergleicht Typ+Attribute+Inhalt; bei exakt
        // identischen Einträgen ist das Ergebnisdokument ohnehin dasselbe.
        let pos = -1
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ed.state.doc.descendants((n: any, p: number) => {
          if (pos >= 0) return false
          if (n === node || (n.type.name === 'taskItem' && n.eq(node))) { pos = p; return false }
          return true
        })
        if (pos < 0) return false
        ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked }))
        return true
      },
    }),
    Placeholder.configure({ placeholder: t('# Heading\n\nNote here…') }),
    Markdown.configure({ html: true, transformPastedText: true }),
    CodeBlockHighlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    PreventTabEscape,
    PdfRef.configure({ onNavigate: (r, p) => navigateRef.current(r, p) }),
    NoteImage.configure({ inline: false }),
  ])

  // Datei → komprimieren → als Blob speichern → als Bild-Node einfügen.
  // Gleicher Ablauf wie ImageWidget.tsx, nur über editor.chain() statt Store.
  async function insertImageFile(file: File) {
    const ed = editorRef.current
    if (!ed) return
    try {
      const compressed = await compressImage(file)
      ed.chain().focus().setImage({ src: await saveBlob(compressed) }).run()
    } catch {
      try {
        ed.chain().focus().setImage({ src: await saveBlob(file) }).run()
      } catch { /* Blob-Speicher nicht verfügbar */ }
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 20 * 1024 * 1024) return
    insertImageFile(f)
  }

  const editor = useEditor({
    extensions,
    content: d.content || '',
    editable: mode === 'edit',
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown.getMarkdown()
      editorGeneratedContent.current = md
      updateNoteContent(widget.id, md)
    },
    editorProps: {
      handlePaste(_view, event) {
        const file = Array.from(event.clipboardData?.items ?? [])
          .find(it => it.type.startsWith('image/'))?.getAsFile()
        if (!file) return false
        event.preventDefault()
        insertImageFile(file)
        return true
      },
      handleDrop(_view, event) {
        const file = Array.from(event.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'))
        if (!file) return false
        event.preventDefault()
        insertImageFile(file)
        return true
      },
    },
  })

  editorRef.current = editor

  useEffect(() => {
    editor?.setEditable(mode === 'edit')
  }, [editor, mode])

  // Full reload when the widget instance changes (different note opened in same slot).
  // emitUpdate: false — TipTap v3 feuert bei setContent sonst standardmäßig
  // onUpdate (Store-Write). Sind zwei Instanzen derselben Notiz gemountet
  // (Board-Kachel + Fokus-Overlay), schaukeln sich deren Sync-Effekte dadurch
  // gegenseitig zur Endlosschleife auf ("Maximum update depth exceeded").
  useEffect(() => {
    if (!editor) return
    const content = (d.content ?? '') as string
    editorGeneratedContent.current = content
    editor.commands.setContent(content, { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, widget.id])

  // Sync externally-inserted content (e.g. PDF reference pasted by ReaderWidget).
  // Skip if the update came from our own typing to avoid resetting the cursor.
  useEffect(() => {
    if (!editor) return
    const incoming = (d.content ?? '') as string
    if (incoming === editorGeneratedContent.current) return
    editorGeneratedContent.current = incoming
    editor.commands.setContent(incoming, { emitUpdate: false })
  }, [editor, d.content])

  // One-time migration: convert legacy PDF reference formats to inline pdfRef spans.
  // 1) Old planboard-pdfref.local Markdown links in d.content → inline <span>
  // 2) Old pdfLinks array entries → inline <span> appended to d.content
  // Both run once per widget mount; after migration pdfLinks is cleared.
  useEffect(() => {
    let content  = (d.content  ?? '') as string
    const links  = (d.pdfLinks ?? []) as NotePdfLink[]
    let changed  = false

    // Replace old [text](https://planboard-pdfref.local/id/page/color) links with spans
    if (content.includes('planboard-pdfref.local')) {
      content = content.replace(
        /\[([^\]]*(?:\\.[^\]]*)*)\]\(https:\/\/planboard-pdfref\.local\/([^/]+)\/(\d+)\/([0-9a-f]{6})\)/g,
        (_m, rawText, readerId, page, hex) => {
          const text  = rawText.replace(/\\\[/g, '[').replace(/\\\]/g, ']')
          const color = `#${hex}`
          return pdfRefHtml(readerId, page, color) + text + '</span>'
        },
      )
      changed = true
    }

    // Convert pdfLinks array entries to inline spans appended to content
    if (links.length > 0) {
      const appended = links
        .map(l => pdfRefHtml(l.readerWidgetId, l.page, l.color) + l.text + '</span>')
        .join('\n\n')
      content = content.trimEnd() ? content.trimEnd() + '\n\n' + appended : appended
      changed = true
    }

    if (changed) {
      updateWidget(widget.id, { data: { ...d, content, pdfLinks: [] } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 4 }}>
      {mode === 'edit' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0, paddingBottom: 2 }} onPointerDown={e => e.stopPropagation()}>
          <button
            title={t('Insert image')}
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer',
            }}
          >
            <IconImage size={12} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageFileChange} style={{ display: 'none' }} />
        </div>
      )}
      <div
        onPointerDown={e => e.stopPropagation()}
        className="note-md-wrap"
        style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
      >
        <EditorContent editor={editor} />
      </div>

      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.note-md-wrap .ProseMirror {
  outline: none;
  min-height: 100%;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text2);
  padding: 2px 4px;
  word-break: break-word;
}
.note-md-wrap .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--text3);
  pointer-events: none;
  height: 0;
  white-space: pre;
}
.note-md-wrap .ProseMirror h1 { font-size: 1.45em; font-weight: 800; color: var(--text1); margin: 2px 0 4px; line-height: 1.25; }
.note-md-wrap .ProseMirror h2 { font-size: 1.2em;  font-weight: 700; color: var(--text1); margin: 10px 0 3px; line-height: 1.3; }
.note-md-wrap .ProseMirror h3 { font-size: 1.05em; font-weight: 700; color: var(--text1); margin: 8px 0 2px; }
.note-md-wrap .ProseMirror p { margin: 0 0 3px; }
.note-md-wrap .ProseMirror strong { font-weight: 700; color: var(--text1); }
.note-md-wrap .ProseMirror em     { font-style: italic; }
.note-md-wrap .ProseMirror s      { color: var(--text3); text-decoration: line-through; }
.note-md-wrap .ProseMirror a { color: var(--accent); text-decoration: underline; cursor: pointer; }
/* PDF reference spans — colour comes from inline style, cursor varies by mode */
.note-md-wrap .ProseMirror .pdf-ref { border-radius: 3px; padding: 0 3px; transition: opacity 0.1s; }
.note-md-wrap .ProseMirror[contenteditable="true"]  .pdf-ref { cursor: text; }
.note-md-wrap .ProseMirror[contenteditable="false"] .pdf-ref { cursor: pointer; }
.note-md-wrap .ProseMirror[contenteditable="false"] .pdf-ref:hover { opacity: 0.75; }
.note-md-wrap .ProseMirror ul { margin: 2px 0 4px; padding-left: 18px; list-style-type: disc; }
.note-md-wrap .ProseMirror ol { margin: 2px 0 4px; padding-left: 18px; list-style-type: decimal; }
.note-md-wrap .ProseMirror li { margin: 1px 0; }
.note-md-wrap .ProseMirror li > p { margin: 0; }
.note-md-wrap .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 2px; }
.note-md-wrap .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 7px; margin: 2px 0; }
/* display:flex neutralisiert die geerbte line-height des Labels — sonst sitzt
   die Box tiefer als die Textzeile. 2.5px ≈ (Zeilenbox 22px − Boxhöhe 17px) / 2 */
.note-md-wrap .ProseMirror ul[data-type="taskList"] li > label { margin-top: 2.5px; flex-shrink: 0; cursor: pointer; display: flex; }
/* Eigene Checkbox statt nativer: Innenraum bleibt transparent, sodass immer
   die Widget-Hintergrundfarbe durchscheint (native Boxen sind innen weiß) */
.note-md-wrap .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 14px; height: 14px;
  margin: 0;
  border: 1.5px solid var(--text3);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  position: relative;
  display: block;
  transition: border-color 0.12s, background 0.12s;
}
.note-md-wrap .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:hover { border-color: var(--accent); }
.note-md-wrap .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.note-md-wrap .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  left: 3.5px; top: 0.5px;
  width: 4px; height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.note-md-wrap .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; color: var(--text3); }
.note-md-wrap .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
.note-md-wrap .ProseMirror ul[data-type="taskList"] li > div > p { margin: 0; }
.note-md-wrap .ProseMirror blockquote {
  border-left: 3px solid var(--accent);
  margin: 4px 0;
  padding: 2px 0 2px 12px;
  color: var(--text3);
  font-style: italic;
}
.note-md-wrap .ProseMirror blockquote p { margin: 0; }
.note-md-wrap .ProseMirror code {
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 5px;
  font-family: ui-monospace, monospace; font-size: 0.85em; color: var(--accent);
}
.note-md-wrap .ProseMirror hr {
  border: none; border-top: 1px solid var(--border); margin: 8px 0;
}
.note-md-wrap .ProseMirror table { border-collapse: collapse; width: 100%; font-size: 0.9em; margin: 4px 0; }
.note-md-wrap .ProseMirror th { border: 1px solid var(--border); padding: 4px 8px; background: var(--surface2); font-weight: 700; color: var(--text1); text-align: left; }
.note-md-wrap .ProseMirror td { border: 1px solid var(--border); padding: 4px 8px; }

/* ── Code block with syntax highlighting ─────────────────────────────────── */
.note-md-wrap .ProseMirror pre {
  position: relative;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 28px 12px 10px;
  overflow-x: auto;
  font-size: 0.82em;
  margin: 6px 0;
}
/* language badge: </> icon */
.note-md-wrap .ProseMirror pre::before {
  content: '</>';
  position: absolute;
  top: 7px; left: 10px;
  font-size: 10px; font-weight: 700;
  color: var(--accent);
  font-family: ui-monospace, monospace;
  pointer-events: none;
  opacity: 0.7;
}
/* language name next to the icon */
.note-md-wrap .ProseMirror pre[data-language]::after {
  content: attr(data-language);
  position: absolute;
  top: 7px; left: 34px;
  font-size: 10px; font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: ui-monospace, monospace;
  pointer-events: none;
}
/* hide label on empty/plaintext blocks */
.note-md-wrap .ProseMirror pre[data-language=""]::before,
.note-md-wrap .ProseMirror pre[data-language=""]::after,
.note-md-wrap .ProseMirror pre[data-language="plaintext"]::after { opacity: 0; }
.note-md-wrap .ProseMirror pre code {
  background: none; border: none; padding: 0;
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: inherit;
  color: #abb2bf;
}

/* ── Syntax token colors (One Dark palette) ──────────────────────────────── */
.note-md-wrap .hljs-keyword,
.note-md-wrap .hljs-operator         { color: #c678dd; }

.note-md-wrap .hljs-function,
.note-md-wrap .hljs-title            { color: #61afef; }

.note-md-wrap .hljs-string,
.note-md-wrap .hljs-regexp,
.note-md-wrap .hljs-template-string  { color: #98c379; }

.note-md-wrap .hljs-number,
.note-md-wrap .hljs-literal          { color: #d19a66; }

.note-md-wrap .hljs-comment,
.note-md-wrap .hljs-doctag           { color: #5c6370; font-style: italic; }

.note-md-wrap .hljs-type,
.note-md-wrap .hljs-class,
.note-md-wrap .hljs-built_in         { color: #e5c07b; }

.note-md-wrap .hljs-variable,
.note-md-wrap .hljs-params           { color: #abb2bf; }

.note-md-wrap .hljs-property,
.note-md-wrap .hljs-attr             { color: #e06c75; }

.note-md-wrap .hljs-meta,
.note-md-wrap .hljs-meta-keyword     { color: #c678dd; }

.note-md-wrap .hljs-tag,
.note-md-wrap .hljs-name             { color: #e06c75; }

.note-md-wrap .hljs-attribute        { color: #d19a66; }

.note-md-wrap .hljs-selector-tag,
.note-md-wrap .hljs-selector-id,
.note-md-wrap .hljs-selector-class   { color: #e06c75; }

.note-md-wrap .hljs-addition         { color: #98c379; background: rgba(152,195,121,0.1); }
.note-md-wrap .hljs-deletion         { color: #e06c75; background: rgba(224,108,117,0.1); }

.note-md-wrap .hljs-bullet,
.note-md-wrap .hljs-symbol           { color: #56b6c2; }

.note-md-wrap .hljs-emphasis         { font-style: italic; }
.note-md-wrap .hljs-strong           { font-weight: bold; }
`
