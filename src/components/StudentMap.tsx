'use client'

import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapTheme, MAP_TILES, getShuttleMarkerHTML, getStationMarkerHTML, getThemeColors, SNU_CAMPUS } from '@/utils/mapConfig'
import { CAMPUS_CENTER, CAMPUS_BOUNDS, CAMPUS_ZOOM, STALE_MARKER_THRESHOLD_MS, STALE_THRESHOLD_MS } from '@/utils/campusData'
import { WifiOff } from 'lucide-react'

interface Station {
  id: string
  name: string
  lat: number
  lng: number
  stop_order: number
  route_id: string
  waiting_count: number
}

interface Caddy {
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

interface RouteType {
  id: string
  name: string
  color: string
  is_active: boolean
}

interface StudentMapProps {
  mapTheme: MapTheme
  caddies: Caddy[]
  stations: Station[]
  routes: RouteType[]
  routePaths?: any[]
  selectedRouteId: string | null
  activeRoutePath: [number, number][]
  selectedStationId: string | null
  onSelectStation: (station: Station) => void
  onMapClick: () => void
  onRecenterCampus?: () => void
  mapRef: React.MutableRefObject<any>
  userLocation?: [number, number] | null
}

// Controller to bind events and ensure sharp tile rendering without clipping
function MapEventController({ onMapClick, mapRef }: { onMapClick: () => void, mapRef: React.MutableRefObject<any> }) {
  const map = useMap()
  
  useEffect(() => {
    mapRef.current = map
    
    // Invalidate size immediately and with small delays to fix any grey tiles or blur
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 150)
    const t2 = setTimeout(() => map.invalidateSize(), 400)
    
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map, mapRef])

  useMapEvents({
    click: (e) => {
      // Only fire general map click if clicking on the actual empty background tiles
      if ((e.originalEvent.target as HTMLElement).classList.contains('leaflet-container') || 
          (e.originalEvent.target as HTMLElement).classList.contains('leaflet-zoom-animated')) {
        onMapClick()
      }
    }
  })
  
  return null
}

export default function StudentMap({
  mapTheme,
  caddies,
  stations,
  routes,
  selectedRouteId,
  activeRoutePath,
  selectedStationId,
  onSelectStation,
  onMapClick,
  mapRef,
  userLocation = null
}: StudentMapProps) {

  const tileConfig = MAP_TILES[mapTheme] || MAP_TILES.light
  const colors = getThemeColors(mapTheme)

  // Use campus bounds from config or fallback to SNU_CAMPUS constants
  const centerPos = CAMPUS_CENTER || SNU_CAMPUS.center
  const bounds = CAMPUS_BOUNDS || SNU_CAMPUS.bounds
  const defaultZoom = CAMPUS_ZOOM?.initial || SNU_CAMPUS.defaultZoom || 16.5
  const minZoom = CAMPUS_ZOOM?.min || SNU_CAMPUS.minZoom || 15
  const maxZoom = CAMPUS_ZOOM?.max || SNU_CAMPUS.maxZoom || 19

  // Filter stations based on selected route
  const visibleStations = selectedRouteId
    ? stations.filter(s => s.route_id === selectedRouteId)
    : stations

  // Filter active caddies: ON_DUTY, valid coords, ping < 60s
  const activeCaddies = caddies.filter(c => {
    if (c.status !== 'ON_DUTY') return false
    if (c.current_lat === null || c.current_lng === null) return false
    const timeSincePing = Date.now() - new Date(c.last_ping).getTime()
    const threshold = typeof STALE_THRESHOLD_MS !== 'undefined' ? STALE_THRESHOLD_MS : 60000
    if (timeSincePing >= threshold) return false
    return true
  })

  const getStationIcon = (station: Station, isSelected: boolean, routeColor: string) => {
    return L.divIcon({
      className: '',
      html: getStationMarkerHTML(station.stop_order, routeColor, isSelected, station.waiting_count),
      iconSize: isSelected ? [36, 36] :,
      iconAnchor: isSelected ? [18, 18] : [14, 14]
    })
  }

  const getCaddyIcon = (caddy: Caddy, isStale: boolean) => {
    return L.divIcon({
      className: '',
      html: getShuttleMarkerHTML(caddy.heading || 0, caddy.status, isStale),
      iconSize:,
      iconAnchor: [24, 24]
    })
  }

  return (
    <div className={`relative w-full h-full ${colors.mapBg} map-fullscreen`}>
      <MapContainer
        center={centerPos}
        zoom={defaultZoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        className="w-full h-full z-0"
      >
        <MapEventController onMapClick={onMapClick} mapRef={mapRef} />

        <TileLayer
          key={mapTheme}
          url={tileConfig.url}
          attribution={tileConfig.attribution}
          maxZoom={19}
        />

        {/* Route Polyline */}
        {selectedRouteId && activeRoutePath && activeRoutePath.length > 0 && (
          <Polyline
            positions={activeRoutePath}
            pathOptions={{
              color: routes.find(r => r.id === selectedRouteId)?.color || '#2563EB',
              weight: 5,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round'
            }}
          />
        )}

        {/* Station Markers */}
        {visibleStations.map(station => {
          const routeColor = routes.find(r => r.id === station.route_id)?.color || '#3b82f6'
          const isSelected = selectedStationId === station.id

          return (
            <Marker
              key={station.id}
              position={[station.lat, station.lng]}
              icon={getStationIcon(station, isSelected, routeColor)}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e)
                  onSelectStation(station)
                }
              }}
            >
              <Popup className="custom-leaflet-popup">
                <div className={`${colors.bgCard} ${colors.text} p-2 rounded-xl border ${colors.borderAccent} font-sans min-w-[140px] text-xs shadow-md`}>
                  <div className="font-bold text-sm mb-1">{station.name}</div>
                  <div className={`flex justify-between items-center ${colors.textSecondary} text-[10px]`}>
                    <span>Stop {station.stop_order}</span>
                    <span className="bg-teal-500/20 text-teal-600 dark:text-teal-400 px-1.5 py-0.5 rounded font-bold">
                      {station.waiting_count} waiting
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Caddy Markers */}
        {activeCaddies.map(caddy => {
          const lastPingTime = new Date(caddy.last_ping).getTime()
          const staleMarkerThreshold = typeof STALE_MARKER_THRESHOLD_MS !== 'undefined' ? STALE_MARKER_THRESHOLD_MS : 45000
          const isStale = (Date.now() - lastPingTime) > staleMarkerThreshold
          const assignedRoute = routes.find(r => r.id === caddy.route_id)

          return (
            <Marker
              key={caddy.id}
              position={[caddy.current_lat!, caddy.current_lng!]}
              icon={getCaddyIcon(caddy, isStale)}
            >
              <Popup className="custom-leaflet-popup">
                <div className={`${colors.bgCard} ${colors.text} p-3 rounded-xl border ${colors.borderAccent} space-y-2 font-sans min-w-[170px] text-xs shadow-lg`}>
                  <div className={`flex justify-between items-center border-b ${colors.border} pb-1.5`}>
                    <span className="font-bold text-sm">{caddy.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                      isStale ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {isStale ? 'Signal Lost' : 'Live'}
                    </span>
                  </div>
                  <div className={`space-y-1 text-[11px] ${colors.textSecondary}`}>
                    <div className="flex justify-between">
                      <span>Route:</span>
                      <span className={`font-medium ${colors.text} truncate max-w-[100px]`}>
                        {assignedRoute ? assignedRoute.name : 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Speed:</span>
                      <span className={`font-medium ${colors.text}`}>
                        {caddy.speed ? `${Math.round(caddy.speed)} km/h` : '0 km/h'}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
