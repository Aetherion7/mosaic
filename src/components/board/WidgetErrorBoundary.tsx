'use client'
import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { crashed: boolean }

export default class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 8, padding: 16, textAlign: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 160, lineHeight: 1.5 }}>
          Widget konnte nicht geladen werden
        </span>
        <button
          onClick={() => this.setState({ crashed: false })}
          style={{
            padding: '4px 12px', fontSize: 11, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text2)', cursor: 'pointer',
          }}
        >
          Neu laden
        </button>
      </div>
    )
  }
}
