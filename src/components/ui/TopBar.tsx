'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSettings } from '@/store/settingsStore'
import SettingsModal from '@/components/ui/SettingsModal'
import SlidingTabs from '@/components/ui/SlidingTabs'
import SearchModal   from '@/components/ui/SearchModal'
import { useT } from '@/hooks/useT'

// Einheitliches Tastaturkürzel-Badge — oben rechts über dem jeweiligen Button
// angedockt (A, E, ⌘K, I). Muss überall dieselbe Position/Optik haben, sonst
// wirken die Center- und Right-Buttons wie zwei verschiedene UI-Sprachen.
const kbdBadgeStyle: React.CSSProperties = {
  position: 'absolute', top: -6, right: -4,
  fontSize: 8, fontWeight: 700, color: 'var(--text3)',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '1px 3px', pointerEvents: 'none',
  lineHeight: 1,
}

export default function TopBar() {
  const board          = useBoardStore(selectBoard)
  const setBoardName   = useBoardStore(s => s.setBoardName)
  const mode           = useUIStore(s => s.mode)
  const toggleMode     = useUIStore(s => s.toggleMode)
  const openPanel      = useUIStore(s => s.openPanel)
  const panel          = useUIStore(s => s.panel)
  const isMobile       = useIsMobile()
  const t              = useT()

  const showKbdHints  = useSettings(s => s.showKbdHints)
  const headerStyle   = useSettings(s => s.headerStyle)
  const aiEnabled     = useSettings(s => s.aiEnabled)
  const isIsland      = headerStyle === 'island'

  // Always-current refs — updated every render so the keydown handler never sees stale values
  const modeRef      = useRef(mode)
  const panelRef     = useRef(panel)
  const openPanelRef = useRef(openPanel)
  modeRef.current      = mode
  panelRef.current     = panel
  openPanelRef.current = openPanel

  const [editingName, setEditingName]     = useState(false)
  const [nameVal, setNameVal]             = useState(board?.name ?? '')
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [searchOpen, setSearchOpen]       = useState(false)
  const searchOpenRef = useRef(searchOpen)
  searchOpenRef.current = searchOpen

  useEffect(() => { setNameVal(board?.name ?? '') }, [board?.name])


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = (e.target ?? document.activeElement) as HTMLElement
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
        return
      }
      if (e.key === 'Escape') {
        if (searchOpenRef.current) { setSearchOpen(false); return }
        openPanelRef.current(null)
        useUIStore.getState().selectWidget(null)
        useUIStore.getState().clearMultiSelect()
        setSettingsOpen(false)
        // Fokus aktiv lösen: Er bliebe sonst für die Dauer der Panel-Exit-
        // Animation (~0,5 s) in der unmountenden Textarea hängen und der
        // Eingabefeld-Guard unten würde solange alle Shortcuts schlucken.
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        return
      }
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) ||
        el?.isContentEditable ||
        !!el?.closest('[contenteditable]') ||
        !!el?.closest('[data-widget-content]')
      ) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useBoardStore.getState().undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Z')) {
        e.preventDefault()
        useBoardStore.getState().redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && modeRef.current === 'edit') {
        const ui    = useUIStore.getState()
        const bs    = useBoardStore.getState()
        const board = bs.boards[bs.currentBoardId]
        // Locked widgets are never deletable via keyboard
        const deletableMulti = ui.multiSelectedIds.filter(wid => !board?.widgets[wid]?.locked)

        if (deletableMulti.length > 1) {
          ui.setMultiSelectedIds(deletableMulti)
          ui.setPendingBulkDelete(true)
        } else {
          const singleId = deletableMulti[0] ?? ui.selectedId
          const widget   = singleId ? board?.widgets[singleId] : undefined
          if (!widget || widget.locked) return
          ui.showUndoToast({ widget, boardId: bs.currentBoardId })
          bs.deleteWidget(widget.id)
          ui.clearMultiSelect()
          ui.selectWidget(null)
        }
        return
      }
      if (e.key === 'e' || e.key === 'E') toggleMode()
      if (e.key === 's' || e.key === 'S') setSettingsOpen(o => !o)
      if ((e.key === 'a' || e.key === 'A') && modeRef.current === 'edit') {
        e.preventDefault()
        openPanelRef.current(panelRef.current === 'addWidget' ? null : 'addWidget')
      }
      if (e.key === 't' || e.key === 'T')
        openPanelRef.current(panelRef.current === 'theme' ? null : 'theme')
      if ((e.key === 'i' || e.key === 'I') && useSettings.getState().aiEnabled)
        openPanelRef.current(panelRef.current === 'ai' ? null : 'ai')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleMode])

  function commitName() {
    setEditingName(false)
    if (nameVal.trim()) setBoardName(nameVal.trim())
    else setNameVal(board?.name ?? '')
  }

  const headerHeight = isMobile ? 48 : 52

  const islandPill: React.CSSProperties = isIsland ? {
    // Mit --bg gemischt statt transparent: bleibt auch über weißem Inhalt
    // (PDF, Zeichenfläche) in jedem Theme deckend & lesbar
    background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '4px 8px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    width: 'fit-content',
  } : {}
  const islandLeft:  React.CSSProperties = isIsland ? { ...islandPill, justifySelf: 'start', paddingRight: 16 } : {}
  const islandRight: React.CSSProperties = isIsland ? { ...islandPill, justifySelf: 'end', marginLeft: 'auto' } : {}

  return (
    <>
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      height: headerHeight, zIndex: 1000,
      // Mobil: Mitte + rechte Buttons behalten ihre natürliche Breite, nur der
      // Namensbereich links schrumpft (Ellipsis) — sonst wird das Zahnrad
      // im Edit-Modus rechts aus dem Viewport gedrängt
      display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto auto' : '1fr auto 1fr', alignItems: 'center',
      columnGap: isMobile ? 6 : 0,
      padding: isIsland ? (isMobile ? '6px 12px' : '6px 16px') : (isMobile ? '0 12px' : '0 16px'),
      background: isIsland ? 'transparent' : 'color-mix(in srgb, var(--surface) 60%, var(--bg))',
      backdropFilter: isIsland ? 'none' : 'blur(16px)',
      borderBottom: isIsland ? 'none' : '1px solid var(--border)',
    }}>

      {/* ── Left: Logo + Board Name (combined pill) ── */}
      {isIsland ? (
        /* Island-Modus: Logo + Name in einer Pille */
        <div style={{ ...islandLeft, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4, justifySelf: 'start', minWidth: 0 }}>
          <Link href="/" title={t("Go to board overview")} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mosaiclogo.png" alt="mosaic" width={34} height={34} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            {!isMobile && <span style={{ fontSize: 28, fontWeight: 400, color: 'var(--text1)', fontFamily: 'Guavine, sans-serif', lineHeight: 1 }}>mosaic</span>}
          </Link>
          <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
          {(
            mode === 'edit' ? (
              editingName ? (
                <input autoFocus maxLength={60} value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(board?.name ?? '') } }}
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', background: 'transparent', border: 'none', outline: 'none', borderRadius: 6, padding: '2px 4px', width: `${Math.max(nameVal.length, 2) + 1}ch`, maxWidth: isMobile ? 110 : 220 }}
                />
              ) : (
                <span onDoubleClick={() => setEditingName(true)} title={t("Double-click to edit")}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'text', userSelect: 'none', maxWidth: isMobile ? 110 : 220, overflow: 'hidden' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {board?.name ?? t('Board')}
                  </span>
                  <svg onClick={e => { e.stopPropagation(); setEditingName(true) }} width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text3)', flexShrink: 0, cursor: 'pointer' }}>
                    <path d="M11 2 L14 5 L5 14 L2 14 L2 11 Z"/><line x1="9.5" y1="3.5" x2="12.5" y2="6.5"/>
                  </svg>
                </span>
              )
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', userSelect: 'none', maxWidth: isMobile ? 110 : 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {board?.name ?? t('Board')}
              </span>
            )
          )}
        </div>
      ) : (
        /* Standard-Modus: Logo + Name ohne Pille */
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Link href="/" title={t("Go to board overview")} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mosaiclogo.png" alt="mosaic" width={30} height={30} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            {!isMobile && <span style={{ fontSize: 24, fontWeight: 400, color: 'var(--text1)', fontFamily: 'Guavine, sans-serif', lineHeight: 1 }}>mosaic</span>}
          </Link>
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
          {(
            mode === 'edit' ? (
              editingName ? (
                <input autoFocus maxLength={60} value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(board?.name ?? '') } }}
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', background: 'transparent', border: 'none', outline: 'none', padding: '2px 0', width: `${Math.max(nameVal.length, 2) + 1}ch`, maxWidth: isMobile ? 110 : 220 }}
                />
              ) : (
                <span onDoubleClick={() => setEditingName(true)} title={t("Double-click to edit")}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'text', userSelect: 'none', maxWidth: isMobile ? 110 : 220, overflow: 'hidden' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {board?.name ?? t('Board')}
                  </span>
                  <svg onClick={e => { e.stopPropagation(); setEditingName(true) }} width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text3)', flexShrink: 0, cursor: 'pointer' }}>
                    <path d="M11 2 L14 5 L5 14 L2 14 L2 11 Z"/><line x1="9.5" y1="3.5" x2="12.5" y2="6.5"/>
                  </svg>
                </span>
              )
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', userSelect: 'none', maxWidth: isMobile ? 110 : 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {board?.name ?? t('Board')}
              </span>
            )
          )}
        </div>
      )}

      {/* ── Center: Add Widget + Mode Toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          ...(isIsland ? {
            background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border)', borderRadius: 999,
            padding: '4px 8px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            transition: 'padding 0.3s ease',
          } : {}),
        }}>
          {/* + Button mit max-width Transition → Pill dehnt sich aus.
              overflowX/Y gemischt (hidden/visible) wird vom Browser zu
              overflow-y:auto zusammengefasst (CSS-Spec-Verhalten bei
              unterschiedlichen Achsen) — das clippt das [A]-Badge trotzdem,
              nur eben scrollbar statt sichtbar. Stattdessen: paddingTop
              vergrößert die Clip-Box selbst nach oben, marginTop gleicht die
              dadurch verschobene Position wieder aus (Netto-Verschiebung 0),
              sodass oben Platz für das nach oben herausragende Badge ist,
              ohne dass sich der Button optisch bewegt. */}
          <div style={{
            maxWidth: mode === 'edit' ? 46 : 0,
            opacity: mode === 'edit' ? 1 : 0,
            overflow: 'hidden',
            paddingTop: 8, marginTop: -8,
            transition: 'max-width 0.3s ease, opacity 0.2s ease',
            flexShrink: 0,
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <IconCircleBtn accent active={panel === 'addWidget'} onClick={() => openPanel(panel === 'addWidget' ? null : 'addWidget')} title={t("Add widget") + " [A]"} id="add-widget-btn">
                <IconPlus />
              </IconCircleBtn>
              {showKbdHints && !isMobile && <span style={kbdBadgeStyle}>A</span>}
            </div>
          </div>

          <div id="tour-mode-toggle" style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'var(--surface)', borderRadius: 999, padding: 3, border: '1px solid var(--border)' }}>
            <SlidingTabs
              options={[
                { value: 'edit', icon: <IconPencil />, title: t('Edit mode') },
                { value: 'view', icon: <IconEye />,    title: t('View mode') },
              ]}
              value={mode}
              onChange={m => useUIStore.getState().setMode(m)}
              slotW={32} slotH={32}
            />
            {showKbdHints && !isMobile && <span style={kbdBadgeStyle}>E</span>}
          </div>
        </div>
      </div>

      {/* ── Right: Search + Theme + Export + Settings ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isMobile ? 4 : 8, ...islandRight }}>
        {/* Search with ⌘K hint */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <IconCircleBtn id="tour-search" active={searchOpen} onClick={() => setSearchOpen(o => !o)} title={t("Search") + " [" + t("Ctrl+K") + "]"}>
            <IconSearch />
          </IconCircleBtn>
          {showKbdHints && !isMobile && <span style={kbdBadgeStyle}>⌘K</span>}
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <IconCircleBtn id="tour-theme" active={panel === 'theme'} onClick={() => openPanel(panel === 'theme' ? null : 'theme')} title={t("Theme") + " [T]"}>
            <IconSun />
          </IconCircleBtn>
          {showKbdHints && !isMobile && <span style={kbdBadgeStyle}>T</span>}
        </div>

        {aiEnabled && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <IconCircleBtn id="tour-ai" active={panel === 'ai'} onClick={() => openPanel(panel === 'ai' ? null : 'ai')} title={t("AI assistant") + " [I]"}>
              <IconSparkleTopbar />
            </IconCircleBtn>
            {showKbdHints && !isMobile && <span style={kbdBadgeStyle}>I</span>}
          </div>
        )}

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <IconCircleBtn id="tour-settings" active={settingsOpen} onClick={() => setSettingsOpen(o => !o)} title={t("Settings") + " [S]"}>
            <IconGear />
          </IconCircleBtn>
          {showKbdHints && !isMobile && <span style={kbdBadgeStyle}>S</span>}
        </div>
      </div>
    </header>

    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    {searchOpen  && <SearchModal   onClose={() => setSearchOpen(false)}   />}
    </>
  )
}

/* ── Small SVG icons ─────────────────────────────────────────────────────── */

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function IconSparkleTopbar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>
    </svg>
  )
}

function IconSun() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function IconGear() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

/* ── Shared button primitives ────────────────────────────────────────────── */

function IconCircleBtn({ children, onClick, active, accent, title, id }: {
  children: React.ReactNode; onClick: () => void; active?: boolean; accent?: boolean; title?: string; id?: string
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 50,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? (accent ? 'var(--accent)' : 'var(--surface2)') : accent ? 'var(--accent)' : 'var(--surface)',
        color: accent ? 'white' : active ? 'var(--accent)' : 'var(--text2)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >{children}</button>
  )
}

