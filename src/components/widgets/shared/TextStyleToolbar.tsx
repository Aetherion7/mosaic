'use client'
import { useRef, useEffect, useState } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { createPortal } from 'react-dom'
import { useSettings } from '@/store/settingsStore'
import { saveBlob, deleteBlob } from '@/lib/blobStore'
import { customFontStack } from '@/lib/fonts'
import { useT } from '@/hooks/useT'

// Font picker, small toolbar building blocks, and the built-in Google Fonts
// stylesheet loader used by NoteWidget's text-style toolbar. Originally lived
// only in the now-removed TextWidget; kept as its own module in case another
// widget ever needs the same font/color/shadow/stroke controls.

export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72]

const FONT_CATEGORIES = [
  {
    label: 'Sans-serif',
    fonts: [
      { value: 'inter',      label: 'Inter',           css: '"Inter", system-ui, sans-serif' },
      { value: 'roboto',     label: 'Roboto',          css: '"Roboto", sans-serif' },
      { value: 'opensans',   label: 'Open Sans',       css: '"Open Sans", sans-serif' },
      { value: 'lato',       label: 'Lato',            css: '"Lato", sans-serif' },
      { value: 'poppins',    label: 'Poppins',         css: '"Poppins", sans-serif' },
      { value: 'nunito',     label: 'Nunito',          css: '"Nunito", sans-serif' },
      { value: 'montserrat', label: 'Montserrat',      css: '"Montserrat", sans-serif' },
      { value: 'raleway',    label: 'Raleway',         css: '"Raleway", sans-serif' },
      { value: 'dmsans',     label: 'DM Sans',         css: '"DM Sans", sans-serif' },
      { value: 'outfit',     label: 'Outfit',          css: '"Outfit", sans-serif' },
      { value: 'jakarta',    label: 'Plus Jakarta',    css: '"Plus Jakarta Sans", sans-serif' },
      { value: 'mulish',     label: 'Mulish',          css: '"Mulish", sans-serif' },
    ],
  },
  {
    label: 'Serif',
    fonts: [
      { value: 'playfair',         label: 'Playfair',          css: '"Playfair Display", serif' },
      { value: 'merriweather',     label: 'Merriweather',      css: '"Merriweather", serif' },
      { value: 'lora',             label: 'Lora',              css: '"Lora", serif' },
      { value: 'cormorant',        label: 'Cormorant',         css: '"Cormorant Garamond", serif' },
      { value: 'ebgaramond',       label: 'EB Garamond',       css: '"EB Garamond", serif' },
      { value: 'librebaskerville', label: 'Libre Baskerville', css: '"Libre Baskerville", serif' },
    ],
  },
  {
    label: 'Display',
    fonts: [
      { value: 'oswald',    label: 'Oswald',     css: '"Oswald", sans-serif' },
      { value: 'bebasneu',  label: 'Bebas Neue', css: '"Bebas Neue", sans-serif' },
      { value: 'righteous', label: 'Righteous',  css: '"Righteous", sans-serif' },
    ],
  },
  {
    label: 'Monospace',
    fonts: [
      { value: 'jetbrains',   label: 'JetBrains Mono', css: '"JetBrains Mono", monospace' },
      { value: 'firamono',    label: 'Fira Code',      css: '"Fira Code", monospace' },
      { value: 'spacemono',   label: 'Space Mono',     css: '"Space Mono", monospace' },
      { value: 'ibmplexmono', label: 'IBM Plex Mono',  css: '"IBM Plex Mono", monospace' },
    ],
  },
  {
    label: 'Handwriting',
    fonts: [
      { value: 'dancingscript', label: 'Dancing Script', css: '"Dancing Script", cursive' },
      { value: 'caveat',        label: 'Caveat',         css: '"Caveat", cursive' },
      { value: 'pacifico',      label: 'Pacifico',       css: '"Pacifico", cursive' },
    ],
  },
]

const FONT_FAMILIES = FONT_CATEGORIES.flatMap(c => c.fonts)

// Google-Fonts-Kurzwahl (Name → CDN-Laden), nur pro Textblock — eine eigene,
// bewusst schlanke Ablage, da sie keine Datei enthält und daher nicht zum
// globalen dateibasierten Schriften-System (Einstellungen → Erscheinungsbild
// → Schrift) gehört. Hochgeladene Dateien laufen dagegen über GENAU dieses
// globale System (settingsStore.customFonts + blobStore/IndexedDB) statt —
// wie vorher — über eine zweite, unabhängige Ablage als Base64 im
// localStorage (fragiler, und vom Datenschutz-Panel nicht erfasst).
interface GoogleFontEntry {
  id:     string
  label:  string
  family: string
}

const GOOGLE_FONTS_KEY = 'planboard-text-google-fonts'
// Alter, inzwischen abgelöster Schlüssel (Datei-Uploads + Google-Fonts
// gemischt als Base64/Klartext). Nur die Google-Fonts-Einträge daraus (kein
// dataUrl) lassen sich verlustfrei übernehmen — Datei-Uploads bräuchten eine
// Board-weite Migration der widget.data.fontFamily-Werte, die hier bewusst
// nicht mitgemacht wird (Alt-Verhalten: diese einzelnen Datei-Schriften
// fallen nach dem Update auf die Standardschrift zurück).
const LEGACY_KEY = 'planboard-custom-fonts'

function loadGoogleFonts(): GoogleFontEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const current: GoogleFontEntry[] = JSON.parse(localStorage.getItem(GOOGLE_FONTS_KEY) || '[]')
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (legacyRaw) {
      const legacy: (GoogleFontEntry & { dataUrl?: string })[] = JSON.parse(legacyRaw)
      const migrated = legacy.filter(f => !f.dataUrl && !current.some(c => c.family === f.family))
      if (migrated.length) {
        const merged = [...current, ...migrated.map(({ id, label, family }) => ({ id, label, family }))]
        saveGoogleFonts(merged)
        return merged
      }
    }
    return current
  } catch { return [] }
}

function saveGoogleFonts(list: GoogleFontEntry[]) {
  try { localStorage.setItem(GOOGLE_FONTS_KEY, JSON.stringify(list)) } catch {}
}

function injectGoogleFont(family: string) {
  const id = `gfont-custom-${family.replace(/\s+/g, '-').toLowerCase()}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;700&display=swap`
  document.head.appendChild(link)
}

export function getFontCss(value: string): string {
  if (value?.startsWith('custom:')) {
    return `"${value.slice(7)}", system-ui, sans-serif`
  }
  const builtin = FONT_FAMILIES.find(f => f.value === value)
  if (builtin) return builtin.css
  // Sonst: eine ID aus dem globalen, dateibasierten Schriften-System —
  // dessen FontFace wird zentral von CustomFontLoader.tsx geladen.
  return value ? customFontStack(value) : 'system-ui, sans-serif'
}

// Lädt die Google-Fonts-Stylesheet-Verknüpfung für alle eingebauten
// Schriften genau einmal — welches Note-Widget zuerst mountet, gewinnt; jedes
// weitere findet die <link> bereits vor.
export function useInjectBuiltinGoogleFonts() {
  useEffect(() => {
    const id = 'gfonts-text-style-widgets'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    const sansSerif = [
      'Inter', 'Roboto', 'Open+Sans', 'Lato', 'Poppins', 'Nunito',
      'Montserrat', 'Raleway', 'DM+Sans', 'Outfit', 'Plus+Jakarta+Sans', 'Mulish',
    ]
    const serif = [
      'Playfair+Display', 'Merriweather', 'Lora',
      'Cormorant+Garamond', 'EB+Garamond', 'Libre+Baskerville',
    ]
    const display = ['Oswald', 'Righteous']
    const mono = ['JetBrains+Mono', 'Fira+Code', 'Space+Mono', 'IBM+Plex+Mono']
    const handwriting = ['Dancing+Script', 'Caveat', 'Pacifico']
    link.href =
      'https://fonts.googleapis.com/css2?' +
      [...sansSerif, ...serif, ...display, ...mono, ...handwriting]
        .map(f => `family=${f}:wght@400;700`)
        .concat('family=Bebas+Neue:wght@400')
        .join('&') +
      '&display=swap'
    document.head.appendChild(link)
  }, [])
}

// ─── Font Picker ──────────────────────────────────────────────────────────────

export function FontPicker({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const [adding, setAdding] = useState<'file' | 'google' | false>(false)
  const [addLabel, setAddLabel] = useState('')
  const [addFamily, setAddFamily] = useState('')
  const [localFile, setLocalFile] = useState<{ name: string; file: File } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [googleFonts, setGoogleFonts] = useState<GoogleFontEntry[]>(() => loadGoogleFonts())
  // Global, dateibasiert — dieselbe Ablage wie Einstellungen → Erscheinungsbild
  // → Schrift (settingsStore + blobStore/IndexedDB), s. Kommentar oben.
  const uploadedFonts   = useSettings(s => s.customFonts)
  const addCustomFont   = useSettings(s => s.addCustomFont)
  const removeCustomFont = useSettings(s => s.removeCustomFont)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFontFile(file: File) {
    const family = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]/g, ' ')
    setLocalFile({ name: family, file })
    setAddLabel(family)
    setAddFamily(family)
  }

  useEffect(() => {
    googleFonts.forEach(f => injectGoogleFont(f.family))
  }, [googleFonts])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const tgt = e.target as Node
      if (
        dropdownRef.current && !dropdownRef.current.contains(tgt) &&
        triggerRef.current && !triggerRef.current.contains(tgt)
      ) {
        setOpen(false)
        setAdding(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function openPicker() {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      const dropW = 210
      const left = r.left + dropW > window.innerWidth ? r.right - dropW : r.left
      setDropPos({ top: r.bottom + 4, left })
    }
    setOpen(o => !o)
  }

  const selectedLabel = (() => {
    if (value?.startsWith('custom:')) {
      const family = value.slice(7)
      return googleFonts.find(f => f.family === family)?.label ?? family
    }
    const builtin = FONT_FAMILIES.find(f => f.value === value)
    if (builtin) return builtin.label
    return uploadedFonts.find(f => f.id === value)?.name ?? 'Inter'
  })()

  const selectedCss = getFontCss(value)

  async function addFont() {
    const label = addLabel.trim()
    if (!label) return
    if (localFile) {
      // Datei-Upload: über den globalen Blob-Speicher, damit dieselbe
      // Schrift auch in Einstellungen → Erscheinungsbild verfügbar ist —
      // CustomFontLoader.tsx registriert das @font-face zentral.
      setUploading(true)
      try {
        const blobRef = await saveBlob(localFile.file)
        const id = `cf_${Date.now()}`
        addCustomFont({ id, name: label, blobRef })
        onChange(id)
      } finally {
        setUploading(false)
      }
    } else {
      const family = addFamily.trim()
      if (!family) return
      injectGoogleFont(family)
      const next = [...googleFonts, { id: `${Date.now()}`, label, family }]
      saveGoogleFonts(next)
      setGoogleFonts(next)
      onChange(`custom:${family}`)
    }
    setAddLabel('')
    setAddFamily('')
    setLocalFile(null)
    setAdding(false)
    setOpen(false)
  }

  function cancelAdding() {
    setAdding(false)
    setAddLabel('')
    setAddFamily('')
    setLocalFile(null)
  }

  // Hochgeladene Datei entfernen: globale Registry + Blob
  function removeUploadedFont(id: string) {
    const removed = uploadedFonts.find(f => f.id === id)
    removeCustomFont(id)
    if (removed) deleteBlob(removed.blobRef).catch(() => {})
    if (value === id) onChange('inter')
  }

  // Google-Fonts-Kurzwahl entfernen: nur die lokale Ablage, keine Datei
  function removeGoogleFont(id: string) {
    const removed = googleFonts.find(f => f.id === id)
    const next = googleFonts.filter(f => f.id !== id)
    saveGoogleFonts(next)
    setGoogleFonts(next)
    if (removed && value === `custom:${removed.family}`) onChange('inter')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); openPicker() }}
        title={t('Choose font')}
        style={{
          ...selStyle,
          minWidth: 110, maxWidth: 130,
          display: 'flex', alignItems: 'center', gap: 4,
          justifyContent: 'space-between',
          fontFamily: selectedCss,
          cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
          {selectedLabel}
        </span>
        <svg width="7" height="5" viewBox="0 0 7 5" style={{ flexShrink: 0, opacity: 0.5 }}>
          <path d="M0 0 L3.5 5 L7 0" fill="currentColor" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: dropPos.top, left: dropPos.left,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, zIndex: 99999, width: 210,
            maxHeight: 380, overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: '4px 0',
          }}
        >
          {/* Built-in fonts grouped by category */}
          {FONT_CATEGORIES.map(cat => (
            <div key={cat.label}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: 'var(--text3)',
                padding: '6px 10px 2px', textTransform: 'uppercase', letterSpacing: '0.09em',
              }}>
                {t(cat.label)}
              </div>
              {cat.fonts.map(f => {
                const active = value === f.value
                return (
                  <FontOption
                    key={f.value}
                    label={f.label}
                    css={f.css}
                    active={active}
                    onSelect={() => { onChange(f.value); setOpen(false) }}
                  />
                )
              })}
            </div>
          ))}

          {/* Custom fonts section */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: 'var(--text3)',
              padding: '2px 10px 6px', textTransform: 'uppercase', letterSpacing: '0.09em',
            }}>
              {t('Added fonts')}
            </div>

            {(uploadedFonts.length > 0 || googleFonts.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 7px 6px' }}>
                {uploadedFonts.map(cf => (
                  <CustomFontRow
                    key={cf.id}
                    label={cf.name}
                    css={customFontStack(cf.id)}
                    active={value === cf.id}
                    onSelect={() => { onChange(cf.id); setOpen(false) }}
                    onRemove={() => removeUploadedFont(cf.id)}
                    removeLabel={t('Remove')}
                  />
                ))}
                {googleFonts.map(gf => {
                  const gfValue = `custom:${gf.family}`
                  return (
                    <CustomFontRow
                      key={gf.id}
                      label={gf.label}
                      css={`"${gf.family}", system-ui, sans-serif`}
                      active={value === gfValue}
                      onSelect={() => { onChange(gfValue); setOpen(false) }}
                      onRemove={() => removeGoogleFont(gf.id)}
                      removeLabel={t('Remove')}
                    />
                  )
                })}
              </div>
            )}

            {/* hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".ttf,.otf"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) { handleFontFile(file); setAdding('file') }
                e.target.value = ''
              }}
            />

            {!adding ? (
              <div style={{ padding: '0 7px 7px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    width: '100%', padding: '6px 0',
                    border: '1.5px dashed var(--border)', borderRadius: 7,
                    background: 'transparent', color: 'var(--text2)',
                    cursor: 'pointer', fontSize: 11,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  {t('Upload TTF / OTF')}
                </button>
                <button
                  onClick={() => setAdding('google')}
                  style={{
                    display: 'block', width: '100%', padding: '5px 0',
                    border: '1px solid var(--border)', borderRadius: 7,
                    background: 'transparent', color: 'var(--text3)',
                    cursor: 'pointer', fontSize: 11,
                  }}
                >
                  + {t('Google Font')}
                </button>
              </div>
            ) : (
              <div style={{ padding: '0 7px 7px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {adding === 'file' && localFile && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', borderRadius: 6,
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    fontSize: 11, color: 'var(--text1)',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {localFile.name}
                  </div>
                )}
                <input
                  autoFocus={adding === 'google'}
                  placeholder={t('Display name')}
                  value={addLabel}
                  onChange={e => setAddLabel(e.target.value)}
                  style={inputStyle}
                />
                {adding === 'google' && (
                  <input
                    placeholder={t('Google Font name (e.g. Nunito Sans)')}
                    value={addFamily}
                    onChange={e => setAddFamily(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addFont() }}
                    style={inputStyle}
                  />
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={addFont}
                    disabled={uploading}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: 999,
                      border: 'none', background: 'var(--accent)',
                      color: 'white', cursor: uploading ? 'default' : 'pointer', fontSize: 11, fontWeight: 600,
                      opacity: uploading ? 0.6 : 1,
                    }}
                  >{uploading ? t('Uploading…') : t('Add')}</button>
                  <button
                    onClick={cancelAdding}
                    title={t('Cancel')}
                    style={{
                      padding: '5px 10px', borderRadius: 999,
                      border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text2)',
                      cursor: 'pointer', fontSize: 11,
                    }}
                  >✕</button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function FontOption({ label, css, active, onSelect }: {
  label: string; css: string; active: boolean; onSelect: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onSelect}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        fontFamily: css, fontSize: 13,
        padding: '5px 10px', cursor: 'pointer', border: 'none',
        background: active ? 'var(--accent)' : hover ? 'var(--surface2)' : 'transparent',
        color: active ? 'white' : 'var(--text1)',
        transition: 'background 0.08s',
      }}
    >
      {label}
    </button>
  )
}

// Zeile für eine bereits hinzugefügte eigene Schrift (Datei-Upload oder
// Google-Fonts-Kurzwahl) — als div mit role="button" statt als <button>, da
// das verschachtelte Entfernen-Icon selbst ein echtes <button> ist (kein
// <button> in <button> möglich).
function CustomFontRow({ label, css, active, onSelect, onRemove, removeLabel }: {
  label: string; css: string; active: boolean
  onSelect: () => void; onRemove: () => void; removeLabel: string
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        borderRadius: 7,
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'var(--surface2)',
        padding: '6px 8px',
        cursor: 'pointer',
        transition: 'border-color 0.1s',
      }}
    >
      <span style={{
        flex: 1,
        fontFamily: css,
        fontSize: 14, color: 'var(--text1)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        title={removeLabel}
        style={{
          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
          border: 'none', background: 'transparent',
          color: 'var(--text3)', cursor: 'pointer',
          fontSize: 12, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
    </div>
  )
}

// ─── Shared small toolbar pieces ───────────────────────────────────────────────

export function ToolBtn({ children, active, onClick, title }: {
  children: React.ReactNode; active: boolean; onClick: () => void; title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2px 5px', borderRadius: 5, border: 'none',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'white' : 'var(--text2)',
        cursor: 'pointer', minWidth: 22, height: 22,
        transition: 'all 0.12s',
      }}
    >{children}</button>
  )
}

export function Divider() {
  return <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 1px' }} />
}

export function ColorSwatchSmall({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  return (
    <ColorSwatch value={value} onChange={onChange}
      trigger={(onClick) => (
        <div onClick={onClick} title={title} style={{ width: 18, height: 18, borderRadius: 4, background: value, border: '1px solid var(--border)', cursor: 'pointer' }} />
      )}
    />
  )
}

export function NoBgIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"
        strokeDasharray={active ? '0' : '2.5 1.5'} fill="none" />
      <line x1="2" y1="11" x2="11" y2="2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  const lines =
    align === 'left'   ? [[0,0],[1,0],[0,1],[0.6,1],[0,2],[0.8,2]] :
    align === 'center' ? [[0.1,0],[0.9,0],[0.2,1],[0.8,1],[0,2],[1,2]] :
                         [[0,0],[1,0],[0.4,1],[1,1],[0.2,2],[1,2]]
  return (
    <svg width="12" height="10" viewBox="0 0 10 8">
      {[0,1,2].map(i => (
        <line
          key={i}
          x1={lines[i*2][0]*10} y1={i*4}
          x2={lines[i*2+1][0]*10} y2={i*4}
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

export const selStyle: React.CSSProperties = {
  fontSize: 11, background: 'var(--surface)', color: 'var(--text1)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '2px 6px', cursor: 'pointer', height: 22,
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '4px 7px', borderRadius: 6, fontSize: 11,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text1)', outline: 'none',
  boxSizing: 'border-box',
}
