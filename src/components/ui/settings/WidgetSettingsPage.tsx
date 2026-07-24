'use client'
import { useSettings } from '@/store/settingsStore'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useT } from '@/hooks/useT'
import { TYPE_LABELS } from '@/components/board/TileWrapper'
import type { WidgetType } from '@/types'
import { Row, SectionTitle } from './shared'
import { BUILT_IN_WIDGETS } from './widgetCatalog'
import { useBlobUrl, deleteBlob } from '@/lib/blobStore'

// Note-Bilder werden als Standard-Markdown-Bildsyntax im content-String
// gespeichert (tiptap-markdown serialisiert @tiptap/extension-image über
// prosemirror-markdown's defaultMarkdownSerializer.nodes.image — kein Custom-
// Serialize wie bei PdfRef nötig, siehe NoteWidget.tsx). Referenzen werden
// hier direkt aus content geparst statt in einem separaten Feld dupliziert
// zu werden — content bleibt einzige Quelle der Wahrheit.
const NOTE_IMAGE_RE = /!\[([^\]]*)\]\((idb-blob:\/\/[^)]+)\)/g

function NoteImagesSection() {
  const board        = useBoardStore(selectBoard)
  const updateWidget  = useBoardStore(s => s.updateWidget)
  const t = useT()

  const entries = Object.values(board?.widgets ?? {})
    .filter(w => w.type === 'note')
    .flatMap(w => {
      const content = (w.data.content as string) ?? ''
      return Array.from(content.matchAll(NOTE_IMAGE_RE)).map(m => ({
        wid: w.id, noteTitle: (w.data.title as string) || t('Note'),
        alt: m[1], ref: m[2], match: m[0],
      }))
    })

  if (entries.length === 0)
    return <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0' }}>{t('No images in any note yet.')}</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
      {entries.map((e, i) => (
        <NoteImageThumb key={i} entry={e} onRemove={() => {
          const w = board?.widgets[e.wid]
          if (!w) return
          const content = ((w.data.content as string) ?? '').replace(e.match, '')
          updateWidget(e.wid, { data: { ...w.data, content } })
          deleteBlob(e.ref)
        }} />
      ))}
    </div>
  )
}

function NoteImageThumb({ entry, onRemove }: { entry: { noteTitle: string; ref: string; alt: string }; onRemove: () => void }) {
  const t = useT()
  const resolved = useBlobUrl(entry.ref)
  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {resolved
        ? <img src={resolved} alt={entry.alt} style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: 64, background: 'var(--surface2)' }} />}
      <div style={{ fontSize: 9, color: 'var(--text3)', padding: '3px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.noteTitle}>
        {entry.noteTitle}
      </div>
      <button
        onClick={onRemove}
        title={t('Remove')}
        style={{
          position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1,
        }}
      >×</button>
    </div>
  )
}

// Eigene Unterseite je Widget-Typ (Sidebar → "WIDGETS" → einzelner Eintrag):
// Kopf mit Icon/Name/Beschreibung + Ein/Aus-Schalter, darunter typ-spezifische
// Einstellungen (bisher nur Calendar: vergangene Termine ausblenden + ICS-Quellen).

function CalendarIcsSources() {
  const board        = useBoardStore(selectBoard)
  const updateWidget  = useBoardStore(s => s.updateWidget)
  const t = useT()
  type IcsSrc = { name: string; ids: string[] }

  const entries = Object.values(board?.widgets ?? {})
    .filter(w => w.type === 'calendar')
    .flatMap(w => {
      const srcs = (w.data.icsSources as IcsSrc[]) ?? []
      return srcs.map(src => ({ ...src, wid: w.id, wdata: w.data }))
    })

  if (entries.length === 0)
    return <div style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0' }}>{t('No ICS calendars imported.')}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {entries.map((src, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
          <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{src.ids.length} {src.ids.length !== 1 ? t('events') : t('event')}</span>
          <button
            onClick={() => {
              const idsOut = new Set<string>(src.ids)
              const srcs   = (src.wdata.icsSources as IcsSrc[]) ?? []
              updateWidget(src.wid, {
                data: {
                  ...src.wdata,
                  events:     ((src.wdata.events ?? []) as Array<{ id: string }>).filter(ev => !idsOut.has(ev.id)),
                  icsSources: srcs.filter(s => s.name !== src.name),
                }
              })
            }}
            title={t('Remove')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px 4px', borderRadius: 4, flexShrink: 0, fontSize: 14, lineHeight: 1 }}
          >×</button>
        </div>
      ))}
    </div>
  )
}

export default function WidgetSettingsPage({ type }: { type: WidgetType }) {
  const disabledWidgetTypes = useSettings(s => s.disabledWidgetTypes)
  const toggleWidgetType = useSettings(s => s.toggleWidgetType)
  const statsDisabledTypes = useSettings(s => s.statsDisabledTypes)
  const setSetting = useSettings(s => s.setSetting)
  const calendarFadePastEvents = useSettings(s => s.calendarFadePastEvents)
  const t = useT()
  const entry    = BUILT_IN_WIDGETS.find(w => w.type === type)
  const disabled = disabledWidgetTypes.includes(type)
  const label    = t(TYPE_LABELS[type] ?? type)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0 18px' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: disabled ? 'var(--surface2)' : 'color-mix(in srgb, var(--accent) 12%, var(--surface2))',
          border: `1px solid ${disabled ? 'var(--border)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: disabled ? 'var(--text3)' : 'var(--accent)',
          transition: 'all 0.15s',
        }}>
          {entry?.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text1)' }}>{label}</div>
          {entry && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{t(entry.desc)}</div>}
        </div>
      </div>

      <Row
        label={t('Enabled')}
        desc={t('Show this widget in the add-widget panel and keep existing instances active')}
        value={!disabled}
        onChange={() => toggleWidgetType(type)}
      />

      {(type === 'task' || type === 'water' || type === 'sleep') && (
        <Row
          label={t('Show statistics')}
          desc={t('Show the statistics section inside this widget')}
          value={!statsDisabledTypes.includes(type)}
          onChange={v => setSetting({
            statsDisabledTypes: v
              ? statsDisabledTypes.filter(x => x !== type)
              : [...statsDisabledTypes, type],
          })}
        />
      )}

      {type === 'calendar' && (
        <>
          <SectionTitle>{t('Calendar')}</SectionTitle>
          <Row
            label={t('Fade past events')}
            desc={t('Events that already happened are shown more transparently')}
            value={calendarFadePastEvents}
            onChange={v => setSetting({ calendarFadePastEvents: v })}
          />
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 7 }}>{t('Imported ICS calendars')}</div>
            <CalendarIcsSources />
          </div>
        </>
      )}

      {type === 'note' && (
        <>
          <SectionTitle>{t('Images')}</SectionTitle>
          <NoteImagesSection />
        </>
      )}
    </div>
  )
}
