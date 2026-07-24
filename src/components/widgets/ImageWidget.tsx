'use client'
import { useRef, useState, useEffect } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { compressImage } from '@/lib/imageUtils'
import { saveBlob, useBlobUrl } from '@/lib/blobStore'
import { useT } from '@/hooks/useT'
import type { Widget, ImageData } from '@/types'

export default function ImageWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const setImageSrc = useBoardStore(s => s.setImageSrc)
  const updateWidget = useBoardStore(s => s.updateWidget)
  const mode = useUIStore(s => s.mode)
  const inputRef = useRef<HTMLInputElement>(null)
  const d = widget.data
  const fit: 'cover' | 'contain' = d.objectFit ?? 'contain'
  const [imgStatus, setImgStatus] = useState<'loading'|'ok'|'error'>('loading')
  // Neue Uploads liegen als Blob in IndexedDB (idb-blob://…), alte DataURLs werden durchgereicht
  const resolvedSrc = useBlobUrl(d.src)

  useEffect(() => { setImgStatus('loading') }, [d.src])
  // '' = Blob-Referenz ließ sich nicht auflösen (z. B. Backup ohne eingebettete Daten)
  useEffect(() => { if (resolvedSrc === '') setImgStatus('error') }, [resolvedSrc])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 20 * 1024 * 1024) {
      alert(t('Image too large — 20 MB maximum allowed.'))
      e.target.value = ''
      return
    }
    try {
      const compressed = await compressImage(f)
      setImageSrc(widget.id, await saveBlob(compressed))
    } catch {
      // Fallback: Originaldatei ohne Komprimierung
      try {
        setImageSrc(widget.id, await saveBlob(f))
      } catch { /* Blob-Speicher nicht verfügbar */ }
    }
    e.target.value = ''
  }

  function toggleFit() {
    updateWidget(widget.id, { data: { ...d, objectFit: fit === 'cover' ? 'contain' : 'cover' } })
  }

  function toggleNoBar() {
    updateWidget(widget.id, { data: { ...d, noBar: !d.noBar } })
  }

  const btnStyle: React.CSSProperties = {
    padding: '3px 9px', fontSize: 11,
    background: 'rgba(0,0,0,0.6)', color: 'white', borderRadius: 20, border: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} onPointerDown={e => e.stopPropagation()}>
      {d.src ? (
        <>
          {!!resolvedSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedSrc} alt={d.alt}
              onLoad={() => setImgStatus('ok')}
              onError={() => setImgStatus('error')}
              style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', opacity: imgStatus === 'ok' ? 1 : 0, transition: 'opacity 0.2s' }}
            />
          )}
          {imgStatus === 'loading' && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            </div>
          )}
          {imgStatus === 'error' && (
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'var(--text3)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
              </svg>
              <span style={{ fontSize:11 }}>{t('Image could not be loaded')}</span>
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '100%', gap: 8,
            border: 'none', background: 'transparent', font: 'inherit',
            color: 'var(--text3)', cursor: mode === 'edit' ? 'pointer' : 'default',
          }}
          disabled={mode !== 'edit'}
          onClick={() => mode === 'edit' && inputRef.current?.click()}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          {mode === 'edit' && <span style={{ fontSize: 12 }}>{t('Upload image')}</span>}
        </button>
      )}
      {mode === 'edit' && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          {d.src && <button onClick={toggleFit} style={btnStyle} title={t('Switch between fill and fit')}>
            {fit === 'cover' ? t('Fit') : t('Fill')}
          </button>}
          {d.src && <button onClick={() => inputRef.current?.click()} style={btnStyle}>{t('Change')}</button>}
          <button
            onClick={toggleNoBar}
            style={{ ...btnStyle, background: d.noBar ? 'rgba(124,111,232,0.85)' : 'rgba(0,0,0,0.6)' }}
            title={t('Show/hide title bar')}
          >
            {d.noBar ? t('Show bar') : t('Hide bar')}
          </button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}
