export async function exportBoardAsPng(boardName: string): Promise<void> {
  const { toPng } = await import('html-to-image')

  const target = document.querySelector<HTMLElement>('[data-board-grid]') ?? document.body

  // Collect CSS rules ourselves so we can skip cross-origin sheets that would
  // throw a SecurityError when html-to-image tries to read their cssRules.
  const fontEmbedCSS = Array.from(document.styleSheets).flatMap(sheet => {
    try {
      return Array.from(sheet.cssRules).map(r => r.cssText)
    } catch {
      return []
    }
  }).join('\n')

  // Crop to the bounding box of the actual widgets. In infinite mode the grid
  // element spans 100×100 cells (~12,400px per side) — rendering that whole
  // area to a canvas exceeds browser limits, so we must not export it fully.
  // offsetLeft/offsetTop are layout values, unaffected by the canvas zoom transform.
  const tiles = Array.from(target.querySelectorAll<HTMLElement>('[data-widget-tile]'))
  let cropOpts: Record<string, unknown> = {}
  if (tiles.length > 0) {
    const PAD  = 24
    const minX = Math.max(0, Math.min(...tiles.map(t => t.offsetLeft)) - PAD)
    const minY = Math.max(0, Math.min(...tiles.map(t => t.offsetTop)) - PAD)
    const maxX = Math.max(...tiles.map(t => t.offsetLeft + t.offsetWidth)) + PAD
    const maxY = Math.max(...tiles.map(t => t.offsetTop + t.offsetHeight)) + PAD
    cropOpts = {
      width:  maxX - minX,
      height: maxY - minY,
      style: {
        transform:       `translate(${-minX}px, ${-minY}px)`,
        transformOrigin: '0 0',
      },
    }
  }

  const dataUrl = await toPng(target, {
    cacheBust: true,
    pixelRatio: window.devicePixelRatio || 2,
    fontEmbedCSS,
    filter: (node) => {
      if (node instanceof HTMLElement && node.tagName === 'IFRAME') return false
      return true
    },
    ...cropOpts,
  })

  const link = document.createElement('a')
  link.href     = dataUrl
  link.download = `${boardName.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')}.png`
  link.click()
}
