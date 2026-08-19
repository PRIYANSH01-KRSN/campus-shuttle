/**
 * Centralized campus data constants for Shiv Nadar University (SNU), Greater Noida.
 * All coordinates fall within the campus geofence bounds: [[28.518, 77.568], [28.535, 77.585]]
 *
 * Station coordinates are approximate and can be fine-tuned via the Admin Portal
 * interactive map editor (drag-to-reposition).
 */

// ─── Campus Map Defaults ───────────────────────────────────────────────────────

export const CAMPUS_CENTER: [number, number] = [28.5255, 77.5755]
export const CAMPUS_BOUNDS: [[number, number], [number, number]] = [
  // Deliberately wider than the campus fence so users can zoom out, orient
  // themselves, and recover from a slightly inaccurate GPS fix.
  [28.5050, 77.5550],
  [28.5450, 77.5950],
]
export const CAMPUS_ZOOM = { initial: 15, min: 13, max: 20 }

// ─── Route Definitions ─────────────────────────────────────────────────────────

export const ROUTES = {
  GATE_1: {
    id: 'route-gate1',
    name: 'Gate 1 Loop',
    color: '#2563EB', // Vibrant Blue
    is_active: true,
  },
  GATE_2: {
    id: 'route-gate2',
    name: 'Gate 2 Loop',
    color: '#10B981', // Emerald Green
    is_active: true,
  },
} as const

// ─── Station Presets ────────────────────────────────────────────────────────────
// Each station has a name, approximate lat/lng, and its stop_order in the loop.

export interface StationPreset {
  name: string
  lat: number
  lng: number
  stop_order: number
}

export const STATIONS: Record<string, StationPreset[]> = {
  // Gate 1 Route — 6 stops
  // Loop: Gate 1 → inner gate → chilika 1b(cluster 1) → Cluster 5 → Cluster 4 → G Block → Gate 1
  GATE_1: [
    { name: 'Gate 1',            lat: 28.533180530044106, lng: 77.57664699610052, stop_order: 1 },
    { name: 'Cluster 5',         lat: 28.5225, lng: 77.5703, stop_order: 2 },
    { name: 'Cluster 4',         lat: 28.5235, lng: 77.5706, stop_order: 3 },
    { name: 'inner gate',            lat: 28.525575, lng: 77.571672, stop_order: 4 },
    { name: 'chilika 1b(cluster 1)', lat: 28.52558333333333, lng: 77.57166666666667, stop_order: 5 },
    { name: 'G Block',           lat: 28.528177747494905, lng: 77.57449105362907, stop_order: 6 },
  ],

  // Gate 2 Route — 10 stops
  // Loop: Gate 2 → Cluster 5 → Cluster 4 → inner gate → chilika 1b(cluster 1) → D Block → C Block → B Block → A Block → Towers → Gate 2
  GATE_2: [
    { name: 'Gate 2',            lat: 28.53076962815911, lng: 77.58093845170927, stop_order: 1 },
    { name: 'Cluster 5',         lat: 28.5225, lng: 77.5703, stop_order: 2 },
    { name: 'Cluster 4',         lat: 28.5235, lng: 77.5706, stop_order: 3 },
    { name: 'inner gate',            lat: 28.525575, lng: 77.571672, stop_order: 4 },
    { name: 'chilika 1b(cluster 1)', lat: 28.52558333333333, lng: 77.57166666666667, stop_order: 5 },
    { name: 'D Block',           lat: 28.5254, lng: 77.5753, stop_order: 6 },
    { name: 'C Block',           lat: 28.5261, lng: 77.5757, stop_order: 7 },
    { name: 'B Block',           lat: 28.5266, lng: 77.5763, stop_order: 8 },
    { name: 'A Block',           lat: 28.5269, lng: 77.5771, stop_order: 9 },
    { name: 'Towers',            lat: 28.5298, lng: 77.5791, stop_order: 10 },
  ],
}

// ─── Route Path Polyline Coordinates ────────────────────────────────────────────
// Arrays of [lat, lng] waypoints tracing campus roadways for each loop.
// Used for Leaflet polyline rendering and Turf.js line-slice ETA calculations.

export const ROUTE_PATHS: Record<string, [number, number][]> = {
  GATE_1: [
    [28.533180530044106, 77.57664699610052], // Gate 1
    [28.5225, 77.5703], // Cluster 5
    [28.5235, 77.5706], // Cluster 4
    [28.525575, 77.571672], // Inner Gate
    [28.52558333333333, 77.57166666666667], // Chilika 1B
    [28.528177747494905, 77.57449105362907], // G Block
    [28.533180530044106, 77.57664699610052]  // Gate 1 (close loop)
  ],

  GATE_2: [
    [28.53076962815911, 77.58093845170927],  // Gate 2
    [28.5225, 77.5703], // Cluster 5
    [28.5235, 77.5706], // Cluster 4
    [28.525575, 77.571672], // Inner Gate
    [28.52558333333333, 77.57166666666667], // Chilika 1B
    [28.5254, 77.5753], // D Block
    [28.5261, 77.5757], // C Block
    [28.5266, 77.5763], // B Block
    [28.5269, 77.5771], // A Block
    [28.5298, 77.5791], // Towers
    [28.53076962815911, 77.58093845170927]   // Gate 2 (close loop)
  ],
}

// ─── Default Caddy Definitions ──────────────────────────────────────────────────

export const DEFAULT_CADDIES = [
  { id: 'caddy-1', name: 'Caddy 1', route_id: 'route-gate1' },
  { id: 'caddy-2', name: 'Caddy 2', route_id: 'route-gate2' },
] as const

// ─── Operational Constants ──────────────────────────────────────────────────────

export const CADDY_SPEED_KMH = 15              // Average cruising speed for ETA calculation
export const STOP_DELAY_MINUTES = 0.75          // 45 seconds per intermediate stop
export const STALE_THRESHOLD_MS = 60000         // 60s — caddy hidden from student map
export const STALE_MARKER_THRESHOLD_MS = 45000  // 45s — marker shown as "Signal Lost"
export const GEOFENCE_SPEED_LIMIT_KMH = 40      // km/h max (pings above this discarded)
export const ANTI_IDLE_DISTANCE_M = 25          // meters from nearest station for anti-idle alert
export const WAIT_FLAG_TTL_MS = 10 * 60 * 1000  // 10-minute wait flag expiry
export const STATION_PROXIMITY_M = 60           // meters radius for "I'm Waiting" geofence
export const POLLING_INTERVAL_MS = 5000         // 5-second DB polling frequency
export const TELEMETRY_INTERVAL_MS = 2500       // 2.5-second GPS streaming interval
export const FLEET_POLLING_INTERVAL_MS = 4000   // 4-second admin fleet polling
