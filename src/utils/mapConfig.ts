/**
 * Shared map configuration and marker utilities for Leaflet maps.
 * Provides high-contrast tile layer URLs (Google Maps / Carto HD),
 * custom SVG shuttle/station markers, theme persistence, and UI palettes.
 */

// ─── Tile Layer Configurations ──────────────────────────────────────────────────
// High-clarity tile URLs with high-contrast road layouts and building footprints

export const MAP_TILES = {
  light: {
    // OpenStreetMap is a reliable public basemap with clear campus roads.
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    // CartoDB Dark Matter HD layer
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
} as const

export type MapTheme = 'light' | 'dark'

// ─── Shiv Nadar University Campus Geographic Constants ──────────────────────────

export const SNU_CAMPUS = {
  center: [28.5245, 77.5750] as [number, number],
  defaultZoom: 15,
  minZoom: 13,
  maxZoom: 20,
  bounds: [
    [28.5050, 77.5550], // South-West
    [28.5450, 77.5950], // North-East
  ] as [[number, number], [number, number]],
}

// ─── Theme Persistence ──────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = 'shuttle-map-theme'

export function getMapTheme(): MapTheme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(THEME_STORAGE_KEY) as MapTheme) || 'dark'
}

export function setMapTheme(theme: MapTheme): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
}

// ─── Status Colors ──────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  ON_DUTY: '#10B981',        // Emerald green
  ON_BREAK: '#F59E0B',       // Amber
  OFF_DUTY: '#64748B',       // Slate grey
  IN_MAINTENANCE: '#F97316', // Orange
  STALE: '#475569',          // Dark slate
}

// ─── Shuttle Marker SVG ─────────────────────────────────────────────────────────

export function getShuttleMarkerHTML(
  heading: number,
  status: string,
  isStale: boolean
): string {
  const color = isStale ? STATUS_COLORS.STALE : (STATUS_COLORS[status] || STATUS_COLORS.OFF_DUTY)
  const showPulse = status === 'ON_DUTY' && !isStale

  return `<div style="position:relative;width:48px;height:48px;">${
    showPulse
      ? `<div style="
          position:absolute;inset:0;border-radius:50%;
          border:2px solid ${color};
          animation:radarPulse 2s ease-out infinite;
        "></div>`
      : ''
  }<svg width="48" height="48" viewBox="0 0 48 48" style="position:absolute;inset:0;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));">
    <circle cx="24" cy="24" r="18" fill="${color}" stroke="white" stroke-width="2.5"/>
    <g transform="rotate(${Math.round(heading)}, 24, 24)">
      <polygon points="24,9 31,27 24,22 17,27" fill="white" opacity="0.95"/>
    </g>${
      isStale
        ? `<circle cx="37" cy="11" r="7" fill="#EF4444" stroke="white" stroke-width="1.5"/>
           <text x="37" y="14.5" text-anchor="middle" fill="white" font-size="10" font-weight="bold">!</text>`
        : ''
    }</svg></div>`
}

// ─── Station Marker HTML ────────────────────────────────────────────────────────

export function getStationMarkerHTML(
  stopOrder: number,
  color: string,
  isSelected: boolean,
  waitingCount: number
): string {
  const size = isSelected ? 36 : 28
  const borderWidth = isSelected ? 3 : 2
  const borderColor = isSelected ? '#14B8A6' : 'white'
  const shadow = isSelected
    ? '0 0 16px rgba(20,184,166,0.6), 0 2px 8px rgba(0,0,0,0.3)'
    : '0 2px 6px rgba(0,0,0,0.3)'

  return `<div style="position:relative;width:${size}px;height:${size}px;">
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${borderWidth}px solid ${borderColor};
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:800;font-size:${isSelected ? 14 : 11}px;
      font-family:system-ui,-apple-system,sans-serif;
      box-shadow:${shadow};
      ${isSelected ? 'animation:stationPulse 2s ease-in-out infinite;' : ''}
      transition:all 0.2s ease;
    ">${stopOrder}</div>${
      waitingCount > 0
        ? `<div style="
            position:absolute;top:-4px;right:-4px;
            min-width:18px;height:18px;border-radius:9px;
            background:#14B8A6;border:2px solid white;
            color:white;font-size:10px;font-weight:800;
            display:flex;align-items:center;justify-content:center;
            font-family:system-ui,sans-serif;
            animation:bounce 1s infinite;padding:0 3px;
          ">${waitingCount}</div>`
        : ''
    }</div>`
}

// ─── Theme-Aware UI Color Palettes ──────────────────────────────────────────────

export interface ThemeColors {
  bg: string
  bgCard: string
  bgSheet: string
  text: string
  textSecondary: string
  textMuted: string
  border: string
  borderAccent: string
  input: string
  pill: string
  pillActive: string
  shadow: string
  mapBg: string
}

export function getThemeColors(theme: MapTheme): ThemeColors {
  if (theme === 'light') {
    return {
      bg: 'bg-white',
      bgCard: 'bg-white/90 backdrop-blur-xl',
      bgSheet: 'bg-white/95 backdrop-blur-2xl',
      text: 'text-slate-900',
      textSecondary: 'text-slate-600',
      textMuted: 'text-slate-400',
      border: 'border-slate-200',
      borderAccent: 'border-slate-300',
      input: 'bg-slate-100 text-slate-900',
      pill: 'bg-slate-100',
      pillActive: 'bg-slate-900 text-white',
      shadow: 'shadow-lg shadow-slate-200/50',
      mapBg: 'bg-slate-100',
    }
  }
  return {
    bg: 'bg-slate-950',
    bgCard: 'bg-slate-900/80 backdrop-blur-xl',
    bgSheet: 'bg-slate-900/95 backdrop-blur-2xl',
    text: 'text-white',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-500',
    border: 'border-slate-800',
    borderAccent: 'border-slate-700',
    input: 'bg-slate-800 text-white',
    pill: 'bg-slate-800',
    pillActive: 'bg-teal-500 text-white',
    shadow: 'shadow-lg shadow-black/30',
    mapBg: 'bg-slate-950',
  }
}
