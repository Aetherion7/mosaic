'use client'
import { useEffect, useRef, useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { Widget, ClockData, ClockStyle } from '@/types'


function pad(n: number) { return String(n).padStart(2, '0') }

type ClockProps = { h: number; m: number; s: number; showSeconds: boolean }

// ── Digital ───────────────────────────────────────────────────────────────────

function DigitalClock({ h, m, s, showSeconds }: ClockProps) {
  const animations = useSettings(st => st.animations)
  const blink = !animations || s % 2 === 0
  // 12-Stunden-Anzeige, da darunter ein AM/PM-Label steht (wie MinimalClock) —
  // vorher zeigte dies die rohen 24h-Ziffern (z. B. "14:23") mit "PM" darunter.
  const hour12 = h % 12 || 12
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        fontFamily: '"Courier New", Consolas, monospace',
        fontWeight: 700,
        letterSpacing: '0.06em',
        color: 'var(--accent)',
        textShadow: '0 0 18px var(--accent), 0 0 36px color-mix(in srgb, var(--accent) 40%, transparent)',
        lineHeight: 1,
        fontSize: showSeconds ? 'clamp(22px, 4cqw, 44px)' : 'clamp(28px, 5cqw, 58px)',
        display: 'flex', alignItems: 'center',
      }}>
        {pad(hour12)}
        <span style={{ opacity: blink ? 1 : 0.2, transition: 'opacity 0.1s', margin: '0 2px' }}>:</span>
        {pad(m)}
        {showSeconds && <>
          <span style={{ opacity: blink ? 1 : 0.2, transition: 'opacity 0.1s', margin: '0 2px', fontSize: '0.65em' }}>:</span>
          <span style={{ fontSize: '0.65em', alignSelf: 'flex-end', paddingBottom: '0.1em' }}>{pad(s)}</span>
        </>}
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text3)' }}>
        {h < 12 ? 'AM' : 'PM'}
      </div>
    </div>
  )
}

// ── Analog ────────────────────────────────────────────────────────────────────

function AnalogClock({ h, m, s }: ClockProps) {
  const cx = 50, cy = 50, r = 46

  const secDeg = s * 6
  const minDeg = m * 6 + s * 0.1
  const hrDeg  = (h % 12) * 30 + m * 0.5

  function polarX(deg: number, radius: number) {
    return cx + Math.cos((deg - 90) * Math.PI / 180) * radius
  }
  function polarY(deg: number, radius: number) {
    return cy + Math.sin((deg - 90) * Math.PI / 180) * radius
  }

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const isHour = i % 5 === 0
    const r1 = isHour ? r - 9 : r - 5
    const rad = i * 6
    return (
      <line
        key={i}
        x1={polarX(rad, r1)} y1={polarY(rad, r1)}
        x2={polarX(rad, r - 1)} y2={polarY(rad, r - 1)}
        stroke={isHour ? 'var(--text1)' : 'var(--border)'}
        strokeWidth={isHour ? 2.2 : 0.9}
        strokeLinecap="round"
      />
    )
  })

  // Hour numbers
  const hourNums = [12, 3, 6, 9].map((n, i) => {
    const deg = i * 90
    return (
      <text
        key={n}
        x={polarX(deg, r - 17)}
        y={polarY(deg, r - 17) + 3.5}
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="var(--text2)"
        stroke="none"
      >{n}</text>
    )
  })

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: '100%', height: '100%', maxWidth: 200, maxHeight: 200 }}
    >
      {/* Face */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r - 1} fill="color-mix(in srgb, var(--surface2) 60%, transparent)" />

      {ticks}
      {hourNums}

      {/* Hour hand */}
      <line
        x1={cx} y1={cy}
        x2={polarX(hrDeg, 24)} y2={polarY(hrDeg, 24)}
        stroke="var(--text1)" strokeWidth="4" strokeLinecap="round"
      />
      {/* Minute hand */}
      <line
        x1={cx} y1={cy}
        x2={polarX(minDeg, 35)} y2={polarY(minDeg, 35)}
        stroke="var(--text1)" strokeWidth="2.5" strokeLinecap="round"
      />
      {/* Second hand */}
      <line
        x1={polarX(secDeg + 180, 10)} y1={polarY(secDeg + 180, 10)}
        x2={polarX(secDeg, 40)} y2={polarY(secDeg, 40)}
        stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 3px var(--accent))' }}
      />

      {/* Center cap */}
      <circle cx={cx} cy={cy} r="4.5" fill="var(--accent)" />
      <circle cx={cx} cy={cy} r="2" fill="var(--surface)" />
    </svg>
  )
}

// ── Minimal ───────────────────────────────────────────────────────────────────

function MinimalClock({ h, m, s, showSeconds }: ClockProps) {
  const lang = useSettings(s => s.language)
  const hour12 = h % 12 || 12
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        fontWeight: 200,
        letterSpacing: '-0.04em',
        color: 'var(--text1)',
        lineHeight: 1,
        fontSize: showSeconds ? 'clamp(28px, 6cqw, 60px)' : 'clamp(40px, 9cqw, 88px)',
      }}>
        {pad(hour12)}:{pad(m)}
        {showSeconds && <span style={{ fontSize: '0.55em', fontWeight: 300, opacity: 0.6, marginLeft: '0.1em' }}>{pad(s)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', color: 'var(--accent)', textTransform: 'uppercase' }}>
          {h < 12 ? 'AM' : 'PM'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.05em' }}>
          {new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  )
}

// ── Flip ──────────────────────────────────────────────────────────────────────

function FlipCard({ digit, prev }: { digit: string; prev: string }) {
  const [flipping, setFlipping] = useState(false)
  const prevRef = useRef(prev)

  useEffect(() => {
    if (digit !== prevRef.current) {
      prevRef.current = digit
      setFlipping(true)
      const t = setTimeout(() => setFlipping(false), 300)
      return () => clearTimeout(t)
    }
  }, [digit])

  const cardBase: React.CSSProperties = {
    width: 'clamp(26px, 3.5cqw, 46px)',
    height: 'clamp(38px, 5.5cqw, 68px)',
    borderRadius: 5,
    background: 'linear-gradient(160deg, #242424 0%, #111 100%)',
    border: '1px solid rgba(255,255,255,0.09)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
    fontSize: 'clamp(18px, 2.5cqw, 32px)',
    fontWeight: 700,
    fontFamily: '"Courier New", monospace',
    color: '#f0f0e8',
    userSelect: 'none',
    flexShrink: 0,
  }

  return (
    <div style={cardBase}>
      {/* Card fold line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '50%',
        height: 1.5,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 3,
      }} />
      {/* Top half slightly lighter */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
        background: 'rgba(255,255,255,0.025)',
      }} />

      <span style={{
        transform: flipping ? 'scaleY(0.1)' : 'scaleY(1)',
        transition: flipping ? 'transform 0.15s ease-in' : 'transform 0.15s ease-out',
        display: 'block',
      }}>{digit}</span>
    </div>
  )
}

function FlipColon() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(5px, 1cqw, 12px)', flexShrink: 0, paddingBottom: 4 }}>
      <div style={{ width: 'clamp(4px, 0.7cqw, 6px)', height: 'clamp(4px, 0.7cqw, 6px)', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
      <div style={{ width: 'clamp(4px, 0.7cqw, 6px)', height: 'clamp(4px, 0.7cqw, 6px)', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
    </div>
  )
}

function FlipClock({ h, m, s, showSeconds }: ClockProps) {
  const ph = pad(h), pm = pad(m), ps = pad(s)
  const [prevDigits, setPrevDigits] = useState({ ph, pm, ps })

  useEffect(() => {
    setPrevDigits(p => ({ ph: p.ph, pm: p.pm, ps: p.ps }))
    const t = setTimeout(() => setPrevDigits({ ph, pm, ps }), 10)
    return () => clearTimeout(t)
  }, [ph, pm, ps])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(2px, 0.5cqw, 6px)' }}>
      <FlipCard digit={ph[0]} prev={prevDigits.ph[0]} />
      <FlipCard digit={ph[1]} prev={prevDigits.ph[1]} />
      <FlipColon />
      <FlipCard digit={pm[0]} prev={prevDigits.pm[0]} />
      <FlipCard digit={pm[1]} prev={prevDigits.pm[1]} />
      {showSeconds && (
        <>
          <FlipColon />
          <FlipCard digit={ps[0]} prev={prevDigits.ps[0]} />
          <FlipCard digit={ps[1]} prev={prevDigits.ps[1]} />
        </>
      )}
    </div>
  )
}

// ── Style selector bar (edit mode) ────────────────────────────────────────────

function togglePillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 9, fontWeight: 700, padding: '4px 9px', borderRadius: 20,
    border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border)'}`,
    background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface2)',
    color: active ? 'var(--accent)' : 'var(--text3)',
    cursor: 'pointer', transition: 'all 0.12s',
    fontVariantNumeric: 'tabular-nums',
  }
}

// Passendes Symbol je Uhrentyp fürs Auswahlfeld
function ClockStyleIcon({ id, size = 12 }: { id: ClockStyle; size?: number }) {
  const base = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'digital': return (   // Anzeige-Kasten mit Doppelpunkt
      <svg {...base}><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="10" r="0.6" fill="currentColor"/><circle cx="12" cy="14" r="0.6" fill="currentColor"/><path d="M7 10v4"/><path d="M17 10v4"/></svg>
    )
    case 'analog': return (    // Zifferblatt mit Zeigern
      <svg {...base}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
    )
    case 'minimal': return (   // dünne Ziffern mit Doppelpunkt
      <svg {...base} strokeWidth={1.3}><path d="M8 7v10"/><path d="M16 7v10"/><circle cx="12" cy="10" r="0.5" fill="currentColor"/><circle cx="12" cy="14" r="0.5" fill="currentColor"/></svg>
    )
    case 'flip': return (      // zwei Klappkarten mit Falzlinie
      <svg {...base}><rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/><line x1="3" y1="12" x2="11" y2="12"/><line x1="13" y1="12" x2="21" y2="12"/></svg>
    )
  }
}

const STYLE_OPTS: { id: ClockStyle; label: string }[] = [
  { id: 'digital', label: 'Digital' },
  { id: 'analog',  label: 'Analog'  },
  { id: 'minimal', label: 'Minimal' },
  { id: 'flip',    label: 'Flip'    },
]

// ── Main widget ───────────────────────────────────────────────────────────────

export default function ClockWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateWidget = useBoardStore(s => s.updateWidget)
  const mode = useUIStore(s => s.mode)
  const d = widget.data as ClockData
  const [styleOpen, setStyleOpen] = useState(false)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const h = now.getHours()
  const m = now.getMinutes()
  const s = now.getSeconds()

  function patch(patch: Partial<typeof d>) {
    updateWidget(widget.id, { data: { ...d, ...patch } })
  }

  const clockProps: ClockProps = { h, m, s, showSeconds: d.showSeconds }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', containerType: 'size' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Clock display */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: d.clockStyle === 'analog' ? 4 : 8,
        overflow: 'hidden',
      }}>
        {d.clockStyle === 'analog'  && <AnalogClock  {...clockProps} />}
        {d.clockStyle === 'minimal' && <MinimalClock {...clockProps} />}
        {d.clockStyle === 'flip'    && <FlipClock    {...clockProps} />}
        {d.clockStyle === 'digital' && <DigitalClock {...clockProps} />}
      </div>

      {/* Edit controls: links das Uhren-Auswahlfeld, unten rechts :ss + Transparenz */}
      {mode === 'edit' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, padding: '4px 8px 8px', flexShrink: 0,
        }}>
          {/* Einzelnes Auswahlfeld mit Symbol je Uhrentyp (öffnet nach oben) */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setStyleOpen(o => !o)}
              title={t('Clock style')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, fontWeight: 600, padding: '4px 9px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text2)', cursor: 'pointer',
              }}
            >
              <span style={{ color: 'var(--accent)', display: 'flex' }}><ClockStyleIcon id={d.clockStyle} /></span>
              {STYLE_OPTS.find(o => o.id === d.clockStyle)?.label ?? d.clockStyle}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: styleOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
            {styleOpen && (<>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setStyleOpen(false)} />
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, zIndex: 50,
                display: 'flex', flexDirection: 'column', gap: 1, padding: 4, minWidth: 118,
                background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)', borderRadius: 10,
                boxShadow: '0 8px 28px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
              }}>
                {STYLE_OPTS.map(opt => {
                  const active = d.clockStyle === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => { patch({ clockStyle: opt.id }); setStyleOpen(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        fontSize: 10, fontWeight: active ? 700 : 500, padding: '5px 8px', borderRadius: 7,
                        border: 'none', textAlign: 'left',
                        background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text2)',
                        cursor: 'pointer',
                      }}
                    >
                      <ClockStyleIcon id={opt.id} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </>)}
          </div>

          {/* Unten rechts: Sekunden + Transparenz */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => patch({ showSeconds: !d.showSeconds })}
              title={t('Show seconds')}
              style={togglePillStyle(d.showSeconds)}
            >:ss</button>

            {/* Frameless toggle — hides bar + frame in view mode (like NoteWidget) */}
            <button
              onClick={() => patch({ noBg: !d.noBg })}
              title={d.noBg ? t('Show bar & frame again') : t('Hide bar & frame (clock only in view)')}
              style={{ ...togglePillStyle(!!d.noBg), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="12" height="12" rx="2.5" strokeDasharray={d.noBg ? '2.5 2.5' : 'none'} />
                <circle cx="8" cy="8" r="2.6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
