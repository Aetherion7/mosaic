'use client'
import { useState, useRef, useEffect } from 'react'
import { ColorSwatch } from '@/components/ui/ColorSwatch'
import { useUIStore } from '@/store/uiStore'
import { useBoardStore } from '@/store/boardStore'
import { useT } from '@/hooks/useT'
import type { Widget, ChartType, ChartDataset, ChartData, WidgetData } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLICE_COLORS = ['#7c6fe8','#4ecdc4','#ffd166','#e84855','#52b5d4','#95e06c','#ff9f43','#a29bfe']
const AXIS_COLOR  = 'var(--text3)'
const LABEL_COLOR = 'var(--text2)'
const GRID_COLOR  = 'color-mix(in srgb, var(--border) 60%, transparent)'
const AXIS_LINE   = 'var(--border)'

// ── Chart type definitions with icons ─────────────────────────────────────────

function CIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const CHART_TYPES: { type: ChartType; label: string; icon: React.ReactNode }[] = [
  {
    type: 'column', label: 'Columns',
    icon: <CIcon>
      <rect x="3"  y="11" width="5" height="10" rx="1.5" fill="currentColor"/>
      <rect x="9.5" y="4"  width="5" height="17" rx="1.5" fill="currentColor"/>
      <rect x="16" y="7"  width="5" height="14" rx="1.5" fill="currentColor"/>
    </CIcon>,
  },
  {
    type: 'bar', label: 'Bars',
    icon: <CIcon>
      <rect x="4" y="3"  width="10" height="4.5" rx="1.5" fill="currentColor"/>
      <rect x="4" y="9.75" width="16" height="4.5" rx="1.5" fill="currentColor"/>
      <rect x="4" y="16.5" width="7"  height="4.5" rx="1.5" fill="currentColor"/>
    </CIcon>,
  },
  {
    type: 'line', label: 'Line',
    icon: <CIcon>
      <polyline points="2,17 7,9 12,13 17,5 22,10" stroke="currentColor" strokeWidth="2.2"/>
      <circle cx="7"  cy="9"  r="2.2" fill="currentColor"/>
      <circle cx="12" cy="13" r="2.2" fill="currentColor"/>
      <circle cx="17" cy="5"  r="2.2" fill="currentColor"/>
    </CIcon>,
  },
  {
    type: 'radar', label: 'Radar',
    icon: <CIcon>
      <polygon points="12,2 21,8 18,19 6,19 3,8" fill="none" stroke="currentColor" strokeWidth="2"/>
      <polygon points="12,7 17,10.5 15.2,17 8.8,17 7,10.5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55"/>
      <line x1="12" y1="2" x2="12" y2="19" stroke="currentColor" strokeWidth="0.8" opacity="0.4"/>
      <line x1="3"  y1="8" x2="21" y2="8"  stroke="currentColor" strokeWidth="0.8" opacity="0.4"/>
    </CIcon>,
  },
  {
    type: 'pie', label: 'Pie',
    icon: <CIcon>
      <path d="M12 3 L12 12 L21 12 A9 9 0 0 0 12 3 Z" fill="currentColor" opacity="0.85"/>
      <path d="M12 12 L3.5 7 A9 9 0 0 0 12 21 Z" fill="currentColor" opacity="0.5"/>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
    </CIcon>,
  },
]

// ── Data type ─────────────────────────────────────────────────────────────────

type ChartD = { labels: string[]; datasets: ChartDataset[] }

// ── Main widget ───────────────────────────────────────────────────────────────

export default function ChartWidget({ widget }: { widget: Widget }) {
  const t                = useT()
  const mode            = useUIStore(s => s.mode)
  const updateChartData = useBoardStore(s => s.updateChartData)
  const d               = widget.data as ChartData & WidgetData

  const pickerRef       = useRef<HTMLDivElement>(null)
  const [pickerOpen,    setPickerOpen]    = useState(false)

  useEffect(() => {
    if (!pickerOpen) return
    const fn = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [pickerOpen])

  function patch(p: Record<string, unknown>) { updateChartData(widget.id, p) }

  const chartType  = d.chartType ?? 'column'
  const chartDef   = CHART_TYPES.find(c => c.type === chartType) ?? CHART_TYPES[0]
  const displayData: ChartD = { labels: d.labels, datasets: d.datasets }

  function renderChart() {
    if (chartType === 'column') return <ColumnChart d={displayData} />
    if (chartType === 'bar')    return <BarChart    d={displayData} />
    if (chartType === 'line')   return <LineChart   d={displayData} />
    if (chartType === 'radar')  return <RadarChart  d={displayData} />
    if (chartType === 'pie')    return <PieChart    d={displayData} />
    return null
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 5 }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <input
          value={d.title} readOnly={mode !== 'edit'}
          onChange={e => patch({ title: e.target.value })}
          style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text1)',
            flex: 1, minWidth: 0,
            background: mode === 'edit' ? 'var(--surface2)' : 'transparent',
            borderRadius: 4, padding: '1px 4px', border: 'none', outline: 'none',
          }}
        />

        {/* ── Chart-type picker ── */}
        {mode === 'edit' && (
          <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
            {/* Trigger button */}
            <button
              onClick={() => setPickerOpen(s => !s)}
              title={t('Choose chart type')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 8px 3px 6px',
                background: pickerOpen ? 'var(--surface)' : 'var(--surface2)',
                border: `1px solid ${pickerOpen ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 7, cursor: 'pointer',
                color: pickerOpen ? 'var(--accent)' : 'var(--text2)',
                fontSize: 10, fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ color: pickerOpen ? 'var(--accent)' : 'var(--text2)', display: 'flex' }}>
                {chartDef.icon}
              </span>
              <span>{t(chartDef.label)}</span>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </button>

            {/* Animated dropdown */}
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 5px)',
              background: 'color-mix(in srgb, var(--surface) 55%, var(--bg))',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              maxHeight: pickerOpen ? '240px' : '0px',
              opacity: pickerOpen ? 1 : 0,
              pointerEvents: pickerOpen ? 'auto' : 'none',
              transition: 'max-height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.16s ease',
              boxShadow: '0 8px 28px rgba(0,0,0,0.42)',
              zIndex: 200, minWidth: 120,
            }}>
              {CHART_TYPES.map((ct, i) => {
                const active = chartType === ct.type
                return (
                  <button
                    key={ct.type}
                    onClick={() => { patch({ chartType: ct.type }); setPickerOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      width: '100%', padding: '8px 14px',
                      background: active ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : 'transparent',
                      borderTop: i > 0 ? '1px solid color-mix(in srgb, var(--border) 50%, transparent)' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: active ? 'var(--accent)' : 'var(--text1)',
                      fontSize: 11, fontWeight: active ? 600 : 400,
                      textAlign: 'left', whiteSpace: 'nowrap',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--text1) 5%, transparent)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span style={{ color: active ? 'var(--accent)' : 'var(--text3)', display: 'flex', flexShrink: 0 }}>
                      {ct.icon}
                    </span>
                    {t(ct.label)}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      {/* Immer nebeneinander (Settings links, Diagramm rechts) — unabhängig
          von der Widget-Höhe, damit das Diagramm bei einer langen/schmalen
          Kachel nicht unter die Einstellungen rutscht. */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'row',
        gap: 6, overflow: 'hidden',
      }}>
        {mode === 'edit' && <ManualEditPanel d={d} patch={patch} />}
        <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          {renderChart()}
        </div>
      </div>
    </div>
  )
}

// ── Manual edit panel ─────────────────────────────────────────────────────────

function ManualEditPanel({
  d, patch,
}: {
  d: { labels: string[]; datasets: ChartDataset[] }
  patch: (p: Record<string, unknown>) => void
}) {
  const t = useT()
  function setVal(di: number, vi: number, v: number) {
    patch({ datasets: d.datasets.map((ds: ChartDataset, i: number) =>
      i === di ? { ...ds, values: ds.values.map((x: number, j: number) => j === vi ? v : x) } : ds) })
  }
  function setLabel(i: number, text: string) {
    patch({ labels: d.labels.map((l: string, j: number) => j === i ? text : l) })
  }
  function addPoint() {
    patch({ labels: [...d.labels, `P${d.labels.length + 1}`], datasets: d.datasets.map((ds: ChartDataset) => ({ ...ds, values: [...ds.values, 0] })) })
  }
  function removePoint(i: number) {
    if (d.labels.length <= 2) return
    patch({ labels: d.labels.filter((_: string, j: number) => j !== i), datasets: d.datasets.map((ds: ChartDataset) => ({ ...ds, values: ds.values.filter((_: number, j: number) => j !== i) })) })
  }
  function addDataset() {
    patch({ datasets: [...d.datasets, { label: `${t('Series')} ${d.datasets.length + 1}`, values: d.labels.map(() => 0), color: SLICE_COLORS[d.datasets.length % SLICE_COLORS.length] }] })
  }
  function removeDataset(di: number) {
    if (d.datasets.length <= 1) return
    patch({ datasets: d.datasets.filter((_: ChartDataset, i: number) => i !== di) })
  }

  // Auto-width: grow with additional datasets so value inputs stay readable
  const panelWidth = Math.max(162, 108 + d.datasets.length * 38)

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: 'var(--text3)',
    letterSpacing: '0.07em', textTransform: 'uppercase',
    padding: '5px 8px 4px',
  }
  const addBtn: React.CSSProperties = {
    width: '100%', padding: '4px 8px',
    fontSize: 10, fontWeight: 500, color: 'var(--accent)',
    background: 'transparent',
    border: '1px dashed color-mix(in srgb, var(--accent) 40%, var(--border))',
    borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
    transition: 'background 0.12s',
  }

  return (
    <div style={{
      flexShrink: 0,
      width: panelWidth,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
      transition: 'width 0.18s ease',
    }}>

      {/* ── Series ── */}
      <div style={sectionLabel}>{t('Data series')}</div>
      <div style={{ padding: '0 6px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {d.datasets.map((ds: ChartDataset, di: number) => (
          <div key={di} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 6px', borderRadius: 7,
            background: 'var(--surface2)', border: '1px solid var(--border)',
          }}>
            <ColorSwatch
              value={ds.color}
              onChange={v => patch({ datasets: d.datasets.map((x: ChartDataset, i: number) => i === di ? { ...x, color: v } : x) })}
              trigger={(onClick) => (
                <div onClick={onClick} style={{ width: 14, height: 14, borderRadius: 4, background: ds.color, border: '1.5px solid rgba(255,255,255,0.12)', cursor: 'pointer', flexShrink: 0 }} />
              )}
            />
            <input value={ds.label}
              onChange={e => patch({ datasets: d.datasets.map((x: ChartDataset, i: number) => i === di ? { ...x, label: e.target.value } : x) })}
              style={{ flex: 1, minWidth: 0, fontSize: 10, background: 'transparent', border: 'none', color: 'var(--text1)', padding: 0 }}
            />
            {d.datasets.length > 1 && (
              <button onClick={() => removeDataset(di)} title={t('Delete dataset')} style={{ flexShrink: 0, width: 14, height: 14, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            )}
          </div>
        ))}
        <button onClick={addDataset} style={addBtn}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('Series')}
        </button>
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* ── Data points ── */}
      <div style={sectionLabel}>{t('Data points')}</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {d.labels.map((label: string, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', minWidth: 11, textAlign: 'center', flexShrink: 0 }}>{i + 1}</div>
            <input value={label} onChange={e => setLabel(i, e.target.value)}
              style={{ width: 28, fontSize: 10, background: 'color-mix(in srgb, var(--surface3) 60%, transparent)', borderRadius: 4, padding: '1px 4px', color: 'var(--text2)', border: '1px solid var(--border)', minWidth: 0, flexShrink: 0 }}
            />
            {d.datasets.map((ds: ChartDataset, di: number) => (
              <input key={di} type="number" value={ds.values[i] ?? 0}
                onChange={e => setVal(di, i, Number(e.target.value))}
                style={{ width: 34, flexShrink: 0, fontSize: 10, textAlign: 'right', background: `${ds.color}18`, borderRadius: 4, padding: '1px 4px', color: 'var(--text1)', border: `1px solid ${ds.color}55`, minWidth: 0 }}
              />
            ))}
            {d.labels.length > 2 && (
              <button onClick={() => removePoint(i)} title={t('Delete data point')} style={{ flexShrink: 0, width: 13, height: 13, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            )}
          </div>
        ))}
        <button onClick={addPoint} style={{ ...addBtn, marginTop: 1 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('Point')}
        </button>
      </div>
    </div>
  )
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function allMax(d: ChartD): number {
  const vals = d.datasets.flatMap(ds => ds.values)
  return Math.max(...vals, 1)
}

function yTicks(d: ChartD, max = allMax(d)): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f))
}

function fmtY(v: number): string { return String(v) }

// ── Säulendiagramm ─────────────────────────────────────────────────────────────

function ColumnChart({ d }: { d: ChartD }) {
  const W   = 240
  const H   = 150
  const PAD = { t: 14, r: 10, b: 28, l: 36 }
  const cW  = W - PAD.l - PAD.r
  const cH  = H - PAD.t - PAD.b
  const maxV = allMax(d)
  const ticks = yTicks(d, maxV)
  const n   = d.labels.length
  const nDS = d.datasets.length
  const gW  = cW / (n || 1)
  const bW  = Math.max(4, Math.min(22, gW / (nDS + 0.5) * 0.85))

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((v, ti) => {
        const y = PAD.t + cH * (1 - v / maxV)
        return (
          <g key={ti}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={GRID_COLOR} strokeWidth={0.5} />
            <text x={PAD.l - 4} y={y + 3.5} textAnchor="end" fontSize={6.5} fill={AXIS_COLOR}>{fmtY(v)}</text>
          </g>
        )
      })}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + cH} stroke={AXIS_LINE} strokeWidth={0.8} />
      <line x1={PAD.l} y1={PAD.t + cH} x2={W - PAD.r} y2={PAD.t + cH} stroke={AXIS_LINE} strokeWidth={0.8} />
      {d.labels.map((label, i) => {
        const gCx = PAD.l + i * gW + gW / 2
        return (
          <g key={i}>
            <text x={gCx} y={H - PAD.b + 11} textAnchor="middle" fontSize={7} fill={LABEL_COLOR}>{label.slice(0, 5)}</text>
            {d.datasets.map((ds, di) => {
              const v    = ds.values[i] ?? 0
              const bH   = Math.max(0, (v / maxV) * cH)
              const x    = gCx + (di - (nDS - 1) / 2) * (bW + 2) - bW / 2
              const fill = nDS === 1 ? (SLICE_COLORS[i % SLICE_COLORS.length]) : ds.color
              return (
                <g key={di}>
                  <rect x={x} y={PAD.t + cH - bH} width={bW} height={bH} rx={3} style={{ fill }} opacity={0.88} />
                  {bH > 14 && <text x={x + bW / 2} y={PAD.t + cH - bH + 9} textAnchor="middle" fontSize={6} fill="white" opacity={0.85}>{fmtY(v)}</text>}
                </g>
              )
            })}
          </g>
        )
      })}
      {d.datasets.length > 1 && d.datasets.map((ds, di) => (
        <g key={di} transform={`translate(${PAD.l + di * 60}, ${PAD.t - 6})`}>
          <rect x={0} y={-5} width={7} height={7} rx={2} fill={ds.color} opacity={0.88} />
          <text x={10} y={1} fontSize={6.5} fill={LABEL_COLOR}>{ds.label.slice(0, 8)}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Balkendiagramm ─────────────────────────────────────────────────────────────

function BarChart({ d }: { d: ChartD }) {
  const W = 240, H = 150
  const PAD = { t: 8, r: 38, b: 18, l: 38 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
  const maxV = allMax(d), n = d.labels.length, nDS = d.datasets.length
  const gH = cH / (n || 1), bH = Math.max(4, Math.min(18, gH / (nDS + 0.5) * 0.85))

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {[0, 0.5, 1].map(f => {
        const x = PAD.l + cW * f
        return (
          <g key={f}>
            <line x1={x} y1={PAD.t} x2={x} y2={H - PAD.b} stroke={GRID_COLOR} strokeWidth={0.5} />
            <text x={x} y={H - PAD.b + 10} textAnchor="middle" fontSize={6.5} fill={AXIS_COLOR}>{Math.round(maxV * f)}</text>
          </g>
        )
      })}
      {d.labels.map((label, i) => {
        const gCy = PAD.t + i * gH + gH / 2
        return (
          <g key={i}>
            <text x={PAD.l - 4} y={gCy + 3} textAnchor="end" fontSize={7} fill={LABEL_COLOR}>{label.slice(0, 5)}</text>
            {d.datasets.map((ds, di) => {
              const v  = ds.values[i] ?? 0
              const bW = Math.max(0, (v / maxV) * cW)
              const y  = gCy + (di - (nDS - 1) / 2) * (bH + 2) - bH / 2
              return (
                <g key={di}>
                  <rect x={PAD.l} y={y} width={bW} height={bH} rx={3} fill={ds.color} opacity={0.88} />
                  {bW > 18 && <text x={PAD.l + bW - 4} y={y + bH / 2 + 2.5} textAnchor="end" fontSize={6} fill="white" opacity={0.85}>{v}</text>}
                </g>
              )
            })}
          </g>
        )
      })}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke={AXIS_LINE} strokeWidth={0.8} />
      {d.datasets.length > 1 && d.datasets.map((ds, di) => (
        <g key={di} transform={`translate(${W - PAD.r + 4}, ${PAD.t + di * 11})`}>
          <rect x={0} y={-4} width={6} height={6} rx={1.5} fill={ds.color} opacity={0.88} />
          <text x={8} y={1} fontSize={6} fill={LABEL_COLOR}>{ds.label.slice(0, 6)}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Liniendiagramm ─────────────────────────────────────────────────────────────

function LineChart({ d }: { d: ChartD }) {
  const W = 240, H = 150
  const PAD = { t: 14, r: 10, b: 28, l: 36 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
  const maxV = allMax(d), n = d.labels.length
  const ticks = yTicks(d, maxV)
  const px = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * cW : cW / 2)
  const py = (v: number) => PAD.t + cH - Math.max(0, v / maxV) * cH

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((v, ti) => {
        const y = py(v)
        return (
          <g key={ti}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={GRID_COLOR} strokeWidth={0.5} />
            <text x={PAD.l - 4} y={y + 3.5} textAnchor="end" fontSize={6.5} fill={AXIS_COLOR}>{fmtY(v)}</text>
          </g>
        )
      })}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + cH} stroke={AXIS_LINE} strokeWidth={0.8} />
      <line x1={PAD.l} y1={PAD.t + cH} x2={W - PAD.r} y2={PAD.t + cH} stroke={AXIS_LINE} strokeWidth={0.8} />
      {d.datasets.map((ds, di) => {
        if (n === 0) return null
        const pts = ds.values.map((v, i) => [px(i), py(v)] as [number, number])
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
        const area = `M${px(0)},${py(0)} ` + pts.map(p => `L${p[0]},${p[1]}`).join(' ') + ` L${px(n - 1)},${py(0)} Z`
        return (
          <g key={di}>
            <path d={area} fill={ds.color} opacity={0.12} />
            <path d={line} fill="none" stroke={ds.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={ds.color} stroke="var(--surface)" strokeWidth={1.5} />
            ))}
          </g>
        )
      })}
      {d.labels.map((label, i) => (
        <text key={i} x={px(i)} y={H - PAD.b + 11} textAnchor="middle" fontSize={7} fill={LABEL_COLOR}>{label.slice(0, 5)}</text>
      ))}
      {d.datasets.length > 1 && d.datasets.map((ds, di) => (
        <g key={di} transform={`translate(${PAD.l + di * 60}, ${PAD.t - 6})`}>
          <line x1={0} y1={-1} x2={10} y2={-1} stroke={ds.color} strokeWidth={2} />
          <circle cx={5} cy={-1} r={2.5} fill={ds.color} />
          <text x={14} y={2} fontSize={6.5} fill={LABEL_COLOR}>{ds.label.slice(0, 8)}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Netzdiagramm (Radar) ──────────────────────────────────────────────────────

function RadarChart({ d }: { d: ChartD }) {
  const W  = 240
  const H  = 160
  const cx = W / 2
  const cy = H / 2
  const R  = Math.min(cx, cy) * 0.64
  const n  = d.labels.length
  const t  = useT()

  if (n < 3) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 10, color: 'var(--text3)', textAlign: 'center' }}>
      {t('At least 3 axes needed')}
    </div>
  )

  const maxV     = allMax(d)
  const rings    = [0.25, 0.5, 0.75, 1]
  const angle    = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2
  const vx       = (i: number, r: number) => cx + r * Math.cos(angle(i))
  const vy       = (i: number, r: number) => cy + r * Math.sin(angle(i))

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {rings.map((f, ri) => {
        const pts = Array.from({ length: n }, (_, i) => `${vx(i, R * f)},${vy(i, R * f)}`).join(' ')
        return <polygon key={ri} points={pts} fill="none" stroke={GRID_COLOR} strokeWidth={ri === rings.length - 1 ? 1 : 0.5} />
      })}
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={cx} y1={cy} x2={vx(i, R)} y2={vy(i, R)} stroke={GRID_COLOR} strokeWidth={0.6} />
      ))}
      {d.datasets.map((ds, di) => {
        const pts = ds.values.map((v, i) => {
          const r = (Math.max(0, v) / maxV) * R
          return `${vx(i, r)},${vy(i, r)}`
        }).join(' ')
        return (
          <g key={di}>
            <polygon points={pts} style={{ fill: ds.color }} opacity={0.15} />
            <polygon points={pts} fill="none" style={{ stroke: ds.color }} strokeWidth={1.8} opacity={0.92} />
            {ds.values.map((v, i) => {
              const r = (Math.max(0, v) / maxV) * R
              return <circle key={i} cx={vx(i, r)} cy={vy(i, r)} r={2.8} fill={ds.color} stroke="var(--surface)" strokeWidth={1.2} />
            })}
          </g>
        )
      })}
      {d.labels.map((label, i) => (
        <text key={i} x={vx(i, R * 1.22)} y={vy(i, R * 1.22)} textAnchor="middle" dominantBaseline="middle" fontSize={7.5} fill={LABEL_COLOR}>
          {label.slice(0, 7)}
        </text>
      ))}
      {d.datasets.length > 1 && d.datasets.map((ds, di) => (
        <g key={di} transform={`translate(4, ${H - 10 - di * 11})`}>
          <rect x={0} y={-5} width={7} height={7} rx={2} fill={ds.color} opacity={0.88} />
          <text x={10} y={1} fontSize={6.5} fill={LABEL_COLOR}>{ds.label.slice(0, 10)}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Kreisdiagramm ─────────────────────────────────────────────────────────────

function PieChart({ d }: { d: ChartD }) {
  const t = useT()
  const W = 240, H = 160
  const cx = W * 0.38, cy = H / 2
  const R = Math.min(cx, cy) * 0.84, INNER = R * 0.44
  const ds = d.datasets[0]
  const vals = ds.values.map(v => Math.max(0, v))
  const total = vals.reduce((s, v) => s + v, 0) || 1
  let startAngle = -Math.PI / 2

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {vals.map((v, i) => {
        const frac = v / total, sweep = frac * 2 * Math.PI
        const color = SLICE_COLORS[i % SLICE_COLORS.length]
        if (sweep < 0.002) { startAngle += sweep; return null }
        const end = startAngle + sweep, lg = sweep > Math.PI ? 1 : 0
        const path = [
          `M ${cx + INNER * Math.cos(startAngle)} ${cy + INNER * Math.sin(startAngle)}`,
          `L ${cx + R * Math.cos(startAngle)} ${cy + R * Math.sin(startAngle)}`,
          `A ${R} ${R} 0 ${lg} 1 ${cx + R * Math.cos(end)} ${cy + R * Math.sin(end)}`,
          `L ${cx + INNER * Math.cos(end)} ${cy + INNER * Math.sin(end)}`,
          `A ${INNER} ${INNER} 0 ${lg} 0 ${cx + INNER * Math.cos(startAngle)} ${cy + INNER * Math.sin(startAngle)}`,
          'Z',
        ].join(' ')
        startAngle = end
        return <path key={i} d={path} fill={color} stroke="var(--surface)" strokeWidth={1.5} opacity={0.9} />
      })}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--text1)">{total}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize={7} fill={AXIS_COLOR}>{t('total')}</text>
      {d.labels.map((label, i) => (
        <g key={i} transform={`translate(${W * 0.68}, ${cy - (d.labels.length * 12) / 2 + i * 14 + 5})`}>
          <rect x={0} y={-6} width={8} height={8} rx={2} fill={SLICE_COLORS[i % SLICE_COLORS.length]} opacity={0.9} />
          <text x={12} y={1} fontSize={7.5} fill={LABEL_COLOR}>{label.slice(0, 9)}: {Math.round((vals[i] ?? 0) / total * 100)}%</text>
        </g>
      ))}
    </svg>
  )
}
