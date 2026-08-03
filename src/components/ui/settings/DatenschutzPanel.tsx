'use client'
import { useT } from '@/hooks/useT'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { SectionTitle } from './shared'

// Externe Dienste, die einzelne Widgets kontaktieren — bewusst zentral hier
// gelistet statt einzeln in jedem Widget, damit Nutzer:innen an EINER Stelle
// den vollständigen Überblick haben. mosaic selbst hat keinen eigenen Server;
// diese Aufrufe gehen direkt aus dem Browser an den jeweiligen Drittanbieter.
const EXTERNAL_SERVICES: { widget: string; services: string }[] = [
  { widget: 'Map widget',        services: 'OpenStreetMap tiles (tile.openstreetmap.org) + Nominatim search (nominatim.openstreetmap.org)' },
  { widget: 'Weather widget',    services: 'Open-Meteo (api.open-meteo.com) + Nominatim geocoding (nominatim.openstreetmap.org)' },
  { widget: 'Quicklinks widget', services: 'Favicon lookup via DuckDuckGo (icons.duckduckgo.com)' },
  { widget: 'AI assistant',      services: 'Your chosen provider (e.g. Anthropic, OpenAI) — only if you enable and configure it' },
]

const STORED_DATA_KEYS = [
  ['Boards & widgets', 'IndexedDB', 'planboard-store'],
  ['Files & images',   'IndexedDB', 'planboard-blobs'],
  ['Settings (incl. your AI API key, if set)', 'localStorage', 'planboard-settings'],
  ['Fonts',     'localStorage', 'planboard-settings'],
  ['Google Font shortcuts (Note widget)', 'localStorage', 'planboard-text-google-fonts'],
] as const

export default function DatenschutzPanel() {
  const t = useT()
  const isDesktop = useIsDesktop()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12, background: 'color-mix(in srgb, var(--accent) 8%, var(--surface2))', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', marginBottom: 4 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          mosaic {t('stores')} <strong style={{ color: 'var(--text1)' }}>{t('all data exclusively locally')}</strong> {t(isDesktop
            ? 'on your device — on disk, not in the cloud. mosaic has no server of its own and never collects or transmits your data.'
            : 'in your browser. mosaic has no server of its own and never collects or transmits your data.')}
        </div>
      </div>

      {/* Ehrlicher Hinweis: einige Widgets kontaktieren direkt Drittanbieter
          (Karte, Wetter, Favicons, optional KI) — ohne diesen Absatz wäre der
          Block oben irreführend ("kein Server" ≠ "kein Netzwerkverkehr"). */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12, background: 'color-mix(in srgb, var(--amber, #f59e0b) 8%, var(--surface2))', border: '1px solid color-mix(in srgb, var(--amber, #f59e0b) 25%, transparent)', marginBottom: 4, marginTop: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber, #f59e0b)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text1)' }}>{t('Exception: some widgets need the internet.')}</strong> {t(isDesktop
            ? 'The map, weather and quicklinks widgets fetch data directly from the external services listed below when you use them — and the optional AI assistant sends your messages straight to the provider you configured. None of this ever passes through a mosaic server, because none exists; requests go directly from your device to the respective third party.'
            : 'The map, weather and quicklinks widgets fetch data directly from the external services listed below when you use them — and the optional AI assistant sends your messages straight to the provider you configured. None of this ever passes through a mosaic server, because none exists; requests go directly from your browser to the respective third party.')}
        </div>
      </div>

      <SectionTitle>{t('External services contacted')}</SectionTitle>
      {EXTERNAL_SERVICES.map(({ widget, services }, i) => (
        <div key={widget} style={{ padding: '8px 0', borderBottom: i === EXTERNAL_SERVICES.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 12 }}>
          <div style={{ color: 'var(--text1)', fontWeight: 500, marginBottom: 2 }}>{t(widget)}</div>
          <div style={{ color: 'var(--text3)', fontSize: 11, lineHeight: 1.5 }}>{services}</div>
        </div>
      ))}

      <SectionTitle>{t('Stored data')}</SectionTitle>
      {STORED_DATA_KEYS.map(([label, type, key], i) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i === STORED_DATA_KEYS.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 12, gap: 8 }}>
          <span style={{ color: 'var(--text1)', fontWeight: 500 }}>{t(label)}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>{type}</span>
            <span style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: 11 }}>{key}</span>
          </div>
        </div>
      ))}

      <SectionTitle>{t('Tracking & cookies')}</SectionTitle>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
        {t('No tracking, no cookies, no ads, no analytics — mosaic itself never phones home.')}<br />
        {t('The core (boards, widgets, settings) works fully offline; the map, weather, quicklinks and AI widgets need a connection to their respective service.')}
      </div>
    </div>
  )
}
