'use client'
import { useState, useEffect, useId } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { todayStr, getWeekDates, weekRangeLabel } from '@/lib/dates'
import StatsToggle from '@/components/ui/StatsToggle'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { Widget, WaterData } from '@/types'

const GOAL_OPTIONS    = [500, 750, 1000, 1500, 2000, 2500, 3000, 3500, 4000]
const SECTION_OPTIONS = [100, 250, 500, 1000]
const WEEK_LABELS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']


function fmt(ml: number) {
  if (ml >= 1000) return ml % 1000 === 0 ? `${ml / 1000}L` : `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')}L`
  return `${ml}ml`
}

// ── Icons ─────────────────────────────────────────────────────────────────────

// ── Mini bottle (shared geometry) ─────────────────────────────────────────────

function MiniBottle({ pct, faded, isToday }: { pct: number; faded?: boolean; isToday?: boolean }) {
  const uid = useId()

  // Same geometry as main bottle
  const capL = 28, capR = 52, capT = 2, capB = 10
  const colL = 25, colR = 55, colT = capB, colB = 13
  const nkL = 27, nkR = 53, nkT = colB, nkB = 34
  const bL = 6, bR = 74, bT = 55, bB = 200
  const bW = bR - bL, bH = bB - bT, rx = 10

  const outline = [
    `M ${capL},${capT}`, `L ${capR},${capT}`, `L ${capR},${capB}`,
    `L ${colR},${colT}`, `L ${colR},${colB}`,
    `L ${nkR},${nkT}`,  `L ${nkR},${nkB}`,
    `C ${bR + 4},${nkB + 6} ${bR},${bT - 6} ${bR},${bT}`,
    `L ${bR},${bB - rx}`, `Q ${bR},${bB} ${bR - rx},${bB}`,
    `L ${bL + rx},${bB}`, `Q ${bL},${bB} ${bL},${bB - rx}`,
    `L ${bL},${bT}`,
    `C ${bL},${bT - 6} ${bL - 4},${nkB + 6} ${nkL},${nkB}`,
    `L ${nkL},${nkT}`, `L ${colL},${colB}`, `L ${colL},${colT}`, `L ${capL},${capB}`, `Z`,
  ].join(' ')

  const clipId    = `mc-${uid}`
  const bgGrad    = `mb-${uid}`
  const glossGrad = `mg-${uid}`
  const fillH  = pct * bH
  const fillTop = bB - fillH

  return (
    <svg width="100%" viewBox="0 0 80 210" style={{ opacity: faded ? 0.25 : 1, overflow: 'visible' }}>
      <defs>
        <clipPath id={clipId}><path d={outline}/></clipPath>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.06)"/>
          <stop offset="50%"  stopColor="rgba(255,255,255,0.03)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0.08)"/>
        </linearGradient>
        <linearGradient id={glossGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18"/>
          <stop offset="35%"  stopColor="white" stopOpacity="0.06"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>

      <path d={outline} fill={`url(#${bgGrad})`} stroke="var(--border)" strokeWidth="1.2"/>

      <g clipPath={`url(#${clipId})`}>
        {fillH > 0 && <rect x={bL} y={fillTop} width={bW} height={fillH} fill="var(--accent2)" opacity={0.82}/>}
        {fillH > 0 && fillH < bH && (
          <rect x={bL} y={fillTop} width={bW} height={Math.min(5, fillH * 0.3)} fill="rgba(255,255,255,0.18)" rx="1"/>
        )}
        <rect x={bL} y={bT} width={bW * 0.28} height={bH} fill={`url(#${glossGrad})`}/>
      </g>

      <path d={outline} fill="none" stroke={isToday ? 'var(--accent2)' : 'var(--border)'} strokeWidth={isToday ? '1.8' : '1.4'}
        opacity={isToday ? 0.7 : 1}/>

      {/* Cap */}
      <rect x={capL} y={capT} width={capR - capL} height={capB - capT} rx="3" fill="var(--surface3)" stroke="var(--border)" strokeWidth="1"/>
      {[0.33, 0.66].map(f => (
        <line key={f} x1={capL + (capR - capL) * f} y1={capT + 1} x2={capL + (capR - capL) * f} y2={capB - 1} stroke="var(--border)" strokeWidth="0.8"/>
      ))}
      {/* Neck grip */}
      {[0.3, 0.6].map(f => (
        <line key={f} x1={nkL} y1={nkT + (nkB - nkT) * f} x2={nkR} y2={nkT + (nkB - nkT) * f} stroke="var(--border)" strokeWidth="0.7"/>
      ))}

      {/* Full checkmark */}
      {pct >= 1 && (
        <polyline
          points={`${(bL + bR) / 2 - 11},${bT + bH / 2 + 2} ${(bL + bR) / 2 - 2},${bT + bH / 2 + 13} ${(bL + bR) / 2 + 13},${bT + bH / 2 - 8}`}
          fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"
        />
      )}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WaterWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const updateTaskData = useBoardStore(s => s.updateTaskData)
  const resetWater = useBoardStore(s => s.resetWater)
  const mode = useUIStore(s => s.mode)
  const d    = widget.data as WaterData

  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    function checkReset() {
      const today = todayStr()
      const current = useBoardStore.getState().boards[
        Object.keys(useBoardStore.getState().boards).find(id =>
          useBoardStore.getState().boards[id]?.widgets[widget.id]
        ) ?? ''
      ]?.widgets[widget.id]?.data as WaterData | undefined
      const ld     = current?.lastDate ?? d.lastDate
      const logged = current?.loggedMl ?? d.loggedMl
      const log    = current?.dailyLog ?? d.dailyLog
      if (ld && ld !== today) {
        const newLog: Record<string, number> = { ...(log ?? {}), [ld]: logged }
        updateTaskData(widget.id, { loggedMl: 0, lastDate: today, dailyLog: newLog })
      } else if (!ld) {
        updateTaskData(widget.id, { lastDate: today })
      }
    }
    checkReset()
    const id = setInterval(checkReset, 60 * 60 * 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.id])

  const goalMl       = d.goalMl      as number
  const loggedMl     = d.loggedMl    as number
  const mlPerSection = (d.mlPerSection as number | undefined) ?? 500
  const dailyLog     = (d.dailyLog   as Record<string, number> | undefined) ?? {}

  // Migration: bereits gespeicherte ungültige Kombinationen (Ziel kein Vielfaches
  // des Abschnitts) auf den größten passenden Abschnitt korrigieren
  useEffect(() => {
    if (goalMl >= mlPerSection && goalMl % mlPerSection === 0) return
    const fixed = [...SECTION_OPTIONS].reverse().find(s2 => goalMl >= s2 && goalMl % s2 === 0)
    if (fixed && fixed !== mlPerSection) updateTaskData(widget.id, { mlPerSection: fixed })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalMl, mlPerSection])
  const numSections  = Math.max(1, Math.ceil(goalMl / mlPerSection))
  const filledCount  = Math.min(numSections, Math.floor(loggedMl / mlPerSection))
  const pct          = Math.min(1, loggedMl / goalMl)
  const statsOpen    = d.statsOpen ?? false
  const showStats    = useSettings(st => !st.statsDisabledTypes.includes('water'))

  function getMlForDate(date: string): number {
    return date === todayStr() ? loggedMl : (dailyLog[date] ?? 0)
  }

  function clickSection(i: number) {
    const upTo = Math.min(goalMl, (i + 1) * mlPerSection)
    if (i === filledCount - 1 && loggedMl >= upTo) {
      updateTaskData(widget.id, { loggedMl: i * mlPerSection })
    } else {
      updateTaskData(widget.id, { loggedMl: upTo })
    }
  }

  const bottle = (
    <Bottle numSections={numSections} filledCount={filledCount} mlPerSection={mlPerSection} goalMl={goalMl} onClick={clickSection}/>
  )

  // Nur Kombinationen erlauben, bei denen das Ziel ein Vielfaches des Abschnitts
  // ist — sonst wäre die oberste Kachel nie füllbar (z. B. Ziel 2,5 L bei 1-L-Abschnitt).
  function isValidCombo(goal: number, section: number): boolean {
    return goal >= section && goal % section === 0
  }

  // Stepper: springt in der Optionsliste zum nächsten GÜLTIGEN Wert in Pfeilrichtung
  function stepValue(list: number[], current: number, dir: -1 | 1, valid: (v: number) => boolean): number {
    const i = list.indexOf(current)
    const idx = i === -1 ? 0 : i
    for (let j = idx + dir; j >= 0 && j < list.length; j += dir) {
      if (valid(list[j])) return list[j]
    }
    return current
  }
  // Gibt es in Pfeilrichtung überhaupt noch einen gültigen Wert? (für disabled-State)
  function hasStep(list: number[], current: number, dir: -1 | 1, valid: (v: number) => boolean): boolean {
    return stepValue(list, current, dir, valid) !== current
  }

  const goalValid    = (g: number) => isValidCombo(g, mlPerSection)
  const sectionValid = (s2: number) => isValidCombo(goalMl, s2)

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 5, alignItems: 'center', overflowY: 'auto', overflowX: 'hidden' }} onPointerDown={e => e.stopPropagation()}>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent2)', lineHeight: 1 }}>{fmt(loggedMl)}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>/ {fmt(goalMl)}</span>
        <span style={{ fontSize: 10, color: pct >= 1 ? 'var(--accent2)' : 'var(--text3)', marginLeft: 2 }}>{Math.round(pct * 100)}%</span>
      </div>

      {/* minHeight: Flasche bleibt auch bei aufgeklappter Statistik sichtbar */}
      <div style={{ flex: 1, minHeight: 120, width: '100%', display: 'flex', justifyContent: 'center' }}>{bottle}</div>

      <button onClick={() => resetWater(widget.id)} style={{ ...resetBtnStyle, flexShrink: 0 }}>{t('Reset')}</button>

      {/* Ziel + Abschnitt als Stepper-Karten (wie Timer-Dauer / Schlafziel) */}
      {mode === 'edit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, width: '100%', flexShrink: 0 }}>
          {([
            { label: t('Goal'),    value: goalMl,       list: GOAL_OPTIONS,    valid: goalValid,    key: 'goalMl' },
            { label: t('Section'), value: mlPerSection, list: SECTION_OPTIONS, valid: sectionValid, key: 'mlPerSection' },
          ] as const).map(f => (
            <div key={f.key} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 7px', minWidth: 0,
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7,
            }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.label}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => updateTaskData(widget.id, { [f.key]: stepValue([...f.list], f.value, -1, f.valid) })}
                  disabled={!hasStep([...f.list], f.value, -1, f.valid)} style={stepBtnStyle(!hasStep([...f.list], f.value, -1, f.valid))}
                  title={`${t('Decrease')} ${f.label}`}
                >−</button>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(f.value)}
                </span>
                <button
                  onClick={() => updateTaskData(widget.id, { [f.key]: stepValue([...f.list], f.value, 1, f.valid) })}
                  disabled={!hasStep([...f.list], f.value, 1, f.valid)} style={stepBtnStyle(!hasStep([...f.list], f.value, 1, f.valid))}
                  title={`${t('Increase')} ${f.label}`}
                >+</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Wochenstatistik (ein-/ausklappbar) ── */}
      <div style={{ display: showStats ? undefined : 'none', flexShrink: 0, width: '100%', borderTop: '1px solid var(--border)' }}>
        <StatsToggle open={statsOpen} onToggle={() => updateTaskData(widget.id, { statsOpen: !statsOpen })} />
        {statsOpen && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px 4px', gap: 2, justifyContent: 'center' }}>
              <button onPointerDown={e => e.stopPropagation()} onClick={() => setWeekOffset(o => o - 1)}
                title={t('Previous week')}
                style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7,1 3,5 7,9"/></svg>
              </button>
              <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', textAlign: 'center', minWidth: 68 }}>
                {weekRangeLabel(weekOffset, t)}
              </span>
              <button onPointerDown={e => e.stopPropagation()} onClick={() => setWeekOffset(o => Math.min(0, o + 1))} disabled={weekOffset >= 0}
                title={t('Next week')}
                style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: weekOffset >= 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: weekOffset >= 0 ? 0.25 : 1 }}>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,1 7,5 3,9"/></svg>
              </button>
            </div>
            <div style={{ padding: '0 6px 8px' }}>
              <WeekBottlesChart weekDates={getWeekDates(weekOffset)} goalMl={goalMl} getMl={getMlForDate} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Week bottles chart ────────────────────────────────────────────────────────

function WeekBottlesChart({ weekDates, goalMl, getMl }: {
  weekDates: string[]
  goalMl: number
  getMl: (date: string) => number
}) {
  const today = todayStr()
  const t = useT()
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
      {weekDates.map((date, di) => {
        const ml      = getMl(date)
        const pct     = Math.min(1, ml / goalMl)
        const isFuture = date > today
        const isToday  = date === today
        return (
          <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <MiniBottle pct={isFuture ? 0 : pct} faded={isFuture} isToday={isToday} />
            <span style={{ fontSize: 6.5, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--text2)' : 'var(--text3)' }}>
              {t(WEEK_LABELS[di])}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

function stepBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)',
    background: 'var(--surface3)', color: 'var(--text2)',
    fontSize: 13, fontWeight: 700, lineHeight: 1, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.3 : 1,
    transition: 'opacity 0.12s',
  }
}

const resetBtnStyle: React.CSSProperties = {
  padding: '3px 14px', fontSize: 10, fontWeight: 600, borderRadius: 50,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text3)', cursor: 'pointer',
}

// ── Main bottle SVG ───────────────────────────────────────────────────────────

function Bottle({ numSections, filledCount, mlPerSection, goalMl, onClick }: {
  numSections:  number
  filledCount:  number
  mlPerSection: number
  goalMl:       number
  onClick:      (i: number) => void
}) {
  const uid = useId()
  const VW = 95, VH = 220
  const capL = 28, capR = 52, capT = 2, capB = 10
  const colL = 25, colR = 55, colT = capB, colB = 13
  const nkL = 27, nkR = 53, nkT = colB, nkB = 34
  const bL = 6, bR = 74, bT = 55, bB = 200
  const bW = bR - bL, bH = bB - bT, rx = 10
  const secH = bH / numSections

  const outline = [
    `M ${capL},${capT}`, `L ${capR},${capT}`, `L ${capR},${capB}`,
    `L ${colR},${colT}`, `L ${colR},${colB}`,
    `L ${nkR},${nkT}`,  `L ${nkR},${nkB}`,
    `C ${bR + 4},${nkB + 6} ${bR},${bT - 6} ${bR},${bT}`,
    `L ${bR},${bB - rx}`, `Q ${bR},${bB} ${bR - rx},${bB}`,
    `L ${bL + rx},${bB}`, `Q ${bL},${bB} ${bL},${bB - rx}`,
    `L ${bL},${bT}`,
    `C ${bL},${bT - 6} ${bL - 4},${nkB + 6} ${nkL},${nkB}`,
    `L ${nkL},${nkT}`, `L ${colL},${colB}`, `L ${colL},${colT}`, `L ${capL},${capB}`, `Z`,
  ].join(' ')

  const clipId = `bc-${uid}`, bgGrad = `bb-${uid}`, glossGrad = `bg-${uid}`
  const fillHeight = filledCount * secH
  const fillTop    = bB - fillHeight
  const showLabels = numSections <= 12 && secH >= 9

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={clipId}><path d={outline}/></clipPath>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.06)"/>
          <stop offset="50%"  stopColor="rgba(255,255,255,0.03)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0.08)"/>
        </linearGradient>
        <linearGradient id={glossGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18"/>
          <stop offset="35%"  stopColor="white" stopOpacity="0.06"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={outline} fill={`url(#${bgGrad})`} stroke="var(--border)" strokeWidth="1.2"/>
      <g clipPath={`url(#${clipId})`}>
        {filledCount > 0 && <rect x={bL} y={fillTop} width={bW} height={fillHeight} fill="var(--accent)" opacity={0.82}/>}
        {Array.from({ length: numSections - 1 }).map((_, i) => {
          const y = bB - (i + 1) * secH
          return <line key={i} x1={bL} y1={y} x2={bR} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i + 1 < filledCount ? 'none' : '3 2'}/>
        })}
        {filledCount > 0 && filledCount < numSections && (
          <rect x={bL} y={fillTop} width={bW} height={Math.min(6, secH * 0.4)} fill="rgba(255,255,255,0.18)" rx="1"/>
        )}
        <rect x={bL} y={bT} width={bW * 0.28} height={bH} fill={`url(#${glossGrad})`}/>
        {showLabels && Array.from({ length: numSections }).map((_, i) => {
          const ml = Math.min(goalMl, (i + 1) * mlPerSection)
          const cy = bB - i * secH - secH / 2
          if (secH < 12) return null
          return (
            <text key={i} x={(bL + bR) / 2} y={cy + 3.5} textAnchor="middle"
              fontSize={Math.min(8, secH * 0.45)} fill={i < filledCount ? 'rgba(255,255,255,0.75)' : 'var(--text3)'}
              fontWeight={i < filledCount ? '600' : '400'}>
              {fmt(ml)}
            </text>
          )
        })}
      </g>
      <path d={outline} fill="none" stroke="var(--border)" strokeWidth="1.4"/>
      <rect x={capL} y={capT} width={capR - capL} height={capB - capT} rx="3" fill="var(--surface3)" stroke="var(--border)" strokeWidth="1"/>
      {[0.33, 0.66].map(f => <line key={f} x1={capL + (capR - capL) * f} y1={capT + 1} x2={capL + (capR - capL) * f} y2={capB - 1} stroke="var(--border)" strokeWidth="0.8"/>)}
      {[0.3, 0.6].map(f => <line key={f} x1={nkL} y1={nkT + (nkB - nkT) * f} x2={nkR} y2={nkT + (nkB - nkT) * f} stroke="var(--border)" strokeWidth="0.7"/>)}
      {showLabels && Array.from({ length: numSections + 1 }).map((_, i) => {
        const ml = i * mlPerSection
        const y  = bB - i * secH
        if (i > numSections) return null
        return (
          <g key={i}>
            <line x1={bR + 1} y1={y} x2={bR + 5} y2={y} stroke="var(--border)" strokeWidth="0.8"/>
            {(i === 0 || i === numSections || numSections <= 6 || i % Math.ceil(numSections / 6) === 0) && (
              <text x={bR + 8} y={y + 3.5} fontSize={6.5} fill="var(--text3)">{fmt(Math.min(goalMl, ml))}</text>
            )}
          </g>
        )
      })}
      {Array.from({ length: numSections }).map((_, i) => (
        <rect key={i} x={bL} y={bB - (i + 1) * secH} width={bW} height={secH} fill="transparent" style={{ cursor: 'pointer' }}
          tabIndex={0} role="button" aria-label={fmt(Math.min(goalMl, (i + 1) * mlPerSection))}
          onClick={() => onClick(i)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(i) } }}
        />
      ))}
      {filledCount >= numSections && (
        <polyline
          points={`${(bL + bR) / 2 - 14},${bT + bH / 2 + 2} ${(bL + bR) / 2 - 2},${bT + bH / 2 + 16} ${(bL + bR) / 2 + 16},${bT + bH / 2 - 10}`}
          fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.45"
        />
      )}
    </svg>
  )
}
