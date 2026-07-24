import { useEffect, RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return
    const el = ref.current
    const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!nodes.length) return

    const first = nodes[0]
    const last  = nodes[nodes.length - 1]

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    el.addEventListener('keydown', onKey)
    // Move focus into modal on open
    const prev = document.activeElement as HTMLElement | null
    first.focus()

    return () => {
      el.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [active, ref])
}
