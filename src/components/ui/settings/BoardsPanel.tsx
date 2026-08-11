'use client'
import { useEffect, useRef, useState } from 'react'
import { useSettings } from '@/store/settingsStore'
import type { CustomTemplate } from '@/store/settingsStore'
import { useBoardStore } from '@/store/boardStore'
import { THEMES, resolveCustomTheme } from '@/lib/themes'
import { TYPE_ICONS, TYPE_LABELS } from '@/components/board/TileWrapper'
import WidgetLayoutPreview from '@/components/ui/WidgetLayoutPreview'
import { useT } from '@/hooks/useT'
import { SectionTitle, SettingItem } from './shared'

// ── Boards & Vorlagen (v. a. für die Board-Übersicht) ─────────────────────────

export default function BoardsPanel() {
  const defaultThemeId       = useSettings(s => s.defaultThemeId)
  const setSetting           = useSettings(s => s.setSetting)
  const customThemes         = useSettings(s => s.customThemes)
  const customTemplates      = useSettings(s => s.customTemplates)
  const removeCustomTemplate = useSettings(s => s.removeCustomTemplate)
  const trash      = useBoardStore(s => s.trash)
  const emptyTrash = useBoardStore(s => s.emptyTrash)
  const [emptyConfirm, setEmptyConfirm] = useState(false)
  const t = useT()

  const themeOptions = [
    ...THEMES.map(th => ({ id: th.id as string, name: th.name, cssVars: th.cssVars })),
    ...customThemes.map(th => { const r = resolveCustomTheme(th); return { id: r.id, name: `${r.name} (${t('custom')})`, cssVars: r.cssVars } }),
  ]

  return (
    <div>
      <SectionTitle>{t('New boards')}</SectionTitle>
      <SettingItem
        last
        label={t('Default theme')}
        desc={t('Applied to every newly created board')}
        control={
          <ThemeSelect
            options={themeOptions}
            value={themeOptions.some(th => th.id === defaultThemeId) ? defaultThemeId : 'dark'}
            onChange={id => setSetting({ defaultThemeId: id })}
          />
        }
      />

      <SectionTitle>{t('Custom templates')}</SectionTitle>
      {customTemplates.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          {t('No templates yet — save a board via its card\'s ⋯ menu ("Save as template"). Templates then appear when creating new boards.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {customTemplates.map(tpl => (
            <TemplateRow key={tpl.id} tpl={tpl} onRemove={() => removeCustomTemplate(tpl.id)} />
          ))}
        </div>
      )}

      <SectionTitle>{t('Trash')}</SectionTitle>
      {trash.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          {t('The trash is empty. Deleted boards stay here for 30 days and can be restored (section at the bottom of the board overview).')}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'color-mix(in srgb, var(--danger) 14%, var(--surface))',
            border: '1px solid color-mix(in srgb, var(--danger) 32%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>
              {trash.length} {trash.length !== 1 ? t('boards in the trash') : t('board in the trash')}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{t('restore them from the board overview.')}</div>
          </div>
          {emptyConfirm ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button onClick={() => setEmptyConfirm(false)}
                style={{ fontSize: 11, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
                {t('Cancel')}
              </button>
              <button onClick={() => { emptyTrash(); setEmptyConfirm(false) }}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 999, border: 'none', background: 'var(--danger)', color: 'white', cursor: 'pointer' }}>
                {t('Yes, empty it')}
              </button>
            </div>
          ) : (
            <button onClick={() => setEmptyConfirm(true)} title={t('Empty trash')}
              style={{
                flexShrink: 0, padding: '4px 12px', borderRadius: 999,
                border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                background: 'none', color: 'var(--danger)', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
              }}>
              {t('Empty trash')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Kompakte, runde Farbvorschau je Theme — dieselben drei Kreise (Fläche/Akzent/
// Akzent2) wie im Theme-Panel selbst, nur kleiner und enger gruppiert.
function ThemeSwatch({ cssVars }: { cssVars: Record<string, string> }) {
  const surface = cssVars['--surface'] ?? '#16192b'
  const accent  = cssVars['--accent']  ?? '#8b74f0'
  const accent2 = cssVars['--accent2'] ?? '#5eead4'
  return (
    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
      {[surface, accent, accent2].map((c, i) => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c, border: '1px solid rgba(128,128,128,0.35)' }} />
      ))}
    </div>
  )
}

// Eigenes Dropdown statt <select>/<option>: native Optionen können keine
// farbigen Vorschau-Punkte rendern, daher dieselbe Custom-Liste wie beim
// Sprachauswähler in GeneralPanel.
function ThemeSelect({ options, value, onChange }: {
  options: { id: string; name: string; cssVars: Record<string, string> }[]
  value: string
  onChange: (id: string) => void
}) {
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

  const current = options.find(o => o.id === value) ?? options[0]

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
        <ThemeSwatch cssVars={current.cssVars} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current.name}
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
          // Deckend auch bei transparentem --surface (Crystal-Glass-Theme)
          background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          {options.map(o => {
            const active = o.id === value
            return (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <ThemeSwatch cssVars={o.cssVars} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.name}
                </span>
                {active && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Auf-/zuklappbare Zeile für eine eigene Board-Vorlage: links eine
// maßstäbliche Mini-Vorschau des Layouts (Rechtecke nach col/row/colSpan/
// rowSpan normiert auf die tatsächliche Ausdehnung der Vorlage), rechts die
// Liste aller enthaltenen Widgets mit Icon.
function TemplateRow({ tpl, onRemove }: { tpl: CustomTemplate; onRemove: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)

  return (
    <div style={{ borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        role="button" tabIndex={0}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7v3h-7z"/>
        </svg>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{tpl.widgets.length} {tpl.widgets.length !== 1 ? t('Widgets') : t('Widget')}</span>
        <button onClick={e => { e.stopPropagation(); onRemove() }} title={t('Remove template')}
          style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'none', color: 'var(--text3)', fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
      </div>

      {open && (
        <div style={{ display: 'flex', gap: 14, padding: '0 10px 10px', alignItems: 'flex-start' }}>
          {/* Dieselbe Vorschau-Komponente wie die Board-Karten-Thumbnails auf
              der Startseite (WidgetLayoutPreview) — identischer Randabstand,
              Lücken zwischen den Kacheln und Skalierung, nur mit den
              gespeicherten Vorlagen-Positionen statt einem echten Board. */}
          <div style={{
            width: 160, height: 110, flexShrink: 0, position: 'relative',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
          }}>
            <WidgetLayoutPreview items={tpl.widgets} accent="var(--accent)" />
          </div>
          {/* Spaltenweise statt einer einzigen langen Liste: max. 5 Zeilen,
              danach geht's in der nächsten Spalte weiter, damit die Vorschau
              bei vielen Widgets nicht immer weiter nach unten wächst. */}
          <div style={{
            flex: 1, minWidth: 0, display: 'grid',
            gridTemplateRows: 'repeat(5, auto)', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, max-content)',
            columnGap: 18, rowGap: 4, alignContent: 'start',
          }}>
            {tpl.widgets.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)', minWidth: 0 }}>
                <span style={{ display: 'flex', color: 'var(--text3)', flexShrink: 0 }}>{TYPE_ICONS[w.type]}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(TYPE_LABELS[w.type] ?? w.type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
