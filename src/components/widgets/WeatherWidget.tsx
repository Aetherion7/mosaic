'use client'
import { useEffect, useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import { useUIStore } from '@/store/uiStore'
import { useSettings } from '@/store/settingsStore'
import { useT } from '@/hooks/useT'
import type { Widget, WeatherWidgetData } from '@/types'

// ── WMO code → label + category ──────────────────────────────────────────────

type WCat = 'clear' | 'pcloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

function wmo(code: number, t: (s: string) => string): { label: string; cat: WCat } {
  if (code === 0)  return { label: t('Clear sky'),      cat: 'clear'   }
  if (code <= 2)   return { label: t('Partly cloudy'),  cat: 'pcloudy' }
  if (code === 3)  return { label: t('Overcast'),       cat: 'cloudy'  }
  if (code <= 48)  return { label: t('Fog'),            cat: 'fog'     }
  if (code <= 55)  return { label: t('Drizzle'),        cat: 'drizzle' }
  if (code <= 67)  return { label: t('Rain'),           cat: 'rain'    }
  if (code <= 77)  return { label: t('Snowfall'),       cat: 'snow'    }
  if (code <= 82)  return { label: t('Showers'),        cat: 'rain'    }
  if (code <= 86)  return { label: t('Snow showers'),   cat: 'snow'    }
  return                  { label: t('Thunderstorm'),   cat: 'storm'   }
}

// accent color per category — used for gradient tint
function catAccent(cat: WCat) {
  return {
    clear:   '#fbbf24',
    pcloudy: '#93c5fd',
    cloudy:  '#94a3b8',
    fog:     '#a8a29e',
    drizzle: '#60a5fa',
    rain:    '#3b82f6',
    snow:    '#bfdbfe',
    storm:   '#818cf8',
  }[cat]
}

// ── SVG weather icons ─────────────────────────────────────────────────────────

// Shared cloud paths (Bezier curves for smooth, realistic shape)
// CloudHigh: sits in upper half, leaves room below for rain/snow
const CLOUD_HIGH = 'M6 27 C6 19 12 13 20 13 C22 8 28 6 35 8 C42 10 46 16 46 22 C46 28 42 31 37 31 L10 31 C7 31 6 29 6 27Z'
// CloudFull: larger, fills more of the frame (for overcast)
const CLOUD_FULL = 'M4 34 C4 25 11 18 20 18 C22 13 29 10 37 12 C44 14 47 21 47 27 C47 33 43 36 38 36 L10 36 C6 36 4 35 4 34Z'
// CloudSmall: for partly-cloudy, sits lower-right
const CLOUD_SMALL = 'M14 40 C14 33 19 28 26 28 C28 23 34 21 40 23 C45 25 47 30 47 35 C47 39 44 41 41 41 L18 41 C15 41 14 40 14 40Z'

function Snowflake({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <line x1={cx-5} y1={cy} x2={cx+5} y2={cy}         stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1={cx} y1={cy-5} x2={cx} y2={cy+5}         stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1={cx-3.5} y1={cy-3.5} x2={cx+3.5} y2={cy+3.5} stroke="#93c5fd" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1={cx+3.5} y1={cy-3.5} x2={cx-3.5} y2={cy+3.5} stroke="#93c5fd" strokeWidth="1.4" strokeLinecap="round"/>
    </g>
  )
}

function WeatherIcon({ cat, size = 64 }: { cat: WCat; size?: number }) {
  switch (cat) {

    case 'clear': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="11" fill="#fbbf24"/>
        {[0,45,90,135,180,225,270,315].map((deg, i) => {
          const a = deg * Math.PI / 180
          return <line key={i}
            x1={24 + Math.cos(a)*14} y1={24 + Math.sin(a)*14}
            x2={24 + Math.cos(a)*19} y2={24 + Math.sin(a)*19}
            stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"/>
        })}
      </svg>
    )

    case 'pcloudy': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        {/* Sun — upper left, some rays hidden behind cloud */}
        <circle cx="15" cy="16" r="9" fill="#fbbf24"/>
        {[225, 270, 315, 0, 45, 90].map((deg, i) => {
          const a = deg * Math.PI / 180
          return <line key={i}
            x1={15 + Math.cos(a)*11} y1={16 + Math.sin(a)*11}
            x2={15 + Math.cos(a)*15} y2={16 + Math.sin(a)*15}
            stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
        })}
        {/* Cloud — lower right, overlaps sun */}
        <path d={CLOUD_SMALL} fill="#cbd5e1"/>
      </svg>
    )

    case 'cloudy': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        {/* Back cloud (darker, peeking above) */}
        <path d={CLOUD_HIGH} fill="#94a3b8"/>
        {/* Front cloud (lighter, larger) */}
        <path d={CLOUD_FULL} fill="#cbd5e1"/>
      </svg>
    )

    case 'fog': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d="M6 18 C6 13 10 9 16 9 C17 6 21 4 26 5 C31 6 34 10 34 14 C34 17 32 18 30 18Z"
          fill="#94a3b8" opacity="0.45"/>
        <line x1="4"  y1="23" x2="44" y2="23" stroke="#94a3b8" strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="8"  y1="31" x2="42" y2="31" stroke="#94a3b8" strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="4"  y1="39" x2="38" y2="39" stroke="#94a3b8" strokeWidth="3.5" strokeLinecap="round"/>
      </svg>
    )

    case 'drizzle': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d={CLOUD_HIGH} fill="#cbd5e1"/>
        {[14, 24, 34].map((x, i) => (
          <line key={i}
            x1={x + 1} y1={34} x2={x - 2} y2={43}
            stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
        ))}
      </svg>
    )

    case 'rain': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d={CLOUD_HIGH} fill="#94a3b8"/>
        {[11, 20, 29, 38].map((x, i) => (
          <line key={i}
            x1={x + (i % 2)} y1={34 + (i % 2) * 4}
            x2={x - 5 + (i % 2)} y2={34 + 13 + (i % 2) * 4}
            stroke="#3b82f6" strokeWidth="2.8" strokeLinecap="round"/>
        ))}
      </svg>
    )

    case 'snow': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d={CLOUD_HIGH} fill="#cbd5e1"/>
        <Snowflake cx={14} cy={38}/>
        <Snowflake cx={26} cy={42}/>
        <Snowflake cx={38} cy={38}/>
      </svg>
    )

    case 'storm': return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d={CLOUD_HIGH} fill="#64748b"/>
        {/* Rain behind bolt */}
        {[11, 38].map((x, i) => (
          <line key={i} x1={x} y1={34} x2={x - 4} y2={45}
            stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round"/>
        ))}
        {/* Lightning bolt */}
        <path d="M26 32 L19 42 L24.5 42 L20 48 L32 37 L26.5 37 Z" fill="#fbbf24"/>
      </svg>
    )
  }
}

// ── Stat icons ────────────────────────────────────────────────────────────────

function IconThermo() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
    </svg>
  )
}
function IconDrop() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2z" opacity="0.8"/>
    </svg>
  )
}
function IconWind() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2M12.59 19.41A2 2 0 1 0 14 16H2M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2"/>
    </svg>
  )
}
function IconPin({ active }: { active: boolean }) {
  return (
    <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
      <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8C10 2.24 7.76 0 5 0z"
        fill={active ? 'var(--accent)' : 'var(--text3)'}/>
      <circle cx="5" cy="5" r="2" fill="white"/>
    </svg>
  )
}
function IconRefresh() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  )
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchOpenMeteo(lat: number, lon: number, t: (s: string) => string) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&wind_speed_unit=kmh&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error(t('Weather data unavailable'))
  return (await res.json()).current as {
    temperature_2m: number; apparent_temperature: number
    relative_humidity_2m: number; weather_code: number; wind_speed_10m: number
  }
}

async function geocodeCity(city: string, lang: string, t: (s: string) => string) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&accept-language=${lang}`
  )
  const json = await res.json()
  if (!json.length) throw new Error(`"${city}" ${t('not found')}`)
  return { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon), name: json[0].display_name.split(',')[0].trim() }
}

async function reverseGeocode(lat: number, lon: number, lang: string, t: (s: string) => string): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=${lang}`
  )
  const json = await res.json()
  const a = json.address ?? {}
  return a.city || a.town || a.village || a.county || t('Current location')
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeatherResult {
  temp: number; feelsLike: number; humidity: number; windKmh: number; code: number; city: string; fetchedAt: number
}

// ── Widget ────────────────────────────────────────────────────────────────────

export default function WeatherWidget({ widget }: { widget: Widget }) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const updateWidget = useBoardStore(s => s.updateWidget)
  const mode = useUIStore(s => s.mode)
  const d = widget.data as { manualCity: string; unit: 'celsius' | 'fahrenheit' }

  const cacheKey = `weather-cache-${widget.id}`

  const [weather,    setWeather]    = useState<WeatherResult | null>(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey)
      return cached ? JSON.parse(cached) : null
    } catch { return null }
  })
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [geoBlocked, setGeoBlocked] = useState(false)
  const [cityInput,  setCityInput]  = useState(d.manualCity)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)

    async function load() {
      try {
        if (d.manualCity) {
          const { lat, lon, name } = await geocodeCity(d.manualCity, lang, t)
          const c = await fetchOpenMeteo(lat, lon, t)
          if (!alive) return
          const result: WeatherResult = { temp: Math.round(c.temperature_2m), feelsLike: Math.round(c.apparent_temperature), humidity: c.relative_humidity_2m, windKmh: Math.round(c.wind_speed_10m), code: c.weather_code, city: name, fetchedAt: Date.now() }
          setWeather(result)
          try { sessionStorage.setItem(cacheKey, JSON.stringify(result)) } catch {}
          setGeoBlocked(false)
        } else {
          await new Promise<void>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              async pos => {
                try {
                  const { latitude: lat, longitude: lon } = pos.coords
                  const [c, city] = await Promise.all([fetchOpenMeteo(lat, lon, t), reverseGeocode(lat, lon, lang, t)])
                  if (!alive) return resolve()
                  const result: WeatherResult = { temp: Math.round(c.temperature_2m), feelsLike: Math.round(c.apparent_temperature), humidity: c.relative_humidity_2m, windKmh: Math.round(c.wind_speed_10m), code: c.weather_code, city, fetchedAt: Date.now() }
                  setWeather(result)
                  try { sessionStorage.setItem(cacheKey, JSON.stringify(result)) } catch {}
                  setGeoBlocked(false); resolve()
                } catch (e) { reject(e) }
              },
              () => { if (alive) setGeoBlocked(true); reject(new Error('geo-denied')) },
              { timeout: 10000 }
            )
          })
        }
      } catch (e: unknown) {
        if (!alive) return
        const msg = e instanceof Error ? e.message : t('Unknown error')
        if (msg !== 'geo-denied') setError(msg)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.manualCity, refreshKey, lang])

  function searchCity() {
    const name = cityInput.trim()
    if (!name) return
    updateWidget(widget.id, { data: { ...d, manualCity: name } })
  }

  function clearCity() {
    updateWidget(widget.id, { data: { ...d, manualCity: '' } })
    setCityInput('')
  }

  function toggleUnit() {
    updateWidget(widget.id, { data: { ...d, unit: d.unit === 'celsius' ? 'fahrenheit' : 'celsius' } })
  }

  function displayTemp(c: number) {
    return d.unit === 'fahrenheit' ? `${Math.round(c * 9 / 5 + 32)}°` : `${c}°`
  }

  const w    = weather
  const info = w ? wmo(w.code, t) : null
  const accent = info ? catAccent(info.cat) : 'var(--accent)'

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={centered} onPointerDown={stop}>
      <Spinner />
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t('Loading…')}</span>
    </div>
  )

  // ── Geo blocked / no data ────────────────────────────────────────────────────
  if (geoBlocked && !w) return (
    <div style={{ ...centered, flexDirection: 'column', gap: 14, padding: '0 20px' }} onPointerDown={stop}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
          <line x1="2" y1="2" x2="22" y2="22"/>
        </svg>
        <span style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.5 }}>
          {t('Location access denied.')}<br/>{t('Enter a city:')}
        </span>
      </div>
      <CityInput value={cityInput} onChange={setCityInput} onSearch={searchCity} />
    </div>
  )

  // ── Error / no data ──────────────────────────────────────────────────────────
  if (error && !w) return (
    <div style={{ ...centered, flexDirection: 'column', gap: 12, padding: '0 20px' }} onPointerDown={stop}>
      <span style={{ fontSize: 11, color: 'var(--danger)', textAlign: 'center' }}>{error}</span>
      <CityInput value={cityInput} onChange={setCityInput} onSearch={searchCity} />
      <button onClick={() => setRefreshKey(k => k + 1)} style={outlineBtn}>↻ {t('Reload')}</button>
    </div>
  )

  // ── Main display ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', gap: 6 }} onPointerDown={stop}>

      {/* Top-right corner: Reload + Unit toggle */}
      <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 3, zIndex: 1 }}>
        <button onClick={() => setRefreshKey(k => k + 1)} title={t('Refresh')} style={chipBtn}>
          <IconRefresh />
        </button>
        <button onClick={toggleUnit} title={t('Switch unit')} style={chipBtn}>
          <span style={{ fontSize: 9, fontWeight: 700 }}>{d.unit === 'celsius' ? '°F' : '°C'}</span>
        </button>
      </div>

      {/* Hero */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '4px 6px 0',
        minHeight: 0, overflow: 'hidden',
        gap: 6,
      }}>

        {/* Top row: pin + [city name + X button inline] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingRight: 60, minWidth: 0 }}>
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <IconPin active={!d.manualCity} />
          </span>
          {/* City name and X grouped so X sits right after the text */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              minWidth: 0,
            }}>
              {w!.city}
            </span>
            {d.manualCity && mode === 'edit' && (
              <button
                onClick={clearCity}
                title={t('Use automatic location')}
                style={{
                  flexShrink: 0, width: 15, height: 15, borderRadius: 4,
                  border: 'none', background: 'none',
                  color: 'var(--text3)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            )}
          </div>
        </div>

        {/* Middle: temp left, icon right */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {/* Temperature */}
            <div style={{
              fontSize: 'clamp(34px, 6cqw, 56px)', fontWeight: 200,
              letterSpacing: '-0.04em', color: 'var(--text1)', lineHeight: 1,
              display: 'flex', alignItems: 'baseline', gap: 3,
            }}>
              {displayTemp(w!.temp)}
              <span style={{ fontSize: '0.38em', fontWeight: 400, color: 'var(--text3)', letterSpacing: 0 }}>
                {d.unit === 'celsius' ? 'C' : 'F'}
              </span>
            </div>
            {/* Weather icon with subtle category-tinted glow */}
            <div style={{ flexShrink: 0, position: 'relative', display: 'flex' }}>
              <div style={{
                position: 'absolute', inset: -12, borderRadius: '50%',
                background: `radial-gradient(circle, color-mix(in srgb, ${accent} 18%, transparent), transparent 70%)`,
                pointerEvents: 'none',
              }} />
              <WeatherIcon cat={info!.cat} size={88} />
            </div>
          </div>
          {/* Description pill — unter dem Icon abgesetzt, damit sie nicht ins Wetter-Bild ragt */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: 'var(--text2)',
              background: `color-mix(in srgb, ${accent} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
              borderRadius: 20, padding: '2px 9px', lineHeight: 1.4,
              letterSpacing: '0.03em', whiteSpace: 'nowrap',
            }}>
              {info!.label}
            </span>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
        padding: '0 6px 6px', flexShrink: 0,
      }}>
        {[
          { icon: <IconThermo />, label: t('Feels like'), value: displayTemp(w!.feelsLike) + (d.unit === 'celsius' ? 'C' : 'F') },
          { icon: <IconDrop />,   label: t('Humidity'),   value: `${w!.humidity} %`   },
          { icon: <IconWind />,   label: t('Wind'),       value: `${w!.windKmh} km/h` },
        ].map((item, i) => (
          <div key={i} style={{
            padding: '6px 4px 5px', textAlign: 'center',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7,
            minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, color: 'var(--text3)', marginBottom: 2 }}>
              {item.icon}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text3)', marginTop: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Offline-Hinweis wenn Daten aus Cache kommen */}
      {error && w && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 6px 6px', flexShrink: 0 }}>
          <span style={{
            fontSize: 8.5, fontWeight: 600, color: '#f59e0b',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 20, padding: '2px 9px', lineHeight: 1.4,
          }}>
            {t('Offline — last updated at')} {new Date(w.fetchedAt).toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Edit mode: city search */}
      {mode === 'edit' && (
        <div style={{
          padding: '6px 6px', flexShrink: 0,
          borderTop: '1px solid var(--border)',
        }}>
          <CityInput value={cityInput} onChange={setCityInput} onSearch={searchCity} compact />
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CityInput({ value, onChange, onSearch, compact }: {
  value: string; onChange: (v: string) => void; onSearch: () => void; compact?: boolean
}) {
  const t = useT()
  const canSearch = value.trim().length > 0
  return (
    // Single field: pin + input + integrated submit arrow
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0,
      padding: compact ? '3px 3px 3px 9px' : '5px 5px 5px 10px',
      background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7,
    }}>
      <span style={{ flexShrink: 0, display: 'flex', opacity: 0.5 }}>
        <svg width="10" height="12" viewBox="0 0 10 12" fill="var(--text2)">
          <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 7 5 7s5-3.25 5-7C10 2.24 7.76 0 5 0z"/>
          <circle cx="5" cy="5" r="1.8" fill="white"/>
        </svg>
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSearch() }}
        placeholder={t('Enter a city…')}
        onPointerDown={e => e.stopPropagation()}
        style={{
          flex: 1, minWidth: 0,
          fontSize: compact ? 10 : 11,
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--text1)', padding: 0,
        }}
      />
      <button
        onClick={onSearch}
        disabled={!canSearch}
        title={t('Search city')}
        style={{
          flexShrink: 0, width: compact ? 20 : 24, height: compact ? 20 : 24,
          borderRadius: 5, border: 'none',
          background: canSearch ? 'var(--accent)' : 'var(--surface3)',
          color: canSearch ? 'white' : 'var(--text3)',
          cursor: canSearch ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, transition: 'background 0.15s, color 0.15s',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1.5" y1="6" x2="10" y2="6"/><polyline points="6.5,2.5 10,6 6.5,9.5"/>
        </svg>
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round"
        style={{ animation: 'w-spin 1s linear infinite' }}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      <style>{`@keyframes w-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const stop = (e: React.PointerEvent) => e.stopPropagation()

const centered: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: '100%',
}

// Matches the 22px icon buttons used in Task/Water chart controls
const chipBtn: React.CSSProperties = {
  height: 22, minWidth: 22, paddingInline: 5, borderRadius: 5,
  border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface2) 85%, transparent)',
  color: 'var(--text3)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
  backdropFilter: 'blur(4px)',
}

const outlineBtn: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, padding: '4px 14px', borderRadius: 50,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text3)', cursor: 'pointer',
}
