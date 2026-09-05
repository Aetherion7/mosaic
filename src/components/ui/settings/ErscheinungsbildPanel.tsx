'use client'
import { useEffect, useRef, useState } from 'react'
import { useSettings } from '@/store/settingsStore'
import type { CustomTheme } from '@/store/settingsStore'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import type { CustomFont } from '@/store/settingsStore'
import { FONT_OPTIONS, customFontStack, type FontOption } from '@/lib/fonts'
import { saveBlob, deleteBlob } from '@/lib/blobStore'
import { useT } from '@/hooks/useT'
import { SectionTitle, HeaderStyleCard, AddCardButton, Row } from './shared'
import ThemeEditorModal from './ThemeEditorModal'

export default function ErscheinungsbildPanel() {
  const headerStyle    = useSettings(s => s.headerStyle)
  const animations     = useSettings(s => s.animations)
  const showMinimap    = useSettings(s => s.showMinimap)
  const setSetting     = useSettings(s => s.setSetting)
  const t = useT()
  return (
    <div>
      <SectionTitle>{t('Header style')}</SectionTitle>
      <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
        <HeaderStyleCard
          active={headerStyle === 'default'}
          label={t('Default')}
          desc={t('Continuous bar with background and divider line')}
          onClick={() => setSetting({ headerStyle: 'default' })}
          preview={
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 8px', background: 'rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.14)' }}>
              <div style={{ width: 20, height: 8, borderRadius: 3, background: '#8b74f0', marginRight: 'auto' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 18, height: 8, borderRadius: 10, background: '#8b74f0' }} />
                <div style={{ width: 18, height: 8, borderRadius: 10, background: 'rgba(255,255,255,0.25)' }} />
              </div>
              <div style={{ width: 18, height: 8, borderRadius: 10, background: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }} />
            </div>
          }
        />
        <HeaderStyleCard
          active={headerStyle === 'island'}
          label={t('Island')}
          desc={t('Floating pills, open space between groups')}
          onClick={() => setSetting({ headerStyle: 'island' })}
          preview={
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ width: 16, height: 6, borderRadius: 3, background: '#8b74f0' }} />
              </div>
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ width: 14, height: 6, borderRadius: 10, background: '#8b74f0' }} />
                <div style={{ width: 14, height: 6, borderRadius: 10, background: 'rgba(255,255,255,0.3)' }} />
              </div>
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ width: 14, height: 6, borderRadius: 10, background: 'rgba(255,255,255,0.3)' }} />
              </div>
            </div>
          }
        />
      </div>

      <SectionTitle>{t('Board')}</SectionTitle>
      <Row
        label={t('Animations')}
        desc={t('Turns decorative transitions and effects on or off across the entire app')}
        value={animations}
        onChange={v => setSetting({ animations: v })}
      />
      <div style={{ marginTop: 20 }}>
        <Row
          last
          label={t('Minimap')}
          desc={t('Shows a live overview of the board in the bottom-left corner')}
          value={showMinimap}
          onChange={v => setSetting({ showMinimap: v })}
        />
      </div>

      <SectionTitle>{t('Font')}</SectionTitle>
      <FontSection />

      <SectionTitle>{t('Custom themes')}</SectionTitle>
      <CustomThemesSection />

      <SectionTitle>{t('Reset')}</SectionTitle>
      <button
        onClick={() => {
          // Nur die Einstellungen zurücksetzen, die dieses Panel (Erscheinungsbild)
          // tatsächlich steuert — vorher wurde hier der komplette AppSettings-Store
          // ersetzt, was auch fachfremde Felder wie disabledWidgetTypes
          // stillschweigend geleert hat.
          setSetting({
            headerStyle:   'default',
            programFont:   'inter',
          })
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', borderRadius: 999, border: '1px solid var(--border)',
          background: 'var(--surface2)', color: 'var(--text2)',
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
        </svg>
        {t('Reset all settings')}
      </button>
    </div>
  )
}

function CustomThemesSection() {
  const customThemes      = useSettings(s => s.customThemes)
  const removeCustomTheme = useSettings(s => s.removeCustomTheme)
  const t = useT()

  // 'new' = Editor ohne Vorbelegung (neues Theme); ein CustomTheme-Objekt =
  // Editor mit dessen Werten vorausgefüllt (Bearbeiten); null = geschlossen.
  const [editorTarget, setEditorTarget] = useState<CustomTheme | 'new' | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Installed custom themes */}
      {customThemes.map(ct => {
        const bg      = ct.cssVars['--bg']      ?? '#0d0d14'
        const surface = ct.cssVars['--surface'] ?? '#16192b'
        const accent  = ct.cssVars['--accent']  ?? '#8b74f0'
        const accent2 = ct.cssVars['--accent2'] ?? '#5eead4'
        return (
          <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {[bg, surface, accent, accent2].map((c, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: 4, background: c, border: '1px solid rgba(128,128,128,0.35)' }} />
              ))}
            </div>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.name}</span>
            <button onClick={() => setEditorTarget(ct)} title={t('Edit theme')}
              style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>
              </svg>
            </button>
            <button onClick={() => removeCustomTheme(ct.id)} title={t('Remove theme')}
              style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'none', color: 'var(--text3)', fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
          </div>
        )
      })}
      {customThemes.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text3)', padding: '2px 0 4px' }}>
          {t('No custom themes yet — they appear in the theme panel under "Custom" after adding one.')}
        </div>
      )}

      <AddCardButton
        title={t('Create theme')}
        desc={t('Open the interactive editor with a live preview')}
        onClick={() => setEditorTarget('new')}
        icon={
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/>
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.68-.75 1.68-1.68 0-.44-.17-.83-.44-1.13-.27-.29-.43-.68-.43-1.11 0-.93.75-1.68 1.68-1.68H16c3.31 0 6-2.69 6-6 0-4.97-4.5-8.4-10-8.4z"/>
          </svg>
        }
      />

      {editorTarget && (
        <ThemeEditorModal
          initial={editorTarget === 'new' ? undefined : editorTarget}
          onClose={() => setEditorTarget(null)}
        />
      )}
    </div>
  )
}

// Programm-Schrift (global, gesamte Oberfläche) + Board-Schrift (überschreibt
// die Programm-Schrift nur für das gerade offene Board). Exportiert, damit
// GeneralPanel.tsx sie auch auf der Startseite (Board-Auswahl) zeigen kann —
// dort ausdrücklich mit showBoardFont={false}: currentBoardId im Store bleibt
// nach dem Verlassen eines Boards bestehen (wird beim Zurückkehren zur
// Startseite nicht geleert), `board` wäre also fälschlich noch gesetzt und
// würde die Board-Schrift-Zeile zeigen, obwohl kein Board offen ist.
export function FontSection({ showBoardFont = true }: { showBoardFont?: boolean }) {
  const t = useT()
  const programFont      = useSettings(s => s.programFont)
  const setSetting       = useSettings(s => s.setSetting)
  const customFonts      = useSettings(s => s.customFonts)
  const addCustomFont    = useSettings(s => s.addCustomFont)
  const removeCustomFont = useSettings(s => s.removeCustomFont)
  const board            = useBoardStore(selectBoard)
  const setBoardFont     = useBoardStore(s => s.setBoardFont)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Eigene Schriften erscheinen im Dropdown als eigene Kategorie unterhalb
  // der eingebauten — ihr Font-Stack zeigt auf den Familiennamen, den
  // CustomFontLoader zur Laufzeit per FontFace-API registriert.
  const customFontOptions: FontOption[] = customFonts.map(f => ({ id: f.id, label: f.name, stack: customFontStack(f.id) }))

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (!/\.(ttf|otf|woff2?|)$/i.test(file.name) && !file.type.startsWith('font/')) {
      setError(t('Please choose a font file (.ttf, .otf, .woff, .woff2)'))
      return
    }
    setUploading(true)
    try {
      const blobRef = await saveBlob(file)
      const name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 40) || t('Custom font')
      addCustomFont({ id: `cf_${Date.now()}`, name, blobRef })
    } catch {
      setError(t('Could not read this font file'))
    } finally {
      setUploading(false)
    }
  }

  function handleRemove(font: CustomFont) {
    removeCustomFont(font.id)
    deleteBlob(font.blobRef).catch(() => {})
    // Nichts soll auf eine gelöschte Font-ID zeigen bleiben
    if (programFont === font.id) setSetting({ programFont: 'inter' })
    if (showBoardFont && board?.fontFamily === font.id) setBoardFont(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text1)' }}>{t('Program font')}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{t('Used everywhere — home screen, settings, and every board without its own font')}</div>
        </div>
        <FontSelect
          builtins={FONT_OPTIONS}
          custom={customFontOptions}
          value={programFont}
          onChange={id => setSetting({ programFont: id ?? 'inter' })}
          onDeleteCustom={id => { const f = customFonts.find(x => x.id === id); if (f) handleRemove(f) }}
          onAddCustom={() => fileRef.current?.click()}
          uploading={uploading}
        />
        <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
      {error && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</div>}

      {showBoardFont && board && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text1)' }}>{t('Board font')}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{t('Overrides the program font, only for this board')}</div>
          </div>
          <FontSelect
            builtins={FONT_OPTIONS}
            custom={customFontOptions}
            value={board.fontFamily ?? null}
            onChange={id => setBoardFont(id)}
            onDeleteCustom={id => { const f = customFonts.find(x => x.id === id); if (f) handleRemove(f) }}
            onAddCustom={() => fileRef.current?.click()}
            uploading={uploading}
            allowInherit
          />
        </div>
      )}
    </div>
  )
}

// Eigenes Dropdown statt <select>/<option>: native Optionen können nicht in
// ihrer jeweiligen Schrift dargestellt werden (Live-Vorschau je Eintrag).
function FontSelect({ builtins, custom, value, onChange, onDeleteCustom, onAddCustom, uploading, allowInherit }: {
  builtins: FontOption[]
  custom: FontOption[]
  value: string | null
  onChange: (id: string | null) => void
  onDeleteCustom?: (id: string) => void
  onAddCustom?: () => void
  uploading?: boolean
  allowInherit?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = [...builtins, ...custom].find(f => f.id === value)
  const currentLabel = current ? current.label : t('Use program font')
  const currentStack = current ? current.stack : 'var(--font-app)'

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 190,
          padding: '5px 9px', borderRadius: 8,
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          background: 'var(--surface2)', cursor: 'pointer', textAlign: 'left',
          transition: 'border-color 0.12s',
        }}
      >
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: current ? 'var(--text1)' : 'var(--text3)',
          fontFamily: currentStack, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentLabel}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
          minWidth: 200, maxHeight: 280, overflowY: 'auto',
          background: 'var(--popover-bg)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          {onAddCustom && (
            <button
              onClick={() => onAddCustom()}
              disabled={uploading}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '7px 10px', border: 'none', cursor: uploading ? 'default' : 'pointer', textAlign: 'left',
                background: 'transparent', opacity: uploading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                {uploading ? t('Uploading…') : t('Add custom font')}
              </span>
            </button>
          )}
          {custom.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 2, marginBottom: 2 }}>
              {custom.map(f => (
                <FontOptionButton key={f.id} f={f} active={f.id === value}
                  onClick={() => { onChange(f.id); setOpen(false) }}
                  onDelete={onDeleteCustom ? () => onDeleteCustom(f.id) : undefined} />
              ))}
            </div>
          )}
          {allowInherit && (
            <button
              onClick={() => { onChange(null); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', width: '100%',
                padding: '7px 10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                background: value === null ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => { if (value !== null) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (value !== null) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <span style={{ fontSize: 12, fontWeight: value === null ? 700 : 500, color: value === null ? 'var(--accent)' : 'var(--text2)', fontStyle: 'italic' }}>
                {t('Use program font')}
              </span>
            </button>
          )}
          {builtins.map(f => (
            <FontOptionButton key={f.id} f={f} active={f.id === value} onClick={() => { onChange(f.id); setOpen(false) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function FontOptionButton({ f, active, onClick, onDelete }: { f: FontOption; active: boolean; onClick: () => void; onDelete?: () => void }) {
  const t = useT()
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: '7px 10px', cursor: 'pointer', textAlign: 'left',
        background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : 'var(--text1)', fontFamily: f.stack, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {f.label}
      </span>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title={t('Remove font')}
          style={{
            width: 18, height: 18, borderRadius: 5, border: 'none', background: 'none', color: 'var(--text3)',
            fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
