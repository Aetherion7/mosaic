'use client'
import { useState, useEffect } from 'react'

// Electron does not touch the default userAgent (see electron/preload.js —
// deliberately no contextBridge API), so it still contains "Electron/x.y.z"
// unless explicitly stripped. That's reason enough to tell apart wording
// that only makes sense in a real browser tab ("browser storage") from the
// desktop app ("on your device — on disk").
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(navigator.userAgent.includes('Electron'))
  }, [])
  return isDesktop
}
