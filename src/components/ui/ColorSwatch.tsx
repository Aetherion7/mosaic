'use client'
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/hooks/useT'

// ── Utilities ────────────────────────────────────────────────────────────────
export function hexSafe(v: string) { return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#888888' }

export function hexToHsv(hex: string): [number, number, number] {
  const h = hexSafe(hex)
  const r = parseInt(h.slice(1,3),16)/255, g = parseInt(h.slice(3,5),16)/255, b = parseInt(h.slice(5,7),16)/255
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min
  let hue = 0
  if (d !== 0) {
    switch(max) {
      case r: hue = ((g-b)/d + (g<b?6:0)) / 6; break
      case g: hue = ((b-r)/d + 2) / 6; break
      case b: hue = ((r-g)/d + 4) / 6; break
    }
  }
  return [hue*360, max===0 ? 0 : d/max*100, max*100]
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hn=h/360, sn=s/100, vn=v/100
  const i = Math.floor(hn*6), f = hn*6-i
  const p=vn*(1-sn), q=vn*(1-f*sn), t=vn*(1-(1-f)*sn)
  let r=0,g=0,b=0
  switch(i%6) {
    case 0: r=vn;g=t;b=p; break; case 1: r=q;g=vn;b=p; break
    case 2: r=p;g=vn;b=t; break; case 3: r=p;g=q;b=vn; break
    case 4: r=t;g=p;b=vn; break; case 5: r=vn;g=p;b=q; break
  }
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')
}

const PICKER_PRESETS = [
  '#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  '#f8fafc','#94a3b8','#334155','#020617',
]

// ── Eigene Palette — global über alle Farbauswahlen, in localStorage gemerkt ──
const CUSTOM_COLORS_KEY   = 'mosaic-custom-colors'
const CUSTOM_COLORS_EVENT = 'mosaic-custom-colors-changed'

function loadCustomColors(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const arr = JSON.parse(localStorage.getItem(CUSTOM_COLORS_KEY) || '[]')
    return Array.isArray(arr) ? arr.filter(c => /^#[0-9a-fA-F]{6}$/.test(c)) : []
  } catch { return [] }
}

function saveCustomColors(colors: string[]) {
  try { localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors)) } catch {}
  window.dispatchEvent(new Event(CUSTOM_COLORS_EVENT))
}

// ── ColorSwatch ──────────────────────────────────────────────────────────────
// trigger: optional render prop for a custom button element.
//   Receives (onClick, isOpen) and should render a clickable element.
//   When omitted, renders a default colored square swatch.
export function ColorSwatch({
  value,
  onChange,
  trigger,
}: {
  value: string
  onChange: (v: string) => void
  trigger?: (onClick: () => void, isOpen: boolean) => React.ReactNode
}) {
  const t = useT()
  const safe = hexSafe(value)
  const [open, setOpen] = useState(false)
  const [customColors, setCustomColors] = useState<string[]>([])

  // Eigene Palette laden + über alle offenen Picker synchron halten
  useEffect(() => {
    setCustomColors(loadCustomColors())
    const sync = () => setCustomColors(loadCustomColors())
    window.addEventListener(CUSTOM_COLORS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CUSTOM_COLORS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  const [h, setH] = useState(() => hexToHsv(safe)[0])
  const [s, setS] = useState(() => hexToHsv(safe)[1])
  const [v, setV] = useState(() => hexToHsv(safe)[2])
  const [hexStr, setHexStr] = useState(safe)
  const [popPos, setPopPos] = useState({ x: 0, y: 0 })
  const [popReady, setPopReady] = useState(false)
  const [hasEyeDropper, setHasEyeDropper] = useState(false)
  useEffect(() => { setHasEyeDropper('EyeDropper' in window) }, [])
  const lastEmitted = useRef(safe)
  const btnRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const svRef  = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const ns = hexSafe(value)
    if (ns === lastEmitted.current) return
    const [nh, nsat, nv] = hexToHsv(ns)
    setH(nh); setS(nsat); setV(nv); setHexStr(ns)
    lastEmitted.current = ns
  }, [value])

  function emit(nh: number, ns: number, nv: number) {
    const hex = hsvToHex(nh, ns, nv)
    setHexStr(hex); lastEmitted.current = hex; onChange(hex)
  }

  function openPicker() {
    if (open) { setOpen(false); return }
    setPopReady(false)
    setOpen(true)
  }

  // Position popup after it renders (measure actual size to stay in viewport)
  useEffect(() => {
    if (!open) { setPopReady(false); return }
    const id = requestAnimationFrame(() => {
      const pop = popRef.current
      if (!pop) return
      // Get the actual trigger element rect (firstElementChild is more reliable than display:contents wrapper)
      const triggerEl = (btnRef.current?.firstElementChild as HTMLElement) ?? btnRef.current
      if (!triggerEl) return
      const r = triggerEl.getBoundingClientRect()
      const pw = pop.offsetWidth || 204
      const ph = pop.offsetHeight || 290
      const M = 8

      // Prefer to the left, fall back to right
      let x = r.left - pw - M
      if (x < M) x = r.right + M
      if (x + pw > window.innerWidth - M) x = window.innerWidth - pw - M
      x = Math.max(M, x)

      // Align top with trigger, clamp to viewport
      let y = r.top
      if (y + ph > window.innerHeight - M) y = window.innerHeight - ph - M
      y = Math.max(M, y)

      setPopPos({ x, y })
      setPopReady(true)
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
        setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function onSVDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; pickSV(e)
  }
  function onSVMove(e: React.PointerEvent<HTMLDivElement>) { if (dragging.current) pickSV(e) }
  function onSVUp() { dragging.current = false }
  function pickSV(e: React.PointerEvent<HTMLDivElement>) {
    const r = svRef.current!.getBoundingClientRect()
    const ns = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))
    const nv = Math.max(0, Math.min(100, 100 - (e.clientY - r.top) / r.height * 100))
    setS(ns); setV(nv); emit(h, ns, nv)
  }

  const currentHex = hsvToHex(h, s, v)

  return (
    <>
      <div ref={btnRef} style={{ display: 'contents' }}>
        {trigger ? trigger(openPicker, open) : (
          <div
            onClick={openPicker}
            title={safe}
            style={{
              width: 28, height: 24, borderRadius: 7,
              background: safe, cursor: 'pointer', flexShrink: 0,
              // Feste Akzentfarbe statt Schwarz/Theme-Rahmen: eine dunkle
              // Swatch-Farbe im Dark Theme war sonst kaum vom Panel-
              // Hintergrund zu unterscheiden, egal wie das Theme selbst aussieht.
              border: open ? '2px solid var(--accent)' : '1.5px solid color-mix(in srgb, var(--accent) 55%, transparent)',
              boxShadow: open
                ? '0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)'
                : '0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent)',
              transition: 'border-color 0.1s, box-shadow 0.1s',
            }}
          />
        )}
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: popPos.x, top: popPos.y, zIndex: 9999,
            width: 204,
            visibility: popReady ? 'visible' : 'hidden',
            background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--border)',
            borderRadius: 14, padding: 10,
            boxShadow: '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
            userSelect: 'none',
          }}
        >
          {/* 2D saturation/value picker */}
          <div
            ref={svRef}
            onPointerDown={onSVDown}
            onPointerMove={onSVMove}
            onPointerUp={onSVUp}
            style={{
              position: 'relative', width: '100%', height: 140,
              borderRadius: 8, cursor: 'crosshair', overflow: 'hidden',
              background: `hsl(${h}, 100%, 50%)`,
              marginBottom: 8,
            }}
          >
            <div style={{ position:'absolute', inset:0, borderRadius:8, background:'linear-gradient(to right,#fff,transparent)' }} />
            <div style={{ position:'absolute', inset:0, borderRadius:8, background:'linear-gradient(to bottom,transparent,#000)' }} />
            <div style={{
              position:'absolute', pointerEvents:'none',
              left:`${s}%`, top:`${100-v}%`,
              transform:'translate(-50%,-50%)',
              width:13, height:13, borderRadius:'50%',
              border:'2.5px solid #fff',
              boxShadow:'0 0 0 1.5px rgba(0,0,0,0.45)',
              background: currentHex,
            }} />
          </div>

          {/* Hue slider */}
          <div style={{ position:'relative', height:14, borderRadius:7, marginBottom:8,
            background:'linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)',
          }}>
            <input
              type="range" min={0} max={360} step={1} value={h}
              className="hue-slider"
              onChange={e => { const nh=+e.target.value; setH(nh); emit(nh,s,v) }}
              style={{
                position:'absolute', inset:0, width:'100%', height:'100%',
                appearance:'none', background:'transparent', cursor:'pointer', margin:0,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any}
            />
          </div>

          {/* Preview + hex + eyedropper */}
          <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8 }}>
            <div style={{ width:22, height:22, borderRadius:5, background:currentHex, border:'1px solid var(--border)', flexShrink:0 }} />
            <input
              value={hexStr}
              onChange={e => {
                const hv = e.target.value; setHexStr(hv)
                if (/^#[0-9a-fA-F]{6}$/.test(hv)) {
                  const [nh,ns,nv] = hexToHsv(hv)
                  setH(nh); setS(ns); setV(nv)
                  lastEmitted.current = hv; onChange(hv)
                }
              }}
              placeholder="#000000"
              onFocus={e => e.target.select()}
              style={{
                flex:1, minWidth:0, background:'var(--surface2)', border:'1px solid var(--border)',
                borderRadius:7, color:'var(--text1)', fontSize:12, boxSizing:'border-box',
                padding:'4px 8px', outline:'none', fontFamily:'monospace',
              }}
            />
            {hasEyeDropper && (
              <button
                title={t('Pick color from screen')}
                onClick={async () => {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = await new (window as any).EyeDropper().open()
                    const hex = result.sRGBHex as string
                    const [nh,ns,nv] = hexToHsv(hex)
                    setH(nh); setS(ns); setV(nv); setHexStr(hex)
                    lastEmitted.current = hex; onChange(hex)
                  } catch { /* cancelled */ }
                }}
                style={{
                  flexShrink:0, width:26, height:26, borderRadius:7, cursor:'pointer',
                  background:'var(--surface2)', border:'1px solid var(--border)',
                  color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', padding:0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.41-1.41-1.42 1.41 1.41 1.42-6.6 6.6A2 2 0 0 0 5 16v3h3a2 2 0 0 0 1.41-.59l6.6-6.6 1.42 1.41 1.41-1.41-1.41-1.42 3.12-3.12a1 1 0 0 0 0-1.64z"/>
                </svg>
              </button>
            )}
          </div>

          {/* Presets */}
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {PICKER_PRESETS.map(c => (
              <div
                key={c}
                onClick={() => { const [nh,ns,nv]=hexToHsv(c); setH(nh);setS(ns);setV(nv);setHexStr(c);lastEmitted.current=c;onChange(c) }}
                style={{
                  width:20, height:20, borderRadius:5, background:c, cursor:'pointer',
                  border: currentHex.toLowerCase()===c ? '2px solid var(--text1)' : '1px solid var(--border)',
                  boxSizing:'border-box', transition:'transform 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform='scale(1.15)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform=''}
              />
            ))}
          </div>

          {/* Eigene Palette — gemerkte Farben, global für alle Farbauswahlen */}
          <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>
              {t('My palette')}
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {customColors.map(c => (
                <div
                  key={c}
                  style={{ position: 'relative' }}
                  onMouseEnter={e => {
                    (e.currentTarget.firstElementChild as HTMLDivElement).style.transform = 'scale(1.15)'
                    ;(e.currentTarget.lastElementChild as HTMLButtonElement).style.opacity = '1'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget.firstElementChild as HTMLDivElement).style.transform = ''
                    ;(e.currentTarget.lastElementChild as HTMLButtonElement).style.opacity = '0'
                  }}
                >
                  <div
                    onClick={() => { const [nh,ns,nv]=hexToHsv(c); setH(nh);setS(ns);setV(nv);setHexStr(c);lastEmitted.current=c;onChange(c) }}
                    onContextMenu={e => { e.preventDefault(); saveCustomColors(customColors.filter(x => x !== c)) }}
                    title={c}
                    style={{
                      width:20, height:20, borderRadius:5, background:c, cursor:'pointer',
                      border: currentHex.toLowerCase()===c.toLowerCase() ? '2px solid var(--text1)' : '1px solid var(--border)',
                      boxSizing:'border-box', transition:'transform 0.1s',
                    }}
                  />
                  <button
                    onClick={e => { e.stopPropagation(); saveCustomColors(customColors.filter(x => x !== c)) }}
                    title={t('Remove from palette')}
                    style={{
                      position: 'absolute', top: -5, right: -5, width: 13, height: 13, borderRadius: '50%',
                      border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--danger)',
                      fontSize: 9, fontWeight: 700, lineHeight: 1, padding: 0, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.12s',
                    }}
                  >×</button>
                </div>
              ))}
              <button
                onClick={() => {
                  const c = currentHex.toLowerCase()
                  if (!customColors.some(x => x.toLowerCase() === c)) saveCustomColors([...customColors, currentHex])
                }}
                title={t('Add current color to palette')}
                style={{
                  width:20, height:20, borderRadius:5, cursor:'pointer',
                  border:'1.5px dashed var(--border)', background:'transparent',
                  color:'var(--text3)', fontSize:13, lineHeight:1, padding:0,
                  display:'flex', alignItems:'center', justifyContent:'center', boxSizing:'border-box',
                }}
              >+</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
