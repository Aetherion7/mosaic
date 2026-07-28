'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { Widget, MapData, MapMarker, MapRoute } from '@/types'

type Tool = 'none' | 'marker' | 'route'

function uid() { return `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

// ── Distance helpers ──────────────────────────────────────────────────────────

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180
  const Δφ = (b.lat - a.lat) * Math.PI / 180, Δλ = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function routeDist(pts: Array<{ lat: number; lng: number }>): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i])
  return d
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

// ── Leaflet icon factory ──────────────────────────────────────────────────────

function makeIcon(L: typeof import('leaflet'), color: string, label: string) {
  const dark = color !== '#ffffff' && color !== '#f3f4f6'
  const inner = label
    ? `<text x="16" y="20" text-anchor="middle" font-size="${label.length > 2 ? 6 : 8}" font-weight="700" fill="${dark ? 'white' : '#333'}" font-family="system-ui">${label.slice(0, 3)}</text>`
    : `<circle cx="16" cy="16" r="5" fill="${dark ? 'rgba(255,255,255,0.85)' : '#555'}"/>`
  return L.divIcon({
    html: `<div style="filter:drop-shadow(0 3px 8px rgba(0,0,0,0.5));width:32px;height:42px">
      <svg viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16 0 0 7.16 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.16 24.84 0 16 0Z"
          fill="${color}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
        <circle cx="16" cy="16" r="9" fill="rgba(255,255,255,0.18)"/>
        ${inner}
      </svg>
    </div>`,
    className: '',
    iconSize:    [32, 42],
    iconAnchor:  [16, 42],
    popupAnchor: [0, -44],
  })
}

// ── Draggable waypoint dot icon ───────────────────────────────────────────────

function makeDotIcon(L: typeof import('leaflet'), color: string, endpoint: boolean) {
  const s = endpoint ? 14 : 10
  return L.divIcon({
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:grab"></div>`,
    className: '',
    iconSize:   [s, s],
    iconAnchor: [s / 2, s / 2],
  })
}

// ── Widget ────────────────────────────────────────────────────────────────────

export default function MapWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const updateWidget = useBoardStore(s => s.updateWidget)
  const mode         = useUIStore(s => s.mode)
  const d            = widget.data as MapData

  const dRef = useRef(d)
  dRef.current = d
  const langRef = useRef(lang)
  langRef.current = lang

  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<import('leaflet').Map | null>(null)
  const leafletRef      = useRef<typeof import('leaflet') | null>(null)
  const markerLayersRef = useRef<Map<string, import('leaflet').Marker>>(new Map())
  const routeLayersRef  = useRef<Map<string, { poly: import('leaflet').Polyline; wpts: import('leaflet').Marker[] }>>(new Map())
  const previewPolyRef  = useRef<import('leaflet').Polyline | null>(null)
  const previewDotsRef  = useRef<import('leaflet').CircleMarker[]>([])
  const clickHandlerRef = useRef<((e: import('leaflet').LeafletMouseEvent) => void) | null>(null)
  const skipNextMapClickRef = useRef(false)

  const [tool,           setTool]          = useState<Tool>('none')
  const [routePts,       setRoutePts]      = useState<Array<{ lat: number; lng: number }>>([])
  const [activeColor,    setActiveColor]   = useState(COLORS[4])
  const [initialized,    setInitialized]   = useState(false)
  const [directoryOpen,  setDirectoryOpen] = useState(false)
  const [editingLabel,   setEditingLabel]  = useState<{ type: 'marker' | 'route'; id: string; val: string } | null>(null)

  const [markerPanel, setMarkerPanel] = useState<{ id: string; label: string } | null>(null)

  const [searchQ,       setSearchQ]       = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searching,     setSearching]     = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const toolRef = useRef<Tool>('none')
  toolRef.current = tool

  const patch = useCallback((p: Partial<MapData>) => {
    updateWidget(widget.id, { data: { ...dRef.current, ...p } })
  }, [updateWidget, widget.id])

  // ── Initialize Leaflet (once) ─────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let alive = true

    async function init() {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (!alive || !containerRef.current) return

      const map = L.map(containerRef.current, {
        center:             [dRef.current.centerLat, dRef.current.centerLng],
        zoom:               dRef.current.zoom,
        zoomControl:        false,
        attributionControl: false,
      })

      L.control.zoom({ position: 'topleft' }).addTo(map)
      L.control.attribution({ prefix: false, position: 'bottomright' })
        .addAttribution('© <a href="https://osm.org/copyright" target="_blank" rel="noopener">OSM</a>')
        .addTo(map)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

      map.on('moveend', () => {
        const c = map.getCenter()
        updateWidget(widget.id, { data: { ...dRef.current, centerLat: c.lat, centerLng: c.lng, zoom: map.getZoom() } })
      })

      map.on('click', () => {
        if (skipNextMapClickRef.current) { skipNextMapClickRef.current = false; return }
        setMarkerPanel(null)
        setSearchOpen(false)
        setEditingLabel(null)
      })

      mapRef.current     = map
      leafletRef.current = L
      setInitialized(true)
    }

    init()
    return () => {
      alive = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current     = null
        leafletRef.current = null
        markerLayersRef.current.clear()
        routeLayersRef.current.clear()
        setInitialized(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync markers ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!initialized || !mapRef.current || !leafletRef.current) return
    const L   = leafletRef.current
    const map = mapRef.current
    const existing = markerLayersRef.current

    const newIds = new Set(d.markers.map(m => m.id))
    for (const [id, layer] of existing) {
      if (!newIds.has(id)) { layer.remove(); existing.delete(id) }
    }
    for (const m of d.markers) {
      const icon = makeIcon(L, m.color, m.label)
      if (existing.has(m.id)) {
        const marker = existing.get(m.id)!
        marker.setLatLng([m.lat, m.lng]).setIcon(icon)
        marker.unbindTooltip()
        if (m.label) marker.bindTooltip(m.label, { direction: 'top', offset: [0, -44] })
      } else {
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map)
        if (m.label) marker.bindTooltip(m.label, { direction: 'top', offset: [0, -44] })
        marker.on('click', () => {
          if (toolRef.current !== 'none') return
          skipNextMapClickRef.current = true
          const current = dRef.current.markers.find(x => x.id === m.id)
          setMarkerPanel({ id: m.id, label: current?.label ?? '' })
        })
        existing.set(m.id, marker)
      }
    }
  }, [initialized, d.markers])

  // ── Sync routes (with draggable waypoints) ────────────────────────────────

  useEffect(() => {
    if (!initialized || !mapRef.current || !leafletRef.current) return
    const L   = leafletRef.current
    const map = mapRef.current
    const existing = routeLayersRef.current

    const newIds = new Set(d.routes.map(r => r.id))
    for (const [id, { poly, wpts }] of existing) {
      if (!newIds.has(id)) {
        poly.remove()
        wpts.forEach(w => w.remove())
        existing.delete(id)
      }
    }

    for (const route of d.routes) {
      const latlngs = route.points.map(p => [p.lat, p.lng] as [number, number])
      const dist    = routeDist(route.points)
      const tip     = route.label ? `${route.label} · ${fmtDist(dist)}` : fmtDist(dist)

      if (existing.has(route.id)) {
        const { poly, wpts } = existing.get(route.id)!
        poly.setLatLngs(latlngs).setStyle({ color: route.color })
        poly.unbindTooltip()
        if (route.points.length > 1) poly.bindTooltip(tip, { sticky: true })
        if (wpts.length === route.points.length) {
          wpts.forEach((w, i) => {
            const p  = route.points[i]
            const ep = i === 0 || i === route.points.length - 1
            w.setLatLng([p.lat, p.lng]).setIcon(makeDotIcon(L, route.color, ep))
          })
        } else {
          wpts.forEach(w => w.remove())
          existing.set(route.id, { poly, wpts: buildWpts(route, poly) })
        }
      } else {
        const poly = L.polyline(latlngs, {
          color: route.color, weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round',
        }).addTo(map)
        if (route.points.length > 1) poly.bindTooltip(tip, { sticky: true })
        existing.set(route.id, { poly, wpts: buildWpts(route, poly) })
      }
    }

    function buildWpts(route: MapRoute, poly: import('leaflet').Polyline): import('leaflet').Marker[] {
      const wpts: import('leaflet').Marker[] = []
      route.points.forEach((p, i) => {
        const ep = i === 0 || i === route.points.length - 1
        const m  = L.marker([p.lat, p.lng], {
          icon:      makeDotIcon(L, route.color, ep),
          draggable: true,
        }).addTo(map)

        m.on('drag', () => {
          poly.setLatLngs(wpts.map(w => w.getLatLng()))
        })
        m.on('dragend', () => {
          const newPts = wpts.map(w => { const ll = w.getLatLng(); return { lat: ll.lat, lng: ll.lng } })
          patch({ routes: dRef.current.routes.map(r => r.id === route.id ? { ...r, points: newPts } : r) })
        })
        wpts.push(m)
      })
      return wpts
    }
  }, [initialized, d.routes, patch])

  // ── Map click handler ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!initialized || !mapRef.current) return
    const map = mapRef.current

    if (clickHandlerRef.current) {
      map.off('click', clickHandlerRef.current)
      clickHandlerRef.current = null
    }

    if (tool === 'marker') {
      const handler = (e: import('leaflet').LeafletMouseEvent) => {
        const m: MapMarker = { id: uid(), lat: e.latlng.lat, lng: e.latlng.lng, label: '', color: activeColor }
        patch({ markers: [...dRef.current.markers, m] })
      }
      clickHandlerRef.current = handler
      map.on('click', handler)
    }
    if (tool === 'route') {
      const handler = (e: import('leaflet').LeafletMouseEvent) => {
        setRoutePts(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }])
      }
      clickHandlerRef.current = handler
      map.on('click', handler)
    }
  }, [initialized, tool, activeColor, patch])

  // ── Preview polyline while drawing ────────────────────────────────────────

  useEffect(() => {
    if (!initialized || !leafletRef.current || !mapRef.current) return
    const L   = leafletRef.current
    const map = mapRef.current

    previewPolyRef.current?.remove()
    previewPolyRef.current = null
    previewDotsRef.current.forEach(d => d.remove())
    previewDotsRef.current = []

    if (routePts.length >= 2) {
      previewPolyRef.current = L.polyline(
        routePts.map(p => [p.lat, p.lng] as [number, number]),
        { color: activeColor, weight: 3, dashArray: '8 5', opacity: 0.75, lineCap: 'round' }
      ).addTo(map)
    }
    previewDotsRef.current = routePts.map((p, i) => {
      const isEndpoint = i === 0 || i === routePts.length - 1
      return L.circleMarker([p.lat, p.lng], {
        radius: isEndpoint ? 7 : 4, fillColor: activeColor,
        color: 'white', weight: 2, opacity: 1, fillOpacity: 0.9,
      }).addTo(map)
    })
  }, [routePts, initialized, activeColor])

  // ── Geocoding search (Nominatim) ──────────────────────────────────────────

  function onSearchChange(q: string) {
    setSearchQ(q)
    clearTimeout(searchDebounceRef.current)
    if (!q.trim()) { setSearchResults([]); setSearchOpen(false); return }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=${langRef.current}`)
        const data = await res.json() as NominatimResult[]
        setSearchResults(data)
        setSearchOpen(true)
      } catch { /* network error — silently ignore */ } finally {
        setSearching(false)
      }
    }, 600)
  }

  function selectSearchResult(r: NominatimResult) {
    if (!mapRef.current) return
    mapRef.current.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 13, { duration: 1 })
    setSearchResults([])
    setSearchOpen(false)
    setSearchQ('')
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function fitBounds() {
    if (!mapRef.current) return
    const allPoints: [number, number][] = [
      ...dRef.current.markers.map(m => [m.lat, m.lng] as [number, number]),
      ...dRef.current.routes.flatMap(r => r.points.map(p => [p.lat, p.lng] as [number, number])),
    ]
    if (allPoints.length === 0) return
    if (allPoints.length === 1) { mapRef.current.setView(allPoints[0], 14); return }
    mapRef.current.fitBounds(allPoints, { padding: [30, 30] })
  }

  function flyTo(lat: number, lng: number) {
    mapRef.current?.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 13), { duration: 0.8 })
  }

  function commitRoute() {
    if (routePts.length < 2) return
    patch({ routes: [...dRef.current.routes, { id: uid(), points: routePts, color: activeColor, label: '' }] })
    setRoutePts([])
  }

  function selectTool(t: Tool) {
    setTool(prev => prev === t ? 'none' : t)
    setRoutePts([])
    setMarkerPanel(null)
  }

  function saveMarkerLabel() {
    if (!markerPanel) return
    patch({ markers: dRef.current.markers.map(m => m.id === markerPanel.id ? { ...m, label: markerPanel.label } : m) })
    setMarkerPanel(null)
  }

  function deleteMarker(id: string) {
    patch({ markers: dRef.current.markers.filter(m => m.id !== id) })
    setMarkerPanel(null)
  }

  function deleteRoute(id: string) {
    patch({ routes: dRef.current.routes.filter(r => r.id !== id) })
  }

  function saveDirLabel() {
    if (!editingLabel) return
    if (editingLabel.type === 'marker') {
      patch({ markers: dRef.current.markers.map(m => m.id === editingLabel.id ? { ...m, label: editingLabel.val } : m) })
    } else {
      patch({ routes: dRef.current.routes.map(r => r.id === editingLabel.id ? { ...r, label: editingLabel.val } : r) })
    }
    setEditingLabel(null)
  }

  const isEdit     = mode === 'edit'
  const hasContent = d.markers.length > 0 || d.routes.length > 0
  const totalItems = d.markers.length + d.routes.length

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* ── Top bar: search + toolbar ── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 7px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        zIndex: 10, minWidth: 0,
      }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: 60, position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'var(--surface2)',
            borderRadius: 7, border: '1px solid var(--border)',
          }}>
            {searching
              ? <div style={{ width: 10, height: 10, margin: '0 7px', flexShrink: 0, border: '1.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'map-spin 0.7s linear infinite' }} />
              : <svg style={{ margin: '0 7px', flexShrink: 0 }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            }
            <input
              value={searchQ}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setSearchQ(''); setSearchResults([]); setSearchOpen(false) }
                if (e.key === 'Enter' && searchResults[0]) selectSearchResult(searchResults[0])
              }}
              placeholder={t('Search location…')}
              className="map-search-input"
              style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--text1)', fontSize: 11, padding: '5px 4px 5px 0' }}
            />
            {searchQ && (
              <button onClick={() => { setSearchQ(''); setSearchResults([]); setSearchOpen(false) }}
                title={t('Clear search')}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '0 6px', fontSize: 13, lineHeight: 1 }}>×</button>
            )}
          </div>

          {searchOpen && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 3, zIndex: 1100,
              background: 'color-mix(in srgb, var(--surface) 95%, transparent)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)', borderRadius: 8,
              overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              {searchResults.map(r => (
                <button key={r.place_id} onClick={() => selectSearchResult(r)}
                  style={{ display: 'block', width: '100%', border: 'none', font: 'inherit', padding: '6px 10px', fontSize: 11, color: 'var(--text1)', background: 'transparent', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {r.display_name.split(',').slice(0, 3).join(', ')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Edit toolbar — only in edit mode */}
        {isEdit && (
          <>
            <Divider />

            <ToolBtn active={tool === 'marker'} title={t('Place marker')} onClick={() => selectTool('marker')}>
              <PinSvg />
            </ToolBtn>
            <ToolBtn active={tool === 'route'} title={t('Draw route')} onClick={() => selectTool('route')}>
              <RouteSvg />
            </ToolBtn>

            <Divider />

            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => setActiveColor(c)} style={{
                  width: 13, height: 13, borderRadius: '50%', background: c,
                  border: activeColor === c ? '2px solid var(--text1)' : '1.5px solid rgba(255,255,255,0.18)',
                  cursor: 'pointer', padding: 0, flexShrink: 0,
                  outline: activeColor === c ? '2px solid color-mix(in srgb, var(--accent) 40%, transparent)' : 'none',
                  outlineOffset: 1,
                  transform: activeColor === c ? 'scale(1.3)' : 'scale(1)',
                  transition: 'transform 0.1s',
                }} />
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {hasContent && (
              <ToolBtn title={t('Zoom to content')} onClick={fitBounds}>
                <FitSvg />
              </ToolBtn>
            )}

            <Divider />

            <ToolBtn title={t('Remove last marker')}
              onClick={() => patch({ markers: dRef.current.markers.slice(0, -1) })}
              disabled={!d.markers.length}>
              <RemoveMarkerSvg />
            </ToolBtn>
            <ToolBtn title={t('Remove last route')}
              onClick={() => patch({ routes: dRef.current.routes.slice(0, -1) })}
              disabled={!d.routes.length}>
              <RemoveRouteSvg />
            </ToolBtn>
            <ToolBtn title={t('Clear all')}
              onClick={() => { patch({ markers: [], routes: [] }); setRoutePts([]) }}
              disabled={!hasContent} danger>
              <TrashSvg />
            </ToolBtn>

            <Divider />
          </>
        )}

        {/* Directory button — always visible */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ToolBtn active={directoryOpen} title={t('Open directory')} onClick={() => setDirectoryOpen(v => !v)}>
            <ListSvg />
          </ToolBtn>
          {totalItems > 0 && !directoryOpen && (
            <div style={{
              position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14,
              borderRadius: 7, padding: '0 3px',
              background: 'var(--accent)', color: 'white',
              fontSize: 8, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', boxSizing: 'border-box',
            }}>
              {totalItems > 99 ? '99+' : totalItems}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, zIndex: 0 }} />

      {/* ── Directory panel ── */}
      {directoryOpen && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 48, right: 8, bottom: 50, zIndex: 1001,
            width: 240, display: 'flex', flexDirection: 'column',
            background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--border)', gap: 7, flexShrink: 0 }}>
            <ListSvg />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)', flex: 1 }}>{t('Directory')}</span>
            <button onClick={() => setDirectoryOpen(false)} title={t('Close')}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

            {/* Markers */}
            {d.markers.length > 0 && (
              <div>
                <div style={{ padding: '4px 10px 2px', fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t('Markers')} ({d.markers.length})
                </div>
                {d.markers.map(m => (
                  <div key={m.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px 5px 10px' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: m.color, border: '1.5px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />

                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      role="button" tabIndex={0}
                      onClick={() => flyTo(m.lat, m.lng)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flyTo(m.lat, m.lng) } }}
                    >
                      {editingLabel?.id === m.id ? (
                        <input
                          autoFocus
                          value={editingLabel.val}
                          onChange={e => setEditingLabel(x => x ? { ...x, val: e.target.value } : null)}
                          onBlur={saveDirLabel}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveDirLabel(); if (e.key === 'Escape') setEditingLabel(null) }}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text1)', padding: '1px 5px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                        />
                      ) : (
                        <>
                          <div
                            style={{ fontSize: 11, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            onClick={e => { e.stopPropagation(); setEditingLabel({ type: 'marker', id: m.id, val: m.label }) }}
                            title={m.label ? t('Click to edit') : t('Click to name')}
                          >
                            {m.label || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>{t('Unnamed')}</span>}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>
                            {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={e => { e.stopPropagation(); deleteMarker(m.id) }}
                      title={t('Delete marker')}
                      style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Routes */}
            {d.routes.length > 0 && (
              <div style={{ marginTop: d.markers.length > 0 ? 6 : 0 }}>
                <div style={{ padding: '4px 10px 2px', fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t('Routes')} ({d.routes.length})
                </div>
                {d.routes.map((r, ri) => (
                  <div key={r.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px 5px 10px' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: r.color, flexShrink: 0 }} />

                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      role="button" tabIndex={0}
                      onClick={() => { if (r.points.length > 0) flyTo(r.points[0].lat, r.points[0].lng) }}
                      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && r.points.length > 0) { e.preventDefault(); flyTo(r.points[0].lat, r.points[0].lng) } }}
                    >
                      {editingLabel?.id === r.id ? (
                        <input
                          autoFocus
                          value={editingLabel.val}
                          onChange={e => setEditingLabel(x => x ? { ...x, val: e.target.value } : null)}
                          onBlur={saveDirLabel}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveDirLabel(); if (e.key === 'Escape') setEditingLabel(null) }}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text1)', padding: '1px 5px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                        />
                      ) : (
                        <>
                          <div
                            style={{ fontSize: 11, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            onClick={e => { e.stopPropagation(); setEditingLabel({ type: 'route', id: r.id, val: r.label }) }}
                            title={r.label ? t('Click to edit') : t('Click to name')}
                          >
                            {r.label || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Route {ri + 1}</span>}
                          </div>
                          <div style={{ fontSize: 9, marginTop: 1, display: 'flex', gap: 6 }}>
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmtDist(routeDist(r.points))}</span>
                            <span style={{ color: 'var(--text3)' }}>{r.points.length} {t('points')}</span>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={e => { e.stopPropagation(); deleteRoute(r.id) }}
                      title={t('Delete route')}
                      style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text3)' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {totalItems === 0 && (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>
                {t('No markers or routes yet.')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Marker panel */}
      {markerPanel && (
        <div style={{
          position: 'absolute', top: 48, right: directoryOpen ? 258 : 8, zIndex: 1001,
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: 12, minWidth: 180,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t('Edit marker')}</div>
          <input autoFocus value={markerPanel.label}
            onChange={e => setMarkerPanel(p => p ? { ...p, label: e.target.value } : null)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') saveMarkerLabel(); if (e.key === 'Escape') setMarkerPanel(null) }}
            placeholder={t('Label…')}
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 12,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 7, color: 'var(--text1)', padding: '5px 8px', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={saveMarkerLabel} style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: '5px 0', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer' }}>
              {t('Save')}
            </button>
            <button onClick={() => deleteMarker(markerPanel.id)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer' }}>
              {t('Delete')}
            </button>
          </div>
        </div>
      )}

      {/* Route drawing HUD */}
      {tool === 'route' && isEdit && (
        <div style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1001, display: 'flex', gap: 6, alignItems: 'center',
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 10, padding: '6px 12px',
          color: 'var(--text1)', fontSize: 11, whiteSpace: 'nowrap',
          border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          <span style={{ color: 'var(--text2)' }}>
            {routePts.length === 0 ? t('Click on the map to set points') : `${routePts.length} ${routePts.length !== 1 ? t('points') : t('point')} ${t('set')}`}
          </span>
          {routePts.length > 1 && (
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {fmtDist(routeDist(routePts))}
            </span>
          )}
          {routePts.length > 0 && (
            <button onClick={() => setRoutePts(prev => prev.slice(0, -1))} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer' }}>
              ← {t('Back')}
            </button>
          )}
          {routePts.length >= 2 && (
            <button onClick={commitRoute} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer' }}>
              {t('Save')}
            </button>
          )}
          {routePts.length > 0 && (
            <button onClick={() => setRoutePts([])} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer' }}>
              {t('Cancel')}
            </button>
          )}
        </div>
      )}

      {/* Active tool badge */}
      {tool !== 'none' && isEdit && (
        <div style={{
          position: 'absolute', bottom: 10, right: 8, zIndex: 1000,
          background: 'var(--accent)', color: 'white',
          fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {tool === 'marker' ? 'Marker' : 'Route'} {t('active')}
        </div>
      )}

      <style>{`
        @keyframes map-spin { to { transform: rotate(360deg) } }
        .map-search-input::placeholder { color: var(--text3); opacity: 1; }
      `}</style>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
}

function ToolBtn({ children, onClick, active, title, disabled, danger }: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  title?: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        height: 28, minWidth: 28, padding: '0 6px',
        borderRadius: 6,
        border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'var(--accent)' : 'var(--surface2)',
        color: active ? 'white' : danger ? '#ef4444' : 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        flexShrink: 0,
        transition: 'background 0.12s, opacity 0.12s',
      }}
    >
      {children}
    </button>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PinSvg() {
  return (
    <svg width="11" height="14" viewBox="0 0 32 42" fill="currentColor">
      <path d="M16 0C7.16 0 0 7.16 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.16 24.84 0 16 0Z"/>
      <circle cx="16" cy="16" r="6" fill="rgba(0,0,0,0.25)"/>
    </svg>
  )
}

function RouteSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="5" cy="19" r="2.5" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="5" r="2.5" fill="currentColor" stroke="none"/>
      <path d="M5 17 C5 11 19 13 19 7"/>
    </svg>
  )
}

function RemoveMarkerSvg() {
  return (
    <svg width="16" height="13" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1C5.79 1 4 2.79 4 5c0 3.3 4 8.5 4 8.5S12 8.3 12 5c0-2.21-1.79-4-4-4z"/>
      <circle cx="8" cy="5" r="1.6" fill="currentColor" fillOpacity="0.3" stroke="none"/>
      <line x1="15" y1="6.5" x2="20" y2="6.5"/>
    </svg>
  )
}

function RemoveRouteSvg() {
  return (
    <svg width="16" height="13" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 13 C2 8 11 8 11 3"/>
      <circle cx="2" cy="13" r="2" fill="currentColor" stroke="none"/>
      <circle cx="11" cy="3" r="2" fill="currentColor" stroke="none"/>
      <line x1="15" y1="8" x2="20" y2="8"/>
    </svg>
  )
}

function FitSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  )
}

function TrashSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

function ListSvg() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <circle cx="3" cy="6" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="3" cy="12" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="3" cy="18" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  )
}
