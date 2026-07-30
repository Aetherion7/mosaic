'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'

type MenuState = { x: number; y: number; target: HTMLElement }

const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'image']

function isEditable(el: HTMLElement | null): boolean {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.includes((el as HTMLInputElement).type)) return true
  if (el.isContentEditable) return true
  return !!el.closest('textarea, input, [contenteditable="true"]')
}

function hasSelection(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.selectionStart !== el.selectionEnd
  }
  const sel = window.getSelection()
  return !!sel && !sel.isCollapsed && el.contains(sel.anchorNode)
}

function isReadOnly(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.readOnly || el.disabled
  return false
}

// Renderer-side stand-in for the OS/browser's own text-field context menu —
// Electron's BrowserWindow doesn't provide one by default. Skips anything a
// more specific handler already claimed (TableWidget's per-cell menu, the
// color-swatch remove actions, …), detected via e.defaultPrevented, since
// those all call preventDefault() themselves without stopping propagation.
export default function GlobalContextMenu() {
  const t = useT()
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      if (e.defaultPrevented) return
      const el = e.target as HTMLElement
      if (!isEditable(el)) return
      e.preventDefault()
      setMenu({ x: e.clientX, y: e.clientY, target: el })
    }
    document.addEventListener('contextmenu', onContextMenu)
    return () => document.removeEventListener('contextmenu', onContextMenu)
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('[data-gctx]')) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!menu) return null
  const el = menu.target
  const selected = hasSelection(el)
  const readOnly = isReadOnly(el)

  function run(cmd: 'cut' | 'copy' | 'paste' | 'selectAll') {
    el.focus()
    if (cmd === 'paste') {
      navigator.clipboard.readText()
        .then(text => { document.execCommand('insertText', false, text) })
        .catch(() => { document.execCommand('paste') })
    } else {
      document.execCommand(cmd === 'selectAll' ? 'selectAll' : cmd)
    }
    setMenu(null)
  }

  const items: { label: string; action: () => void; enabled: boolean }[] = [
    { label: t('Cut'),   action: () => run('cut'),   enabled: selected && !readOnly },
    { label: t('Copy'),  action: () => run('copy'),  enabled: selected },
    { label: t('Paste'), action: () => run('paste'), enabled: !readOnly },
    { label: t('Select All'), action: () => run('selectAll'), enabled: true },
  ]

  return (
    <div
      data-gctx="1"
      style={{
        position: 'fixed', zIndex: 10000, left: menu.x, top: menu.y,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '4px 0', minWidth: 160,
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
      }}
    >
      {items.map(item => (
        <div
          key={item.label}
          onPointerDown={e => { e.preventDefault(); if (item.enabled) item.action() }}
          style={{
            padding: '6px 14px', fontSize: 12,
            cursor: item.enabled ? 'pointer' : 'default',
            color: item.enabled ? 'var(--text1)' : 'var(--text3)',
          }}
          onMouseEnter={e => { if (item.enabled) e.currentTarget.style.background = 'var(--surface2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}
