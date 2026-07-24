'use client'
import { use, useEffect, useLayoutEffect, useState } from 'react'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSettings } from '@/store/settingsStore'
import { getTheme } from '@/lib/themes'
import { getFontStack } from '@/lib/fonts'
import { useT } from '@/hooks/useT'
import BoardGrid        from '@/components/board/BoardGrid'
import TopBar           from '@/components/ui/TopBar'
import FocusOverlay     from '@/components/board/FocusOverlay'
import ThemePanel       from '@/components/ui/ThemePanel'
import AiPanel          from '@/components/ui/AiPanel'
import WidgetStylePanel from '@/components/ui/WidgetStylePanel'
import BottomOverlay    from '@/components/ui/BottomOverlay'
import TutorialTour     from '@/components/ui/TutorialTour'

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useT()
  const openPanel = useUIStore(s => s.openPanel)
  const panel = useUIStore(s => s.panel)
  const isMobile = useIsMobile()

  // Track async IndexedDB rehydration so we don't judge/switch on the pre-hydration state
  const [hydrated, setHydrated] = useState(() => useBoardStore.persist.hasHydrated())
  useEffect(() => useBoardStore.persist.onFinishHydration(() => setHydrated(true)), [])

  // Switch board and apply theme — re-runs after hydration, since rehydration
  // replaces currentBoardId with the persisted value and would undo the switch.
  // useLayoutEffect (statt useEffect): feuert VOR dem Browser-Paint, damit beim
  // Boardwechsel nie ein Frame des vorherigen Boards sichtbar wird.
  useLayoutEffect(() => {
    const store = useBoardStore.getState()
    if (id !== store.currentBoardId) store.switchBoard(id)

    // Apply theme CSS vars for the board we just switched to
    const board = selectBoard(useBoardStore.getState())
    if (!board) return
    const theme = getTheme(board.themeId)
    const root  = document.documentElement
    Object.entries(theme.cssVars).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [id, hydrated])

  // Re-apply CSS vars when the theme changes while the board is open
  const themeId = useBoardStore(s => selectBoard(s)?.themeId)
  useEffect(() => {
    if (!themeId) return
    const theme = getTheme(themeId)
    const root  = document.documentElement
    Object.entries(theme.cssVars).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [themeId])

  const board          = useBoardStore(selectBoard)
  const currentBoardId = useBoardStore(s => s.currentBoardId)
  const headerStyle    = useSettings(s => s.headerStyle)
  const customFonts    = useSettings(s => s.customFonts)

  useEffect(() => {
    document.title = board ? `${board.name} – mosaic` : 'mosaic'
    return () => { document.title = 'mosaic' }
  }, [board?.name])

  const [storageWarning, setStorageWarning] = useState(false)
  useEffect(() => {
    if (!navigator.storage?.estimate) return
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage && quota && usage / quota > 0.8) setStorageWarning(true)
    })
  }, [])

  const isIsland    = headerStyle === 'island'

  // Before hydration finishes we can't know whether the board exists — show nothing
  // instead of flashing "Board nicht gefunden" or a stale board.
  if (!hydrated) return null

  // Store zeigt noch auf das vorherige Board (Wechsel läuft) → nichts rendern,
  // der Layout-Effect schaltet vor dem nächsten Paint um.
  if (currentBoardId !== id) return null

  if (!board) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        {t('Board not found')}
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
      // Board-Schrift überschreibt die Programm-Schrift nur innerhalb dieses
      // Boards (Einstellungen → Erscheinungsbild → Board-Schrift); ohne
      // eigene Wahl erbt es die globale --font-app.
      fontFamily: board.fontFamily ? getFontStack(board.fontFamily, customFonts) : 'var(--font-app)',
    }}>
      <div style={{ position: 'absolute', inset: 0, paddingTop: isIsland ? 0 : (isMobile ? 48 : 52) }}>
        <BoardGrid />
      </div>

      <TopBar />
      <FocusOverlay />
      <ThemePanel />
      <AiPanel />
      <WidgetStylePanel />
      <BottomOverlay />
      <TutorialTour />

      {storageWarning && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: 'color-mix(in srgb, #f59e0b 15%, var(--surface))',
          border: '1px solid #f59e0b', borderRadius: 10, padding: '8px 16px',
          fontSize: 12, color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          {t('Storage almost full — delete old boards or images to free up space.')}
          <button onClick={() => setStorageWarning(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {panel && (
        <div
          onClick={() => openPanel(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 800 }}
        />
      )}
    </div>
  )
}
