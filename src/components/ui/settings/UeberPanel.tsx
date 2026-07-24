'use client'
import { useT } from '@/hooks/useT'
import { SectionTitle } from './shared'
import { APP_VERSION } from '@/lib/version'

// Externe Links öffnen in einem echten Tab/Fenster außerhalb der App —
// im Electron-Build fängt main.js das über setWindowOpenHandler ab und
// reicht es an den System-Browser weiter, statt es im App-Fenster zu laden.
// glow: optionale Marken-Tönung (Ko-fi-Orange, GitHub-Sponsors-Pink, Stern-Gold)
// für die Support-Zeilen — dieselbe Hover-Wirkung wie bei den Spenden-Karten
// am Ende der Tutorial-Tour. Ohne glow bleibt es beim neutralen Akzent-Hover
// (Project-Sektion oben: Quellcode/Issue-Link).
function LinkRow({ href, icon, label, sub, glow }: { href: string; icon: React.ReactNode; label?: string; sub: string; glow?: string }) {
  const restStyle = glow
    ? { background: `color-mix(in srgb, ${glow} 10%, var(--surface2))`, borderColor: `color-mix(in srgb, ${glow} 35%, var(--border))`, boxShadow: `0 2px 10px color-mix(in srgb, ${glow} 12%, transparent)`, transform: 'none' }
    : { background: 'var(--surface2)', borderColor: 'var(--border)', boxShadow: 'none', transform: 'none' }
  const hoverStyle = glow
    ? { background: `color-mix(in srgb, ${glow} 20%, var(--surface2))`, borderColor: `color-mix(in srgb, ${glow} 60%, var(--border))`, boxShadow: `0 6px 16px color-mix(in srgb, ${glow} 25%, transparent)`, transform: 'translateY(-1px)' }
    : { background: 'color-mix(in srgb, var(--accent) 8%, var(--surface2))', borderColor: 'var(--border)', boxShadow: 'none', transform: 'none' }
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9,
        border: `1px solid ${restStyle.borderColor}`, background: restStyle.background, textDecoration: 'none',
        marginBottom: 6, boxShadow: restStyle.boxShadow, transform: restStyle.transform,
        transition: 'background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.background = hoverStyle.background; el.style.borderColor = hoverStyle.borderColor
        el.style.boxShadow = hoverStyle.boxShadow; el.style.transform = hoverStyle.transform
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLAnchorElement
        el.style.background = restStyle.background; el.style.borderColor = restStyle.borderColor
        el.style.boxShadow = restStyle.boxShadow; el.style.transform = restStyle.transform
      }}
    >
      <span style={{ color: 'var(--accent)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)', minHeight: 15 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{sub}</div>
      </div>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0 }}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </a>
  )
}

export default function UeberPanel() {
  const t = useT()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mosaiclogo.png" alt="mosaic" width={52} height={52} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 400, color: 'var(--text1)', fontFamily: 'Guavine, sans-serif', lineHeight: 1, marginBottom: 4 }}>mosaic</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('Version')} {APP_VERSION}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, padding: '3px 8px', borderRadius: 20, background: 'color-mix(in srgb, var(--accent) 12%, var(--surface2))', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{t('Local-first · No account needed')}</span>
          </div>
        </div>
      </div>

      <SectionTitle>{t('Project')}</SectionTitle>
      <LinkRow
        href="https://github.com/Aetherion7/mosaic"
        label={t('Source code on GitHub')}
        sub={t('Report bugs, request features, or contribute')}
        icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.11.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.2.67.79.55A10.52 10.52 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5z"/></svg>}
      />
      <LinkRow
        href="https://github.com/Aetherion7/mosaic/issues"
        label={t('Report an issue')}
        sub={t('Found a bug or have an idea?')}
        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
      />

      <SectionTitle>{t('Support the project')}</SectionTitle>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 8 }}>
        {t('mosaic is free to use. If it\'s useful to you, a donation helps cover the time that goes into it — no pressure at all.')}
      </div>
      <LinkRow
        href="https://ko-fi.com/mosaicboard"
        sub={t('One-time or monthly support')}
        glow="#ff6154"
        // eslint-disable-next-line @next/next/no-img-element
        icon={<img src="/badges/kofi.png" alt="Ko-fi" style={{ height: 22, width: 'auto' }} />}
      />
      <LinkRow
        href="https://github.com/sponsors/Aetherion7"
        label="GitHub Sponsors"
        sub={t('Sponsor development directly on GitHub')}
        glow="#db61a2"
        // github.png ist ein weißer Kreis mit transparent ausgeschnittenem
        // Octocat — braucht einen FEST dunklen Hintergrund (nicht vom Theme
        // abhängig), sonst verschwindet er auf hellen Themes.
        icon={
          <span style={{ background: '#0d1117', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badges/github.png" alt="GitHub" style={{ width: '78%', height: '78%' }} />
          </span>
        }
      />
      <LinkRow
        href="https://github.com/Aetherion7/mosaic"
        label={t('Star on GitHub')}
        sub={t('Costs nothing, helps a lot')}
        glow="#eac54f"
        // eslint-disable-next-line @next/next/no-img-element
        icon={<img src="/badges/github-star.webp" alt="" style={{ width: 18, height: 18 }} />}
      />

      <SectionTitle>{t('Technologies')}</SectionTitle>
      {[
        ['Next.js 16',      t('React framework')],
        ['React 19',        t('UI library')],
        ['Zustand',         t('State management')],
        ['Framer Motion',   t('Animations')],
        ['Tiptap',          t('Rich text editor')],
        ['dnd-kit',         t('Drag & drop')],
        ['IndexedDB',       t('Local data storage')],
      ].map(([name, role]) => (
        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: 'var(--text1)' }}>{name}</span>
          <span style={{ color: 'var(--text3)' }}>{role}</span>
        </div>
      ))}

      <SectionTitle>{t('License')}</SectionTitle>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
        {t('mosaic is source-available under the PolyForm Noncommercial License 1.0.0: free to use and modify for personal, educational or nonprofit purposes — not for resale or commercial hosting.')}
        {' '}
        <a href="https://github.com/Aetherion7/mosaic/blob/main/LICENSE.md" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          {t('Read the full license')}
        </a>
      </div>
    </div>
  )
}
