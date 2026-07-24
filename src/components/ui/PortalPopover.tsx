'use client'
import { useRef, useState, useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'

// Generic escape hatch for small toolbar popovers that would otherwise be
// clipped by an overflow:hidden ancestor (e.g. a widget tile that's narrower
// than the popover it needs to show). Mirrors the portal+measure+clamp+
// outside-click pattern already used by ColorSwatch.tsx, but decoupled from
// any specific visual content so multiple popovers in the same widget can
// reuse it instead of duplicating the positioning math.
export function PortalPopover({
  open, anchorRef, onClose, children, width,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!open) { setReady(false); return }
    const id = requestAnimationFrame(() => {
      const anchor = anchorRef.current
      const pop = popRef.current
      if (!anchor || !pop) return
      const r = anchor.getBoundingClientRect()
      const pw = pop.offsetWidth
      const ph = pop.offsetHeight
      const M = 8

      let x = r.left
      if (x + pw > window.innerWidth - M) x = window.innerWidth - pw - M
      x = Math.max(M, x)

      let y = r.bottom + 6
      if (y + ph > window.innerHeight - M) y = Math.max(M, r.top - ph - 6)

      setPos({ x, y })
      setReady(true)
    })
    return () => cancelAnimationFrame(id)
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={popRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999,
        width, visibility: ready ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
