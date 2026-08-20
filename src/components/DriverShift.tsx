'use client'

import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { 
  Play, Square, AlertTriangle, LogOut, Compass, MapPin, 
  Wifi, WifiOff, Users, BatteryCharging, Radio, Volume2, ShieldAlert
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Geolocation, type CallbackID, type Position } from '@capacitor/geolocation'
import { BackgroundGeolocation } from '@capgo/background-geolocation'
import dynamic from 'next/dynamic'
import { ROUTES, ROUTE_PATHS } from '@/utils/campusData'

const DriverMap = dynamic(() => import('./AdminMap'), { ssr: false })
const OFF_DUTY_GRACE_WINDOW_MS = 45_000

interface Profile {
  id: string
  full_name: string
  phone: string
  role: 'admin' | 'driver' | 'student'
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

interface Station {
  id: string
  name: string
  lat: number
  lng: number
  stop_order: number
  route_id: string
  waiting_count: number
}

interface DriverShiftProps {
  profile: Profile
  caddy: Caddy | null
  availableCaddies?: Caddy[]
  stations: Station[]
  isOnline: boolean
  offlineBufferCount: number
  onLogout: () => void
  onCaddyStatusChange: (updatedCaddy: Caddy) => void
  onTelemetryLogged: (ping: any) => void
}

export default function DriverShift({
  profile,
  caddy,
  availableCaddies = [],
  stations,
  isOnline,
  offlineBufferCount,
  onLogout,
  onCaddyStatusChange,
  onTelemetryLogged,
}: DriverShiftProps) {
  const supabase = createClient()
  
  // Local state
  const [caddyState, setCaddyState] = useState<Caddy | null>(caddy)
  const [showVehiclePicker, setShowVehiclePicker] = useState<boolean>(false)
  const [wakeLockActive, setWakeLockActive] = useState(false)
  const [currentSpeed, setCurrentSpeed] = useState<number>(0)
  const [isGeofenced, setIsGeofenced] = useState<boolean>(true)
  const [gpsQuality, setGpsQuality] = useState<'EXCELLENT' | 'WEAK' | 'SEARCHING'>('SEARCHING')

  // Refs for tracking
  const watchIdRef = useRef<string | number | null>(null)
  const wakeLockRef = useRef<any>(null)
  const lastTelemetryPushTimeRef = useRef<number>(0)
  const heartbeatIntervalRef = useRef<any>(null)
  const lastGpsTimeRef = useRef<number>(Date.now())
  const activeCaddyRef = useRef<Caddy | null>(caddy)
  const dutyIntentRef = useRef(false)
  const streamingRef = useRef(false)
  const startStreamingRef = useRef<() => Promise<void>>(async () => undefined)

  const dutySessionKey = `caddy-duty:${profile.id}`
  const saveDutyIntent = (active: boolean, caddyId?: string) => {
    dutyIntentRef.current = active
    if (typeof window === 'undefined') return
    if (active && caddyId) {
      sessionStorage.setItem(dutySessionKey, caddyId)
    } else {
      sessionStorage.removeItem(dutySessionKey)
    }
  }
  
  // Track latest coordinates — initialised to 0,0 so we can detect "no GPS fix yet"
  const lastLocationRef = useRef<{ lat: number, lng: number, heading: number, speed: number }>({
    lat: 0,
    lng: 0,
    heading: 0,
    speed: 0
  })
  const lastAcceptedLocationRef = useRef<{ lat: number, lng: number, timestamp: number } | null>(null)
  const smoothedSpeedRef = useRef(0)

  const distanceMeters = (a: { lat: number, lng: number }, b: { lat: number, lng: number }) => {
    const rad = (value: number) => value * Math.PI / 180
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  }

  // GPS speed is often null or noisy on phones. Derive it from consecutive
  // accepted locations, ignore accuracy-sized movement, then low-pass filter.
  const acceptLocation = (lat: number, lng: number, heading: number, reportedSpeed: number | null, accuracy: number, timestamp = Date.now()) => {
    if (!validateGeofence(lat, lng) || accuracy > 500) {
      setIsGeofenced(false)
      return
    }
    const previous = lastAcceptedLocationRef.current
    let measuredSpeed = reportedSpeed !== null && reportedSpeed >= 0 ? reportedSpeed * 3.6 : 0
    if (previous) {
      const seconds = Math.max(1, (timestamp - previous.timestamp) / 1000)
      const distance = distanceMeters(previous, { lat, lng })
      // Do not convert GPS jitter smaller than its stated accuracy into speed.
      measuredSpeed = distance <= Math.max(5, accuracy * 0.65) ? 0 : (distance / seconds) * 3.6
    }
    if (measuredSpeed > 40) return

    const speedKmh = Math.round(smoothedSpeedRef.current * 0.65 + measuredSpeed * 0.35)
    smoothedSpeedRef.current = speedKmh
    lastAcceptedLocationRef.current = { lat, lng, timestamp }
    lastLocationRef.current = { lat, lng, heading, speed: speedKmh }
    setIsGeofenced(true)
    setCurrentSpeed(speedKmh)
    setGpsQuality(accuracy < 15 ? 'EXCELLENT' : 'WEAK')
    setCaddyState(previousState => previousState ? { ...previousState, current_lat: lat, current_lng: lng, heading, speed: speedKmh, last_ping: new Date(timestamp).toISOString() } : previousState)
  }

  // Synchronize internal caddy state
  useEffect(() => {
    if (caddy && typeof window !== 'undefined' && sessionStorage.getItem(dutySessionKey) === caddy.id) {
      dutyIntentRef.current = true
    }
    activeCaddyRef.current = caddy
    // A delayed realtime/poll response must never undo the driver's active
    // screen toggle. OFF_DUTY is only persisted by End Duty or logout.
    setCaddyState(previous => {
      if (dutyIntentRef.current && previous?.id === caddy?.id && caddy?.status === 'OFF_DUTY') {
        return { ...caddy, status: 'ON_DUTY' }
      }
      return caddy
    })
  }, [caddy])

  // Resume through a ref so the window listener always invokes the latest
  // tracker with the current caddy, not a stale render closure.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && dutyIntentRef.current && !streamingRef.current) {
        void startStreamingRef.current()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  // A duty-state transition is the source of truth for the tracker lifecycle.
  // This recovers tracking immediately if a render lands between the durable
  // ON_DUTY mutation and listener registration.
  useEffect(() => {
    if (caddyState?.status === 'ON_DUTY' && dutyIntentRef.current && !streamingRef.current) {
      void startStreamingRef.current()
    }
  }, [caddyState?.status])

  // Clean up watchers on unmount
  useEffect(() => {
    return () => {
      stopStreaming()
    }
  }, [])

  // Geofence Validation: Discard coordinates outside SNU campus bounds
  // Campus boundaries: [[28.5150, 77.5650], [28.5350, 77.5850]]
  const validateGeofence = (lat: number, lng: number) => {
    const minLat = 28.5150
    const maxLat = 28.5350
    const minLng = 77.5650
    const maxLng = 77.5850
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
  }

  // Handle geolocation updates
  const handleGpsUpdate = async (position: GeolocationPosition | Position) => {
    const lat = position.coords.latitude
    const lng = position.coords.longitude
    
    // Heading in degrees (default to 0 if not provided by browser/hardware)
    acceptLocation(lat, lng, position.coords.heading ?? lastLocationRef.current.heading ?? 0, position.coords.speed, position.coords.accuracy, position.timestamp)

    // Push telemetry synchronously directly from native OS callback event to bypass background throttling
    const now = Date.now()
    if (now - lastTelemetryPushTimeRef.current > 2500 && streamingRef.current && activeCaddyRef.current) {
      lastTelemetryPushTimeRef.current = now
      if (lastLocationRef.current.lat === 0 && lastLocationRef.current.lng === 0) return

      const ping = {
        lat: lastLocationRef.current.lat,
        lng: lastLocationRef.current.lng,
        speed: lastLocationRef.current.speed,
        heading: lastLocationRef.current.heading,
        status: 'ON_DUTY',
        last_ping: new Date().toISOString()
      }

      if (navigator.onLine) {
        const { error: pushError } = await supabase
          .from('caddies')
          .update({
            current_lat: ping.lat,
            current_lng: ping.lng,
            speed: ping.speed,
            heading: ping.heading,
            status: 'ON_DUTY',
            last_ping: ping.last_ping
          })
          .eq('id', activeCaddyRef.current.id)

        if (pushError) {
          console.error('Supabase telemetry push error:', pushError)
          onTelemetryLogged(ping)
        }
      } else {
        onTelemetryLogged(ping)
      }
    }
  }

  const handleGpsError = (err: GeolocationPositionError) => {
    console.error('GPS tracking error:', err)
    setGpsQuality('SEARCHING')
  }

  // Wake Lock handler
  const requestWakeLock = async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
      setWakeLockActive(true)
    } catch (err) {
      console.warn('Wake Lock request failed:', err)
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
        setWakeLockActive(false)
      } catch (err) {
        console.error(err)
      }
    }
  }

  // Streaming Engine loop
  const startStreaming = async () => {
    const activeCaddy = activeCaddyRef.current
    if (!activeCaddy || streamingRef.current) return
    streamingRef.current = true
    saveDutyIntent(true, activeCaddy.id)

    // Persist the toggle immediately. This comes before any permission or GPS
    // async work, so the first Start Duty tap always starts a live session.
    const now = new Date().toISOString()
    const { data: updatedCaddy, error } = await supabase
      .from('caddies')
      .update({ status: 'ON_DUTY', speed: 0, heading: 0, last_ping: now })
      .eq('id', activeCaddy.id)
      .select()
      .single()

    if (error) {
      streamingRef.current = false
      saveDutyIntent(false)
      console.error('Failed to start duty:', error)
      return
    }
    if (updatedCaddy) {
      activeCaddyRef.current = updatedCaddy
      setCaddyState(updatedCaddy)
      onCaddyStatusChange(updatedCaddy)
    }

    // 1. Activate Wake Lock after the durable state transition.
    await requestWakeLock()

    // 2. Register native background geolocation or fallback to browser watchPosition
    if (Capacitor.isNativePlatform()) {
      try {
        const permission = await Geolocation.checkPermissions()
        if (permission.location !== 'granted') await Geolocation.requestPermissions({ permissions: ['location'] })
        // Android needs a foreground notification plus background authorization
        // to continue GPS updates after the driver presses Home. The native
        // plugin handles OS-specific settings prompts where required.
        const backgroundPermission = await BackgroundGeolocation.checkPermissions()
        if (backgroundPermission.backgroundLocation !== 'granted' || backgroundPermission.notification !== 'granted') {
          await BackgroundGeolocation.requestPermissions({ permissions: ['backgroundLocation', 'notification'] })
        }
        const nativeWatchId: CallbackID = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0, interval: 2500, minimumUpdateInterval: 1000 },
          (position, nativeError) => {
            if (nativeError || !position) {
              console.error('Native GPS tracking error:', nativeError)
              setGpsQuality('SEARCHING')
              return
            }
            lastGpsTimeRef.current = Date.now()
            handleGpsUpdate(position)
          },
        )
        watchIdRef.current = nativeWatchId

        // The Capgo service owns the Android foreground/background service;
        // the Capacitor watch above is the primary high-accuracy foreground feed.
        await BackgroundGeolocation.start({
          backgroundMessage: "SNU Caddy Tracker is running in background",
          backgroundTitle: "SNU Caddy Tracker",
          requestPermissions: true,
          stale: false,
          distanceFilter: 10,
        }, (loc: any, error) => {
          if (error) {
            console.error('Background geolocation error:', error)
            setGpsQuality('SEARCHING')
            return
          }
          if (loc) {
            const lat = loc.latitude
            const lng = loc.longitude
            const heading = loc.bearing ?? loc.heading ?? 0
            const accuracy = loc.accuracy ?? 10
            acceptLocation(lat, lng, heading, loc.speed ?? null, accuracy, loc.time ? new Date(loc.time).getTime() : Date.now())
          }
        })
      } catch (err) {
        console.error('Failed to start Capacitor background geolocation:', err)
      }
    } else {
      if (navigator.geolocation) {
        const startWatch = () => {
          return navigator.geolocation.watchPosition(
            (pos) => {
              lastGpsTimeRef.current = Date.now()
              handleGpsUpdate(pos)
            },
            handleGpsError,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          )
        }

        watchIdRef.current = startWatch()

        // Network/GPS jitter only changes the local quality indicator. The
        // active duty session remains ON_DUTY through a full 45-second grace
        // window (and is never auto-written as OFF_DUTY).
        heartbeatIntervalRef.current = setInterval(() => {
          const timeSinceLastGps = Date.now() - lastGpsTimeRef.current
          if (timeSinceLastGps > OFF_DUTY_GRACE_WINDOW_MS) {
            setGpsQuality('SEARCHING')
          }
        }, 5000)
      }
    }
  }

  startStreamingRef.current = startStreaming

  const stopStreaming = async () => {
    streamingRef.current = false
    // 1. Clear intervals & watchers
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }

    if (Capacitor.isNativePlatform()) {
      try {
        await BackgroundGeolocation.stop()
      } catch (err) {
        console.error('Failed to stop native background geolocation:', err)
      }
    }

    if (watchIdRef.current !== null) {
      if (Capacitor.isNativePlatform() && typeof watchIdRef.current === 'string') {
        await Geolocation.clearWatch({ id: watchIdRef.current })
      } else if (typeof watchIdRef.current === 'number') {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      watchIdRef.current = null
    }

    // 2. Release wake lock
    await releaseWakeLock()
    
    setCurrentSpeed(0)
    setGpsQuality('SEARCHING')
  }

  // Button transitions

  const handleStartDuty = async () => {
    await startStreaming()
  }

  const handleTakeBreak = async () => {
    if (!caddyState) return
    await stopStreaming()
    saveDutyIntent(false)

    // Update status to ON_BREAK
    const { data: updatedCaddy, error } = await supabase
      .from('caddies')
      .update({
        status: 'ON_BREAK',
        speed: 0,
        heading: 0,
        last_ping: new Date().toISOString()
      })
      .eq('id', caddyState.id)
      .select()
      .single()

    if (!error && updatedCaddy) {
      setCaddyState(updatedCaddy)
      onCaddyStatusChange(updatedCaddy)
    }
  }

  const handleEndDuty = async () => {
    if (!caddyState) return
    await stopStreaming()
    saveDutyIntent(false)

    // End the shift but retain the admin-managed driver and route assignment.
    const { data: updatedCaddy, error } = await supabase
      .from('caddies')
      .update({
        status: 'OFF_DUTY',
        current_lat: null,
        current_lng: null,
        speed: 0,
        heading: 0,
        last_ping: new Date().toISOString()
      })
      .eq('id', caddyState.id)
      .select()
      .single()

    if (!error && updatedCaddy) {
      setCaddyState(updatedCaddy)
      onCaddyStatusChange(updatedCaddy)
      onLogout() // Logs driver out of dashboard since caddy assignment ended
    }
  }

  const handleSelectCaddy = async (selected: Caddy) => {
    try {
      const { data: updated } = await supabase
        .from('caddies')
        .update({
          current_driver_id: profile.id,
          last_ping: new Date().toISOString()
        })
        .eq('id', selected.id)
        .select()
        .maybeSingle()

      const target = updated || { ...selected, current_driver_id: profile.id }
      setCaddyState(target)
      onCaddyStatusChange(target)
      setShowVehiclePicker(false)
    } catch (e) {
      const target = { ...selected, current_driver_id: profile.id }
      setCaddyState(target)
      onCaddyStatusChange(target)
      setShowVehiclePicker(false)
    }
  }

  if (!caddyState || showVehiclePicker) {
    const listToDisplay = Array.isArray(availableCaddies) ? availableCaddies : []

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 text-center space-y-6 font-sans">
        <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-3xl text-teal-400">
          <Compass className="w-8 h-8 animate-pulse" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h2 className="text-xl font-bold text-white">Select Vehicle for Duty</h2>
          <p className="text-xs text-slate-400">
            Welcome, <span className="text-slate-200 font-semibold">{profile.full_name}</span>. Choose the caddy you are driving today:
          </p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {listToDisplay.map((caddyItem) => (
            <div 
              key={caddyItem.id}
              onClick={() => handleSelectCaddy(caddyItem)}
              className="bg-slate-900 border border-slate-800 hover:border-teal-500/50 p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:bg-teal-500 group-hover:text-slate-950 transition-colors">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm text-white">{caddyItem.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">ID: {caddyItem.id}</div>
                </div>
              </div>
              <span className="text-xs font-semibold text-teal-400 bg-teal-500/10 px-3 py-1 rounded-lg border border-teal-500/20">
                Select & Drive
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          {caddyState && (
            <button
              onClick={() => setShowVehiclePicker(false)}
              className="py-2.5 px-5 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-850"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 py-2.5 px-5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold transition-all"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
    )
  }

  const isDutyRunning = caddyState.status === 'ON_DUTY'
  const isBreakRunning = caddyState.status === 'ON_BREAK'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-teal-500 selection:text-slate-950">
      
      {/* 1. Header Metrics (In-Vehicle status) */}
      <header className="bg-slate-900 border-b border-slate-850 px-6 py-4 flex justify-between items-center z-40 shrink-0">
        <div className="flex items-center gap-3">
          <Radio className={`w-4 h-4 ${isDutyRunning ? 'text-emerald-400 animate-ping' : 'text-slate-500'}`} />
          <div className="flex flex-col">
            <span className="text-xs font-black text-white uppercase tracking-wider">{caddyState.name}</span>
            <span className="text-[9px] text-slate-500 font-mono mt-0.5">{caddyState.id}</span>
          </div>
          {!isDutyRunning && (
            <button
              onClick={() => setShowVehiclePicker(true)}
              className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded font-bold hover:bg-teal-500/20 transition-all"
            >
              Switch Caddy
            </button>
          )}
        </div>

        {/* System parameters indicator badges */}
        <div className="flex items-center gap-2">
          {/* Offline/Online signal Status */}
          {isOnline ? (
            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-emerald-400 font-bold">
              <Wifi className="w-3.5 h-3.5" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-rose-400 font-bold animate-pulse">
              <WifiOff className="w-3.5 h-3.5" /> Offline
            </span>
          )}

          {/* Wake Lock Status */}
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1 ${
            wakeLockActive ? 'bg-teal-500/10 text-teal-400 border border-teal-500/15' : 'bg-slate-800 text-slate-500'
          }`}>
            <BatteryCharging className="w-3.5 h-3.5" /> Wake
          </span>
        </div>
      </header>

      {/* 2. Main High-contrast Driver Interface */}
      <main className="flex-1 p-6 overflow-y-auto space-y-6 flex flex-col justify-between shrink-0">
        
        {/* Speedometer card */}
        <div className="bg-slate-900 border border-slate-850 rounded-3xl p-5 flex items-center justify-between shadow-xl">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-extrabold block">Speed Limit: 40 km/h</span>
            <h2 className="text-3xl font-black text-white">{isDutyRunning ? currentSpeed : '0'} <span className="text-xs text-slate-500 font-bold uppercase">km/h</span></h2>
          </div>

          <div className="text-right space-y-1">
            <span className="text-[9px] text-slate-500 uppercase font-extrabold block">GPS Quality</span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
              gpsQuality === 'EXCELLENT' ? 'bg-emerald-500/10 text-emerald-400' :
              gpsQuality === 'WEAK' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-950 text-slate-600'
            }`}>
              {gpsQuality}
            </span>
          </div>
        </div>

        <div className="h-[200px] lg:h-[260px] rounded-3xl overflow-hidden border border-slate-850">
          <DriverMap
            mapTheme="dark"
            caddies={caddyState ? [caddyState] : []}
            routes={Object.values(ROUTES)}
            selectedRouteId={caddyState?.route_id}
            activeRoutePath={caddyState?.route_id === ROUTES.GATE_2.id ? ROUTE_PATHS.GATE_2 : ROUTE_PATHS.GATE_1}
          />
        </div>

        {/* Real-time Station Demand Feed */}
        <div className="bg-slate-900 border border-slate-850 rounded-3xl p-5.5 space-y-4 flex-1 flex flex-col">
          <div className="border-b border-slate-850 pb-2.5 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-teal-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Campus Demand Feed</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">Duty Stops</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[160px] lg:max-h-[220px] flex-1 pr-1">
            {stations.length > 0 ? (
              stations.map(station => (
                <div key={station.id} className="bg-slate-950 border border-slate-850 rounded-2xl p-3.5 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-slate-400">
                      {station.stop_order}
                    </span>
                    <span className="font-semibold text-slate-200">{station.name}</span>
                  </div>

                  {station.waiting_count > 0 ? (
                    <div className="bg-rose-500 text-slate-950 text-xs font-extrabold px-3 py-1 rounded-full flex items-center gap-1.5 animate-pulse shadow-lg shadow-rose-500/10 border border-rose-400/20">
                      <Volume2 className="w-3.5 h-3.5" />
                      {station.waiting_count} Waiting
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-bold bg-slate-900 px-2.5 py-1 rounded-full">
                      Empty
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 text-center py-6">Duty route loop contains no stations.</p>
            )}
          </div>
        </div>

        {/* Offline buffering indicator */}
        {offlineBufferCount > 0 && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-2xl text-xs font-semibold text-center leading-relaxed flex items-center justify-center gap-2 animate-pulse">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Network Disconnected. Buffered {offlineBufferCount} locations in IndexedDB cache.</span>
          </div>
        )}

        {!isGeofenced && isDutyRunning && (
          <div className="bg-amber-500/15 border border-amber-500/30 text-amber-400 p-3 rounded-2xl text-xs font-semibold text-center leading-relaxed flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
            <span>Outside Geofence! Location update skipped (Outside SNU campus bounds).</span>
          </div>
        )}

      </main>

      {/* 3. Huge High-contrast Action Buttons */}
      <footer className="bg-slate-900 border-t border-slate-850 p-6 space-y-4 shrink-0 z-45">
        
        <div className="grid grid-cols-2 gap-4">
          {/* Start Duty (Green) */}
          <button
            onClick={handleStartDuty}
            disabled={isDutyRunning}
            className="py-5 bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 hover:bg-emerald-600 text-slate-950 font-black rounded-3xl shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 transition-all active:scale-95 text-sm uppercase tracking-wider border border-emerald-400/20"
          >
            <Play className="w-5 h-5 fill-slate-950" />
            Start Duty
          </button>

          {/* Take Break (Yellow) */}
          <button
            onClick={handleTakeBreak}
            disabled={!isDutyRunning}
            className="py-5 bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 hover:bg-amber-500 text-slate-950 font-black rounded-3xl shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2 transition-all active:scale-95 text-sm uppercase tracking-wider border border-amber-300/20"
          >
            <Square className="w-4 h-4 fill-slate-950" />
            Take Break
          </button>
        </div>

        {/* End Duty (Red) */}
        <button
          onClick={handleEndDuty}
          className="w-full py-5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-3xl shadow-lg shadow-rose-600/10 flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm uppercase tracking-wider border border-rose-500/20"
        >
          <LogOut className="w-5 h-5" />
          End Duty (Log out)
        </button>

      </footer>

    </div>
  )
}
