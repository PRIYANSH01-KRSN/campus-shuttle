'use client'

import React, { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/client'
import * as turf from '@turf/turf'
import {
  Navigation, CheckCircle2, AlertCircle, Clock,
  MapPin, Route, Sun, Moon, Wifi, WifiOff,
  ChevronUp, Crosshair, Building2, ExternalLink, Bus
} from 'lucide-react'
import { MapTheme, getMapTheme, setMapTheme as setMapThemeLS, getThemeColors } from '@/utils/mapConfig'
import {
  CAMPUS_CENTER,
  STALE_THRESHOLD_MS,
  WAIT_FLAG_TTL_MS,
  STATION_PROXIMITY_M,
  POLLING_INTERVAL_MS,
  ROUTES,
  STATIONS,
  ROUTE_PATHS,
  DEFAULT_CADDIES
} from '@/utils/campusData'

const StudentMap = dynamic(() => import('./StudentMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-500 text-sm gap-3">
      <Bus className="w-8 h-8 animate-pulse text-teal-500" />
      <span>Loading Map...</span>
    </div>
  )
})

type LatLng = [number, number]

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

interface AdBanner {
  id: string
  title: string
  sponsor_name: string
  image_url: string
  target_url: string
  is_active: boolean
  impressions: number
  clicks: number
}

export default function StudentPortal() {
  const supabase = createClient()
  const mapRef = useRef<any>(null)

  // Map & Theme State
  const [mapTheme, setMapTheme] = useState<MapTheme>('dark')
  const colors = getThemeColors(mapTheme)

  // Connection State
  const [isOnline, setIsOnline] = useState(true)

  // Data State
  const [routes, setRoutes] = useState<RouteType[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [caddies, setCaddies] = useState<Caddy[]>([])
  const [adBanners, setAdBanners] = useState<AdBanner[]>([])
  const [routePaths, setRoutePaths] = useState<any[]>([])
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  // Selection State
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [activeRoutePath, setActiveRoutePath] = useState<LatLng[]>([])
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)

  // Interaction State
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0)
  const [showStatusBanner, setShowStatusBanner] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  // Ad State
  const [currentAd, setCurrentAd] = useState<AdBanner | null>(null)
  const adImpressionTracked = useRef<string | null>(null)

  useEffect(() => {
    // Initialize theme
    setMapTheme(getMapTheme())

    // Connection monitoring
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      position => setUserLocation([position.coords.latitude, position.coords.longitude]),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  const handleThemeToggle = () => {
    const next = mapTheme === 'light' ? 'dark' : 'light'
    setMapTheme(next)
    setMapThemeLS(next)
  }

  // Data Fetching
  const fetchBaseData = async () => {
    try {
      const { data: routesData } = await supabase.from('routes').select('*')
      const { data: stationsData } = await supabase.from('campus_stations').select('*')
      const { data: caddiesData } = await supabase.from('caddies').select('*')
      const { data: pathsData } = await supabase.from('route_paths').select('*')
      const { data: adsData } = await supabase.from('ad_banners').select('*').eq('is_active', true)

      if (routesData && routesData.length > 0) {
        setRoutes(routesData)
      } else {
        setRoutes([
          { id: ROUTES.GATE_1.id, name: ROUTES.GATE_1.name, color: ROUTES.GATE_1.color, is_active: true },
          { id: ROUTES.GATE_2.id, name: ROUTES.GATE_2.name, color: ROUTES.GATE_2.color, is_active: true }
        ])
      }

      if (stationsData && stationsData.length > 0) {
        setStations(stationsData)
      } else {
        const fallbackStations = [
          ...STATIONS.GATE_1.map((s, idx) => ({ id: `g1-${idx}`, route_id: ROUTES.GATE_1.id, ...s, waiting_count: 0 })),
          ...STATIONS.GATE_2.map((s, idx) => ({ id: `g2-${idx}`, route_id: ROUTES.GATE_2.id, ...s, waiting_count: 0 }))
        ]
        setStations(fallbackStations)
      }

      if (caddiesData && caddiesData.length > 0) {
        setCaddies(caddiesData)
      } else {
        setCaddies([
          { id: 'caddy-1', name: 'Caddy 1', route_id: ROUTES.GATE_1.id, status: 'OFF_DUTY', current_driver_id: null, current_lat: null, current_lng: null, speed: 0, heading: 0, last_ping: new Date().toISOString() },
          { id: 'caddy-2', name: 'Caddy 2', route_id: ROUTES.GATE_2.id, status: 'OFF_DUTY', current_driver_id: null, current_lat: null, current_lng: null, speed: 0, heading: 0, last_ping: new Date().toISOString() }
        ] as any)
      }

      if (pathsData && pathsData.length > 0) {
        setRoutePaths(pathsData)
      } else {
        setRoutePaths([
          { id: 'p1', route_id: ROUTES.GATE_1.id, coordinates: ROUTE_PATHS.GATE_1 },
          { id: 'p2', route_id: ROUTES.GATE_2.id, coordinates: ROUTE_PATHS.GATE_2 }
        ])
      }

      if (adsData && adsData.length > 0) {
        setAdBanners(adsData)
        if (!currentAd) {
          const randomIndex = Math.floor(Math.random() * adsData.length)
          setCurrentAd(adsData[randomIndex])
        }
      }
    } catch (err) {
      console.error('Failed to query tables:', err)
    }
  }

  useEffect(() => {
    fetchBaseData()
    const pollInterval = setInterval(fetchBaseData, POLLING_INTERVAL_MS)

    const savedCooldown = localStorage.getItem('wait_flag_cooldown')
    if (savedCooldown) {
      const targetTime = parseInt(savedCooldown)
      const remaining = Math.max(0, Math.round((targetTime - Date.now()) / 1000))
      setCooldownRemaining(remaining)
    }

    return () => clearInterval(pollInterval)
  }, [])

  useEffect(() => {
    if (cooldownRemaining <= 0) return
    const timer = setTimeout(() => {
      setCooldownRemaining(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearTimeout(timer)
  }, [cooldownRemaining])

  useEffect(() => {
    if (currentAd && adImpressionTracked.current !== currentAd.id) {
      adImpressionTracked.current = currentAd.id
      supabase
        .from('ad_banners')
        .update({ impressions: (currentAd.impressions || 0) + 1 })
        .eq('id', currentAd.id)
        .then()
    }
  }, [currentAd])

  // Realtime Caddies
  useEffect(() => {
    const channel = supabase
      .channel('caddies-live-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caddies' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const updatedCaddy = payload.new as Caddy
          setCaddies(prev => prev.map(c => c.id === updatedCaddy.id ? updatedCaddy : c))
        } else {
          fetchBaseData()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Route Selection
  useEffect(() => {
    if (selectedRouteId && routePaths.length > 0) {
      const matchingPath = routePaths.find(p => p.route_id === selectedRouteId)
      if (matchingPath) {
        setActiveRoutePath(matchingPath.coordinates as LatLng[])
      } else {
        setActiveRoutePath([])
      }
    } else {
      setActiveRoutePath([])
    }
    if (selectedStation && selectedRouteId && selectedStation.route_id !== selectedRouteId) {
      setSelectedStation(null)
      setDrawerOpen(false)
    }
  }, [selectedRouteId, routePaths])

  // ETA Calculation (Turf.js)
  const calculateCaddyETA = (caddy: Caddy, station: Station) => {
    if (!caddy.current_lat || !caddy.current_lng) return null
    
    const pathObj = routePaths.find(p => p.route_id === station.route_id)
    if (!pathObj || !pathObj.coordinates || pathObj.coordinates.length < 2) {
      const cPt = turf.point([caddy.current_lng, caddy.current_lat])
      const sPt = turf.point([station.lng, station.lat])
      const distKm = turf.distance(cPt, sPt)
      const distM = Math.round(distKm * 1000)
      const etaMins = Math.round((distKm / 15) * 60)
      return { distance: distM, eta: Math.max(1, etaMins) }
    }

    const pathCoords = pathObj.coordinates as LatLng[]
    const turfLine = turf.lineString(pathCoords.map(c => [c[1], c[0]]))
    
    const caddyPt = turf.point([caddy.current_lng, caddy.current_lat])
    const stationPt = turf.point([station.lng, station.lat])
    
    const snappedCaddy = turf.nearestPointOnLine(turfLine, caddyPt)
    const snappedStation = turf.nearestPointOnLine(turfLine, stationPt)

    const caddyIndex = snappedCaddy.properties.index ?? 0
    const stationIndex = snappedStation.properties.index ?? 0

    let slicedLineCoords: any[] = []
    if (caddyIndex <= stationIndex) {
      slicedLineCoords = [
        snappedCaddy.geometry.coordinates,
        ...pathCoords.slice(caddyIndex + 1, stationIndex + 1).map(c => [c[1], c[0]]),
        snappedStation.geometry.coordinates
      ]
    } else {
      slicedLineCoords = [
        snappedCaddy.geometry.coordinates,
        ...pathCoords.slice(caddyIndex + 1).map(c => [c[1], c[0]]),
        ...pathCoords.slice(0, stationIndex + 1).map(c => [c[1], c[0]]),
        snappedStation.geometry.coordinates
      ]
    }

    let roadDistanceKm = 0
    try {
      if (slicedLineCoords.length >= 2) {
        roadDistanceKm = turf.length(turf.lineString(slicedLineCoords))
      }
    } catch {
      roadDistanceKm = turf.distance(snappedCaddy, snappedStation)
    }

    const roadDistanceMeters = Math.round(roadDistanceKm * 1000)
    const routeStations = stations.filter(s => s.route_id === station.route_id)
    let intermediateStopsCount = 0

    const caddyStopOrder = routeStations.reduce((closest, current) => {
      const currentPt = turf.point([current.lng, current.lat])
      const dist = turf.distance(caddyPt, currentPt)
      return dist < closest.dist ? { dist, order: current.stop_order } : closest
    }, { dist: Infinity, order: 1 }).order

    const targetStopOrder = station.stop_order

    if (caddyStopOrder <= targetStopOrder) {
      intermediateStopsCount = routeStations.filter(
        s => s.stop_order > caddyStopOrder && s.stop_order < targetStopOrder
      ).length
    } else {
      intermediateStopsCount = routeStations.filter(
        s => s.stop_order > caddyStopOrder || s.stop_order < targetStopOrder
      ).length
    }

    const travelTimeMins = (roadDistanceKm / 15) * 60
    const stopsDelayMins = intermediateStopsCount * 0.75
    const totalETAMins = Math.max(1, Math.round(travelTimeMins + stopsDelayMins))

    return { distance: roadDistanceMeters, eta: totalETAMins }
  }

  const activeCaddiesList = caddies.filter(c => 
    c.status === 'ON_DUTY' && 
    c.current_lat && 
    c.current_lng && 
    (Date.now() - new Date(c.last_ping).getTime() < STALE_THRESHOLD_MS)
  )

  const activeEtasList = selectedStation ? activeCaddiesList
    .filter(c => c.route_id === selectedStation.route_id)
    .map(caddy => {
      const calculations = calculateCaddyETA(caddy, selectedStation)
      return {
        caddy,
        distance: calculations?.distance ?? 0,
        eta: calculations?.eta ?? 0
      }
    })
    .sort((a, b) => a.eta - b.eta) : []

  const distanceToSelectedStation = selectedStation && userLocation
    ? Math.round(turf.distance(turf.point([userLocation[1], userLocation[0]]), turf.point([selectedStation.lng, selectedStation.lat])) * 1000)
    : null

  // FAB Actions
  const handleRecenterLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((position) => {
      if (mapRef.current) {
        mapRef.current.flyTo([position.coords.latitude, position.coords.longitude], 17, { animate: true })
      }
    })
  }

  const handleRecenterCampus = () => {
    if (mapRef.current) {
      mapRef.current.flyTo(CAMPUS_CENTER, 15, { animate: true })
    }
  }

  // "I'm Waiting" Action
  const handleSignalWaiting = () => {
    if (!selectedStation) return
    setGpsLoading(true)

    if (!navigator.geolocation) {
      setShowStatusBanner({ type: 'error', text: 'Geolocation not supported.' })
      setGpsLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const studentPt = turf.point([position.coords.longitude, position.coords.latitude])
        const stationPt = turf.point([selectedStation.lng, selectedStation.lat])
        const distanceMeters = turf.distance(studentPt, stationPt) * 1000

        if (distanceMeters > STATION_PROXIMITY_M) {
          setShowStatusBanner({
            type: 'error',
            text: `Must be within ${STATION_PROXIMITY_M}m of the station (You are ${Math.round(distanceMeters)}m away).`
          })
          setGpsLoading(false)
          setTimeout(() => setShowStatusBanner(null), 5000)
          return
        }

        const studentId = localStorage.getItem('shuttle-device-id') || (() => {
          const id = crypto.randomUUID()
          localStorage.setItem('shuttle-device-id', id)
          return id
        })()

        const { error } = await supabase
          .from('wait_flags')
          .upsert({
            station_id: selectedStation.id,
            student_id: studentId,
            expires_at: new Date(Date.now() + WAIT_FLAG_TTL_MS).toISOString(),
          }, { onConflict: 'station_id,student_id' })

        if (!error) {
          setShowStatusBanner({ type: 'success', text: 'Boarding signal sent! Driver notified.' })
          const targetTime = Date.now() + WAIT_FLAG_TTL_MS
          localStorage.setItem('wait_flag_cooldown', targetTime.toString())
          setCooldownRemaining(WAIT_FLAG_TTL_MS / 1000)
          fetchBaseData()
        } else {
          setShowStatusBanner({ type: 'error', text: `Request failed: ${error.message}` })
        }
        
        setGpsLoading(false)
        setTimeout(() => setShowStatusBanner(null), 5000)
      },
      () => {
        setShowStatusBanner({ type: 'error', text: 'Location access denied or failed.' })
        setGpsLoading(false)
        setTimeout(() => setShowStatusBanner(null), 5000)
      },
      { enableHighAccuracy: true, timeout: 6000 }
    )
  }

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <div className={`w-full h-screen ${colors.bg} flex flex-col overflow-hidden relative select-none`}>
      
      {/* 1. Status Banner */}
      {showStatusBanner && (
        <div className={`absolute top-20 left-4 right-4 z-[9999] p-3 rounded-xl border shadow-xl flex items-center gap-3 backdrop-blur-md animate-bounce ${
          showStatusBanner.type === 'success' 
            ? 'bg-emerald-500/90 border-emerald-400 text-white' 
            : 'bg-rose-500/90 border-rose-400 text-white'
        }`}>
          {showStatusBanner.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-semibold">{showStatusBanner.text}</span>
        </div>
      )}

      {/* 2. Floating Top Bar */}
      <div className="absolute top-4 left-4 right-4 z-[999] flex items-center justify-between">
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-full ${colors.bgCard} shadow-lg border ${colors.borderAccent} transition-all`}>
          <div className="relative flex items-center justify-center w-4 h-4">
            {isOnline ? (
              <>
                <div className="absolute inset-0 rounded-full bg-emerald-500 opacity-25 animate-ping"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
              </>
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></div>
            )}
          </div>
          <span className={`text-xs font-bold ${colors.text}`}>{isOnline ? 'Live' : 'Reconnecting'}</span>
          <span className={`text-xs font-bold ${colors.textMuted} mx-1`}>•</span>
          <span className={`text-xs font-bold ${colors.text}`}>SNU Shuttle</span>
        </div>

        <button 
          onClick={handleThemeToggle}
          className={`p-2.5 rounded-full ${colors.bgCard} shadow-lg border ${colors.borderAccent} ${colors.text} hover:scale-105 active:scale-95 transition-all`}
        >
          {mapTheme === 'light' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* 3. Fullscreen Map */}
      <div className="flex-1 w-full min-h-0 relative z-10">
        <StudentMap
          mapTheme={mapTheme}
          stations={stations}
          caddies={caddies}
          routes={routes}
          routePaths={routePaths}
          selectedRouteId={selectedRouteId}
          activeRoutePath={activeRoutePath}
          selectedStationId={selectedStation ? selectedStation.id : null}
          onSelectStation={(station) => {
            setSelectedStation(station)
            setDrawerOpen(true)
          }}
          onMapClick={() => {
            if (selectedStation) {
              setSelectedStation(null)
              setDrawerOpen(false)
            }
          }}
          onRecenterCampus={handleRecenterCampus}
          mapRef={mapRef}
          userLocation={userLocation}
        />
        
        {/* Empty State Overlay */}
        {activeCaddiesList.length === 0 && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[900]">
            <div className={`px-6 py-4 rounded-2xl ${colors.bgCard} border ${colors.borderAccent} shadow-2xl flex flex-col items-center gap-3 animate-pulse`}>
              <Bus className={`w-8 h-8 ${colors.textMuted}`} />
              <span className={`text-sm font-bold ${colors.text}`}>No caddies currently on active duty</span>
            </div>
          </div>
        )}

        {/* Floating Route Pills Capsule */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-lg border border-slate-200/50 dark:border-slate-700/50 rounded-full px-2 py-1.5 flex items-center gap-1.5 w-max max-w-[90vw] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSelectedRouteId(null)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all shadow-sm ${
              selectedRouteId === null ? 'bg-teal-500 text-white' : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All
          </button>
          {routes.map(route => (
            <button
              key={route.id}
              onClick={() => setSelectedRouteId(route.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all shadow-sm flex items-center gap-2 ${
                selectedRouteId === route.id ? 'bg-teal-500 text-white' : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: route.color }}></span>
              {route.name}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Right FABs */}
      <div className="absolute right-4 bottom-32 z-[999] flex flex-col gap-3">
        <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" className={`fab-btn p-3 rounded-full ${colors.bgCard} border ${colors.borderAccent} ${colors.text} shadow-xl text-xl leading-none`}>
          +
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" className={`fab-btn p-3 rounded-full ${colors.bgCard} border ${colors.borderAccent} ${colors.text} shadow-xl text-xl leading-none`}>
          −
        </button>
        <button onClick={handleRecenterLocation} className={`fab-btn p-3 rounded-full ${colors.bgCard} border ${colors.borderAccent} ${colors.text} shadow-xl`}>
          <Crosshair className="w-5 h-5" />
        </button>
        <button onClick={handleRecenterCampus} className={`fab-btn p-3 rounded-full ${colors.bgCard} border ${colors.borderAccent} ${colors.text} shadow-xl`}>
          <Building2 className="w-5 h-5" />
        </button>
      </div>

      {/* 5. Bottom UI Area */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] flex flex-col items-center pointer-events-none">
        
        {/* Bottom Sheet */}
        <div className={`w-full ${colors.bgSheet} border-t ${colors.borderAccent} shadow-[0_-10px_40px_rgba(0,0,0,0.2)] rounded-t-3xl bottom-sheet flex flex-col pointer-events-auto ${
          drawerOpen ? 'translate-y-0' : 'translate-y-[calc(100%-72px)]'
        }`}>
          
          <div onClick={() => setDrawerOpen(!drawerOpen)} className="w-full py-4 flex flex-col items-center justify-center cursor-pointer">
            <div className="bottom-sheet-handle mb-3"></div>
            {!drawerOpen && (
              <div className={`text-xs font-bold ${colors.textSecondary} flex items-center gap-2`}>
                <Bus className="w-4 h-4" />
                {activeCaddiesList.length > 0 ? `${activeCaddiesList.length} caddies active` : 'No caddies on duty'}
              </div>
            )}
          </div>

          <div className="px-6 pb-8 flex-1 overflow-y-auto">
            {selectedStation ? (
              <div className="space-y-6">
                
                {/* Station Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className={`text-xl font-black ${colors.text}`}>{selectedStation.name}</h2>
                    <div className="flex gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded-md font-bold ${colors.pill} ${colors.textSecondary}`}>
                        Stop {selectedStation.stop_order}
                      </span>
                      {routes.find(r => r.id === selectedStation.route_id) && (
                        <span 
                          className="text-xs px-2 py-1 rounded-md font-bold text-white shadow-sm"
                          style={{ backgroundColor: routes.find(r => r.id === selectedStation.route_id)?.color }}
                        >
                          {routes.find(r => r.id === selectedStation.route_id)?.name}
                        </span>
                      )}
                    </div>
                    {distanceToSelectedStation !== null && (
                      <p className={`mt-2 text-xs font-semibold ${colors.textSecondary}`}>You are {distanceToSelectedStation} m from this stop</p>
                    )}
                  </div>

                  {cooldownRemaining > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      <button disabled className={`px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 ${colors.pill} ${colors.textMuted}`}>
                        <Clock className="w-5 h-5" /> Locked
                      </button>
                      <span className="text-[10px] font-bold text-teal-500">{formatCooldown(cooldownRemaining)}</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleSignalWaiting}
                      disabled={gpsLoading}
                      className="px-5 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-teal-500/25 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {gpsLoading ? <Wifi className="w-5 h-5 animate-pulse" /> : <Navigation className="w-5 h-5" />}
                      I'm Waiting
                    </button>
                  )}
                </div>

                {/* ETAs */}
                <div className="space-y-3">
                  <h3 className={`text-xs font-black uppercase tracking-wider ${colors.textMuted}`}>Incoming Caddies</h3>
                  {activeEtasList.length > 0 ? (
                    <div className="space-y-3">
                      {activeEtasList.map(({ caddy, distance, eta }) => (
                        <div key={caddy.id} className={`${colors.bgCard} border ${colors.border} p-4 rounded-2xl flex items-center justify-between shadow-sm`}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
                              <Bus className="w-5 h-5" />
                            </div>
                            <div>
                              <div className={`font-bold ${colors.text} text-sm`}>{caddy.name}</div>
                              <div className={`text-xs ${colors.textSecondary} mt-0.5`}>
                                {distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`} away
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-black text-teal-600 dark:text-teal-400">
                              ~{eta} min
                            </div>
                            <div className={`text-[10px] font-bold ${colors.textMuted}`}>{caddy.speed} km/h</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`p-4 rounded-xl border border-dashed ${colors.borderAccent} ${colors.textSecondary} text-sm text-center font-medium`}>
                      {activeCaddiesList.length > 0 ? "🚌 Shuttles active. Live ETA will show once a driver departs your previous station." : "No incoming caddies on this route."}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className={`py-8 text-center text-sm font-medium ${colors.textSecondary} border border-dashed ${colors.borderAccent} rounded-2xl`}>
                Select a stop on the map to see details.
              </div>
            )}

            {/* Ad Banner */}
            {currentAd && (
              <div 
                onClick={() => {
                  window.open(currentAd.target_url, '_blank', 'noopener,noreferrer')
                  supabase.from('ad_banners').update({ clicks: (currentAd.clicks || 0) + 1 }).eq('id', currentAd.id).then()
                }}
                className={`mt-6 w-full rounded-2xl overflow-hidden border ${colors.borderAccent} cursor-pointer group shadow-sm hover:shadow-md transition-shadow bg-black/5 dark:bg-white/5`}
              >
                <div className="relative h-24 w-full">
                  <img src={currentAd.image_url} alt={currentAd.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                  <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/70 bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-md">Sponsored</span>
                      <div className="text-white font-bold text-sm mt-1 truncate">{currentAd.title}</div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-white/50 group-hover:text-white transition-colors shrink-0 mb-1" />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
