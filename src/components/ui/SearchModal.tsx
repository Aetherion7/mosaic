'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { selectBoard } from '@/store/boardStore'
import { TYPE_LABELS } from '@/components/board/TileWrapper'
import { extractNoteTitle } from '@/lib/noteTitle'
import { useT } from '@/hooks/useT'
import type { Widget } from '@/types'
import {
  IconTask, IconNote, IconTimer, IconWater, IconImage,
  IconCalendar, IconChart, IconTable, IconDraw, IconClock,
  IconWeather, IconMap, IconReader,
  IconSleep, IconAgenda, IconLinks,
} from '@/components/ui/Icons'

function PluginIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>
    </svg>
  )
}

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  task:        <IconTask size={18} />,
  note:        <IconNote size={18} />,
  timer:       <IconTimer size={18} />,
  water:       <IconWater size={18} />,
  image:       <IconImage size={18} />,
  calendar:    <IconCalendar size={18} />,
  chart:       <IconChart size={18} />,
  spreadsheet: <IconTable size={18} />,
  drawboard:   <IconDraw size={18} />,
  clock:       <IconClock size={18} />,
  weather:     <IconWeather size={18} />,
  map:         <IconMap size={18} />,
  reader:      <IconReader size={18} />,
  plugin:      <PluginIcon />,
  sleep:       <IconSleep size={18} />,
  agenda:      <IconAgenda size={18} />,
  quicklinks:  <IconLinks size={18} />,
}

interface Result {
  boardId:   string
  boardName: string
  widget:    Widget
  label:     string
}

interface Props { onClose: () => void }

export default function SearchModal({ onClose }: Props) {
  // Suche ist bewusst auf das aktuell geöffnete Board beschränkt
  const board       = useBoardStore(selectBoard)
  const selectWidget = useUIStore(s => s.selectWidget)
  const t = useT()

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q || !board) return []
    const out: Result[] = []
    for (const widget of Object.values(board.widgets)) {
      const d = widget.data as Record<string, unknown>
      const noteTitle = widget.type === 'note' ? extractNoteTitle(d.content as string | undefined) : null
      const label =
        (d.name as string | undefined) ||
        noteTitle ||
        (d.title as string | undefined) ||
        (d.content as string | undefined) ||
        t(TYPE_LABELS[widget.type]) ||
        widget.type
      if (
        label.toLowerCase().includes(q) ||
        widget.type.toLowerCase().includes(q) ||
        t(TYPE_LABELS[widget.type] ?? '').toLowerCase().includes(q)
      ) {
        out.push({ boardId: board.id, boardName: board.name, widget, label })
      }
    }
    return out.slice(0, 40)
  }, [query, board, t])

  const [cursor, setCursor] = useState(0)
  useEffect(() => { setCursor(0) }, [results])

  function navigate(r: Result) {
    selectWidget(r.widget.id)
    // In infinite mode: pan canvas to widget position
    if ((board?.layoutMode ?? 'infinite') === 'infinite') {
      useUIStore.getState().setCanvasFocus({
        col:     r.widget.pos.col,
        row:     r.widget.pos.row,
        colSpan: r.widget.pos.colSpan,
        rowSpan: r.widget.pos.rowSpan,
      })
    }
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && results[cursor]) navigate(results[cursor])
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        role="dialog" aria-modal="true" aria-label={t('Widget search')}
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('Search widgets on this board…')}
            aria-label={t('Search widgets on this board')}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text1)', fontSize: 16,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: 0 }}
            >
              ×
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px' }}>
            ESC
          </span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {query && results.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              {t('No results for')} “{query}”
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.boardId}-${r.widget.id}`}
              onClick={() => navigate(r)}
              onMouseEnter={() => setCursor(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '9px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                background: i === cursor ? 'color-mix(in srgb, var(--accent) 10%, var(--surface2))' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <span style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 9,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text2)',
              }}>
                {TYPE_ICON_MAP[r.widget.type] ?? <PluginIcon />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {t(TYPE_LABELS[r.widget.type] ?? r.widget.type)}
                </span>
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{t('Enter ↵')}</span>
            </button>
          ))}
        </div>

      </motion.div>
    </div>
  )
}
