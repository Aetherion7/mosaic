'use client'
import { useEffect, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/core'

interface Head { level: number; text: string; pos: number }

function collectHeadings(editor: Editor): Head[] {
  const out: Head[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim()
      if (text) out.push({ level: node.attrs.level as number, text, pos })
      return false
    }
    return true
  })
  return out
}

// Thin rail on the note's right edge: one tick per heading (longer = higher
// level). Hovering opens the full outline in document order; clicking an
// entry scrolls the note to that heading — across all split columns too.
export function NoteOutline({ editor, scrollRef, t, onPresence }: {
  editor: Editor | null
  scrollRef: RefObject<HTMLDivElement | null>
  t: (s: string) => string
  onPresence: (has: boolean) => void
}) {
  const [heads, setHeads] = useState<Head[]>([])
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState<Set<number>>(new Set())

  // Re-read on the next frame, never synchronously: Tiptap can emit
  // transactions during React's commit phase, and setting state from there
  // on every keystroke cascades into "Maximum update depth exceeded".
  useEffect(() => {
    if (!editor) return
    let raf = 0
    let lastKey = ''
    const read = () => {
      raf = 0
      const next = collectHeadings(editor)
      const key = next.map(h => `${h.level}:${h.pos}:${h.text}`).join('|')
      if (key !== lastKey) { lastKey = key; setHeads(next) }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(read) }
    schedule()
    const onTx = ({ transaction }: { transaction: { docChanged: boolean } }) => { if (transaction.docChanged) schedule() }
    editor.on('transaction', onTx)
    return () => { editor.off('transaction', onTx); cancelAnimationFrame(raf) }
  }, [editor])

  useEffect(() => { onPresence(heads.length > 0) }, [heads.length, onPresence])

  // Which headings are currently on screen (highlighted in the rail).
  useEffect(() => {
    const box = scrollRef.current
    if (!box || !editor || !heads.length) return
    const update = () => {
      const r = box.getBoundingClientRect()
      const next = new Set<number>()
      for (const h of heads) {
        const el = editor.view.nodeDOM(h.pos) as HTMLElement | null
        const er = el?.getBoundingClientRect?.()
        if (er && er.bottom > r.top && er.top < r.bottom) next.add(h.pos)
      }
      setVisible(prev => prev.size === next.size && [...next].every(p => prev.has(p)) ? prev : next)
    }
    update()
    box.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(box)
    return () => { box.removeEventListener('scroll', update); ro.disconnect() }
  }, [editor, heads, scrollRef])

  if (!editor || !heads.length) return null
  const minLevel = Math.min(...heads.map(h => h.level))

  function jump(h: Head) {
    const box = scrollRef.current
    const el = editor!.view.nodeDOM(h.pos) as HTMLElement | null
    if (!box || !el?.getBoundingClientRect) return
    const br = box.getBoundingClientRect()
    // The board may be CSS-scaled: convert screen px back to layout px.
    const k = box.offsetHeight / (br.height || 1)
    const top = box.scrollTop + (el.getBoundingClientRect().top - br.top) * k - 6
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    el.classList.add('note-heading-flash')
    setTimeout(() => el.classList.remove('note-heading-flash'), 900)
  }

  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 16, zIndex: 3 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, padding: '8px 2px 0 0' }} aria-label={t('Outline')}>
        {heads.slice(0, 40).map(h => (
          <span key={h.pos} style={{
            height: 2, borderRadius: 2, display: 'block',
            width: Math.max(4, 12 - (h.level - minLevel) * 3),
            background: visible.has(h.pos) ? 'var(--accent)' : 'var(--text3)',
            opacity: visible.has(h.pos) ? 1 : 0.55,
          }} />
        ))}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 4, right: 14, width: 210, maxHeight: 'calc(100% - 8px)', overflowY: 'auto',
          background: 'var(--popover-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid var(--border)', borderRadius: 10, padding: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '5px 8px 4px' }}>
            {t('Outline')}
          </div>
          {heads.map(h => (
            <button key={h.pos} type="button" onClick={() => jump(h)} title={h.text}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer',
                padding: '4px 8px', paddingLeft: 8 + (h.level - minLevel) * 12, borderRadius: 6,
                fontSize: h.level === minLevel ? 12 : 11.5, fontWeight: h.level === minLevel ? 600 : 400,
                color: visible.has(h.pos) ? 'var(--accent)' : h.level === minLevel ? 'var(--text1)' : 'var(--text2)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
