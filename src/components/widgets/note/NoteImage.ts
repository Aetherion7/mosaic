import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { MarkdownSerializerState } from 'prosemirror-markdown'
import { saveBlob, getBlob, isBlobRef } from '@/lib/blobStore'

// Block image for the note editor. The bytes live in the blob store
// (idb-blob://…), so the note's Markdown only carries a short reference.
// Saved as a raw `<img>` line: markdown-it (html:true) keeps a lone tag
// line as an HTML block, which parseHTML below reads straight back —
// including the width, which plain `![](…)` Markdown can't express.

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export async function insertImageFiles(editor: Editor, files: File[], at?: number) {
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) return false
  const refs = await Promise.all(imgs.map(f => saveBlob(f)))
  const content = refs.map(src => ({ type: 'image', attrs: { src } }))
  const chain = editor.chain().focus()
  if (typeof at === 'number') chain.insertContentAt(at, content)
  else chain.insertContent(content)
  chain.run()
  return true
}

function filesOf(list: FileList | null | undefined): File[] {
  return list ? Array.from(list).filter(f => f.type.startsWith('image/')) : []
}

export const NoteImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src:   { default: null },
      alt:   { default: '' },
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const w = parseInt(el.getAttribute('width') ?? '', 10)
          return Number.isFinite(w) && w > 0 ? w : null
        },
      },
    }
  },

  // Blob references are written as data-src: a real `src="idb-blob://…"`
  // makes the browser try (and fail) to fetch that scheme whenever the
  // Markdown is turned into HTML.
  parseHTML() {
    const alt = (dom: HTMLElement) => dom.getAttribute('alt') ?? ''
    return [
      { tag: 'img[data-src]', getAttrs: (dom: HTMLElement) => ({ src: dom.getAttribute('data-src'), alt: alt(dom) }) },
      { tag: 'img[src]', getAttrs: (dom: HTMLElement) => ({ src: dom.getAttribute('src'), alt: alt(dom) }) },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { src, ...rest } = HTMLAttributes
    return ['img', mergeAttributes(rest, isBlobRef(src) ? { 'data-src': src } : { src })]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const { src, alt, width } = node.attrs as { src: string | null; alt: string | null; width: number | null }
          const srcAttr = isBlobRef(src) ? 'data-src' : 'src'
          state.write(`<img ${srcAttr}="${escAttr(src ?? '')}" alt="${escAttr(alt ?? '')}"${width ? ` width="${width}"` : ''}>`)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let cur = node
      const wrap = document.createElement('div')
      wrap.className = 'note-img'
      wrap.contentEditable = 'false'
      const img = document.createElement('img')
      img.draggable = false
      const handle = document.createElement('span')
      handle.className = 'note-img-handle'
      wrap.append(img, handle)

      let loaded = ''
      let objUrl: string | null = null
      const load = (src: string) => {
        if (src === loaded) return
        loaded = src
        if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null }
        if (!isBlobRef(src)) { img.src = src; return }
        getBlob(src).then(blob => {
          if (loaded !== src) return
          if (blob) { objUrl = URL.createObjectURL(blob); img.src = objUrl }
          else wrap.classList.add('missing')
        }).catch(() => wrap.classList.add('missing'))
      }
      const apply = () => {
        load(cur.attrs.src ?? '')
        img.alt = cur.attrs.alt ?? ''
        wrap.style.width = cur.attrs.width ? `${cur.attrs.width}px` : ''
      }
      apply()

      // Drag the corner handle to resize. Deltas are converted from screen
      // pixels to layout pixels, since the whole board may be CSS-scaled.
      handle.addEventListener('pointerdown', e => {
        if (!editor.isEditable) return
        e.preventDefault(); e.stopPropagation()
        const rect = wrap.getBoundingClientRect()
        const k = wrap.offsetWidth / (rect.width || 1)
        const startX = e.clientX, startW = wrap.offsetWidth
        const maxW = (wrap.parentElement?.clientWidth ?? 2000)
        handle.setPointerCapture(e.pointerId)
        const move = (ev: PointerEvent) => {
          wrap.style.width = `${Math.round(Math.max(40, Math.min(maxW, startW + (ev.clientX - startX) * k)))}px`
        }
        const up = () => {
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', up)
          const width = Math.round(wrap.offsetWidth)
          const pos = typeof getPos === 'function' ? getPos() : undefined
          if (typeof pos === 'number') {
            editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, width: width >= maxW - 1 ? null : width }))
          }
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', up)
      })

      return {
        dom: wrap,
        update(next) {
          if (next.type !== cur.type) return false
          cur = next
          apply()
          return true
        },
        selectNode() { wrap.classList.add('selected') },
        deselectNode() { wrap.classList.remove('selected') },
        stopEvent: e => (e.target as HTMLElement) === handle,
        ignoreMutation: () => true,
        destroy() { if (objUrl) URL.revokeObjectURL(objUrl) },
      }
    }
  },

  // Pasting or dropping image files inserts them as images.
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handlePaste: (_view: EditorView, event: ClipboardEvent) => {
            const files = filesOf(event.clipboardData?.files)
            if (!files.length || !editor.isEditable) return false
            event.preventDefault()
            void insertImageFiles(editor, files)
            return true
          },
          handleDrop: (view: EditorView, event: DragEvent) => {
            const files = filesOf(event.dataTransfer?.files)
            if (!files.length || !editor.isEditable) return false
            event.preventDefault()
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            void insertImageFiles(editor, files, at)
            return true
          },
        },
      }),
    ]
  },
})
