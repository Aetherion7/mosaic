import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from '@/store/boardStore'
import { makeBoard, defaultWidget } from '@/lib/defaults'
import { executeAiTool, normalizeWidgetData } from '@/lib/ai/tools'
import { registerReader, unregisterReader } from '@/lib/ai/readerRegistry'
import { renderInlineMd } from '@/components/ui/aiShared'

// Grid-Layout statt unendlicher Leinwand: autoPos liest dort window/canvasView,
// die es im Node-Testlauf nicht gibt
function reset() {
  const fresh = makeBoard('Testboard')
  fresh.layoutMode = 'grid'
  useBoardStore.setState({
    boards: { [fresh.id]: fresh },
    currentBoardId: fresh.id,
    trash: [],
    _history: [],
    _future: [],
  })
  return fresh
}

beforeEach(() => { reset() })

// ── Scope-Guard: Widget-Modus darf nur das gepinnte Widget anfassen ──────────

describe('executeAiTool — Pinned-Widget-Scope', () => {
  it('blockiert alle Tools außer update_widget/get_board', async () => {
    const r = await executeAiTool('add_widget', { type: 'note' }, { widgetId: 'w_x' })
    expect(r.result).toMatch(/not available in pinned-widget mode/)
    const r2 = await executeAiTool('delete_widget', { id: 'w_x' }, { widgetId: 'w_x' })
    expect(r2.result).toMatch(/not available/)
    const r3 = await executeAiTool('set_theme', { themeId: 'dark' }, { widgetId: 'w_x' })
    expect(r3.result).toMatch(/not available/)
  })

  it('blockiert update_widget auf fremde Widget-IDs', async () => {
    const w = defaultWidget('note')
    useBoardStore.getState().addWidget(w)
    const other = defaultWidget('note')
    useBoardStore.getState().addWidget(other)
    const r = await executeAiTool('update_widget', { id: other.id, data: { title: 'Hack' } }, { widgetId: w.id })
    expect(r.result).toMatch(/only modify the pinned widget/)
    // Fremdes Widget unverändert
    const board = useBoardStore.getState().boards[useBoardStore.getState().currentBoardId]
    expect(board.widgets[other.id].data.title).not.toBe('Hack')
  })

  it('erlaubt update_widget auf das gepinnte Widget', async () => {
    const w = defaultWidget('note')
    useBoardStore.getState().addWidget(w)
    const r = await executeAiTool('update_widget', { id: w.id, data: { title: 'Neu' } }, { widgetId: w.id })
    expect(r.result).toMatch(/Updated/)
    const board = useBoardStore.getState().boards[useBoardStore.getState().currentBoardId]
    expect(board.widgets[w.id].data.title).toBe('Neu')
  })
})

// ── add_widget / update_widget ───────────────────────────────────────────────

describe('executeAiTool — add_widget', () => {
  it('legt ein Widget mit Daten-Merge an', async () => {
    const r = await executeAiTool('add_widget', { type: 'note', data: { title: 'KI', content: 'Hallo' } })
    expect(r.result).toMatch(/Added note widget/)
    const board = useBoardStore.getState().boards[useBoardStore.getState().currentBoardId]
    const created = Object.values(board.widgets)[0]
    expect(created.type).toBe('note')
    expect(created.data.title).toBe('KI')
    expect(created.data.content).toBe('Hallo')
  })

  it('weist unbekannte Typen ab', async () => {
    const r = await executeAiTool('add_widget', { type: 'diagram' })
    expect(r.result).toMatch(/unknown widget type/)
  })
})

describe('executeAiTool — Undo (K1)', () => {
  it('update_widget erzeugt einen Undo-Schritt; schnelle Folgeänderungen mergen', async () => {
    const w = defaultWidget('note')
    useBoardStore.getState().addWidget(w)
    const before = useBoardStore.getState()._history.length
    await executeAiTool('update_widget', { id: w.id, data: { title: 'A' } })
    await executeAiTool('update_widget', { id: w.id, data: { title: 'B' } })
    const after = useBoardStore.getState()._history.length
    // genau EIN zusätzlicher Schritt (Merge über kind "data:<id>" < 1.5s)
    expect(after).toBe(before + 1)
    useBoardStore.getState().undo()
    const board = useBoardStore.getState().boards[useBoardStore.getState().currentBoardId]
    expect(board.widgets[w.id].data.title).toBe('Note')
  })
})

// ── get_board: ids-Filter + Kappung ──────────────────────────────────────────

describe('executeAiTool — get_board', () => {
  it('filtert auf angefragte ids', async () => {
    const a = defaultWidget('note'); useBoardStore.getState().addWidget(a)
    const b = defaultWidget('timer'); useBoardStore.getState().addWidget(b)
    const r = await executeAiTool('get_board', { ids: [a.id] })
    const parsed = JSON.parse(r.result)
    expect(Object.keys(parsed.widgets)).toEqual([a.id])
  })

  it('kappt sehr lange Strings und blendet fileData aus', async () => {
    const w = defaultWidget('note')
    w.data.content = 'x'.repeat(10_000)
    w.data.fileData = 'idb-blob://sollte-nicht-erscheinen'
    useBoardStore.getState().addWidget(w)
    const r = await executeAiTool('get_board', {})
    const parsed = JSON.parse(r.result)
    const data = parsed.widgets[w.id].data
    expect(data.content.length).toBeLessThan(4200)
    expect(data.content).toMatch(/truncated, 10000 chars/)
    expect(data.fileData).toBeUndefined()
  })

  it('liefert im Widget-Scope automatisch nur das gepinnte Widget', async () => {
    const a = defaultWidget('note'); useBoardStore.getState().addWidget(a)
    const b = defaultWidget('timer'); useBoardStore.getState().addWidget(b)
    const r = await executeAiTool('get_board', {}, { widgetId: b.id })
    const parsed = JSON.parse(r.result)
    expect(Object.keys(parsed.widgets)).toEqual([b.id])
  })
})

// ── highlight_in_reader: Registry-Anbindung + Guards ─────────────────────────

describe('executeAiTool — highlight_in_reader', () => {
  it('meldet Fehler, wenn das Reader-Widget nicht auf dem Bildschirm geladen ist', async () => {
    const w = defaultWidget('reader'); useBoardStore.getState().addWidget(w)
    const r = await executeAiTool('highlight_in_reader', { id: w.id, query: 'muss', color: '#52b5d4' })
    expect(r.result).toMatch(/no document loaded/)
  })

  it('lehnt Nicht-Reader-Widgets ab', async () => {
    const w = defaultWidget('note'); useBoardStore.getState().addWidget(w)
    const r = await executeAiTool('highlight_in_reader', { id: w.id, query: 'x', color: '#ffd166' })
    expect(r.result).toMatch(/not a reader/)
  })

  it('ruft den registrierten Highlighter auf und meldet die Trefferzahl', async () => {
    const w = defaultWidget('reader'); useBoardStore.getState().addWidget(w)
    registerReader(w.id, { highlightAll: async (q, c) => (q === 'muss' && c === '#52b5d4' ? 3 : 0) })
    const r = await executeAiTool('highlight_in_reader', { id: w.id, query: 'muss', color: '#52b5d4' })
    unregisterReader(w.id)
    expect(r.result).toMatch(/Highlighted 3 occurrence/)
    expect(r.summary).toContain('3×')
  })

  it('blockiert im Pinned-Modus fremde Reader-IDs, erlaubt das gepinnte', async () => {
    const a = defaultWidget('reader'); useBoardStore.getState().addWidget(a)
    const b = defaultWidget('reader'); useBoardStore.getState().addWidget(b)
    registerReader(a.id, { highlightAll: async () => 1 })
    const denied = await executeAiTool('highlight_in_reader', { id: a.id, query: 'x', color: '#ffd166' }, { widgetId: b.id })
    expect(denied.result).toMatch(/only modify the pinned widget/)
    const ok = await executeAiTool('highlight_in_reader', { id: a.id, query: 'x', color: '#ffd166' }, { widgetId: a.id })
    unregisterReader(a.id)
    expect(ok.result).toMatch(/Highlighted 1/)
  })
})

// ── normalizeWidgetData: Spreadsheet-Zellen härten ───────────────────────────

describe('normalizeWidgetData', () => {
  it('koerziert numerische v, verpackt nackte Werte, normalisiert Schlüssel', () => {
    const out = normalizeWidgetData('spreadsheet', {
      cells: { 'a1': { v: 1.7 }, 'B2': 42, 'C3': { v: '=SUM(A1:B2)', b: true } },
    }) as { cells: Record<string, { v: string; b?: boolean }> }
    expect(out.cells.A1).toEqual({ v: '1.7' })
    expect(out.cells.B2).toEqual({ v: '42' })
    expect(out.cells.C3).toEqual({ v: '=SUM(A1:B2)', b: true })
  })

  it('lässt Nicht-Spreadsheet-Daten unverändert', () => {
    const data = { title: 'x', cells: { A1: 1 } }
    expect(normalizeWidgetData('note', data)).toBe(data)
  })
})

// ── renderInlineMd: Mini-Markdown der Chat-Antworten ─────────────────────────

describe('renderInlineMd', () => {
  it('rendert **fett**, *kursiv* und `code` als Elemente', () => {
    const out = renderInlineMd('a **b** und *c* mit `d`')
    const types = out.map(n => (typeof n === 'string' ? 'text' : (n as { type: string }).type))
    expect(types).toEqual(['text', 'strong', 'text', 'em', 'text', 'code'])
  })

  it('lässt Text ohne Markdown unangetastet', () => {
    expect(renderInlineMd('nur text')).toEqual(['nur text'])
  })
})
