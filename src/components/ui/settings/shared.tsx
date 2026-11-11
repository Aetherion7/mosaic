'use client'
import { useState } from 'react'
import { useT } from '@/hooks/useT'

// ─── Reusable primitives ──────────────────────────────────────────────────────

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={value} aria-label={label}
      onClick={e => { e.stopPropagation(); onChange(!value) }}
      style={{ width: 40, height: 22, borderRadius: 11, flexShrink: 0, border: 'none', padding: 0, background: value ? 'var(--accent)' : 'rgba(150,150,150,0.25)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.18s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  )
}

// ─── Gemeinsame Stile (Designprinzipien, KONZEPT.md §6) ───────────────────────

// Einstellungszeile als eigene tonale Kachel statt Trennlinie. `last` lässt nur
// den Abstand zur nächsten Kachel weg.
export function tileStyle(last?: boolean): React.CSSProperties {
  return {
    padding: '12px 14px', borderRadius: 14,
    background: 'color-mix(in srgb, var(--surface2) 70%, transparent)',
    marginBottom: last ? 0 : 6,
  }
}

// Pillen-Knöpfe: Akzent (gefüllt), Ghost (Rand), Danger (getönt), Danger-Solid
// (nur für die endgültige "Ja, löschen"-Bestätigung).
export function pillBtn(kind: 'accent' | 'soft' | 'ghost' | 'danger' | 'dangerSolid' = 'ghost'): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
    border: kind === 'ghost' ? '1px solid var(--border)' : 'none',
    background:
      kind === 'accent' ? 'var(--accent)'
      : kind === 'soft' ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
      : kind === 'danger' ? 'color-mix(in srgb, var(--danger) 16%, transparent)'
      : kind === 'dangerSolid' ? 'var(--danger)'
      : 'transparent',
    color:
      kind === 'accent' ? 'var(--on-accent, white)'
      : kind === 'soft' ? 'var(--accent)'
      : kind === 'danger' ? 'var(--danger)'
      : kind === 'dangerSolid' ? 'white'
      : 'var(--text2)',
  }
}

// Einzeilige Eingaben sind Pillen; Textareas bekommen Radius 14.
export const pillInput: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text1)', fontSize: 12.5, outline: 'none',
  boxSizing: 'border-box',
}

// Ausgewählte Optionskarte: Akzent-Tönung + innerer Ring statt 2px-Rand.
export function optionCardStyle(active: boolean): React.CSSProperties {
  return {
    border: 'none', borderRadius: 14,
    background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface2)',
    boxShadow: active ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--border)',
  }
}

export const POPOVER_SHADOW = '0 10px 32px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)'
export const MODAL_SHADOW = '0 32px 80px color-mix(in srgb, var(--shadow-color, #000) 55%, transparent)'

export function XIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

// Runder Schließen-Knopf (Vorlage: ThemePanel)
export function CloseButton({ onClick, title, ariaLabel, size = 26 }: { onClick: () => void; title?: string; ariaLabel?: string; size?: number }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={ariaLabel} style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0, padding: 0,
      border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <XIcon size={size >= 28 ? 11 : 10} />
    </button>
  )
}

export function Row({ label, desc, value, onChange, last }: { label: string; desc?: React.ReactNode; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <div onClick={() => onChange(!value)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, ...tileStyle(last), cursor: 'pointer' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{desc}</div>}
      </div>
      <Toggle value={value} onChange={onChange} label={label} />
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text1)', marginTop: 22, marginBottom: 10 }}>{children}</div>
}

export function KbdRow({ keys, action, last }: { keys: string[]; action: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, ...tileStyle(last), padding: '9px 14px' }}>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{action}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {keys.map((k, i) => (
          <kbd key={i} style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}>{k}</kbd>
        ))}
      </div>
    </div>
  )
}

export function SettingItem({ label, desc, control, last }: { label: string; desc?: string; control: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      ...tileStyle(last), gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  )
}

export function HeaderStyleCard({ active, label, desc, preview, onClick }: { active: boolean; label: string; desc: string; preview: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
      ...optionCardStyle(active),
      transition: 'all 0.15s',
    }}>
      <div style={{ width: '100%', height: 52, borderRadius: 10, background: '#0f0f1a', marginBottom: 10, position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
        {preview}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text1)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{desc}</div>
    </button>
  )
}

// ── Eigene Themes ─────────────────────────────────────────────────────────────

export const THEME_JSON_TEMPLATE = `{
  "name": "My Theme",
  "cssVars": {
    "--bg":       "#0b1020",
    "--surface":  "#141a30",
    "--surface2": "#1c2340",
    "--surface3": "#262e52",
    "--border":   "#323b63",
    "--accent":   "#5b8fff",
    "--accent2":  "#4ecdc4",
    "--text1":    "#eef1fa",
    "--text2":    "#8f97b8",
    "--text3":    "#666e92"
  },
  "bg": {
    "pattern":        "dots",
    "patternColor":   "#ffffff",
    "patternOpacity": 0.15
  }
}`

export function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Karten-Button zum Öffnen des JSON-Formulars (Theme)
export function AddCardButton({ title, desc, icon, onClick }: { title: string; desc: string; icon: React.ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '10px 12px',
        borderRadius: 14, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
        border: 'none',
        background: hover ? 'color-mix(in srgb, var(--accent) 10%, var(--surface2))' : 'color-mix(in srgb, var(--surface2) 70%, transparent)',
      }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text1)' }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: hover ? 'var(--accent)' : 'var(--text3)', flexShrink: 0, transition: 'color 0.15s' }}>
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  )
}

// Auf-/zuklappbare JSON-Vorlage mit Download & Direkt-Einfügen
export function TemplateBox({ json, filename, onInsert }: { json: string; filename: string; onInsert?: () => void }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  return (
    <div style={{ borderRadius: 14, background: 'color-mix(in srgb, var(--surface2) 70%, transparent)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.16s', flexShrink: 0 }}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t('Template')}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{open ? t('Collapse') : t('View')}</span>
      </button>
      {open && (
        <>
          <pre style={{
            margin: '0 8px', padding: '10px 12px', borderRadius: 10, background: 'var(--surface)',
            fontSize: 10.5, fontFamily: 'monospace', lineHeight: 1.65, color: 'var(--text2)',
            overflowX: 'auto', maxHeight: 200, overflowY: 'auto',
          }}>{json}</pre>
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px 10px' }}>
            <button onClick={() => downloadJson(filename, json)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999, border: 'none', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', cursor: 'pointer' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {t('Download')}
            </button>
            {onInsert && (
              <button onClick={onInsert}
                style={{ fontSize: 10.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
                {t('Insert into field')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
