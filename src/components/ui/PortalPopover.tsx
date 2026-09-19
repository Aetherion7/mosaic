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

  // Position is measured once at open time and never re-measured — moving
  // the board while open left the popover fixed at its old screen position,
  // visually detaching from its trigger and drifting over whatever content
  // moved into that spot. Closing instead of tracking matches how a native
  // <select>'s dropdown behaves and avoids the cost/jitter of repositioning
  // a possibly-tall list continuously.
  //
  // Two listeners because this app has two unrelated ways the board moves
  // under a fixed-position popover: a real scrollable ancestor (native
  // "scroll", doesn't bubble — capture phase on window catches it from any
  // nested scroller) and the infinite-canvas board mode, which pans/zooms by
  // applying a transform imperatively on every wheel tick (by design, to
  // avoid a React re-render per scroll frame — see InfiniteCanvas.tsx) and
  // so never fires "scroll" at all. The existing outside-mousedown handler
  // above already closes this for the OTHER infinite-canvas pan path
  // (space+drag), since that starts with a mousedown on the canvas.
  useEffect(() => {
    if (!open) return
    // Ignore scrolling INSIDE the popover (its own long option list)
    const onScroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) onClose() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('wheel', onScroll, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('wheel', onScroll, true)
    }
  }, [open, onClose])

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
