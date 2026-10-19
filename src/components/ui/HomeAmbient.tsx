'use client'
import { useEffect, useRef } from 'react'

// The website's ambient background (docs/index.html: `.aura`, the grain
// overlay and the `#tiles` canvas), ported 1:1 for the board overview:
// four slowly drifting, heavily blurred color fields under a vignette, a
// fine noise grain, and grid tiles that light up around the cursor and fade
// out again. `light` swaps in a pale palette for the light overview mode.

const ORBS = {
  dark:  ['#07184a', '#040f2e', '#081e52', '#062a52'],
  light: ['#b9cfff', '#cfdfff', '#a6c2ff', '#c3d9ff'],
}

const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

const CSS = `
.home-aura { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.home-aura i { position: absolute; border-radius: 50%; filter: blur(120px); opacity: .4; will-change: transform; }
.home-aura i:nth-child(1) { width: 62vw; height: 62vw; left: -18vw; top: -22vw; animation: home-f1 34s ease-in-out infinite alternate; }
.home-aura i:nth-child(2) { width: 55vw; height: 55vw; right: -20vw; top: 10vh; animation: home-f2 41s ease-in-out infinite alternate; }
.home-aura i:nth-child(3) { width: 48vw; height: 48vw; left: 20vw; bottom: -30vw; animation: home-f3 38s ease-in-out infinite alternate; opacity: .45; }
.home-aura i:nth-child(4) { width: 30vw; height: 30vw; left: 45vw; top: 30vh; animation: home-f4 29s ease-in-out infinite alternate; opacity: .25; }
@keyframes home-f1 { to { transform: translate(22vw, 18vh) scale(1.15); } }
@keyframes home-f2 { to { transform: translate(-26vw, 30vh) scale(.9); } }
@keyframes home-f3 { to { transform: translate(18vw, -40vh) scale(1.2); } }
@keyframes home-f4 { to { transform: translate(-30vw, -10vh) scale(1.4); } }
.home-aura::after { content: ''; position: absolute; inset: 0; background: var(--home-vignette); }
.home-aura.still i { animation: none; }
@media (prefers-reduced-motion: reduce) { .home-aura i { animation: none; } }
`

export function HomeAmbient({ mode, motion }: { mode: 'dark' | 'light'; motion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !motion) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover)').matches) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const light = mode === 'light'
    let dpr = 1, W = 0, H = 0, raf = 0, lastSpawn = 0, prev = 0
    const G = 22, GAP = 6
    type Tile = { gx: number; gy: number; w: number; h: number; t: number; life: number; l: number }
    let tiles: Tile[] = []
    const used = new Set<string>()

    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = c!.width = innerWidth * dpr; H = c!.height = innerHeight * dpr
      c!.style.width = innerWidth + 'px'; c!.style.height = innerHeight + 'px'
    }
    size()
    addEventListener('resize', size)

    // A tile only appears where all of its cells are free, so tiles never
    // overlap and keep the same gap between them.
    const free = (gx: number, gy: number, w: number, h: number) => {
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (used.has(`${gx + i},${gy + j}`)) return false
      return true
    }
    const mark = (q: Tile, v: boolean) => {
      for (let i = 0; i < q.w; i++) for (let j = 0; j < q.h; j++) {
        const k = `${q.gx + i},${q.gy + j}`
        if (v) used.add(k); else used.delete(k)
      }
    }
    function spawn(x: number, y: number) {
      // Mostly squares of mixed size, some elongated rectangles.
      for (let tries = 0; tries < 8; tries++) {
        let w: number, h: number
        if (Math.random() < .7) {
          w = h = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5][Math.random() * 10 | 0]
        } else {
          const short = 2 + (Math.random() * 2 | 0), long = short + 1 + (Math.random() * 3 | 0)
          const horiz = Math.random() < .5; w = horiz ? long : short; h = horiz ? short : long
        }
        const gx = Math.floor((x + (Math.random() - .5) * 160) / G - w / 2)
        const gy = Math.floor((y + (Math.random() - .5) * 160) / G - h / 2)
        if (!free(gx, gy, w, h)) continue
        const q: Tile = { gx, gy, w, h, t: 0, life: 1800 + Math.random() * 1800, l: 34 + Math.random() * 16 }
        mark(q, true); tiles.push(q)
        break
      }
      if (!raf) raf = requestAnimationFrame(draw)
    }
    function onMove(e: PointerEvent) {
      const now = performance.now()
      if (now - lastSpawn < 18) return
      lastSpawn = now; spawn(e.clientX, e.clientY); spawn(e.clientX, e.clientY)
    }
    addEventListener('pointermove', onMove, { passive: true })

    function draw(t: number) {
      const dt = prev ? t - prev : 16; prev = t
      ctx!.clearRect(0, 0, W, H)
      tiles = tiles.filter(q => { q.t += dt; if (q.t >= q.life) { mark(q, false); return false } return true })
      for (const q of tiles) {
        const p = q.t / q.life
        let a = p < .25 ? p / .25 : 1 - (p - .25) / .75
        a = a * a * (light ? .22 : .14)
        const x = (q.gx * G + GAP / 2) * dpr, y = (q.gy * G + GAP / 2) * dpr
        const ww = (q.w * G - GAP) * dpr, hh = (q.h * G - GAP) * dpr
        ctx!.beginPath()
        ctx!.roundRect(x, y, ww, hh, 5 * dpr)
        ctx!.fillStyle = `hsla(218,80%,${light ? q.l + 20 : q.l}%,${a * .45})`
        ctx!.fill()
        ctx!.strokeStyle = `hsla(215,85%,${light ? 52 : 62}%,${a})`
        ctx!.lineWidth = dpr; ctx!.stroke()
      }
      if (tiles.length) raf = requestAnimationFrame(draw); else { raf = 0; prev = 0 }
    }

    return () => {
      removeEventListener('resize', size)
      removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, W, H)
    }
  }, [mode, motion])

  const orbs = ORBS[mode]
  return (
    <>
      <style>{CSS}</style>
      <div aria-hidden className={`home-aura${motion ? '' : ' still'}`}
        style={{ ['--home-vignette' as string]: mode === 'dark'
          ? 'radial-gradient(ellipse at center, transparent 30%, rgba(2,4,11,.85) 100%)'
          : 'radial-gradient(ellipse at center, transparent 35%, rgba(238,243,252,.8) 100%)' }}>
        {orbs.map((c, i) => <i key={i} style={{ background: c }} />)}
      </div>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2000, opacity: mode === 'dark' ? .06 : .04, backgroundImage: NOISE }} />
    </>
  )
}
