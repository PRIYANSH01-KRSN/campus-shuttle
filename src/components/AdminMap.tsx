'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapTheme,
  MAP_TILES,
  getShuttleMarkerHTML,
  getStationMarkerHTML,
  getThemeColors,
  SNU_CAMPUS,
} from '@/utils/mapConfig'
import {
  CAMPUS_CENTER,
  CAMPUS_BOUNDS,
  CAMPUS_ZOOM,
  STALE_MARKER_THRESHOLD_MS,
} from '@/utils/campusData'
import { WifiOff, Move } from 'lucide-react'

export interface Station {
  id: string
  name: string
  lat: number
  lng: number
  stop_order: number
  route_id: string
  waiting_count: number
}

export interface Caddy {
  id: string
  name: string
  route_id: string | null
  current_driver_id: string | null
  status: 'OFF_DUTY' | 'ON_DUTY' | 'ON_BREAK' | 'IN_MAINTENANCE'
  current_lat: number | null
  current_lng: number | null
  speed: number
  heading: number
  last_ping: string
}

export interface RouteType {
  id: string
  name: string
  color: string
  is_active: boolean
}

interface AdminMapProps {
  mapTheme: MapTheme
  caddies?: Caddy[]
  stations?: Station[]
  routes?: RouteType[]
  selectedRouteId?: string | null
  activeRoutePath?: [number, number][]
  isStudioMode?: boolean
  onStationDragEnd?: (stationId: string, newLat: number, newLng: number) => void
  onMapClickAddPoint?: (lat: number, lng: number) => void
  selectedStationId?: string | null
  onSelectStation?: (station: Station) => void
}

function AdminMapController({
  isStudioMode,
  onMapClickAddPoint,
}: {
  isStudioMode?: boolean
  onMapClickAddPoint?: (lat: number, lng: number) => void
}) {
  const map = useMap()

  useEffect(() => {
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 200)
    const t2 = setTimeout(() => map.invalidateSize(), 500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map])

  useMapEvents({
    click: (e) => {
      if (isStudioMode && onMapClickAddPoint) {
        onMapClickAddPoint(e.latlng.lat, e.latlng.lng)
      }
    },
  })

  return null
}

export default function AdminMap({
  mapTheme = 'light',
  caddies = [],
  stations = [],
  routes = [],
  selectedRouteId = null,
  activeRoutePath = [],
  isStudioMode = false,
  onStationDragEnd,
  onMapClickAddPoint,
  selectedStationId = null,
  onSelectStation,
}: AdminMapProps) {
  // Prevent SSR execution crashes
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-2xl">
        <span className="text-sm font-medium text-slate-500">Loading Campus Map...</span>
      </div>
    )
  }

  const tileConfig = MAP_TILES[mapTheme] || MAP_TILES.light
  const colors = getThemeColors(mapTheme)

  const centerPos: [number, number] = CAMPUS_CENTER || SNU_CAMPUS?.center || [28.5245, 77.5750]
  const bounds: [[number, number], [number, number]] = CAMPUS_BOUNDS || SNU_CAMPUS?.bounds || [
    [28.5150, 77.5650],
    [28.5350, 77.5850],
  ]
  const defaultZoom = CAMPUS_ZOOM?.initial || SNU_CAMPUS?.defaultZoom || 16.5
  const minZoom = CAMPUS_ZOOM?.min || SNU_CAMPUS?.minZoom || 15
  const maxZoom = CAMPUS_ZOOM?.max || SNU_CAMPUS?.maxZoom || 19

  const visibleStations = selectedRouteId
    ? stations.filter((s) => s.route_id === selectedRouteId)
    : stations

  const getStationIcon = useCallback((
    station: Station,
    isSelected: boolean,
    routeColor: string
  ) => {
    return L.divIcon({
      className: '',
      html: getStationMarkerHTML(
        station.stop_order,
        routeColor,
        isSelected,
        station.waiting_count || 0
      ),
      iconSize: isSelected ? [36, 36] : [28, 28],
      iconAnchor: isSelected ? [18, 18] : [14, 14],
    })
  }, [])

  const getCaddyIcon = useCallback((caddy: Caddy, isStale: boolean) => {
    return L.divIcon({
      className: '',
      html: getShuttleMarkerHTML(caddy.heading || 0, caddy.status, isStale),
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    })
  }, [])

  const validRoutePath = Array.isArray(activeRoutePath) ? activeRoutePath : []

  return (
    <div className={`relative w-full h-full min-h-[400px] ${colors.mapBg} rounded-2xl overflow-hidden border ${colors.border}`}>
      <MapContainer
        center={centerPos}
        zoom={defaultZoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        zoomControl={true}
        className="w-full h-full z-0"
      >
        <AdminMapController
          isStudioMode={isStudioMode}
          onMapClickAddPoint={onMapClickAddPoint}
        />

        <TileLayer
          key={mapTheme}
          url={tileConfig.url}
          attribution={tileConfig.attribution}
          maxZoom={19}
        />

        {/* Route Polyline */}
        {validRoutePath.length > 0 && (
          <MemoizedPolyline 
            validRoutePath={validRoutePath} 
            selectedRouteId={selectedRouteId} 
            routes={routes} 
          />
        )}

        {/* Studio Mode Waypoint Point Dots */}
        {isStudioMode &&
          validRoutePath.map((pt, idx) => (
            <Marker
              key={`wp-${idx}`}
              position={pt}
              icon={L.divIcon({
                className: '',
                html: `<div style="width:10px;height:10px;border-radius:50%;background:#F59E0B;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
                iconSize: [10, 10],
                iconAnchor: [5, 5],
              })}
            />
          ))}

        {/* Campus Station Markers */}
        <MemoizedStationMarkers 
          visibleStations={visibleStations} 
          routes={routes} 
          selectedStationId={selectedStationId} 
          isStudioMode={isStudioMode}
          getStationIcon={getStationIcon}
          onSelectStation={onSelectStation}
          onStationDragEnd={onStationDragEnd}
          colors={colors}
        />

        {/* Caddy Fleet Markers */}
        <MemoizedCaddyMarkers 
          caddies={caddies} 
          routes={routes} 
          getCaddyIcon={getCaddyIcon}
          colors={colors}
        />
      </MapContainer>
    </div>
  )
}

// ── Memoized Sub-components ──────────────────────────────────────────────

const MemoizedPolyline = React.memo(function MemoizedPolylineComponent({ validRoutePath, selectedRouteId, routes }: any) {
  return (
    <Polyline
      positions={validRoutePath}
      pathOptions={{
        color:
          routes.find((r: any) => r.id === selectedRouteId)?.color || '#2563EB',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      }}
    />
  )
})

const MemoizedStationMarkers = React.memo(function MemoizedStationMarkersComponent({ visibleStations, routes, selectedStationId, isStudioMode, getStationIcon, onSelectStation, onStationDragEnd, colors }: any) {
  return (
    <>
      {visibleStations.map((station: any) => {
        const routeColor =
          routes.find((r: any) => r.id === station.route_id)?.color || '#3b82f6'
        const isSelected = selectedStationId === station.id

        return (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            draggable={isStudioMode}
            icon={getStationIcon(station, isSelected, routeColor)}
            eventHandlers={{
              click: (e) => {
                onSelectStation?.(station)
              },
              dragend: (e) => {
                const marker = e.target
                const position = marker.getLatLng()
                if (onStationDragEnd) {
                  onStationDragEnd(station.id, position.lat, position.lng)
                }
              },
            }}
          >
            <Popup className="custom-leaflet-popup">
              <div
                className={`${colors.bgCard} ${colors.text} p-2.5 rounded-xl border ${colors.borderAccent} font-sans min-w-[150px] text-xs shadow-lg`}
              >
                <div className="font-bold text-sm mb-1">{station.name}</div>
                <div className="flex justify-between items-center text-[10px] mb-2">
                  <span className={colors.textSecondary}>
                    Stop #{station.stop_order}
                  </span>
                  <span className="bg-teal-500/20 text-teal-600 dark:text-teal-400 px-1.5 py-0.5 rounded font-bold">
                    {station.waiting_count || 0} waiting
                  </span>
                </div>
                {isStudioMode && (
                  <div className="flex items-center gap-1 text-amber-500 font-medium text-[10px] pt-1 border-t border-slate-700/30">
                    <Move className="w-3 h-3" />
                    <span>Drag to reposition</span>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}, (prev, next) => {
  if (prev.selectedStationId !== next.selectedStationId) return false;
  if (prev.isStudioMode !== next.isStudioMode) return false;
  if (prev.visibleStations.length !== next.visibleStations.length) return false;
  return true;
})

const MemoizedCaddyMarkers = React.memo(function MemoizedCaddyMarkersComponent({ caddies, routes, getCaddyIcon, colors }: any) {
  return (
    <>
      {caddies.map((caddy: any) => {
        if (caddy.current_lat === null || caddy.current_lng === null) {
          return null
        }

        const lastPingTime = new Date(caddy.last_ping).getTime()
        const staleThreshold = STALE_MARKER_THRESHOLD_MS || 45000
        const isStale = Date.now() - lastPingTime > staleThreshold
        const assignedRoute = routes.find((r: any) => r.id === caddy.route_id)

        return (
          <Marker
            key={caddy.id}
            position={[caddy.current_lat, caddy.current_lng]}
            icon={getCaddyIcon(caddy, isStale)}
          >
            <Popup className="custom-leaflet-popup">
              <div
                className={`${colors.bgCard} ${colors.text} p-3 rounded-xl border ${colors.borderAccent} space-y-2 font-sans min-w-[180px] text-xs shadow-xl`}
              >
                <div
                  className={`flex justify-between items-center border-b ${colors.border} pb-1.5`}
                >
                  <span className="font-bold text-sm">{caddy.name}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                      isStale
                        ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {isStale ? 'Signal Lost' : caddy.status}
                  </span>
                </div>
                <div
                  className={`space-y-1 text-[11px] ${colors.textSecondary}`}
                >
                  <div className="flex justify-between">
                    <span>Route:</span>
                    <span className={`font-medium ${colors.text}`}>
                      {assignedRoute?.name || 'Unassigned'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Speed:</span>
                    <span className="font-mono">
                      {isStale ? '0' : caddy.speed} km/h
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Heading:</span>
                    <span className="font-mono">
                      {Math.round(caddy.heading)}°
                    </span>
                  </div>
                  {isStale && (
                    <div className="flex items-center gap-1 text-rose-500 dark:text-rose-400 font-bold mt-2 text-[10px] pt-1">
                      <WifiOff className="w-3.5 h-3.5" />
                      Offline ({Math.round((Date.now() - lastPingTime) / 1000)}s ago)
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}, (prev, next) => {
  return JSON.stringify(prev.caddies) === JSON.stringify(next.caddies);
})