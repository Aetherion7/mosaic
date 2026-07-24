'use client'
import { useEffect, useRef, useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { IconPlay, IconPause, IconReset } from '@/components/ui/Icons'
import { useT } from '@/hooks/useT'
import type { Widget, TimerData } from '@/types'

function playDoneSound() {
  try {
    type AC = typeof AudioContext
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext)
    const ctx = new Ctx()
    const t = ctx.currentTime
    ;([[523, 0, 0.12], [659, 0.18, 0.12], [784, 0.36, 0.35]] as [number, number, number][]).forEach(([freq, delay, dur]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      gain.gain.setValueAtTime(0, t + delay)
      gain.gain.linearRampToValueAtTime(0.22, t + delay + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + dur)
      osc.start(t + delay); osc.stop(t + delay + dur)
    })
  } catch { /* AudioContext unavailable */ }
}

// Hinweis auch dann, wenn der Tab im Hintergrund ist: System-Benachrichtigung
// (falls erlaubt) + „⏰"-Präfix im Tab-Titel, bis der Tab wieder Fokus bekommt.
function notifyDone(timerName: string, t: (s: string) => string) {
  if (typeof document === 'undefined' || !document.hidden) return
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(t('Timer finished'), {
        body: timerName ? `"${timerName}" ${t('is done.')}` : t('Your timer is done.'),
        icon: '/mosaiclogo.png',
      })
      n.onclick = () => { window.focus(); n.close() }
    }
  } catch { /* Notification nicht verfügbar */ }
  const original = document.title
  if (original.startsWith('⏰')) return
  document.title = `⏰ ${t('Timer finished')} — ${original}`
  const restore = () => {
    document.title = original
    document.removeEventListener('visibilitychange', restore)
  }
  document.addEventListener('visibilitychange', restore)
}

// Berechtigung einmalig beim Timer-Start anfragen (User-Geste → Prompt erlaubt)
function requestNotifyPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  } catch { /* Notification nicht verfügbar */ }
}

export default function TimerWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const setTimerData = useBoardStore(s => s.setTimerData)
  const mode = useUIStore(s => s.mode)
  const d = widget.data
  const totalMs = d.durationMin * 60 * 1000
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [, tick] = useState(0)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelVal, setLabelVal] = useState<string>(d.name ?? '')
  // Initialised to null so the first render (possibly already-done) never triggers the sound
  const prevDoneRef = useRef<boolean | null>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)

  const elapsed = d.running && d.startedAt
    ? d.elapsed + (Date.now() - d.startedAt)
    : d.elapsed
  const remaining = Math.max(0, totalMs - elapsed)
  const done = remaining === 0
  const pct = 1 - remaining / totalMs

  useEffect(() => {
    if (d.running && d.startedAt) {
      intervalRef.current = setInterval(() => tick(n => n + 1), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [d.running, d.startedAt])

  // Stop the ticking once the timer completes (freeze elapsed at the total)
  useEffect(() => {
    if (done && d.running) {
      setTimerData(widget.id, { running: false, elapsed: totalMs, startedAt: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, d.running])

  // Play the sound only on a live transition to done — not when the widget
  // mounts with an already-expired timer (e.g. after a page reload).
  useEffect(() => {
    if (done && prevDoneRef.current === false) {
      playDoneSound()
      notifyDone(d.name ?? '', t)
    }
    prevDoneRef.current = done
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  useEffect(() => {
    if (editingLabel) labelInputRef.current?.focus()
  }, [editingLabel])

  function start() {
    requestNotifyPermission()
    setTimerData(widget.id, { running: true, startedAt: Date.now() })
  }
  function pause() { setTimerData(widget.id, { running: false, elapsed, startedAt: null }) }
  function reset() { setTimerData(widget.id, { running: false, elapsed: 0, startedAt: null }) }
  function setDuration(val: number) { setTimerData(widget.id, { durationMin: val, elapsed: 0 }) }

  function commitLabel() {
    setTimerData(widget.id, { name: labelVal.trim() })
    setEditingLabel(false)
  }

  const r = 68
  const circ = 2 * Math.PI * r
  const dash = circ * pct

  // Parse remaining time into h / m / s
  const totalSec = Math.max(0, Math.floor(remaining / 1000))
  const hours = Math.floor(totalSec / 3600)
  const mins  = Math.floor((totalSec % 3600) / 60)
  const secs  = totalSec % 60
  const timeStr = hours > 0
    ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  const statusText = done ? t('Done!') : d.running ? t('Running…') : ''
  const hasLabel   = (d.name ?? '').trim().length > 0

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: 4, padding: '6px 8px' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Label row */}
      {editingLabel ? (
        <input
          ref={labelInputRef}
          value={labelVal}
          maxLength={80}
          onChange={e => setLabelVal(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setLabelVal(d.name ?? ''); setEditingLabel(false) } }}
          placeholder={t('Label…')}
          style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text2)', textAlign: 'center',
            background: 'var(--surface2)', borderRadius: 6, padding: '2px 8px',
            border: '1px solid var(--border)', width: '100%', maxWidth: 140,
          }}
        />
      ) : hasLabel ? (
        <span
          onDoubleClick={() => mode === 'edit' && setEditingLabel(true)}
          title={mode === 'edit' ? t('Double-click to edit') : undefined}
          style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text2)',
            cursor: mode === 'edit' ? 'text' : 'default',
            userSelect: 'none',
          }}
        >
          {d.name}
        </span>
      ) : mode === 'edit' ? (
        <button
          onClick={() => { setLabelVal(''); setEditingLabel(true) }}
          style={{
            fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none',
            cursor: 'pointer', padding: '1px 6px', borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 20,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {t('Add text')}
        </button>
      ) : null}

      {/* Ring + controls — always centered */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--surface3)" strokeWidth="9"/>
        <circle
          cx="80" cy="80" r={r} fill="none"
          stroke={done ? 'var(--success)' : 'var(--accent)'}
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - dash}
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />

        <text x="80" y={statusText ? '76' : '80'} textAnchor="middle" dominantBaseline="middle" fill="var(--text1)" fontSize="15" fontWeight="500" fontFamily="monospace">
          {timeStr}
        </text>
        {statusText && <text x="80" y="94" textAnchor="middle" dominantBaseline="middle" fill="var(--text3)" fontSize="10">
          {statusText}
        </text>}
      </svg>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        {done ? (
          <button onClick={reset} style={btnStyle('var(--accent)')}><IconReset size={13} /> {t('Reset')}</button>
        ) : d.running ? (
          <>
            <button onClick={pause} style={btnStyle('var(--surface3)')}><IconPause size={13} /> {t('Pause')}</button>
            <button onClick={reset} title={t('Reset')} style={btnStyle('var(--danger)', true)}><IconReset size={13} /></button>
          </>
        ) : (
          <button onClick={start} style={btnStyle('var(--accent)')}><IconPlay size={13} /> {t('Start')}</button>
        )}
      </div>
      </div>

      {/* Duration stepper (matches the sleep-goal stepper) */}
      {mode === 'edit' && !d.running && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto',
          padding: '4px 7px', width: '100%', maxWidth: 220, flexShrink: 0,
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('Duration')}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={() => setDuration(d.durationMin <= 5 ? 1 : d.durationMin - 5)}
              disabled={d.durationMin <= 1} style={stepBtnStyle(d.durationMin <= 1)}
            >−</button>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, minWidth: 52, justifyContent: 'center' }}>
              <input
                type="number" min={1} max={9999} value={d.durationMin}
                onChange={e => setDuration(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
                style={{
                  width: 34, textAlign: 'center', fontSize: 12, fontWeight: 700,
                  color: 'var(--accent)', background: 'transparent', border: 'none', outline: 'none',
                  padding: 0, fontVariantNumeric: 'tabular-nums', MozAppearance: 'textfield',
                }}
              />
              <span style={{ fontSize: 9, color: 'var(--text3)' }}>{t('min')}</span>
            </div>
            <button
              onClick={() => setDuration(Math.min(9999, d.durationMin + 5))}
              disabled={d.durationMin >= 9999} style={stepBtnStyle(d.durationMin >= 9999)}
            >+</button>
          </div>
        </div>
      )}
    </div>
  )
}

function btnStyle(bg: string, small = false): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: small ? '5px 10px' : '6px 18px',
    fontSize: 12, fontWeight: 600, borderRadius: 50, border: 'none',
    background: bg, color: 'white', letterSpacing: '0.03em', cursor: 'pointer',
  }
}

function stepBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)',
    background: 'var(--surface3)', color: 'var(--text2)',
    fontSize: 13, fontWeight: 700, lineHeight: 1, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.3 : 1,
    transition: 'opacity 0.12s',
  }
}
