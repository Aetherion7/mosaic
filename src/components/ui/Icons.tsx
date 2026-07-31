// Shared SVG icon components — no emojis, no external deps

type P = { size?: number; strokeWidth?: number; className?: string }

function Ic({ size = 16, strokeWidth = 0.85, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export function IconTask({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}><circle cx="8" cy="8" r="6"/><polyline points="5.5,8 7,9.5 10.5,6"/></Ic>
}
export function IconChecklist({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="1.5" y="2.5" width="5" height="5" rx="1"/>
    <polyline points="2.5,5 3.8,6.5 6.5,3.5"/>
    <line x1="8.5" y1="5" x2="14" y2="5"/>
    <rect x="1.5" y="9.5" width="5" height="5" rx="1"/>
    <line x1="8.5" y1="12" x2="14" y2="12"/>
  </Ic>
}
export function IconNote({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
    <polyline points="10,2 10,5 13,5"/>
    <line x1="5" y1="8" x2="11" y2="8"/>
    <line x1="5" y1="11" x2="9" y2="11"/>
  </Ic>
}
export function IconTimer({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <circle cx="8" cy="9.5" r="5.5"/>
    <polyline points="8,6.5 8,9.5 10,11.5"/>
    <line x1="6" y1="1.5" x2="10" y2="1.5"/>
    <line x1="8" y1="1.5" x2="8" y2="4"/>
  </Ic>
}
export function IconWater({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <path d="M8 2 C8 2 3 8 3 10 a5 5 0 0 0 10 0 C13 8 8 2 8 2Z"/>
  </Ic>
}
export function IconImage({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="2" y="3" width="12" height="10" rx="1.5"/>
    <circle cx="5.5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/>
    <polyline points="2,12 5,9 8,11 11,7 14,12"/>
  </Ic>
}
export function IconCalendar({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="2" y="3" width="12" height="11" rx="1.5"/>
    <line x1="2" y1="7" x2="14" y2="7"/>
    <line x1="5.5" y1="1.5" x2="5.5" y2="4.5"/>
    <line x1="10.5" y1="1.5" x2="10.5" y2="4.5"/>
    <rect x="5" y="9" width="2" height="2" rx="0.4" fill="currentColor" stroke="none"/>
    <rect x="9" y="9" width="2" height="2" rx="0.4" fill="currentColor" stroke="none"/>
  </Ic>
}
export function IconChart({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <line x1="2" y1="13.5" x2="14" y2="13.5"/>
    <rect x="2.5" y="9" width="2.5" height="4.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.5"/>
    <rect x="6.5" y="6.5" width="2.5" height="7" rx="0.5" fill="currentColor" stroke="none" opacity="0.5"/>
    <rect x="10.5" y="10.5" width="2.5" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.5"/>
    <polyline points="3.75,7 7.75,4 11.75,8.5" fill="none"/>
    <circle cx="3.75" cy="7" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="7.75" cy="4" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="11.75" cy="8.5" r="1.2" fill="currentColor" stroke="none"/>
  </Ic>
}

// Chart sub-type icons
export function IconColumn({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <line x1="2" y1="13.5" x2="14" y2="13.5"/>
    <rect x="2.5" y="8" width="3" height="5.5" rx="0.7" fill="currentColor" stroke="none"/>
    <rect x="6.5" y="5" width="3" height="8.5" rx="0.7" fill="currentColor" stroke="none"/>
    <rect x="10.5" y="10" width="3" height="3.5" rx="0.7" fill="currentColor" stroke="none"/>
  </Ic>
}
export function IconBar({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <line x1="2.5" y1="2" x2="2.5" y2="14"/>
    <rect x="3" y="3" width="5" height="2.5" rx="0.7" fill="currentColor" stroke="none"/>
    <rect x="3" y="6.8" width="9" height="2.5" rx="0.7" fill="currentColor" stroke="none"/>
    <rect x="3" y="10.5" width="6.5" height="2.5" rx="0.7" fill="currentColor" stroke="none"/>
  </Ic>
}
export function IconLine({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <polyline points="2,11 5,7 8,9 11,4.5 14,7"/>
    <circle cx="2" cy="11" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="5" cy="7" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="8" cy="9" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="11" cy="4.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="14" cy="7" r="1.5" fill="currentColor" stroke="none"/>
  </Ic>
}
export function IconRadar({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <polygon points="8,2 14,6 12,13.5 4,13.5 2,6"/>
    <polygon points="8,4.8 11.2,7 9.8,11.5 6.2,11.5 4.8,7" strokeOpacity="0.5"/>
    <line x1="8" y1="2" x2="8" y2="4.8" strokeOpacity="0.4"/>
    <line x1="14" y1="6" x2="11.2" y2="7" strokeOpacity="0.4"/>
    <line x1="12" y1="13.5" x2="9.8" y2="11.5" strokeOpacity="0.4"/>
    <line x1="4" y1="13.5" x2="6.2" y2="11.5" strokeOpacity="0.4"/>
    <line x1="2" y1="6" x2="4.8" y2="7" strokeOpacity="0.4"/>
  </Ic>
}
export function IconPie({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <circle cx="8" cy="8" r="6"/>
    <path d="M8 8 L8 2 A6 6 0 0 1 13.2 11 Z" fill="currentColor" stroke="none" opacity="0.7"/>
    <path d="M8 8 L13.2 11 A6 6 0 0 1 2.8 10.5 Z" fill="currentColor" stroke="none" opacity="0.4"/>
    <line x1="8" y1="8" x2="8" y2="2" strokeOpacity="0.6"/>
    <line x1="8" y1="8" x2="13.2" y2="11" strokeOpacity="0.6"/>
    <line x1="8" y1="8" x2="2.8" y2="10.5" strokeOpacity="0.6"/>
  </Ic>
}

// UI action icons
export function IconDrag({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 14" fill="currentColor">
      {([3, 7, 11] as const).map(y =>
        ([2, 8] as const).map(x => <circle key={`${x}${y}`} cx={x} cy={y} r={1.4}/>)
      )}
    </svg>
  )
}
export function IconDuplicate({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="2"/>
      <path d="M11 5V3a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
    </svg>
  )
}
export function IconSliders({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <line x1="2" y1="5" x2="14" y2="5"/>
      <line x1="2" y1="11" x2="14" y2="11"/>
      <circle cx="6" cy="5" r="2.2" fill="var(--surface2)"/>
      <circle cx="10" cy="11" r="2.2" fill="var(--surface2)"/>
    </svg>
  )
}
export function IconExpand({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6V2h4"/>
      <path d="M10 2h4v4"/>
      <path d="M14 10v4h-4"/>
      <path d="M6 14H2v-4"/>
    </svg>
  )
}
export function IconX({ size = 10 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="2" y1="2" x2="8" y2="8"/>
      <line x1="8" y1="2" x2="2" y2="8"/>
    </svg>
  )
}
export function IconPlay({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" stroke="none">
      <polygon points="3.5,1.5 12.5,7 3.5,12.5"/>
    </svg>
  )
}
export function IconPause({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" stroke="none">
      <rect x="2.5" y="2" width="3.5" height="10" rx="1"/>
      <rect x="8" y="2" width="3.5" height="10" rx="1"/>
    </svg>
  )
}
export function IconReset({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
  )
}
export function IconPin({ size = 8 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 16" fill="currentColor" stroke="none">
      <path d="M7 0.5 C4.5 0.5 2.5 2.5 2.5 5 C2.5 8.5 7 15 7 15 S11.5 8.5 11.5 5 C11.5 2.5 9.5 0.5 7 0.5Z M7 7 C5.9 7 5 6.1 5 5 S5.9 3 7 3 S9 3.9 9 5 S8.1 7 7 7Z"/>
    </svg>
  )
}
export function IconEdit({ size = 10 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2 L10 4 L4 10 L1.5 10.5 L2 8 Z"/>
      <line x1="6.5" y1="3.5" x2="8.5" y2="5.5"/>
    </svg>
  )
}
export function IconCheck({ size = 30 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none"
      stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.45">
      <polyline points="5,15 12,22 25,8"/>
    </svg>
  )
}
export function IconTable({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="2" y="2" width="12" height="12" rx="1.5"/>
    <line x1="2" y1="6" x2="14" y2="6"/>
    <line x1="2" y1="10" x2="14" y2="10"/>
    <line x1="6" y1="2" x2="6" y2="14"/>
    <line x1="10" y1="2" x2="10" y2="14"/>
  </Ic>
}

export function IconDraw({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="2"/>
    <path d="M4 10 Q6 5.5 8.5 8 Q10.5 10 12.5 6"/>
  </Ic>
}
export function IconMap({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    {/* Map pin */}
    <path d="M8 1.5C5.52 1.5 3.5 3.52 3.5 6c0 3.75 4.5 8.5 4.5 8.5s4.5-4.75 4.5-8.5C12.5 3.52 10.48 1.5 8 1.5z"/>
    <circle cx="8" cy="6" r="1.6" fill="none"/>
  </Ic>
}
export function IconWeather({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <path d="M3 13a2.5 2.5 0 0 1 0-5h.3a3.5 3.5 0 0 1 6.8-1A2.5 2.5 0 0 1 13 9.5a2 2 0 0 1-2 3.5H3z"/>
  </Ic>
}
export function IconClock({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <circle cx="8" cy="8.5" r="6"/>
    <polyline points="8,5.5 8,8.5 10.5,10.5"/>
  </Ic>
}
export function IconClockDigital({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="1.5" y="4" width="13" height="8" rx="1.5"/>
    <line x1="8" y1="5.5" x2="8" y2="10.5" strokeOpacity="0.3"/>
    <text x="4" y="9.8" fontSize="4.5" fontFamily="monospace" fill="currentColor" stroke="none">88:88</text>
  </Ic>
}
export function IconClockAnalog({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <circle cx="8" cy="8" r="6.5"/>
    <line x1="8" y1="4.5" x2="8" y2="8"/>
    <line x1="8" y1="8" x2="11" y2="9.5"/>
    <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>
  </Ic>
}
export function IconClockMinimal({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <text x="1" y="11" fontSize="8" fontFamily="sans-serif" fontWeight="300" fill="currentColor" stroke="none">12:00</text>
  </Ic>
}
export function IconClockFlip({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="1" y="3" width="6" height="10" rx="1.2"/>
    <rect x="9" y="3" width="6" height="10" rx="1.2"/>
    <line x1="1" y1="8" x2="7" y2="8" strokeOpacity="0.5"/>
    <line x1="9" y1="8" x2="15" y2="8" strokeOpacity="0.5"/>
    <text x="2.5" y="7" fontSize="4" fontFamily="monospace" fill="currentColor" stroke="none">1</text>
    <text x="3" y="12.5" fontSize="4" fontFamily="monospace" fill="currentColor" stroke="none">2</text>
    <text x="10.5" y="7" fontSize="4" fontFamily="monospace" fill="currentColor" stroke="none">3</text>
    <text x="11" y="12.5" fontSize="4" fontFamily="monospace" fill="currentColor" stroke="none">0</text>
  </Ic>
}
export function IconReader({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
    <polyline points="10,2 10,5 13,5"/>
    <line x1="5" y1="7" x2="11" y2="7"/>
    <line x1="5" y1="9.5" x2="11" y2="9.5"/>
    <rect x="4.5" y="11" width="4" height="1.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.7"/>
  </Ic>
}
export function IconSleep({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <path d="M13.5 9.8A6 6 0 0 1 6.2 2.5 6 6 0 1 0 13.5 9.8Z"/>
    <line x1="10.5" y1="3" x2="13.5" y2="3"/>
    <line x1="13.5" y1="3" x2="10.5" y2="6"/>
    <line x1="10.5" y1="6" x2="13.5" y2="6"/>
  </Ic>
}
export function IconAgenda({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <circle cx="3" cy="4" r="1" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="8" r="1" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/>
    <line x1="6" y1="4" x2="14" y2="4"/>
    <line x1="6" y1="8" x2="14" y2="8"/>
    <line x1="6" y1="12" x2="11" y2="12"/>
  </Ic>
}
export function IconLinks({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <rect x="2" y="2" width="5" height="5" rx="1.2"/>
    <rect x="9" y="2" width="5" height="5" rx="1.2"/>
    <rect x="2" y="9" width="5" height="5" rx="1.2"/>
    <line x1="10" y1="13" x2="14" y2="9"/>
    <polyline points="11,9 14,9 14,12"/>
  </Ic>
}
// Icon für das HTML-Widget (Code-Klammern) — eigene, per Nutzer eingefügte
// HTML-Seite, live gerendert.
export function IconHtml({ size, strokeWidth }: P) {
  return <Ic size={size} strokeWidth={strokeWidth}>
    <polyline points="5.5,4 1.5,8 5.5,12"/>
    <polyline points="10.5,4 14.5,8 10.5,12"/>
  </Ic>
}
