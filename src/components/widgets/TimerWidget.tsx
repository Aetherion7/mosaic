'use client'
import { useEffect, useRef, useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { IconPlay, IconPause, IconReset } from '@/components/ui/Icons'
import { useT } from '@/hooks/useT'
import { requestNotifyPermission, fireNotification } from '@/lib/notify'
import { saveBlob, getBlob, deleteBlob } from '@/lib/blobStore'
import type { Widget, TimerData, TimerCustomSound } from '@/types'

// Höchstlänge für hochgeladene Alarmtöne — lang genug für einen kurzen Jingle,
// kurz genug, dass eine falsch gewählte Datei (ganzer Song) nicht minutenlang
// im Hintergrund weiterläuft, falls die Seite währenddessen den Fokus behält.
const MAX_CUSTOM_SOUND_SEC = 8

function makeOsc(ctx: AudioContext, freq: number, type: OscillatorType, start: number, dur: number, peak: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain); gain.connect(ctx.destination)
  osc.type = type; osc.frequency.value = freq
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
  osc.start(start); osc.stop(start + dur)
}

// Drei eingebaute Alarmtöne, alle deutlich länger als der ursprüngliche
// einzelne ~0.7s-Akkord (Nutzer-Feedback: "zu kurz") — rein synthetisiert
// per Web Audio, damit keine Audio-Assets ins Bundle müssen.
function playChime(ctx: AudioContext) {
  const t0 = ctx.currentTime
  const notes: [number, number, number][] = [[523, 0, 0.12], [659, 0.18, 0.12], [784, 0.36, 0.35]]
  for (let rep = 0; rep < 3; rep++) {
    const base = rep * 0.75
    notes.forEach(([freq, delay, dur]) => makeOsc(ctx, freq, 'sine', t0 + base + delay, dur, 0.22))
  }
}

function playBell(ctx: AudioContext) {
  const t0 = ctx.currentTime
  ;[440, 880, 1320].forEach((freq, i) => makeOsc(ctx, freq, 'sine', t0, 2.4, 0.28 / (i + 1)))
}

function playAlarmBeeps(ctx: AudioContext) {
  const t0 = ctx.currentTime
  const beepDur = 0.22, gap = 0.16
  for (let i = 0; i < 7; i++) {
    makeOsc(ctx, i % 2 === 0 ? 880 : 660, 'square', t0 + i * (beepDur + gap), beepDur, 0.14)
  }
}

interface SoundPreset { id: string; label: string; play: (ctx: AudioContext) => void }
const SOUND_PRESETS: SoundPreset[] = [
  { id: 'chime', label: 'Chime', play: playChime },
  { id: 'bell',  label: 'Bell',  play: playBell },
  { id: 'alarm', label: 'Alarm', play: playAlarmBeeps },
]

function playPreset(id: string | undefined) {
  try {
    type AC = typeof AudioContext
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext)
    const ctx = new Ctx()
    const preset = SOUND_PRESETS.find(p => p.id === id) ?? SOUND_PRESETS[0]
    preset.play(ctx)
  } catch { /* AudioContext unavailable */ }
}

async function playCustomSound(ref: string) {
  try {
    const blob = await getBlob(ref)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.play().catch(() => {})
    const cleanup = () => URL.revokeObjectURL(url)
    audio.addEventListener('ended', cleanup)
    // Netz für den Fall, dass 'ended' nie feuert (z. B. Wiedergabefehler mittendrin)
    setTimeout(cleanup, (MAX_CUSTOM_SOUND_SEC + 2) * 1000)
  } catch { /* Blob nicht (mehr) verfügbar */ }
}

function playAlarmSound(d: { soundId?: string; customSounds?: TimerCustomSound[] }) {
  const custom = d.soundId ? (d.customSounds ?? []).find(c => c.id === d.soundId) : undefined
  if (custom) playCustomSound(custom.ref)
  else playPreset(d.soundId)
}

// Liest die Dauer einer Audiodatei aus, ohne sie erst hochzuladen —
// HTMLAudioElement lädt dafür nur die Metadaten, nicht die ganze Datei.
function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration) }
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid audio file')) }
    audio.src = url
  })
}

// Hinweis auch dann, wenn der Tab im Hintergrund ist: System-Benachrichtigung
// (falls erlaubt, via fireNotification aus lib/notify) + „⏰"-Präfix im
// Tab-Titel, bis der Tab wieder Fokus bekommt. Das "nur wenn Tab
// unsichtbar"-Gate bleibt hier (TimerWidget-spezifisch — nur stören, wenn
// man weggeschaut hat) statt in der geteilten Funktion selbst, siehe dortiger
// Kommentar.
function notifyDone(timerName: string, t: (s: string) => string) {
  if (typeof document === 'undefined' || !document.hidden) return
  fireNotification(t('Timer finished'), timerName ? `"${timerName}" ${t('is done.')}` : t('Your timer is done.'))
  const original = document.title
  if (original.startsWith('⏰')) return
  document.title = `⏰ ${t('Timer finished')} — ${original}`
  const restore = () => {
    document.title = original
    document.removeEventListener('visibilitychange', restore)
  }
  document.addEventListener('visibilitychange', restore)
}

export default function TimerWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const setTimerData = useBoardStore(s => s.setTimerData)
  const mode = useUIStore(s => s.mode)
  const showActionToast = useUIStore(s => s.showActionToast)
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
      playAlarmSound(d)
      notifyDone(d.name ?? '', t)
      // In-App-Popup zusätzlich zur (nur bei verstecktem Tab feuernden)
      // System-Benachrichtigung — so bekommt man den Alarm auch mit, wenn
      // mosaic zwar sichtbar, das Timer-Widget aber gerade nicht im
      // Blickfeld ist (anderer Bereich des Boards, anderes Widget im Fokus).
      showActionToast((d.name ?? '').trim() ? `"${d.name}" ${t('is done.')}` : t('Your timer is done.'))
    }
    prevDoneRef.current = done
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  useEffect(() => {
    if (editingLabel) labelInputRef.current?.focus()
  }, [editingLabel])

  // ── Alarmton-Auswahl (nur im Editmodus, oben rechts) ──────────────────────
  const [soundMenuOpen, setSoundMenuOpen] = useState(false)
  const [soundError, setSoundError] = useState<string | null>(null)
  const soundMenuRef = useRef<HTMLDivElement>(null)
  const soundErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const customSounds: TimerCustomSound[] = d.customSounds ?? []

  useEffect(() => {
    if (!soundMenuOpen) return
    function onDown(e: MouseEvent) {
      if (!soundMenuRef.current?.contains(e.target as Node)) setSoundMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [soundMenuOpen])

  function flashSoundError(msg: string) {
    if (soundErrorTimerRef.current) clearTimeout(soundErrorTimerRef.current)
    setSoundError(msg)
    soundErrorTimerRef.current = setTimeout(() => setSoundError(null), 4000)
  }

  function selectSound(soundId: string | undefined) {
    setTimerData(widget.id, { soundId })
    playAlarmSound({ ...d, soundId })
  }

  async function handleSoundFile(file: File) {
    let duration: number
    try {
      duration = await readAudioDuration(file)
    } catch {
      flashSoundError(t('This file could not be used as an alarm sound.'))
      return
    }
    if (!isFinite(duration) || duration > MAX_CUSTOM_SOUND_SEC + 0.05) {
      flashSoundError(t('Custom sounds can be at most 8 seconds long.'))
      return
    }
    try {
      const ref: string = await saveBlob(file)
      const sound: TimerCustomSound = { id: `snd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: file.name, ref }
      setTimerData(widget.id, { customSounds: [...customSounds, sound], soundId: sound.id })
    } catch {
      flashSoundError(t('This file could not be used as an alarm sound.'))
    }
  }

  async function removeCustomSound(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const target = customSounds.find(c => c.id === id)
    const patch: Partial<TimerData> = { customSounds: customSounds.filter(c => c.id !== id) }
    if (d.soundId === id) patch.soundId = undefined
    setTimerData(widget.id, patch)
    if (target) { try { await deleteBlob(target.ref) } catch { /* nicht kritisch */ } }
  }

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

  const allSounds = [
    ...SOUND_PRESETS.map(p => ({ id: p.id, label: t(p.label), custom: false })),
    ...customSounds.map(c => ({ id: c.id, label: c.name, custom: true })),
  ]
  const currentSoundLabel = allSounds.find(s => s.id === (d.soundId ?? SOUND_PRESETS[0].id))?.label ?? t(SOUND_PRESETS[0].label)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: 4, padding: '6px 8px', position: 'relative' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Alarmton-Auswahl — nur im Editmodus, oben rechts */}
      {mode === 'edit' && (
        <div ref={soundMenuRef} style={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}>
          <button
            onClick={() => setSoundMenuOpen(o => !o)}
            title={`${t('Alarm sound')}: ${currentSoundLabel}`}
            aria-haspopup="listbox"
            aria-expanded={soundMenuOpen}
            style={{
              width: 22, height: 22, borderRadius: 6, border: `1px solid ${soundMenuOpen ? 'var(--accent)' : 'var(--border)'}`,
              background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>
            </svg>
          </button>

          {soundMenuOpen && (
            <div role="listbox" style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
              minWidth: 168, maxHeight: 220, overflowY: 'auto',
              background: 'var(--popover-bg)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden',
            }}>
              {allSounds.map(s => {
                const active = (d.soundId ?? SOUND_PRESETS[0].id) === s.id
                return (
                  <button
                    key={s.id}
                    role="option"
                    aria-selected={active}
                    onClick={() => selectSound(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '7px 10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface3)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span style={{
                      flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontSize: 12, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text1)',
                    }}>
                      {s.label}
                    </span>
                    {s.custom && (
                      <span
                        onClick={e => removeCustomSound(s.id, e)}
                        title={t('Remove sound')}
                        style={{
                          flexShrink: 0, width: 15, height: 15, borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--text3)', fontSize: 12, lineHeight: 1, cursor: 'pointer',
                        }}
                      >×</span>
                    )}
                  </button>
                )
              })}

              <div style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer',
                    textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--accent)',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {t('Upload sound…')}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleSoundFile(f); e.target.value = '' }}
              />
            </div>
          )}
        </div>
      )}
      {soundError && mode === 'edit' && (
        <div style={{
          position: 'absolute', top: 30, right: 4, zIndex: 21, maxWidth: 160,
          fontSize: 10, lineHeight: 1.4, color: 'var(--danger)',
          background: 'color-mix(in srgb, var(--danger) 12%, var(--surface))',
          border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
          borderRadius: 7, padding: '5px 7px',
        }}>
          {soundError}
        </div>
      )}

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
