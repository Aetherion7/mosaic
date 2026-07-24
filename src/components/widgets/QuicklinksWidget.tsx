'use client'
import { useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { uid } from '@/lib/defaults'
import { useT } from '@/hooks/useT'
import type { Widget, QuicklinksData, QuickLink } from '@/types'

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export default function QuicklinksWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const mode  = useUIStore(s => s.mode)
  const d     = widget.data as QuicklinksData
  const links = d.links ?? []

  const [urlInput,   setUrlInput]   = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set())

  function addLink() {
    const url = normalizeUrl(urlInput)
    if (!url || !domainOf(url)) return
    const link: QuickLink = {
      id:    `l_${uid()}`,
      url,
      label: labelInput.trim() || domainOf(url),
    }
    updateTaskData(widget.id, { links: [...links, link] })
    setUrlInput(''); setLabelInput('')
  }

  function removeLink(id: string) {
    updateTaskData(widget.id, { links: links.filter(l => l.id !== id) })
  }

  function open(link: QuickLink) {
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }} onPointerDown={e => e.stopPropagation()}>

      {/* Tile grid */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {links.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, color: 'var(--text3)', textAlign: 'center', padding: '0 12px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span style={{ fontSize: 10, lineHeight: 1.5 }}>
              {mode === 'edit' ? t('Add a link below') : t('No links yet — add some in edit mode')}
            </span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 5 }}>
            {links.map(link => {
              const domain = domainOf(link.url)
              const letter = (link.label[0] ?? '?').toUpperCase()
              return (
                <div key={link.id} style={{ position: 'relative' }}>
                  <button
                    onClick={() => open(link)}
                    title={link.url}
                    style={{
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '8px 3px 6px', borderRadius: 8, cursor: 'pointer',
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 7, overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--surface3)', border: '1px solid var(--border)',
                    }}>
                      {domain && !failedIcons.has(link.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
                          alt="" width={18} height={18}
                          style={{ display: 'block' }}
                          onError={() => setFailedIcons(prev => new Set(prev).add(link.id))}
                        />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>{letter}</span>
                      )}
                    </span>
                    <span style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text2)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.label}
                    </span>
                  </button>
                  {mode === 'edit' && (
                    <button
                      onClick={() => removeLink(link.id)}
                      title={t('Remove')}
                      style={{
                        position: 'absolute', top: 3, right: 3, width: 15, height: 15,
                        borderRadius: '50%', border: '1px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--text3)',
                        cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <line x1="1.5" y1="1.5" x2="8.5" y2="8.5"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5"/>
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add form (edit mode) */}
      {mode === 'edit' && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <input
            value={urlInput} placeholder="example.com"
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addLink() }}
            style={{ ...editInput, flex: 1.4, minWidth: 0 }}
          />
          <input
            value={labelInput} placeholder={t('Name (optional)')} maxLength={24}
            onChange={e => setLabelInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addLink() }}
            style={{ ...editInput, flex: 1, minWidth: 0 }}
          />
          <button
            onClick={addLink}
            disabled={!domainOf(normalizeUrl(urlInput))}
            title={t('Add link')}
            style={{
              flexShrink: 0, width: 32, height: 25, borderRadius: 7,
              border: 'none', background: 'var(--accent)', color: 'white',
              cursor: domainOf(normalizeUrl(urlInput)) ? 'pointer' : 'default',
              opacity: domainOf(normalizeUrl(urlInput)) ? 1 : 0.4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              transition: 'opacity 0.15s',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="6" y1="1.5" x2="6" y2="10.5"/><line x1="1.5" y1="6" x2="10.5" y2="6"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

const editInput: React.CSSProperties = {
  fontSize: 10, padding: '4px 7px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text1)', outline: 'none',
}
