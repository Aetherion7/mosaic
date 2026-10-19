import { Node, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { MarkdownSerializerState } from 'prosemirror-markdown'

// Split view: independent side-by-side columns inside ONE note. Each column
// is its own block container (typing/Enter never spills into a neighbour),
// they exist from the start so any of them can be clicked into, and each
// grows downward on its own. Saved as blank-line-separated <div> wrappers —
// markdown-it keeps each lone tag line as raw HTML and still parses the
// Markdown between them (same trick as the paragraph-alignment wrapper).

function wrapSerializer(open: string) {
  return (state: MarkdownSerializerState, node: PMNode) => {
    state.write(open)
    state.closeBlock(node)
    state.renderContent(node)
    state.write('</div>')
    state.closeBlock(node)
  }
}

export const NoteColumns = Node.create({
  name: 'noteColumns',
  group: 'block',
  content: 'noteColumn+',
  isolating: true,
  defining: true,
  parseHTML() { return [{ tag: 'div[data-note-columns]' }] },
  renderHTML({ node }) {
    return ['div', { 'data-note-columns': String(node.childCount), class: 'note-columns', style: `--note-cols:${node.childCount}` }, 0]
  },
  addStorage() {
    return { markdown: { serialize: wrapSerializer('<div data-note-columns>'), parse: {} } }
  },
})

export const NoteColumn = Node.create({
  name: 'noteColumn',
  content: 'block+',
  isolating: true,
  defining: true,
  parseHTML() { return [{ tag: 'div[data-note-column]' }] },
  renderHTML() { return ['div', { 'data-note-column': '', class: 'note-column' }, 0] },
  addStorage() {
    return { markdown: { serialize: wrapSerializer('<div data-note-column>'), parse: {} } }
  },
})

export function columnCount(editor: Editor | null): number {
  let n = 1
  editor?.state.doc.forEach(node => { if (node.type.name === 'noteColumns' && n === 1) n = node.childCount })
  return n
}

const isBlankColumn = (col: PMNode) =>
  col.childCount === 1 && col.firstChild!.type.name === 'paragraph' && col.firstChild!.content.size === 0

// Switches the whole note between 1–4 columns. Going up adds empty columns
// (existing text stays in the first); going down appends the removed
// columns' content to the last remaining one, so nothing is ever lost.
export function setColumnCount(editor: Editor, n: number) {
  const { state } = editor
  const { schema, doc } = state
  const colsType = schema.nodes.noteColumns, colType = schema.nodes.noteColumn, para = schema.nodes.paragraph
  let colsNode: PMNode | null = null, colsPos = -1
  doc.forEach((node, offset) => { if (!colsNode && node.type === colsType) { colsNode = node; colsPos = offset } })
  const tr = state.tr

  if (!colsNode) {
    if (n <= 1) return
    const first = colType.create(null, doc.content.size ? doc.content : para.create())
    const rest = Array.from({ length: n - 1 }, () => colType.create(null, para.create()))
    tr.replaceWith(0, doc.content.size, colsType.create(null, [first, ...rest]))
  } else {
    const node = colsNode as PMNode
    const cols: PMNode[] = []
    node.forEach(c => cols.push(c))
    if (n === cols.length) return
    if (n <= 1) {
      const blocks: PMNode[] = []
      cols.filter((c, i) => i === 0 || !isBlankColumn(c)).forEach(c => c.forEach(b => blocks.push(b)))
      tr.replaceWith(colsPos, colsPos + node.nodeSize, blocks)
    } else if (n > cols.length) {
      const extra = Array.from({ length: n - cols.length }, () => colType.create(null, para.create()))
      tr.replaceWith(colsPos, colsPos + node.nodeSize, colsType.create(null, [...cols, ...extra]))
    } else {
      const keep = cols.slice(0, n)
      const merged: PMNode[] = []
      keep[n - 1].forEach(b => merged.push(b))
      cols.slice(n).filter(c => !isBlankColumn(c)).forEach(c => c.forEach(b => merged.push(b)))
      keep[n - 1] = colType.create(null, merged)
      tr.replaceWith(colsPos, colsPos + node.nodeSize, colsType.create(null, keep))
    }
  }
  editor.view.dispatch(tr.scrollIntoView())
}
