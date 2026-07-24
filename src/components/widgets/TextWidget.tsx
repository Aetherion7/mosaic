'use client'
import { useRef, useEffect, useState } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { createPortal } from 'react-dom'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { saveBlob, deleteBlob } from '@/lib/blobStore'
import { customFontStack } from '@/lib/fonts'
import { useT } from '@/hooks/useT'
import type { Widget, TextData } from '@/types'

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72]

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

function getFontCss(value: string): string {
  if (value?.startsWith('custom:')) {
    return `"${value.slice(7)}", system-ui, sans-serif`
  }
  const builtin = FONT_FAMILIES.find(f => f.value === value)
  if (builtin) return builtin.css
  // Sonst: eine ID aus dem globalen, dateibasierten Schriften-System —
  // dessen FontFace wird zentral von CustomFontLoader.tsx geladen.
  return value ? customFontStack(value) : 'system-ui, sans-serif'
}

// ─── Font Picker ──────────────────────────────────────────────────────────────

function FontPicker({ value, onChange }: {
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
                      flex: 1, padding: '5px 0', borderRadius: 6,
                      border: 'none', background: 'var(--accent)',
                      color: 'white', cursor: uploading ? 'default' : 'pointer', fontSize: 11, fontWeight: 600,
                      opacity: uploading ? 0.6 : 1,
                    }}
                  >{uploading ? t('Uploading…') : t('Add')}</button>
                  <button
                    onClick={cancelAdding}
                    title={t('Cancel')}
                    style={{
                      padding: '5px 10px', borderRadius: 6,
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

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function TextWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const mode = useUIStore(s => s.mode)
  const d = widget.data
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const [toolbarH, setToolbarH] = useState(0)

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      setCompact((entries[0]?.contentRect.height ?? 999) < 150)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Im Compact-Modus schwebt die Toolbar über dem Text — Höhe messen, damit der
  // Textbereich (inkl. Platzhalter) darunter beginnt und immer sichtbar bleibt.
  useEffect(() => {
    const el = toolbarRef.current
    if (!el) { setToolbarH(0); return }
    const obs = new ResizeObserver(entries => {
      setToolbarH(entries[0]?.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [mode, compact])

  useEffect(() => {
    const id = 'gfonts-textwidget'
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

  function patch(update: Record<string, unknown>) {
    updateTaskData(widget.id, update)
  }

  const palette: string[] = d.colorPalette ?? []

  function addToPalette() {
    const color = d.color
    if (!color || palette.includes(color)) return
    patch({ colorPalette: [...palette, color] })
  }

  function removeFromPalette(color: string) {
    patch({ colorPalette: palette.filter((c: string) => c !== color) })
  }

  const textStyle: React.CSSProperties = {
    fontSize:           d.fontSize,
    fontWeight:         d.fontWeight,
    fontStyle:          d.fontStyle,
    textDecoration:     d.textDecoration ?? 'none',
    textAlign:          d.textAlign,
    color:              d.color,
    fontFamily:         getFontCss(d.fontFamily),
    lineHeight:         d.lineHeight,
    width:              '100%',
    textShadow:         d.textShadow
                          ? `${d.textShadowX ?? 1}px ${d.textShadowY ?? 2}px ${d.textShadowBlur ?? 6}px ${d.textShadowColor ?? '#000000'}`
                          : undefined,
    WebkitTextStroke:   d.textStroke
                          ? `${d.textStrokeWidth ?? 1}px ${d.textStrokeColor ?? '#000000'}`
                          : undefined,
  }

  return (
    <div
      ref={outerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', position: 'relative' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {mode === 'edit' && (
        <div ref={toolbarRef} style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
          padding: '4px 6px', borderRadius: 8,
          background: compact
            ? 'color-mix(in srgb, var(--surface2) 92%, transparent)'
            : 'var(--surface2)',
          border: '1px solid var(--border)',
          backdropFilter: compact ? 'blur(8px)' : undefined,
          WebkitBackdropFilter: compact ? 'blur(8px)' : undefined,
          flexShrink: compact ? undefined : 0,
          ...(compact ? {
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          } : {}),
        }}>

          {/* Font family – custom picker with preview */}
          <FontPicker
            value={d.fontFamily ?? 'inter'}
            onChange={v => patch({ fontFamily: v })}
          />

          <Divider />

          {/* Font size */}
          <select
            value={d.fontSize}
            onChange={e => patch({ fontSize: Number(e.target.value) })}
            style={selStyle}
            title={t('Font size')}
          >
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <Divider />

          {/* Bold */}
          <ToolBtn
            active={d.fontWeight === 'bold'}
            onClick={() => patch({ fontWeight: d.fontWeight === 'bold' ? 'normal' : 'bold' })}
            title={t('Bold')}
          >
            <span style={{ fontWeight: 700, fontSize: 13 }}>B</span>
          </ToolBtn>

          {/* Italic */}
          <ToolBtn
            active={d.fontStyle === 'italic'}
            onClick={() => patch({ fontStyle: d.fontStyle === 'italic' ? 'normal' : 'italic' })}
            title={t('Italic')}
          >
            <span style={{ fontStyle: 'italic', fontSize: 13 }}>I</span>
          </ToolBtn>

          {/* Underline */}
          <ToolBtn
            active={(d.textDecoration ?? 'none') === 'underline'}
            onClick={() => patch({ textDecoration: (d.textDecoration ?? 'none') === 'underline' ? 'none' : 'underline' })}
            title={t('Underline')}
          >
            <span style={{ textDecoration: 'underline', fontSize: 13 }}>U</span>
          </ToolBtn>

          <Divider />

          {/* Align */}
          {(['left', 'center', 'right'] as const).map(align => (
            <ToolBtn
              key={align}
              active={d.textAlign === align}
              onClick={() => patch({ textAlign: align })}
              title={align === 'left' ? t('Left') : align === 'center' ? t('Center') : t('Right')}
            >
              <AlignIcon align={align} />
            </ToolBtn>
          ))}

          <Divider />

          {/* Line height */}
          <select
            value={d.lineHeight}
            onChange={e => patch({ lineHeight: Number(e.target.value) })}
            style={selStyle}
            title={t('Line height')}
          >
            {[1, 1.2, 1.4, 1.6, 1.8, 2, 2.5].map(v => (
              <option key={v} value={v}>{v}×</option>
            ))}
          </select>

          <Divider />

          {/* Color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <ColorSwatch
              value={d.color.startsWith('#') ? d.color : '#000000'}
              onChange={v => patch({ color: v })}
              trigger={(onClick) => (
                <div onClick={onClick} title={t('Text color')} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 1,
                  padding: '3px 5px', borderRadius: 5,
                  minWidth: 22, height: 22, cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, color: d.color }}>A</span>
                  <div style={{ width: 13, height: 3, background: d.color, borderRadius: 1 }} />
                </div>
              )}
            />

            {palette.map((c: string) => (
              <button
                key={c}
                onClick={() => patch({ color: c })}
                onContextMenu={e => { e.preventDefault(); removeFromPalette(c) }}
                title={`${c} (${t('right-click to remove')})`}
                style={{
                  width: 18, height: 18, borderRadius: 4, border: 'none',
                  background: c, cursor: 'pointer', flexShrink: 0,
                  outline: d.color === c ? '2px solid var(--accent)' : '2px solid transparent',
                  outlineOffset: 1,
                }}
              />
            ))}

            <button
              onClick={addToPalette}
              title={t('Add current color to palette')}
              style={{
                width: 18, height: 18, borderRadius: 4, border: '1.5px dashed var(--border)',
                background: 'transparent', color: 'var(--text3)',
                cursor: 'pointer', fontSize: 14, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >+</button>
          </div>

          <Divider />

          {/* Text shadow */}
          <ToolBtn
            active={!!d.textShadow}
            onClick={() => patch({ textShadow: !d.textShadow })}
            title={t('Text shadow')}
          >
            <span style={{ fontSize: 12, fontWeight: 700, textShadow: '1px 2px 3px rgba(0,0,0,0.9)' }}>S</span>
          </ToolBtn>
          {d.textShadow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <ColorSwatchSmall
                value={d.textShadowColor ?? '#000000'}
                onChange={v => patch({ textShadowColor: v })}
                title={t('Shadow color')}
              />
              <select
                value={d.textShadowBlur ?? 6}
                onChange={e => patch({ textShadowBlur: Number(e.target.value) })}
                style={selStyle}
                title={t('Blur')}
              >
                {[0, 2, 4, 6, 8, 12, 16, 24].map(v => <option key={v} value={v}>{v}px</option>)}
              </select>
              <select
                value={d.textShadowX ?? 1}
                onChange={e => patch({ textShadowX: Number(e.target.value) })}
                style={selStyle}
                title={t('X offset')}
              >
                {[-6, -4, -2, -1, 0, 1, 2, 4, 6].map(v => <option key={v} value={v}>x{v}</option>)}
              </select>
              <select
                value={d.textShadowY ?? 2}
                onChange={e => patch({ textShadowY: Number(e.target.value) })}
                style={selStyle}
                title={t('Y offset')}
              >
                {[-6, -4, -2, -1, 0, 1, 2, 4, 6].map(v => <option key={v} value={v}>y{v}</option>)}
              </select>
            </div>
          )}

          <Divider />

          {/* Text stroke */}
          <ToolBtn
            active={!!d.textStroke}
            onClick={() => patch({ textStroke: !d.textStroke })}
            title={t('Text outline (stroke)')}
          >
            <span style={{ fontSize: 12, fontWeight: 700, WebkitTextStroke: '0.6px currentColor' }}>O</span>
          </ToolBtn>
          {d.textStroke && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <ColorSwatchSmall
                value={d.textStrokeColor ?? '#000000'}
                onChange={v => patch({ textStrokeColor: v })}
                title={t('Outline color')}
              />
              <select
                value={d.textStrokeWidth ?? 1}
                onChange={e => patch({ textStrokeWidth: Number(e.target.value) })}
                style={selStyle}
                title={t('Outline width')}
              >
                {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}px</option>)}
              </select>
            </div>
          )}

          <Divider />

          {/* No background */}
          <ToolBtn
            active={!!d.noBg}
            onClick={() => patch({ noBg: !d.noBg })}
            title={t('Hide widget background')}
          >
            <NoBgIcon active={!!d.noBg} />
          </ToolBtn>

        </div>
      )}

      {/* Text area */}
      {mode === 'edit' ? (
        <textarea
          ref={textareaRef}
          value={d.content}
          onChange={e => patch({ content: e.target.value })}
          placeholder={t('Enter text here…')}
          style={{
            ...textStyle,
            flex: 1, minHeight: 0, resize: 'none',
            background: 'transparent', border: 'none', outline: 'none',
            padding: '2px 4px',
            marginTop: compact ? toolbarH + 4 : 0,
            color: d.color.startsWith('var') ? undefined : d.color,
          }}
        />
      ) : (
        <div style={{
          ...textStyle,
          flex: 1, padding: '2px 4px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          overflowY: 'auto',
        }}>
          {d.content || <span style={{ opacity: 0.3 }}>{t('No text')}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ToolBtn({ children, active, onClick, title }: {
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

function Divider() {
  return <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0, margin: '0 1px' }} />
}

function ColorSwatchSmall({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  return (
    <ColorSwatch value={value} onChange={onChange}
      trigger={(onClick) => (
        <div onClick={onClick} title={title} style={{ width: 18, height: 18, borderRadius: 4, background: value, border: '1px solid var(--border)', cursor: 'pointer' }} />
      )}
    />
  )
}

function NoBgIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"
        strokeDasharray={active ? '0' : '2.5 1.5'} fill="none" />
      <line x1="2" y1="11" x2="11" y2="2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
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

const selStyle: React.CSSProperties = {
  fontSize: 11, background: 'var(--surface)', color: 'var(--text1)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '2px 6px', cursor: 'pointer', height: 22,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '4px 7px', borderRadius: 6, fontSize: 11,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text1)', outline: 'none',
  boxSizing: 'border-box',
}
