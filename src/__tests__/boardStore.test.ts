import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from '@/store/boardStore'
import { useSettings } from '@/store/settingsStore'
import { makeBoard, defaultWidget } from '@/lib/defaults'

// Store vor jedem Test auf einen sauberen Stand bringen
function reset() {
  const fresh = makeBoard('Testboard')
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

describe('createBoard', () => {
  it('nutzt das Standard-Theme aus den Einstellungen', () => {
    useSettings.setState({ defaultThemeId: 'dark' })
    const id = useBoardStore.getState().createBoard('Neu')
    const b = useBoardStore.getState().boards[id]
    expect(b.name).toBe('Neu')
    expect(b.themeId).toBe('dark')
    expect(useBoardStore.getState().currentBoardId).toBe(id)
  })

  it('fällt bei unbekanntem Standard-Theme auf dark zurück', () => {
    useSettings.setState({ defaultThemeId: 'gibt-es-nicht' })
    const id = useBoardStore.getState().createBoard('Neu')
    expect(useBoardStore.getState().boards[id].themeId).toBe('dark')
    useSettings.setState({ defaultThemeId: 'dark' })
  })
})

describe('duplicateBoard', () => {
  it('vergibt frisches createdAt und übernimmt Pin nicht', () => {
    const s = useBoardStore.getState()
    const srcId = s.currentBoardId
    useBoardStore.setState(st => ({
      boards: { ...st.boards, [srcId]: { ...st.boards[srcId], pinned: true, createdAt: 1000 } },
    }))
    useBoardStore.getState().duplicateBoard(srcId)
    const copy = Object.values(useBoardStore.getState().boards).find(b => b.id !== srcId)!
    // Englisch ist die App-Default-Sprache — Suffix folgt der aktuellen Sprache (i18n)
    expect(copy.name).toBe('Testboard (Copy)')
    expect(copy.pinned).toBe(false)
    expect(copy.createdAt).toBeGreaterThan(1000)
  })

  it('vergibt neue Widget-IDs', () => {
    const s = useBoardStore.getState()
    const w = defaultWidget('note')
    s.addWidget(w)
    s.duplicateBoard(s.currentBoardId)
    const copy = Object.values(useBoardStore.getState().boards).find(b => b.id !== s.currentBoardId)!
    expect(Object.keys(copy.widgets)).toHaveLength(1)
    expect(Object.keys(copy.widgets)[0]).not.toBe(w.id)
  })
})

describe('Papierkorb', () => {
  it('deleteBoard verschiebt in den Papierkorb statt hart zu löschen', () => {
    const id = useBoardStore.getState().createBoard('Weg damit')
    useBoardStore.getState().deleteBoard(id)
    const st = useBoardStore.getState()
    expect(st.boards[id]).toBeUndefined()
    expect(st.trash.some(t => t.board.id === id)).toBe(true)
  })

  it('restoreBoard holt ein Board zurück', () => {
    const id = useBoardStore.getState().createBoard('Zurückholen')
    useBoardStore.getState().deleteBoard(id)
    useBoardStore.getState().restoreBoard(id)
    const st = useBoardStore.getState()
    expect(st.boards[id]?.name).toBe('Zurückholen')
    expect(st.trash.some(t => t.board.id === id)).toBe(false)
  })

  it('purgeBoard und emptyTrash löschen endgültig', () => {
    const a = useBoardStore.getState().createBoard('A')
    const b = useBoardStore.getState().createBoard('B')
    useBoardStore.getState().deleteBoard(a)
    useBoardStore.getState().deleteBoard(b)
    useBoardStore.getState().purgeBoard(a)
    expect(useBoardStore.getState().trash).toHaveLength(1)
    useBoardStore.getState().emptyTrash()
    expect(useBoardStore.getState().trash).toHaveLength(0)
  })

  it('das letzte Board wird durch ein frisches ersetzt', () => {
    const st = useBoardStore.getState()
    st.deleteBoard(st.currentBoardId)
    const after = useBoardStore.getState()
    expect(Object.keys(after.boards)).toHaveLength(1)
    expect(after.boards[after.currentBoardId]).toBeDefined()
  })
})

describe('Undo/Redo', () => {
  it('macht Widget-Löschen rückgängig', () => {
    const s = useBoardStore.getState()
    const w = defaultWidget('note')
    s.addWidget(w)
    useBoardStore.getState().deleteWidget(w.id)
    expect(Object.keys(useBoardStore.getState().boards[s.currentBoardId].widgets)).toHaveLength(0)
    useBoardStore.getState().undo()
    expect(useBoardStore.getState().boards[s.currentBoardId].widgets[w.id]).toBeDefined()
    useBoardStore.getState().redo()
    expect(Object.keys(useBoardStore.getState().boards[s.currentBoardId].widgets)).toHaveLength(0)
  })

  it('stellt Hintergrund-Änderungen wieder her', () => {
    const s = useBoardStore.getState()
    const before = s.boards[s.currentBoardId].bg.color
    s.setBackground({ color: '#123456' })
    expect(useBoardStore.getState().boards[s.currentBoardId].bg.color).toBe('#123456')
    useBoardStore.getState().undo()
    expect(useBoardStore.getState().boards[s.currentBoardId].bg.color).toBe(before)
  })

  it('fasst schnelle Hintergrund-Folgeänderungen zu einem Schritt zusammen', () => {
    const s = useBoardStore.getState()
    const before = s.boards[s.currentBoardId].bg.color
    s.setBackground({ color: '#111111' })
    useBoardStore.getState().setBackground({ color: '#222222' })
    useBoardStore.getState().setBackground({ color: '#333333' })
    useBoardStore.getState().undo()
    expect(useBoardStore.getState().boards[s.currentBoardId].bg.color).toBe(before)
  })

  it('überspringt Einträge gelöschter Boards', () => {
    const first = useBoardStore.getState().currentBoardId
    const id = useBoardStore.getState().createBoard('Temp')
    useBoardStore.getState().addWidget(defaultWidget('note'))  // History-Eintrag für Temp
    useBoardStore.getState().deleteBoard(id)
    useBoardStore.getState().switchBoard(first)
    // Undo darf nicht hängen bleiben oder das gelöschte Board anfassen
    useBoardStore.getState().undo()
    expect(useBoardStore.getState().boards[id]).toBeUndefined()
  })
})

describe('transferWidget', () => {
  it('verschiebt ein Widget mit Originalgröße auf ein anderes Board', () => {
    const s = useBoardStore.getState()
    const srcId = s.currentBoardId
    const w = defaultWidget('note', { col: 3, row: 3, colSpan: 5, rowSpan: 3 })
    s.addWidget(w)
    const targetId = useBoardStore.getState().createBoard('Ziel')
    useBoardStore.getState().switchBoard(srcId)
    useBoardStore.getState().transferWidget(w.id, targetId, false)
    const st = useBoardStore.getState()
    expect(st.boards[srcId].widgets[w.id]).toBeUndefined()
    const moved = Object.values(st.boards[targetId].widgets)[0]
    expect(moved).toBeDefined()
    expect(moved.pos.colSpan).toBe(5)
    expect(moved.pos.rowSpan).toBe(3)
  })

  it('kopiert ohne das Original zu entfernen', () => {
    const s = useBoardStore.getState()
    const srcId = s.currentBoardId
    const w = defaultWidget('note')
    s.addWidget(w)
    const targetId = useBoardStore.getState().createBoard('Ziel')
    useBoardStore.getState().switchBoard(srcId)
    useBoardStore.getState().transferWidget(w.id, targetId, true)
    const st = useBoardStore.getState()
    expect(st.boards[srcId].widgets[w.id]).toBeDefined()
    expect(Object.keys(st.boards[targetId].widgets)).toHaveLength(1)
  })

  it('ignoriert Transfer auf das eigene Board', () => {
    const s = useBoardStore.getState()
    const w = defaultWidget('note')
    s.addWidget(w)
    useBoardStore.getState().transferWidget(w.id, s.currentBoardId, false)
    expect(useBoardStore.getState().boards[s.currentBoardId].widgets[w.id]).toBeDefined()
  })
})

describe('setBoardFolder', () => {
  it('setzt und entfernt die Ordner-Zuordnung', () => {
    const s = useBoardStore.getState()
    const id = s.currentBoardId
    s.setBoardFolder(id, '  Arbeit  ')
    expect(useBoardStore.getState().boards[id].folder).toBe('Arbeit')
    useBoardStore.getState().setBoardFolder(id, null)
    expect(useBoardStore.getState().boards[id].folder).toBeUndefined()
  })

  it('ändert lastEdited nicht (reine Organisation)', () => {
    const s = useBoardStore.getState()
    const id = s.currentBoardId
    const before = s.boards[id].lastEdited
    s.setBoardFolder(id, 'Privat')
    expect(useBoardStore.getState().boards[id].lastEdited).toBe(before)
  })
})
