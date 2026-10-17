'use client'
import { useRef, useState } from 'react'
import { PortalPopover } from '@/components/ui/PortalPopover'

// Generic replacement for a native <select> — mosaic's own button+chevron
// trigger opening a floating option list (same shape as SleepWidget's
// TimeFormatPicker / BoardsPanel's ThemeSelect), built on PortalPopover so it
// also escapes an overflow:hidden widget tile instead of getting clipped.
export interface DropdownOption {
  value: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

export function Dropdown({
  value, options, onChange, title, disabled, placeholder, buttonStyle, popoverWidth, align = 'left',
}: {
  value: string
  options: DropdownOption[]
  onChange: (v: string) => void
  title?: string
  disabled?: boolean
  placeholder?: string
  buttonStyle?: React.CSSProperties
  popoverWidth?: number
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const current = options.find(o => o.value === value)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
          fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 7,
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          background: 'var(--surface2)', color: disabled ? 'var(--text3)' : 'var(--text1)',
          cursor: disabled ? 'default' : 'pointer', textAlign: align,
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.12s',
          ...buttonStyle,
        }}
      >
        {current?.icon}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.label ?? placeholder ?? ''}
        </span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <PortalPopover open={open} anchorRef={btnRef} onClose={() => setOpen(false)} width={popoverWidth}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 1, padding: 4, maxHeight: 280, overflowY: 'auto',
          background: 'var(--popover-bg)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)', borderRadius: 7,
          boxShadow: '0 8px 28px color-mix(in srgb, var(--shadow-color, #000) 40%, transparent)',
        }}>
          {options.map(o => {
            const active = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onClick={() => { if (o.disabled) return; onChange(o.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                  fontSize: 11, fontWeight: active ? 700 : 500, padding: '6px 9px', borderRadius: 7,
                  border: 'none', textAlign: 'left', whiteSpace: 'nowrap',
                  background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                  color: o.disabled ? 'var(--text3)' : active ? 'var(--accent)' : 'var(--text2)',
                  cursor: o.disabled ? 'default' : 'pointer',
                  opacity: o.disabled ? 0.4 : 1,
                }}
              >
                {o.icon}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
              </button>
            )
          })}
        </div>
      </PortalPopover>
    </>
  )
}
