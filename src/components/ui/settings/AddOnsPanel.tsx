'use client'
import { useState } from 'react'
import { useSettings } from '@/store/settingsStore'
import type { InstalledPlugin } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import { SectionTitle, AddCardButton, TemplateBox, PLUGIN_JSON_TEMPLATE } from './shared'

// Ganz unten in der Einstellungs-Sidebar: eigene, per JSON installierte
// Widget-Plugins verwalten (Liste + Installationsformular).
export default function AddOnsPanel() {
  const installedPlugins = useSettings(s => s.installedPlugins)
  const installPlugin = useSettings(s => s.installPlugin)
  const uninstallPlugin = useSettings(s => s.uninstallPlugin)
  const t = useT()
  const [showInstallForm, setShowInstallForm] = useState(false)
  const [jsonInput,  setJsonInput]  = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [preview,    setPreview]    = useState<InstalledPlugin | null>(null)

  function handleJsonChange(val: string) {
    setJsonInput(val)
    setParseError(null)
    setPreview(null)
    if (!val.trim()) return
    try {
      const obj = JSON.parse(val)
      if (!obj.id || !obj.name || !obj.icon) {
        setParseError(t('Required fields missing: id, name, icon'))
        return
      }
      // embedUrl landet als iframe-src (PluginWidget.tsx) — nur https zulassen.
      // javascript:/data:/file:-URIs abfangen, bevor sie überhaupt gespeichert werden.
      if (obj.embedUrl && !/^https:\/\//i.test(String(obj.embedUrl))) {
        setParseError(t('embedUrl must start with https://'))
        return
      }
      setPreview({
        id:       String(obj.id),
        name:     String(obj.name),
        icon:     String(obj.icon),
        desc:     String(obj.desc ?? ''),
        version:  String(obj.version ?? '1.0.0'),
        author:   obj.author   ? String(obj.author)   : undefined,
        embedUrl: obj.embedUrl ? String(obj.embedUrl) : undefined,
      })
    } catch {
      setParseError(t('Invalid JSON'))
    }
  }

  function doInstall() {
    if (!preview) return
    installPlugin(preview)
    setShowInstallForm(false)
    setJsonInput('')
    setPreview(null)
  }

  return (
    <div>
      <SectionTitle>{t('Third-party add-ons')}</SectionTitle>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
        {t('Install your own widget plugins as JSON. Plugins appear in the add-widget panel.')}
      </div>

      {installedPlugins.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', marginBottom: 8 }}>
          <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{p.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {p.desc && <span>{p.desc} · </span>}v{p.version}{p.author ? ` · ${p.author}` : ''}
            </div>
          </div>
          <button onClick={() => uninstallPlugin(p.id)} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #ef444455', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            {t('Remove')}
          </button>
        </div>
      ))}

      {showInstallForm ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface2)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'color-mix(in srgb, var(--accent) 14%, var(--surface))',
              border: '1px solid color-mix(in srgb, var(--accent) 32%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4 L9 4 Q9 1 12 1 Q15 1 15 4 L20 4 L20 9 Q23 9 23 12 Q23 15 20 15 L20 20 L15 20 Q15 17 12 17 Q9 17 9 20 L4 20 L4 15 Q7 15 7 12 Q7 9 4 9 Z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text1)' }}>{t('Install plugin')}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>
                {t('Required fields: "id", "name", "icon" (emoji) — optional "desc", "version", "author", "embedUrl".')}
              </div>
            </div>
            <button onClick={() => { setShowInstallForm(false); setJsonInput(''); setPreview(null); setParseError(null) }} title={t('Close')}
              style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
            </button>
          </div>
          <TemplateBox json={PLUGIN_JSON_TEMPLATE} filename="mosaic-plugin-template.json" onInsert={() => handleJsonChange(PLUGIN_JSON_TEMPLATE)} />
          <textarea
            value={jsonInput}
            onChange={e => handleJsonChange(e.target.value)}
            placeholder={t('Paste JSON here — see the template above for the structure …')}
            rows={8}
            spellCheck={false}
            style={{
              width: '100%', resize: 'vertical', borderRadius: 8,
              border: `1px solid ${parseError ? 'var(--danger)' : 'var(--border)'}`,
              background: 'var(--surface)', color: 'var(--text1)',
              fontSize: 10.5, fontFamily: 'monospace', lineHeight: 1.6, padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {parseError && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{parseError}</div>}
          {preview && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
              <span style={{ fontSize: 22 }}>{preview.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text1)' }}>{preview.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{preview.desc} v{preview.version}{preview.author ? ` · ${preview.author}` : ''}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>✓ {t('Valid')}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowInstallForm(false); setJsonInput(''); setPreview(null); setParseError(null) }}
              style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
              {t('Cancel')}
            </button>
            <button onClick={doInstall} disabled={!preview}
              style={{ fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: preview ? 'pointer' : 'default', opacity: preview ? 1 : 0.4 }}>
              {t('Install')}
            </button>
          </div>
        </div>
      ) : (
        <AddCardButton
          title={t('Add plugin')}
          desc={t('Install a widget plugin as JSON — template included')}
          onClick={() => setShowInstallForm(true)}
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4 L9 4 Q9 1 12 1 Q15 1 15 4 L20 4 L20 9 Q23 9 23 12 Q23 15 20 15 L20 20 L15 20 Q15 17 12 17 Q9 17 9 20 L4 20 L4 15 Q7 15 7 12 Q7 9 4 9 Z"/>
            </svg>
          }
        />
      )}
    </div>
  )
}
