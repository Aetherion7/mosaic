'use client'
import { useState, useRef, useEffect } from 'react'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { useSettings } from '@/store/settingsStore'
import type { CustomTheme, InstalledPlugin } from '@/store/settingsStore'
import { importBlobs } from '@/lib/blobStore'
import { buildFullBackupPayload, buildBoardBackupPayload, downloadJson, boardExportFilename, fullBackupFilename } from '@/lib/backup'
import { useT } from '@/hooks/useT'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { SectionTitle } from './shared'

// Zeigt nur, wie viel Platz mosaics eigene Daten belegen — kein Vergleich
// gegen die Storage-Quota mehr (navigator.storage.estimate()'s `quota` ist
// in der Desktop-App und im Browser gleichermaßen eine große, für Nutzer:innen
// bedeutungslose Zahl, die eher wie "Speicherplatz der ganzen Festplatte"
// wirkt als wie ein sinnvoller Vergleichswert).
function StorageInfo() {
  const [usage, setUsage] = useState<number | null>(null)
  const t = useT()
  const isDesktop = useIsDesktop()

  useEffect(() => {
    if (!navigator.storage?.estimate) return
    navigator.storage.estimate().then(est => setUsage(est.usage ?? null))
  }, [])

  if (usage === null) return null

  const usedMB = (usage / 1024 / 1024).toFixed(1)

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{t(isDesktop ? 'Local storage' : 'Browser storage')}</span>
      <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace' }}>{usedMB} MB</span>
    </div>
  )
}

function formatBackupAge(ts: number, t: (s: string) => string): { text: string; urgent: boolean } {
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days === 0) return { text: t('Today'), urgent: false }
  if (days === 1) return { text: t('Yesterday'), urgent: false }
  if (days < 7)  return { text: t('{n} days ago').replace('{n}', String(days)), urgent: false }
  if (days < 30) { const w = Math.floor(days / 7);  return { text: t(w > 1 ? '{n} weeks ago' : '{n} week ago').replace('{n}', String(w)), urgent: true } }
  const m = Math.floor(days / 30)
  return { text: t(m > 1 ? '{n} months ago' : '{n} month ago').replace('{n}', String(m)), urgent: true }
}

export default function DatenPanel() {
  const boards           = useBoardStore(s => s.boards)
  const currentBoard     = useBoardStore(selectBoard)
  const importBoard      = useBoardStore(s => s.importBoard)
  const importAllBoards  = useBoardStore(s => s.importAllBoards)
  const setSetting       = useSettings(s => s.setSetting)
  const lastExportAt     = useSettings(s => s.lastExportAt)
  const t = useT()
  const isDesktop = useIsDesktop()

  const [clearConfirm, setClearConfirm] = useState(false)
  const [importError,  setImportError]  = useState<string | null>(null)
  const [importOk,     setImportOk]     = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<{
    boards: Record<string, import('@/types').Board>
    settings?: { customThemes?: CustomTheme[]; customTemplates?: unknown[]; installedPlugins?: InstalledPlugin[] }
    collisions: string[]
  } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const boardCount  = Object.keys(boards).length
  const widgetCount = Object.values(boards).reduce((n, b) => n + Object.keys(b.widgets).length, 0)
  const backup      = lastExportAt ? formatBackupAge(lastExportAt, t) : null

  // Vollständiges Backup: Boards + eigene Themes/Vorlagen/Plugins + Binärdaten (Bilder, PDFs)
  async function exportAll() {
    const s       = useSettings.getState()
    const trash   = useBoardStore.getState().trash
    const payload = await buildFullBackupPayload(boards, trash, s)
    downloadJson(payload, fullBackupFilename())
    setSetting({ lastExportAt: Date.now() })
  }

  async function exportCurrentBoard() {
    if (!currentBoard) return
    const payload = await buildBoardBackupPayload(currentBoard)
    downloadJson(payload, boardExportFilename(currentBoard))
    setSetting({ lastExportAt: Date.now() })
  }

  // Minimal structural check so arbitrary JSON can't corrupt the store
  function isBoardLike(b: unknown): boolean {
    return !!b && typeof b === 'object' && !Array.isArray(b)
      && typeof (b as { id?: unknown }).id === 'string'
      && typeof (b as { name?: unknown }).name === 'string'
      && typeof (b as { widgets?: unknown }).widgets === 'object'
      && !Array.isArray((b as { widgets?: unknown }).widgets)
  }

  // Eigene Themes/Vorlagen/Plugins aus einem Backup einspielen (per ID zusammenführen, nichts überschreiben)
  function mergeImportedSettings(imp: NonNullable<NonNullable<typeof pendingImport>['settings']>) {
    const s = useSettings.getState()
    const mergeById = <T extends { id: string }>(cur: T[], add: unknown): T[] =>
      Array.isArray(add) ? [...cur, ...(add as T[]).filter(a => a && typeof a.id === 'string' && !cur.some(c => c.id === a.id))] : cur
    s.setSetting({
      customThemes:     mergeById(s.customThemes,     imp.customThemes),
      customTemplates:  mergeById(s.customTemplates,  imp.customTemplates),
      installedPlugins: mergeById(s.installedPlugins, imp.installedPlugins),
    })
  }

  function applyBoardsImport(
    entries: Record<string, import('@/types').Board>,
    settings?: NonNullable<typeof pendingImport>['settings'],
  ) {
    importAllBoards(entries)
    if (settings) mergeImportedSettings(settings)
    const n = Object.keys(entries).length
    setImportOk(`${n} ${n !== 1 ? t('boards imported') : t('board imported')}${settings ? ` (${t('incl. settings')})` : ''}`)
    setPendingImport(null)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null); setImportOk(null); setPendingImport(null)
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (isBoardLike(data)) {
          importBoard(data)
          setImportOk(`${t('Board')} “${data.name}” ${t('imported')}`)
          return
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          setImportError(t('Unknown format — expected a mosaic JSON file'))
          return
        }
        // Einzelboard-Export mit eingebetteten Binärdaten
        if (data.format === 'mosaic-board' && isBoardLike(data.board)) {
          await importBlobs(data.blobs)
          importBoard(data.board)
          setImportOk(`${t('Board')} “${data.board.name}” ${t('imported')}`)
          return
        }
        // Backup-Format ({format, boards, settings, blobs}) oder altes (nur Board-Record)
        const isBackup   = data.format === 'mosaic-backup' && data.boards && typeof data.boards === 'object'
        const boardsSrc  = isBackup ? data.boards : data
        const settings   = isBackup ? data.settings : undefined
        const entries    = Object.entries(boardsSrc as Record<string, unknown>).filter(([, b]) => isBoardLike(b))
        if (entries.length === 0) {
          setImportError(t('Unknown format — expected a mosaic JSON file'))
          return
        }
        if (isBackup) await importBlobs(data.blobs)
        const toImport   = Object.fromEntries(entries) as Record<string, import('@/types').Board>
        const collisions = Object.keys(toImport).filter(id => boards[id]).map(id => boards[id].name)
        if (collisions.length > 0) {
          // Nicht kommentarlos überschreiben — erst bestätigen lassen
          setPendingImport({ boards: toImport, settings, collisions })
          return
        }
        applyBoardsImport(toImport, settings)
      } catch {
        setImportError(t('Invalid JSON file'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function doClearAll() {
    localStorage.clear()
    indexedDB.deleteDatabase('planboard-store')
    indexedDB.deleteDatabase('planboard-blobs')
    location.reload()
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 16px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text1)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    textAlign: 'left', width: '100%', transition: 'background 0.12s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        {[
          { label: t('Boards'), value: boardCount },
          { label: t('Widgets'), value: widgetCount },
          { label: t('Last backup'), value: backup ? backup.text : '—', accent: backup?.urgent },
        ].map(stat => (
          <div key={stat.label} style={{
            padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)',
            border: `1px solid ${stat.accent ? '#f59e0b44' : 'var(--border)'}`,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: stat.accent ? '#f59e0b' : 'var(--text1)', lineHeight: 1.2 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontWeight: 500 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <StorageInfo />

      <SectionTitle>{t('Export')}</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {currentBoard && (
          <button onClick={exportCurrentBoard} style={btnStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            <span>
              {t('Export current board')}
              <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginTop: 1 }}>“{currentBoard.name}” {t('as JSON')}</span>
            </span>
          </button>
        )}
        <button onClick={exportAll} style={btnStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          <span>
            {t('Export all boards')}
            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginTop: 1 }}>{boardCount} {boardCount !== 1 ? t('boards') : t('board')} {t('as a complete backup')}</span>
          </span>
        </button>
      </div>

      <SectionTitle>{t('Import')}</SectionTitle>
      <button onClick={() => importRef.current?.click()} style={btnStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface3)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        <span>
          {t('Import backup')}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginTop: 1 }}>{t('A single board or a complete backup (JSON)')}</span>
        </span>
      </button>
      <input ref={importRef} type="file" accept=".json,application/json" onChange={handleImport} style={{ display: 'none' }} />
      {importOk   && <div style={{ fontSize: 12, color: 'var(--accent)', padding: '8px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 10%, var(--surface2))', marginTop: 8 }}>✓ {importOk}</div>}
      {importError && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', borderRadius: 8, background: '#ef444410', marginTop: 8 }}>✗ {importError}</div>}
      {pendingImport && (
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid #f59e0b55', background: '#f59e0b10', marginTop: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>
            {pendingImport.collisions.length} {pendingImport.collisions.length !== 1 ? t('existing boards would be overwritten') : t('existing board would be overwritten')}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
            {pendingImport.collisions.slice(0, 5).map(n => `“${n}”`).join(', ')}
            {pendingImport.collisions.length > 5 ? ` ${t('and')} ${pendingImport.collisions.length - 5} ${t('more')}` : ''} —{' '}
            {t('the current state of these boards will be lost.')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => applyBoardsImport(pendingImport.boards, pendingImport.settings)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#1a1200', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {t('Overwrite & import')}
            </button>
            <button onClick={() => setPendingImport(null)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      <SectionTitle>{t('Danger zone')}</SectionTitle>
      {clearConfirm ? (
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid #ef444455', background: '#ef444410' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>{t('Really delete all data?')}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
            {t('This action is')} <strong>{t('irreversible')}</strong>. {t('All boards, widgets and settings will be deleted.')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doClearAll} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {t('Yes, delete everything')}
            </button>
            <button onClick={() => setClearConfirm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid #ef444455', background: '#ef444408' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>{t('Delete all data')}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>{t(isDesktop ? 'Irreversibly deletes all boards, widgets and settings from this device.' : 'Irreversibly deletes all boards, widgets and settings from the browser.')}</div>
          <button onClick={() => setClearConfirm(true)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ef4444', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            {t('Delete all data')}
          </button>
        </div>
      )}
    </div>
  )
}
