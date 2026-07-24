'use client'
import { useBoardStore, selectBoard } from '@/store/boardStore'
import { DEFAULT_BG } from '@/lib/defaults'
import type { BoardBg } from '@/types'

function bgCss(bg: BoardBg): React.CSSProperties {
  if (bg.type === 'gradient') {
    const dirs: Record<string, string> = {
      'to-r': '90deg', 'to-br': '135deg', 'to-b': '180deg', 'to-bl': '225deg',
      'to-l': '270deg', 'to-tl': '315deg', 'to-t': '0deg', 'to-tr': '45deg',
    }
    return { background: `linear-gradient(${dirs[bg.gradientDir]}, ${bg.gradient[0]}, ${bg.gradient[1]})` }
  }
  if (bg.type === 'image' && bg.imageUrl) {
    // Always apply both filters so toggling brightness/blur is smooth
    return {
      backgroundImage:    `url(${bg.imageUrl})`,
      backgroundSize:     'cover',
      backgroundPosition: 'center center',
      backgroundRepeat:   'no-repeat',
      filter:             `brightness(${bg.imageBrightness ?? 1}) blur(${bg.imageBlur ?? 0}px)`,
    }
  }
  return { background: bg.color }
}

function patternCss(bg: BoardBg): React.CSSProperties {
  if (bg.pattern === 'dots') {
    return {
      backgroundImage: `radial-gradient(circle, ${bg.patternColor} 1px, transparent 1px)`,
      backgroundSize:  '28px 28px',
      opacity:         bg.patternOpacity,
    }
  }
  if (bg.pattern === 'grid') {
    return {
      backgroundImage: `
        linear-gradient(${bg.patternColor} 1px, transparent 1px),
        linear-gradient(90deg, ${bg.patternColor} 1px, transparent 1px)
      `,
      backgroundSize: '40px 40px',
      opacity:        bg.patternOpacity,
    }
  }
  return { display: 'none' }
}

export default function CanvasBackground() {
  const bg = useBoardStore(s => selectBoard(s)?.bg ?? DEFAULT_BG)

  // When blur is active, extend the div beyond the viewport so blurred edges
  // are clipped by the browser viewport, not visible as a faded border.
  const blurPad = bg.type === 'image' && (bg.imageBlur ?? 0) > 0
    ? (bg.imageBlur ?? 0) * 2 + 10
    : 0
  const insetVal = blurPad > 0 ? `-${blurPad}px` : 0

  return (
    <>
      <div style={{ position: 'absolute', inset: insetVal, ...bgCss(bg) }} />
      {bg.pattern !== 'none' && bg.pattern !== 'columns' && (
        <div style={{
          position: 'absolute', inset: 0,
          ...patternCss(bg),
          pointerEvents: 'none',
        }} />
      )}
    </>
  )
}
