'use client'

import { useRef, useState, useMemo, useEffect, useLayoutEffect } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import { evalSafeExpr, buildFormulaFns } from '@/lib/safeFormula'
import type { Widget } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SCell {
  v: string
  b?: boolean; i?: boolean; u?: boolean; s?: boolean
  a?: 'l' | 'c' | 'r'; va?: 't' | 'm' | 'b'
  fc?: string; bg?: string
  fmt?: 'auto' | 'num' | 'int' | 'cur' | 'pct' | 'text'
  dec?: number; fs?: number; wrap?: boolean
  bd?: string  // '' | 'none' | combo of 't'|'r'|'b'|'l'
}
type CellMap = Record<string, SCell>

// ─── Formula engine ───────────────────────────────────────────────────────────

function colToIdx(col: string): number {
  let n = 0
  for (const c of col.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}
function idxToCol(idx: number): string {
  let s = '', i = idx + 1
  while (i > 0) { i--; s = String.fromCharCode(65 + i % 26) + s; i = Math.floor(i / 26) }
  return s
}
function rangeKeys(c1: string, r1: string, c2: string, r2: string): string[] {
  const keys: string[] = []
  for (let r = parseInt(r1); r <= parseInt(r2); r++)
    for (let c = colToIdx(c1.toUpperCase()); c <= colToIdx(c2.toUpperCase()); c++)
      keys.push(`${idxToCol(c)}${r}`)
  return keys
}
function cellComputed(key: string, cells: CellMap, lang: string, vis = new Set<string>()): number | string {
  if (vis.has(key)) return '#CIRC!'
  const cell = cells[key]
  // v kann aus Fremdquellen (KI-Assistent, alte Importe) auch als Zahl ankommen
  const v = cell?.v == null ? '' : String(cell.v)
  if (v.trim() === '') return ''
  if (!v.startsWith('=')) {
    const n = Number(v)
    return isNaN(n) ? v : n
  }
  vis.add(key)
  try { const r = calcExpr(v.slice(1), cells, lang, vis); vis.delete(key); return r }
  catch { vis.delete(key); return '#ERR!' }
}
function calcExpr(raw: string, cells: CellMap, lang: string, vis: Set<string>): number | string {
  let e = raw.trim()
  // Ein einziger Regex-Durchlauf statt zwei getrennter:
  //  - String-Literale ("...") werden unverändert durchgereicht, statt von der
  //    Zellbezug-Ersetzung mit angefasst zu werden (sonst wird z. B. "Q1" in
  //    =CONCATENATE("Q1 report") durch den Wert der Zelle Q1 ersetzt).
  //  - "$"-Anker (A$1, $A1, $A$1) werden erkannt und ignoriert — sie steuern
  //    nur das Ausfüllverhalten (TableWidget adjustFormula), nicht den Wert.
  //  - (?!\s*\() verhindert, dass ein Funktionsname mit Zahl-Suffix wie LOG10
  //    als Zellbezug "Spalte LOG, Zeile 10" fehlinterpretiert wird — ein
  //    Zellbezug steht nie direkt vor einer öffnenden Klammer.
  e = e.replace(
    /"(?:[^"\\]|\\.)*"|\$?([A-Za-z]+)\$?(\d+):\$?([A-Za-z]+)\$?(\d+)(?!\s*\()|\$?\b([A-Za-z]+)\$?(\d+)\b(?!\s*\()/g,
    (m, rc1, rr1, rc2, rr2, sc, sr) => {
      if (m[0] === '"') return m
      if (rc1 !== undefined) {
        const vals = rangeKeys(rc1, rr1, rc2, rr2).map(k => {
          const v = cellComputed(k, cells, lang, vis)
          if (v === '') return 0
          if (typeof v === 'string') return isNaN(+v) ? JSON.stringify(v) : +v
          return v
        })
        return `[${vals.join(',')}]`
      }
      const v = cellComputed(sc.toUpperCase() + sr, cells, lang, vis)
      if (v === '') return '0'
      if (typeof v === 'string') return isNaN(+v) ? JSON.stringify(v) : v
      return String(v)
    }
  )
  const locale = lang === 'de' ? 'de-DE' : 'en-US'
  // Sicherer Tokenizer/Parser statt new Function() — s. src/lib/safeFormula.ts.
  // Cell-Referenzen sind oben bereits zu Literalen aufgelöst; hier steht nur
  // noch eine reine Ausdrucks-Zeichenkette, die NIE als JS ausgeführt wird.
  try {
    const result = evalSafeExpr(e, buildFormulaFns(locale))
    return typeof result === 'boolean' || Array.isArray(result) ? String(result) : result
  } catch { return '#ERR!' }
}

function fmtVal(raw: number | string, cell: SCell, lang: string): string {
  if (typeof raw !== 'number') return String(raw)
  // Division durch 0 / MAX·MIN über eine leere Auswahl liefern rohe
  // Infinity/NaN-Werte — als Fehlercode statt als wörtlichen Text "Infinity"/
  // "NaN" anzeigen, konsistent mit #ERR!/#CIRC! an anderer Stelle.
  if (!Number.isFinite(raw)) return Number.isNaN(raw) ? '#NUM!' : '#DIV/0!'
  const fmt = cell.fmt ?? 'auto'
  const dec = cell.dec
  if (fmt === 'num')  return raw.toFixed(dec ?? 2)
  if (fmt === 'int')  return Math.round(raw).toString()
  if (fmt === 'cur')  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 }).format(raw)
  if (fmt === 'pct')  return (raw * 100).toFixed(dec ?? 1) + '%'
  if (fmt === 'text') return String(raw)
  if (Number.isInteger(raw)) return String(raw)
  return dec !== undefined ? raw.toFixed(dec) : String(parseFloat(raw.toPrecision(10)))
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEF_COL_W = 90
const DEF_ROW_H = 26
const HDR_H     = 24
const ROW_HDR_W = 36

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function TableWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const mode           = useUIStore(s => s.mode)
  const d = widget.data as {
    rows: number; cols: number; cells: CellMap
    colW: number[]; rowH?: number[]; title: string
  }

  const dRef        = useRef(d); dRef.current = d
  const langRef     = useRef(lang); langRef.current = lang
  const selRef      = useRef<{ r: number; c: number } | null>(null)
  const selRangeRef = useRef<{ r1: number; c1: number; r2: number; c2: number } | null>(null)
  const computedRef = useRef<Record<string, number | string>>({})

  const [sel,        setSel]        = useState<{ r: number; c: number } | null>(null)
  const [selRange,   setSelRange]   = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null)
  const [editing,    setEditing]    = useState<{ r: number; c: number } | null>(null)
  const [editVal,    setEditVal]    = useState('')
  const [ctxMenu,    setCtxMenu]    = useState<{ x: number; y: number; r: number; c: number } | null>(null)
  const [ctxHover,   setCtxHover]   = useState(-1)
  const [editingTitle, setEditingTitle] = useState(false)

  // View features
  const [showFilters,   setShowFilters]   = useState(false)
  const [activeFilters, setActiveFilters] = useState<Record<number, string>>({})
  const [filterDrop,    setFilterDrop]    = useState<{ col: number; x: number; y: number } | null>(null)
  const [findOpen,      setFindOpen]      = useState(false)
  const [findVal,       setFindVal]       = useState('')
  const [findIdx,       setFindIdx]       = useState(0)
  const [bordersDrop,   setBordersDrop]   = useState(false)
  const [importToast,  setImportToast]  = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inputRef     = useRef<HTMLInputElement>(null)
  const csvInputRef  = useRef<HTMLInputElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // fill-handle drag: isFill=true → autofill on drop; isFill=false → selection drag
  const rangeDragRef = useRef<{ r0: number; c0: number; isFill?: boolean } | null>(null)
  const resizeColRef = useRef<{ col: number; startX: number; startW: number } | null>(null)
  const resizeRowRef = useRef<{ row: number; startY: number; startH: number } | null>(null)

  selRef.current      = sel
  selRangeRef.current = selRange

  // ── helpers ────────────────────────────────────────────────────────────────
  const K       = (r: number, c: number) => `${idxToCol(c)}${r + 1}`
  const getCell = (r: number, c: number): SCell => d.cells[K(r, c)] ?? { v: '' }
  const getRowH = (r: number) => d.rowH?.[r] ?? DEF_ROW_H

  function patchCells(next: CellMap) {
    updateTaskData(widget.id, { cells: next })
  }
  function patchCell(r: number, c: number, upd: Partial<SCell>) {
    const k = K(r, c)
    updateTaskData(widget.id, { cells: { ...d.cells, [k]: { ...getCell(r, c), ...upd } } })
  }
  function patchRange(upd: Partial<SCell>) {
    const next = { ...d.cells }
    if (selRange) {
      const r1 = Math.min(selRange.r1, selRange.r2), r2 = Math.max(selRange.r1, selRange.r2)
      const c1 = Math.min(selRange.c1, selRange.c2), c2 = Math.max(selRange.c1, selRange.c2)
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) {
          const k = K(r, c); next[k] = { ...(next[k] ?? { v: '' }), ...upd }
        }
    } else if (sel) {
      const k = K(sel.r, sel.c); next[k] = { ...(next[k] ?? { v: '' }), ...upd }
    }
    patchCells(next)
  }
  function applyOuterBorder() {
    if (!selRange && !sel) return
    const next = { ...d.cells }
    const r1 = selRange ? Math.min(selRange.r1, selRange.r2) : sel!.r
    const r2 = selRange ? Math.max(selRange.r1, selRange.r2) : sel!.r
    const c1 = selRange ? Math.min(selRange.c1, selRange.c2) : sel!.c
    const c2 = selRange ? Math.max(selRange.c1, selRange.c2) : sel!.c
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const sides = (r === r1 ? 't' : '') + (r === r2 ? 'b' : '') + (c === c1 ? 'l' : '') + (c === c2 ? 'r' : '')
        if (!sides) continue
        const k = K(r, c); next[k] = { ...(next[k] ?? { v: '' }), bd: sides }
      }
    }
    patchCells(next)
  }

  // ── Computed values ────────────────────────────────────────────────────────
  const computed = useMemo(() => {
    const m: Record<string, number | string> = {}
    for (const [k, cell] of Object.entries(d.cells))
      if (cell?.v) m[k] = cellComputed(k, d.cells, lang)
    return m
  }, [d.cells, lang])
  computedRef.current = computed

  const selCell = sel ? getCell(sel.r, sel.c) : null
  const selKey  = sel ? K(sel.r, sel.c) : ''
  const selRaw  = sel ? (d.cells[selKey]?.v ?? '') : ''

  // ── Find ──────────────────────────────────────────────────────────────────
  const findMatches = useMemo(() => {
    if (!findVal.trim()) return []
    const q = findVal.toLowerCase()
    const res: Array<{ r: number; c: number }> = []
    for (let r = 0; r < d.rows; r++)
      for (let c = 0; c < d.cols; c++) {
        const k = K(r, c)
        const disp = computed[k] !== undefined
          ? fmtVal(computed[k], d.cells[k] ?? { v: '' }, lang)
          : (d.cells[k]?.v ?? '')
        if (String(disp).toLowerCase().includes(q)) res.push({ r, c })
      }
    return res
  }, [findVal, computed, d.cells, d.rows, d.cols, lang])

  const safeFindIdx  = findMatches.length ? findIdx % findMatches.length : 0
  const findCurrent  = findMatches[safeFindIdx]

  function findStep(dir: 1 | -1) {
    if (!findMatches.length) return
    const ni = ((safeFindIdx + dir) + findMatches.length) % findMatches.length
    setFindIdx(ni)
    setSel({ r: findMatches[ni].r, c: findMatches[ni].c }); setSelRange(null)
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const all = Array.from({ length: d.rows }, (_, i) => i)
    if (!showFilters || !Object.keys(activeFilters).length) return all
    return all.filter(r =>
      Object.entries(activeFilters).every(([col, val]) => {
        if (!val) return true
        const k = K(r, parseInt(col))
        const raw = computed[k]
        const disp = raw !== undefined
          ? fmtVal(raw, d.cells[k] ?? { v: '' }, lang)
          : (d.cells[k]?.v ?? '')
        return val === '(empty)' ? !disp : String(disp) === val
      })
    )
  }, [showFilters, activeFilters, computed, d.cells, d.rows, lang])

  function colUniqueValues(col: number): string[] {
    const vals = new Set<string>()
    for (let r = 0; r < d.rows; r++) {
      const k = K(r, col)
      const raw = computed[k]
      const disp = raw !== undefined ? fmtVal(raw, d.cells[k] ?? { v: '' }, lang) : (d.cells[k]?.v ?? '')
      vals.add(String(disp) || '(empty)')
    }
    return Array.from(vals).sort()
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  function startEdit(r: number, c: number, init?: string) {
    if (mode !== 'edit') return
    setEditing({ r, c })
    setEditVal(init !== undefined ? init : getCell(r, c).v)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  function commitEdit() {
    if (!editing) return
    patchCell(editing.r, editing.c, { v: editVal })
    setEditing(null)
  }
  function cancelEdit() { setEditing(null) }

  // Formelleiste: wie der Zell-Editor lokal puffern statt bei jedem
  // Tastendruck in den Store zu schreiben (das löste vorher bei jedem
  // Zeichen eine volle Neuberechnung des gesamten Formel-Graphen aus).
  const [formulaVal, setFormulaVal] = useState<string | null>(null)
  function commitFormulaBar() {
    if (sel && formulaVal !== null) patchCell(sel.r, sel.c, { v: formulaVal })
    setFormulaVal(null)
  }
  function moveSel(dr: number, dc: number) {
    setSel(prev => {
      if (!prev) return { r: 0, c: 0 }
      return { r: Math.max(0, Math.min(d.rows - 1, prev.r + dr)), c: Math.max(0, Math.min(d.cols - 1, prev.c + dc)) }
    })
    setSelRange(null)
  }
  function isInRange(r: number, c: number) {
    if (!selRange) return false
    const { r1, c1, r2, c2 } = selRange
    return r >= Math.min(r1,r2) && r <= Math.max(r1,r2) && c >= Math.min(c1,c2) && c <= Math.max(c1,c2)
  }

  // ── Fill-handle autofill ──────────────────────────────────────────────────
  function adjustFormula(formula: string, dr: number, dc: number): string {
    return formula.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (_, cs, col, rs, row) => {
      const newColIdx = colToIdx(col.toUpperCase()) + (cs ? 0 : dc)
      const newRow    = parseInt(row) + (rs ? 0 : dr)
      if (newColIdx < 0 || newRow < 1) return _
      return `${cs}${idxToCol(newColIdx)}${rs}${newRow}`
    })
  }
  function onFillHandleDown(e: React.PointerEvent, r: number, c: number) {
    e.preventDefault(); e.stopPropagation()
    rangeDragRef.current = { r0: r, c0: c, isFill: true }
    setSelRange({ r1: r, c1: c, r2: r, c2: c })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onFillHandleMove(e: React.PointerEvent) {
    if (!rangeDragRef.current?.isFill) return
    const els = document.elementsFromPoint(e.clientX, e.clientY)
    const td  = els.find(el => (el as HTMLElement).dataset?.cellRow !== undefined) as HTMLElement | undefined
    if (!td) return
    const r = parseInt(td.dataset.cellRow!), c = parseInt(td.dataset.cellCol!)
    if (isNaN(r) || isNaN(c)) return
    const { r0, c0 } = rangeDragRef.current
    setSelRange({ r1: r0, c1: c0, r2: r, c2: c })
  }
  function onFillHandleUp() {
    const drag = rangeDragRef.current
    if (!drag?.isFill) { rangeDragRef.current = null; return }
    rangeDragRef.current = null
    if (!selRange) return
    const { r0, c0 } = drag
    const { r1, c1, r2, c2 } = selRange
    const srcCell = getCell(r0, c0)
    const newCells = { ...d.cells }
    for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++) {
      for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++) {
        if (r === r0 && c === c0) continue
        const dr = r - r0, dc = c - c0
        let v = srcCell.v
        if (v.startsWith('=')) { v = adjustFormula(v, dr, dc) }
        else { const n = parseFloat(v); if (v.trim() !== '' && !isNaN(n)) v = String(n + dr + dc) }
        newCells[K(r, c)] = { ...srcCell, v }
      }
    }
    patchCells(newCells)
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return }
      if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); moveSel(1, 0); return }
      if (e.key === 'Tab')    { e.preventDefault(); commitEdit(); moveSel(0, e.shiftKey ? -1 : 1); return }
      return
    }
    if (!sel) {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key)) {
        e.preventDefault(); setSel({ r: 0, c: 0 })
      }
      return
    }
    switch (e.key) {
      case 'ArrowUp':    e.preventDefault(); moveSel(-1, 0); break
      case 'ArrowDown':  e.preventDefault(); moveSel(1, 0); break
      case 'ArrowLeft':  e.preventDefault(); moveSel(0, -1); break
      case 'ArrowRight': e.preventDefault(); moveSel(0, 1); break
      case 'Tab':        e.preventDefault(); moveSel(0, e.shiftKey ? -1 : 1); break
      case 'Enter':      e.preventDefault(); startEdit(sel.r, sel.c); break
      case 'Delete': case 'Backspace':
        e.preventDefault()
        if (selRange) {
          const next = { ...d.cells }
          const { r1,c1,r2,c2 } = selRange
          for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++)
            for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++)
              delete next[K(r, c)]
          patchCells(next); setSelRange(null)
        } else { patchCell(sel.r, sel.c, { v: '' }) }
        break
      case 'Escape': setSel(null); break
      case 'F2': e.preventDefault(); startEdit(sel.r, sel.c); break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) startEdit(sel.r, sel.c, e.key)
    }
  }

  // ── Column resize ─────────────────────────────────────────────────────────
  function onColResizeDown(e: React.MouseEvent, col: number) {
    e.stopPropagation(); e.preventDefault()
    resizeColRef.current = { col, startX: e.clientX, startW: d.colW[col] ?? DEF_COL_W }
    const onMove = (me: MouseEvent) => {
      if (!resizeColRef.current) return
      const newW = Math.max(40, resizeColRef.current.startW + me.clientX - resizeColRef.current.startX)
      const colW = [...d.colW]; colW[resizeColRef.current.col] = newW
      updateTaskData(widget.id, { colW })
    }
    const onUp = () => { resizeColRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // ── Row resize ────────────────────────────────────────────────────────────
  function onRowResizeDown(e: React.MouseEvent, row: number) {
    e.stopPropagation(); e.preventDefault()
    resizeRowRef.current = { row, startY: e.clientY, startH: getRowH(row) }
    const onMove = (me: MouseEvent) => {
      if (!resizeRowRef.current) return
      const newH = Math.max(18, resizeRowRef.current.startH + me.clientY - resizeRowRef.current.startY)
      const rowH = [...(dRef.current.rowH ?? Array(dRef.current.rows).fill(DEF_ROW_H))]
      while (rowH.length < dRef.current.rows) rowH.push(DEF_ROW_H)
      rowH[resizeRowRef.current.row] = newH
      updateTaskData(widget.id, { rowH })
    }
    const onUp = () => { resizeRowRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  function sortCol(col: number, asc: boolean) {
    const rows = Array.from({ length: d.rows }, (_, r) =>
      Array.from({ length: d.cols }, (_, c) => ({ ...getCell(r, c) }))
    )
    rows.sort((a, b) => {
      const av = a[col]?.v ?? '', bv = b[col]?.v ?? ''
      const an = +av, bn = +bv
      if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an
      return asc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    const next: CellMap = {}
    rows.forEach((row, r) => row.forEach((cell, c) => { if (cell.v) next[K(r, c)] = cell }))
    patchCells(next); setCtxMenu(null)
  }

  // ── Row / col ops ─────────────────────────────────────────────────────────
  function addRow(after: number) {
    const next: CellMap = {}
    for (const [k, cell] of Object.entries(d.cells)) {
      const m = k.match(/^([A-Z]+)(\d+)$/); if (!m) continue
      const r = parseInt(m[2]) - 1, c = colToIdx(m[1])
      next[K(r > after ? r + 1 : r, c)] = cell
    }
    const rowH = d.rowH ? [...d.rowH] : undefined
    if (rowH) rowH.splice(after + 1, 0, DEF_ROW_H)
    updateTaskData(widget.id, { rows: d.rows + 1, cells: next, ...(rowH ? { rowH } : {}) })
    setCtxMenu(null)
  }
  function delRow(r: number) {
    if (d.rows <= 1) return
    const next: CellMap = {}
    for (const [k, cell] of Object.entries(d.cells)) {
      const m = k.match(/^([A-Z]+)(\d+)$/); if (!m) continue
      const row = parseInt(m[2]) - 1, c = colToIdx(m[1])
      if (row === r) continue
      next[K(row > r ? row - 1 : row, c)] = cell
    }
    updateTaskData(widget.id, { rows: d.rows - 1, cells: next })
    setCtxMenu(null)
  }
  function addCol(after: number) {
    const colW = [...d.colW]; colW.splice(after + 1, 0, DEF_COL_W)
    const next: CellMap = {}
    for (const [k, cell] of Object.entries(d.cells)) {
      const m = k.match(/^([A-Z]+)(\d+)$/); if (!m) continue
      const r = parseInt(m[2]) - 1, c = colToIdx(m[1])
      next[K(r, c > after ? c + 1 : c)] = cell
    }
    updateTaskData(widget.id, { cols: d.cols + 1, colW, cells: next })
    setCtxMenu(null)
  }
  function delCol(c: number) {
    if (d.cols <= 1) return
    const colW = d.colW.filter((_, i) => i !== c)
    const next: CellMap = {}
    for (const [k, cell] of Object.entries(d.cells)) {
      const m = k.match(/^([A-Z]+)(\d+)$/); if (!m) continue
      const r = parseInt(m[2]) - 1, col = colToIdx(m[1])
      if (col === c) continue
      next[K(r, col > c ? col - 1 : col)] = cell
    }
    updateTaskData(widget.id, { cols: d.cols - 1, colW, cells: next })
    setCtxMenu(null)
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Jedes fokussierte Eingabefeld (Formelleiste, Zell-Editor, Suchfeld,
      // Titel-Editor) soll natives Kopieren/Einfügen des Textfelds behalten —
      // die zweite Bedingung hier prüfte vorher fälschlich "...UND außerhalb
      // dieser Tabelle", was wegen data-table-widget am äußeren Container nie
      // zutraf und die gesamte Prüfung wirkungslos machte.
      if (target.closest('input, textarea, [contenteditable]')) return
      const s = selRef.current; const sr = selRangeRef.current
      const comp = computedRef.current; const cells = dRef.current.cells

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && (s || sr)) {
        const r1 = sr ? Math.min(sr.r1,sr.r2) : s!.r, r2 = sr ? Math.max(sr.r1,sr.r2) : s!.r
        const c1 = sr ? Math.min(sr.c1,sr.c2) : s!.c, c2 = sr ? Math.max(sr.c1,sr.c2) : s!.c
        const rows: string[] = []
        for (let r = r1; r <= r2; r++) {
          const cols: string[] = []
          for (let c = c1; c <= c2; c++) {
            const k = `${idxToCol(c)}${r + 1}`
            const raw = comp[k]; const cell = cells[k] ?? { v: '' }
            cols.push(raw !== undefined ? fmtVal(raw, cell, langRef.current) : (cell.v ?? ''))
          }
          rows.push(cols.join('\t'))
        }
        navigator.clipboard.writeText(rows.join('\n')).catch(() => {})
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && s) {
        navigator.clipboard.readText().then(text => {
          const rowsData = text.split('\n')
          const next = { ...dRef.current.cells }
          rowsData.forEach((row, dr) => {
            row.split('\t').forEach((val, dc) => {
              const r = s.r + dr, c = s.c + dc
              if (r >= dRef.current.rows || c >= dRef.current.cols) return
              const k = `${idxToCol(c)}${r + 1}`
              next[k] = { ...(next[k] ?? { v: '' }), v: val }
            })
          })
          updateTaskData(widget.id, { cells: next })
        }).catch(() => {})
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (!containerRef.current?.contains(document.activeElement)) return
        e.preventDefault()
        setFindOpen(true); setTimeout(() => findInputRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!ctxMenu && !filterDrop && !bordersDrop) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('[data-ctx],[data-filterdrop],[data-bordersdrop]')) {
        setCtxMenu(null); setFilterDrop(null); setBordersDrop(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [ctxMenu, filterDrop, bordersDrop])

  // ── Cell border helper ─────────────────────────────────────────────────────
  // Only handles user-set cell.bd borders. Selection border is drawn via overlay.
  function cellBorderStyle(cell: SCell): React.CSSProperties {
    const grid  = '1px solid color-mix(in srgb, var(--border) 70%, transparent)'
    const thick = '2px solid var(--text2)'
    const bd = cell.bd
    if (!bd) return { border: grid }
    if (bd === 'none') return { border: '1px solid transparent' }
    if (bd === 'tlbr') return { border: thick }
    return {
      borderTop:    bd.includes('t') ? thick : grid,
      borderRight:  bd.includes('r') ? thick : grid,
      borderBottom: bd.includes('b') ? thick : grid,
      borderLeft:   bd.includes('l') ? thick : grid,
    }
  }

  // ── Selection: normalized range (for fill-handle + box-shadow) ──────────
  const selNr = useMemo(() => {
    const s = sel, sr = selRange
    if (!s && !sr) return null
    return sr ? {
      r1: Math.min(sr.r1, sr.r2), r2: Math.max(sr.r1, sr.r2),
      c1: Math.min(sr.c1, sr.c2), c2: Math.max(sr.c1, sr.c2),
    } : { r1: s!.r, r2: s!.r, c1: s!.c, c2: s!.c }
  }, [sel, selRange])

  // ── DOM-measured overlay position (exact cell boundaries) ────────────────
  const scrollDivRef = useRef<HTMLDivElement>(null)
  const [overlayPos, setOverlayPos] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const container = scrollDivRef.current
    const nr = selNr
    if (!container || !nr) { setOverlayPos(null); return }
    const visR1 = visibleRows.find(r => r >= nr.r1) ?? nr.r1
    const visR2 = [...visibleRows].reverse().find(r => r <= nr.r2) ?? nr.r2
    const tl = container.querySelector(`[data-cell-row="${visR1}"][data-cell-col="${nr.c1}"]`) as HTMLElement | null
    const br = container.querySelector(`[data-cell-row="${visR2}"][data-cell-col="${nr.c2}"]`) as HTMLElement | null
    if (!tl || !br) { setOverlayPos(null); return }
    // Use offsetLeft/offsetTop (CSS layout units, unaffected by board-level CSS transforms)
    function cssOffsetFrom(el: HTMLElement, ancestor: HTMLElement) {
      let x = 0, y = 0
      let cur: HTMLElement | null = el
      while (cur && cur !== ancestor) {
        x += cur.offsetLeft
        y += cur.offsetTop
        cur = cur.offsetParent as HTMLElement | null
      }
      return { x, y }
    }
    const tlOff = cssOffsetFrom(tl, container)
    const brOff = cssOffsetFrom(br, container)
    setOverlayPos({
      left:   tlOff.x,
      top:    tlOff.y,
      width:  brOff.x + br.offsetWidth  - tlOff.x,
      height: brOff.y + br.offsetHeight - tlOff.y,
    })
  }, [selNr, d.colW, d.rowH, d.rows, d.cols, visibleRows])

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setImportToast(msg)
    toastTimerRef.current = setTimeout(() => setImportToast(null), 3500)
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  // Robuster CSV-Parser (RFC 4180): behandelt gequotete Felder mit
  // eingebetteten Kommas/Zeilenumbrüchen/escapten Anführungszeichen — das
  // Gegenstück zu exportCSV() unten.
  function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++ }
          else inQuotes = false
        } else field += c
      } else if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field); field = ''
      } else if (c === '\r') {
        // ignorieren — \n unten schließt die Zeile ab
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = ''
      } else {
        field += c
      }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
    // Eine einzelne leere Schlusszeile (abschließender Zeilenumbruch) verwerfen
    if (rows.length > 1) {
      const last = rows[rows.length - 1]
      if (last.length === 1 && last[0] === '') rows.pop()
    }
    return rows
  }

  // Ersetzt den kompletten Tabelleninhalt durch die importierte CSV-Datei —
  // Zeilen/Spalten werden auf die Größe der Datei angepasst.
  function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ''))
      if (parsed.length === 0) return
      const rows = parsed.length
      const cols = Math.max(1, ...parsed.map(r => r.length))
      const cells: CellMap = {}
      parsed.forEach((row, r) => {
        row.forEach((val, c) => {
          if (val !== '') cells[K(r, c)] = { v: val }
        })
      })
      updateTaskData(widget.id, {
        rows, cols, cells,
        colW: Array.from({ length: cols }, () => DEF_COL_W),
        rowH: undefined,
      })
      showToast(`${rows} ${rows !== 1 ? t('rows imported') : t('row imported')}`)
    }
    reader.onerror = () => showToast(t('Error reading file'))
    reader.readAsText(file)
  }

  function exportCSV() {
    const rows: string[] = []
    for (let r = 0; r < d.rows; r++) {
      const cols: string[] = []
      for (let c = 0; c < d.cols; c++) {
        const k = K(r, c); const raw = computed[k] ?? d.cells[k]?.v ?? ''
        const s = String(raw)
        cols.push(s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s)
      }
      rows.push(cols.join(','))
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    const filename = `${d.title || t('table')}.csv`
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
    showToast(`${filename} - ${t('exported')}`)
  }

  // ── Context menu items ────────────────────────────────────────────────────
  const ctxItems: (null | [string, () => void])[] = ctxMenu ? [
    [t('Insert row above'),   () => addRow(ctxMenu.r - 1)],
    [t('Insert row below'),  () => addRow(ctxMenu.r)],
    [t('Delete row'),         () => delRow(ctxMenu.r)],
    null,
    [t('Insert column left'), () => addCol(ctxMenu.c - 1)],
    [t('Insert column right'),() => addCol(ctxMenu.c)],
    [t('Delete column'),         () => delCol(ctxMenu.c)],
    null,
    ['↑ ' + t('Sort ascending'),  () => sortCol(ctxMenu.c, true)],
    ['↓ ' + t('Sort descending'),   () => sortCol(ctxMenu.c, false)],
    null,
    [t('Clear cell'), () => { patchCell(ctxMenu.r, ctxMenu.c, { v: '' }); setCtxMenu(null) }],
    [t('Clear formatting'), () => {
      const k = K(ctxMenu.r, ctxMenu.c)
      const cell = d.cells[k]
      if (cell) updateTaskData(widget.id, { cells: { ...d.cells, [k]: { v: cell.v } } })
      setCtxMenu(null)
    }],
  ] : []

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div
      ref={containerRef}
      data-table-widget="1"
      tabIndex={0}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', outline: 'none', position: 'relative' }}
      onKeyDown={onKeyDown}
      onPointerDown={e => e.stopPropagation()}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node) && editing) commitEdit() }}
    >
      {/* ── Title + export ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface2))', flexShrink: 0, minHeight: 32 }}>
        {mode === 'edit' ? (
          editingTitle
            ? <input autoFocus value={d.title || ''} onChange={e => updateTaskData(widget.id, { title: e.target.value })}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); setEditingTitle(false) } }}
                placeholder={t('Table title…')}
                style={{ flex: 1, fontSize: 12, fontWeight: 700, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text1)' }} />
            : <span onClick={() => setEditingTitle(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, fontSize: 12, fontWeight: 700, color: d.title ? 'var(--text1)' : 'var(--text3)', cursor: 'text', userSelect: 'none' }}>
                {d.title || t('Table title…')}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45, flexShrink: 0 }}>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </span>
        ) : (
          d.title ? <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text1)' }}>{d.title}</span> : <div style={{ flex: 1 }} />
        )}
        {mode === 'edit' && (
          <button onClick={() => csvInputRef.current?.click()} title={t('Import CSV')} style={sExportBtn}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="11" x2="8" y2="2"/><polyline points="5,5 8,2 11,5"/><polyline points="2,13 2,14 14,14 14,13"/>
            </svg>
            CSV
          </button>
        )}
        <button onClick={exportCSV} title={t('Export as CSV')} style={sExportBtn}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="2" x2="8" y2="11"/><polyline points="5,8 8,11 11,8"/><polyline points="2,13 2,14 14,14 14,13"/>
          </svg>
          CSV
        </button>
        <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={importCSV} style={{ display: 'none' }} />
      </div>

      {/* ── Context menu ───────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div data-ctx="1" style={{ ...sPopup, left: ctxMenu.x, top: ctxMenu.y }} onPointerDown={e => e.stopPropagation()}>
          {ctxItems.map((item, i) =>
            item === null
              ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
              : <div key={i} onPointerDown={item[1]} onPointerEnter={() => setCtxHover(i)} onPointerLeave={() => setCtxHover(-1)}
                  style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text1)', background: ctxHover === i ? 'var(--surface2)' : 'transparent' }}>
                  {item[0]}
                </div>
          )}
        </div>
      )}

      {/* ── Filter dropdown ────────────────────────────────────────────────── */}
      {filterDrop && (
        <div data-filterdrop="1" style={{ ...sPopup, left: filterDrop.x, top: filterDrop.y, minWidth: 160 }} onPointerDown={e => e.stopPropagation()}>
          <div style={{ padding: '4px 10px 4px', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Filter')}: {idxToCol(filterDrop.col)}</div>
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          <div onPointerDown={() => { setActiveFilters(f => { const n = {...f}; delete n[filterDrop.col]; return n }); setFilterDrop(null) }}
            style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text3)', fontStyle: 'italic' }}>
            {t('(Show all)')}
          </div>
          {colUniqueValues(filterDrop.col).map(v => (
            <div key={v} onPointerDown={() => { setActiveFilters(f => ({ ...f, [filterDrop.col]: v })); setFilterDrop(null) }}
              style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text1)', background: activeFilters[filterDrop.col] === v ? 'color-mix(in srgb,var(--accent) 15%,transparent)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6 }}>
              {activeFilters[filterDrop.col] === v && <span style={{ color: 'var(--accent)' }}>✓</span>}
              {t(v)}
            </div>
          ))}
        </div>
      )}

      {mode === 'edit' && (
        <>
          {/* ── Formula bar ────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '3px 6px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', minWidth: 36, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px' }}>
              {sel ? K(sel.r, sel.c) : '—'}
            </span>
            <span style={{ color: 'var(--text3)', fontSize: 13, fontStyle: 'italic', userSelect: 'none' }}>ƒx</span>
            <input
              value={formulaVal ?? selRaw}
              onChange={e => setFormulaVal(e.target.value)}
              onBlur={commitFormulaBar}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.currentTarget.blur() }
                if (e.key === 'Escape') { setFormulaVal(null); e.currentTarget.blur() }
              }}
              placeholder={t('Value or =Formula')}
              style={{ flex: 1, fontSize: 12, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text1)' }}
            />
          </div>

          {/* ── Toolbar ────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, flexShrink: 0, padding: '3px 6px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', minHeight: 30 }}>

            {/* Font size */}
            <select value={selCell?.fs ?? 12} onChange={e => patchRange({ fs: +e.target.value })} style={sSel} title={t('Font size')}>
              {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            <Sep />

            {/* Text style */}
            <TBtn active={!!selCell?.b} onClick={() => patchRange({ b: !selCell?.b })} title={t('Bold')}><b style={{fontSize:12}}>B</b></TBtn>
            <TBtn active={!!selCell?.i} onClick={() => patchRange({ i: !selCell?.i })} title={t('Italic')}><i style={{fontSize:12}}>I</i></TBtn>
            <TBtn active={!!selCell?.u} onClick={() => patchRange({ u: !selCell?.u })} title={t('Underline')}><u style={{fontSize:12}}>U</u></TBtn>
            <TBtn active={!!selCell?.s} onClick={() => patchRange({ s: !selCell?.s })} title={t('Strikethrough')}><s style={{fontSize:11}}>S</s></TBtn>

            <Sep />

            {/* Colors */}
            <CBtn value={selCell?.fc ?? '#888888'} onChange={v => patchRange({ fc: v })} title={t('Text color')}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                <span style={{ fontSize:11, fontWeight:700, color: selCell?.fc ?? 'var(--text1)', lineHeight:1 }}>A</span>
                <div style={{ width:12, height:3, background: selCell?.fc ?? 'var(--text1)', borderRadius:1 }}/>
              </div>
            </CBtn>
            <CBtn value={selCell?.bg ?? '#ffffff'} onChange={v => patchRange({ bg: v })} title={t('Background color')}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill={selCell?.bg ?? 'none'} stroke="currentColor" strokeWidth="1.2">
                  <rect x="1" y="1" width="10" height="10" rx="2"/>
                </svg>
                <div style={{ width:12, height:3, background: selCell?.bg ?? 'var(--border)', borderRadius:1 }}/>
              </div>
            </CBtn>

            <Sep />

            {/* Borders dropdown */}
            <div style={{ position:'relative' }}>
              <TBtn active={bordersDrop} onClick={() => setBordersDrop(v => !v)} title={t('Border')}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="12" height="12"/>
                  <line x1="1" y1="7" x2="13" y2="7"/><line x1="7" y1="1" x2="7" y2="13"/>
                </svg>
              </TBtn>
              {bordersDrop && (
                <div data-bordersdrop="1" style={{ position:'absolute', top:'100%', left:0, zIndex:9999, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'4px 0', minWidth:170, boxShadow:'0 6px 20px rgba(0,0,0,0.35)' }} onPointerDown={e => e.stopPropagation()}>
                  {([
                    [t('No border'),  'none'],
                    [t('All borders'),  'tlbr'],
                    [t('Outer border'),  'outer'],
                    [t('Bottom only'),    'b'],
                    [t('Top only'),     't'],
                    [t('Left only'),    'l'],
                    [t('Right only'),   'r'],
                    [t('Bottom + top'), 'tb'],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={val}
                      onPointerDown={() => {
                        if (val === 'outer') { applyOuterBorder() }
                        else { patchRange({ bd: val }) }
                        setBordersDrop(false)
                      }}
                      style={{ padding:'6px 14px', fontSize:12, cursor:'pointer', color:'var(--text1)' }}>
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Sep />

            {/* H-align */}
            {(['l','c','r'] as const).map(a => (
              <TBtn key={a} active={selCell?.a === a} onClick={() => patchRange({ a })} title={a === 'l' ? t('Left') : a === 'c' ? t('Center') : t('Right')}>
                <AlignSvg a={a} />
              </TBtn>
            ))}

            {/* V-align */}
            {(['t','m','b'] as const).map(va => (
              <TBtn key={va} active={selCell?.va === va} onClick={() => patchRange({ va })} title={va === 't' ? t('Align top') : va === 'm' ? t('Align center') : t('Align bottom')}>
                <VAlignSvg va={va} />
              </TBtn>
            ))}

            {/* Wrap */}
            <TBtn active={!!selCell?.wrap} onClick={() => patchRange({ wrap: !selCell?.wrap })} title={t('Wrap text')}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="3" x2="13" y2="3"/>
                <path d="M1 7h8a2 2 0 0 1 0 4H7"/>
                <polyline points="5,9 7,11 5,13"/>
              </svg>
            </TBtn>

            <Sep />

            {/* Number format */}
            <select value={selCell?.fmt ?? 'auto'} onChange={e => patchRange({ fmt: e.target.value as SCell['fmt'] })} style={sSel} title={t('Number format')}>
              <option value="auto">Auto</option>
              <option value="num">0.00</option>
              <option value="int"># {t('Integer')}</option>
              <option value="cur">€ {t('Currency')}</option>
              <option value="pct">% {t('Percent')}</option>
              <option value="text">{t('Text')}</option>
            </select>
            {selCell?.fmt && !['auto','text'].includes(selCell.fmt) && (
              <select value={selCell?.dec ?? 2} onChange={e => patchRange({ dec: +e.target.value })} style={{ ...sSel, width: 44 }} title={t('Decimal places')}>
                {[0,1,2,3,4].map(n => <option key={n} value={n}>.{n === 0 ? '0' : '0'.repeat(n)}</option>)}
              </select>
            )}

            <Sep />

            {/* Sort (shown when a cell is selected) */}
            {sel && <>
              <TBtn active={false} onClick={() => sortCol(sel.c, true)} title={t('Sort ascending (this column)')}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <line x1="2" y1="4" x2="8" y2="4"/><line x1="2" y1="7" x2="6" y2="7"/><line x1="2" y1="10" x2="4" y2="10"/>
                  <line x1="11" y1="10" x2="11" y2="3"/><polyline points="9,5 11,3 13,5"/>
                </svg>
              </TBtn>
              <TBtn active={false} onClick={() => sortCol(sel.c, false)} title={t('Sort descending (this column)')}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <line x1="2" y1="4" x2="8" y2="4"/><line x1="2" y1="7" x2="6" y2="7"/><line x1="2" y1="10" x2="4" y2="10"/>
                  <line x1="11" y1="3" x2="11" y2="10"/><polyline points="9,8 11,10 13,8"/>
                </svg>
              </TBtn>
              <Sep />
            </>}

            {/* Table structure */}
            <TBtn active={false} onClick={() => updateTaskData(widget.id, { rows: d.rows + 1 })} title={t('Add row')} small>+Z</TBtn>
            <TBtn active={false} onClick={() => updateTaskData(widget.id, { cols: d.cols + 1, colW: [...d.colW, DEF_COL_W] })} title={t('Add column')} small>+S</TBtn>
            {d.rows > 1 && sel && <TBtn active={false} onClick={() => delRow(sel.r)} title={t('Delete current row')} small>−Z</TBtn>}
            {d.cols > 1 && sel && <TBtn active={false} onClick={() => delCol(sel.c)} title={t('Delete current column')} small>−S</TBtn>}

            <Sep />

            {/* Filter toggle */}
            <TBtn active={showFilters} onClick={() => { setShowFilters(v => !v); if (showFilters) setActiveFilters({}) }} title={t('Show/hide filter')}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 2h12l-4.5 5.5V12l-3-1.5V7.5L1 2z"/>
              </svg>
            </TBtn>
            {/* Active filter indicator */}
            {showFilters && Object.keys(activeFilters).length > 0 && (
              <span style={{ fontSize:10, color:'var(--accent)', fontWeight:700, marginLeft:2 }}>
                {Object.keys(activeFilters).length}
              </span>
            )}

            {/* Find */}
            <TBtn active={findOpen} onClick={() => { setFindOpen(v => !v); if (!findOpen) setTimeout(() => findInputRef.current?.focus(), 0) }} title={t('Search [Ctrl+F]')}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="13" y2="13"/>
              </svg>
            </TBtn>

            {/* Format clear */}
            {(selCell?.b || selCell?.i || selCell?.u || selCell?.s || selCell?.fc || selCell?.bg || selCell?.bd) && (
              <>
                <Sep />
                <TBtn active={false} onClick={() => {
                  if (!sel) return
                  const k = K(sel.r, sel.c)
                  const cell = d.cells[k]
                  if (cell) updateTaskData(widget.id, { cells: { ...d.cells, [k]: { v: cell.v, fmt: cell.fmt, dec: cell.dec } } })
                }} title={t('Clear formatting')}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M3 2h8l-3 5h3l-5 5"/><line x1="2" y1="12" x2="5" y2="9"/>
                  </svg>
                </TBtn>
              </>
            )}
          </div>

          {/* ── Find bar ───────────────────────────────────────────────────── */}
          {findOpen && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 8px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', flexShrink:0 }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="13" y2="13"/></svg>
              <input ref={findInputRef} value={findVal}
                onChange={e => { setFindVal(e.target.value); setFindIdx(0) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1) }
                  if (e.key === 'Escape') { setFindOpen(false); setFindVal('') }
                }}
                placeholder={t('Search…')}
                style={{ flex:1, fontSize:12, background:'transparent', border:'none', outline:'none', color:'var(--text1)' }}
              />
              <span style={{ fontSize:11, color:'var(--text3)', whiteSpace:'nowrap', minWidth:50, textAlign:'right' }}>
                {findVal ? (findMatches.length ? `${safeFindIdx + 1} / ${findMatches.length}` : t('0 matches')) : ''}
              </span>
              <TBtn active={false} onClick={() => findStep(-1)} title={t('Previous match')}>↑</TBtn>
              <TBtn active={false} onClick={() => findStep(1)} title={t('Next match')}>↓</TBtn>
              <TBtn active={false} onClick={() => { setFindOpen(false); setFindVal('') }} title={t('Close')}>✕</TBtn>
            </div>
          )}
        </>
      )}

      {/* ── Spreadsheet grid ─────────────────────────────────────────────────── */}
      <div
        ref={scrollDivRef}
        style={{ flex:1, overflow:'auto', position:'relative' }}
        onPointerDown={() => { setCtxMenu(null); setFilterDrop(null) }}
        onPointerUp={() => { if (rangeDragRef.current && !rangeDragRef.current.isFill) rangeDragRef.current = null }}
      >
        <table style={{ borderCollapse:'collapse', tableLayout:'fixed', minWidth:'100%' }}>
          <colgroup>
            <col style={{ width: ROW_HDR_W }} />
            {Array.from({ length: d.cols }, (_, c) => <col key={c} style={{ width: d.colW[c] ?? DEF_COL_W }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...hdrCell, width: ROW_HDR_W, position:'sticky', top:0, left:0, zIndex:5 }} />
              {Array.from({ length: d.cols }, (_, c) => (
                <th key={c} style={{ ...hdrCell, position:'sticky', top:0, zIndex:4 }}>
                  <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
                    {idxToCol(c)}
                    {showFilters && (
                      <button
                        onPointerDown={e => {
                          e.stopPropagation()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setFilterDrop({ col: c, x: rect.left, y: rect.bottom + 2 })
                        }}
                        style={{ position:'absolute', right:2, top:'50%', transform:'translateY(-50%)', background: activeFilters[c] ? 'var(--accent)' : 'var(--surface)', border:'none', borderRadius:3, padding:'1px 2px', cursor:'pointer', color: activeFilters[c] ? 'white' : 'var(--text3)', display:'flex', alignItems:'center' }}
                        title={activeFilters[c] ? `${t('Active filter')}: ${activeFilters[c]}` : t('Filter column')}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M0 1h8L5 5v3L3 7V5L0 1z"/></svg>
                      </button>
                    )}
                    {mode === 'edit' && (
                      <div onMouseDown={e => onColResizeDown(e, c)} style={{ position:'absolute', right:0, top:0, bottom:0, width:5, cursor:'col-resize', zIndex:1 }} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(r => (
              <tr key={r} style={{ height: getRowH(r) }}>
                {/* Row header */}
                <td style={{ ...hdrCell, position:'sticky', left:0, zIndex:3 }}>
                  <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
                    {r + 1}
                    {mode === 'edit' && (
                      <div onMouseDown={e => onRowResizeDown(e, r)} style={{ position:'absolute', bottom:0, left:0, right:0, height:4, cursor:'row-resize', zIndex:1 }} />
                    )}
                  </div>
                </td>
                {/* Cells */}
                {Array.from({ length: d.cols }, (_, c) => {
                  const k        = K(r, c)
                  const cell     = d.cells[k] ?? { v: '' }
                  const isSel    = sel?.r === r && sel?.c === c
                  const isEd     = editing?.r === r && editing?.c === c
                  const inRange  = !isSel && isInRange(r, c)
                  const isFind   = findOpen && !!findVal && findMatches.some(m => m.r === r && m.c === c)
                  const isCurFind = findOpen && findCurrent?.r === r && findCurrent?.c === c
                  const rawVal   = computed[k]
                  const display  = rawVal !== undefined ? fmtVal(rawVal, cell, lang) : (cell.v || '')
                  const rowH     = getRowH(r)

                  const cellStyle: React.CSSProperties = {
                    height: rowH, padding: 0, position: 'relative',
                    overflow: cell.wrap ? 'visible' : 'hidden',
                    background: isCurFind
                      ? 'color-mix(in srgb,var(--accent) 30%,transparent)'
                      : isFind
                        ? 'color-mix(in srgb,var(--accent) 15%,transparent)'
                        : cell.bg ?? undefined,
                    boxShadow: (isSel || inRange) && !isCurFind && !isFind
                      ? 'inset 0 0 0 100vmax color-mix(in srgb, var(--accent) 10%, transparent)'
                      : undefined,
                    outline: 'none',
                    verticalAlign: cell.va === 't' ? 'top' : cell.va === 'b' ? 'bottom' : 'middle',
                    ...cellBorderStyle(cell),
                  }
                  const textStyle: React.CSSProperties = {
                    fontSize: cell.fs ?? 12, lineHeight: 1.3,
                    fontWeight: cell.b ? 700 : 400,
                    fontStyle:  cell.i ? 'italic' : 'normal',
                    textDecoration: [cell.u && 'underline', cell.s && 'line-through'].filter(Boolean).join(' ') || 'none',
                    color: cell.fc ?? 'var(--text1)',
                    textAlign: cell.a === 'c' ? 'center' : cell.a === 'r' ? 'right' : 'left',
                    whiteSpace: cell.wrap ? 'pre-wrap' : 'nowrap',
                    wordBreak:  cell.wrap ? 'break-word' : undefined,
                  }

                  return (
                    <td key={c} data-cell-row={r} data-cell-col={c} style={cellStyle}
                      onPointerDown={e => {
                        e.stopPropagation()
                        if (isEd) return
                        if (editing) commitEdit()
                        setSel({ r, c }); setSelRange(null)
                        rangeDragRef.current = { r0: r, c0: c, isFill: false }
                        containerRef.current?.focus()
                      }}
                      onPointerEnter={() => {
                        if (!rangeDragRef.current || rangeDragRef.current.isFill) return
                        const { r0, c0 } = rangeDragRef.current
                        setSelRange({ r1: r0, c1: c0, r2: r, c2: c })
                      }}
                      onDoubleClick={() => startEdit(r, c)}
                      onContextMenu={e => {
                        if (mode !== 'edit') return
                        e.preventDefault(); setSel({ r, c })
                        setCtxMenu({ x: e.clientX, y: e.clientY, r, c })
                      }}
                    >
                      {isEd ? (
                        <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); moveSel(1, 0) }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                            else if (e.key === 'Tab')    { e.preventDefault(); commitEdit(); moveSel(0, e.shiftKey ? -1 : 1) }
                          }}
                          style={{ ...textStyle, position:'absolute', inset:0, width:'100%', height:'100%', border:'none', outline:'none', padding:'0 4px', background:'var(--surface)', boxSizing:'border-box' }}
                        />
                      ) : (
                        <div style={{ ...textStyle, padding:'0 4px', height:'100%', display:'flex', alignItems: cell.va === 't' ? 'flex-start' : cell.va === 'b' ? 'flex-end' : 'center', overflow: cell.wrap ? 'visible' : 'hidden' }}>
                          {display}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Selection border overlay (Google-Sheets-style single rect) ── */}
        {overlayPos && (
          <div
            style={{
              position: 'absolute', pointerEvents: 'none', zIndex: 6,
              left: overlayPos.left, top: overlayPos.top,
              width: overlayPos.width, height: overlayPos.height,
              border: '2px solid var(--accent)', boxSizing: 'border-box',
            }}
          />
        )}
        {/* ── Fill handle at bottom-right corner of selection ── */}
        {overlayPos && selNr && mode === 'edit' && !editing && (
          <div
            onPointerDown={e => onFillHandleDown(e, selNr.r2, selNr.c2)}
            onPointerMove={onFillHandleMove}
            onPointerUp={onFillHandleUp}
            style={{
              position: 'absolute', touchAction: 'none', zIndex: 10,
              left: overlayPos.left + overlayPos.width - 4,
              top: overlayPos.top + overlayPos.height - 4,
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)', border: '1.5px solid var(--bg)',
              cursor: 'crosshair',
            }}
          />
        )}
      </div>

      {/* ── Import/Export-Toast ── */}
      {importToast && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          zIndex: 200, pointerEvents: 'none',
          fontSize: 12, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {importToast}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TBtn({ active, onClick, children, title, small }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title?: string; small?: boolean
}) {
  return (
    <button onClick={onClick} title={title} style={{
      display:'flex', alignItems:'center', justifyContent:'center',
      padding: small ? '2px 4px' : '2px 5px', borderRadius:5, border:'none',
      height:22, minWidth: small ? 20 : 22, fontSize:11,
      background: active ? 'var(--accent)' : 'transparent',
      color: active ? 'white' : 'var(--text2)',
      cursor:'pointer', flexShrink:0,
    }}>{children}</button>
  )
}

function Sep() {
  return <div style={{ width:1, height:16, background:'var(--border)', margin:'0 2px', flexShrink:0 }} />
}

function CBtn({ value, onChange, title, children }: {
  value: string; onChange: (v: string) => void; title?: string; children: React.ReactNode
}) {
  return (
    <ColorSwatch value={value} onChange={onChange} trigger={onClick => (
      <div onClick={onClick} title={title} style={{ cursor:'pointer', padding:'2px 5px', height:22, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {children}
      </div>
    )} />
  )
}

function AlignSvg({ a }: { a: 'l' | 'c' | 'r' }) {
  const lines = a === 'l' ? [[0,0],[1,0],[0,1],[0.6,1],[0,2],[0.8,2]]
    : a === 'c' ? [[0.1,0],[0.9,0],[0.2,1],[0.8,1],[0,2],[1,2]]
    : [[0,0],[1,0],[0.4,1],[1,1],[0.2,2],[1,2]]
  return (
    <svg width="12" height="10" viewBox="0 0 10 8">
      {[0,1,2].map(i => <line key={i} x1={lines[i*2][0]*10} y1={i*4} x2={lines[i*2+1][0]*10} y2={i*4} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>)}
    </svg>
  )
}

function VAlignSvg({ va }: { va: 't' | 'm' | 'b' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      {va === 't' && <><line x1="1" y1="2" x2="11" y2="2"/><line x1="4" y1="4" x2="4" y2="10"/><line x1="8" y1="4" x2="8" y2="10"/><line x1="4" y1="7" x2="8" y2="7"/></>}
      {va === 'm' && <><line x1="1" y1="6" x2="11" y2="6"/><line x1="4" y1="2" x2="4" y2="10"/><line x1="8" y1="2" x2="8" y2="10"/></>}
      {va === 'b' && <><line x1="1" y1="10" x2="11" y2="10"/><line x1="4" y1="2" x2="4" y2="8"/><line x1="8" y1="2" x2="8" y2="8"/><line x1="4" y1="5" x2="8" y2="5"/></>}
    </svg>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hdrCell: React.CSSProperties = {
  height: HDR_H, background: 'var(--surface2)',
  border: '1px solid var(--border)', fontSize: 11, fontWeight: 600,
  color: 'var(--text3)', textAlign: 'center', userSelect: 'none',
  padding: 0,
}
const sSel: React.CSSProperties = {
  fontSize: 11, background: 'var(--surface)', color: 'var(--text1)',
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '2px 4px', height: 22, cursor: 'pointer',
}
const sExportBtn: React.CSSProperties = {
  display:'flex', alignItems:'center', gap:4,
  fontSize:10, fontWeight:700, color:'var(--accent)',
  background:'color-mix(in srgb, var(--accent) 14%, transparent)',
  border:'1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
  borderRadius:5, padding:'2px 8px', cursor:'pointer', flexShrink:0, height:22,
}
const sPopup: React.CSSProperties = {
  position:'fixed', zIndex:9999,
  background:'var(--surface)', border:'1px solid var(--border)',
  borderRadius:8, padding:'4px 0', minWidth:190,
  boxShadow:'0 6px 20px rgba(0,0,0,0.4)',
}
