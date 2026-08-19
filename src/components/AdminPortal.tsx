'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/client'
import * as turf from '@turf/turf'
import { 
  Plus, Trash, Check, AlertTriangle, RefreshCw, Route, Truck, 
  DollarSign, ShieldAlert, UserPlus, Wrench, Edit2, X, Sun, Moon, LogOut, Lock
} from 'lucide-react'
import { formatIST, formatINR } from '@/utils/format'
import { FLEET_POLLING_INTERVAL_MS, ROUTES, STATIONS, ROUTE_PATHS, DEFAULT_CADDIES } from '@/utils/campusData'
import { MapTheme, getMapTheme, setMapTheme as setMapThemeLS } from '@/utils/mapConfig'

const AdminMap = dynamic(() => import('./AdminMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[480px] bg-slate-900 animate-pulse rounded-2xl flex flex-col items-center justify-center text-slate-500 text-sm border border-slate-800 gap-3">
      <RefreshCw className="w-6 h-6 animate-spin text-teal-500" />
      <span>Initializing High-Clarity Campus Map...</span>
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
  created_at: string
}

interface Profile {
  id: string
  full_name: string
  phone: string
  role: 'admin' | 'driver' | 'student'
  pin?: string
}

export default function AdminPortal({ onLogout }: { onLogout?: () => void }) {
  const supabase = createClient()
  
  // Auth state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(true)

  // App state
  const [activeTab, setActiveTab] = useState<'studio' | 'fleet' | 'ads'>('studio')
  const [routes, setRoutes] = useState<RouteType[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [caddies, setCaddies] = useState<Caddy[]>([])
  const [adBanners, setAdBanners] = useState<AdBanner[]>([])
  const [drivers, setDrivers] = useState<Profile[]>([])
  
  // Theme state
  const [mapTheme, setMapThemeState] = useState<MapTheme>('dark')
  
  useEffect(() => {
    setMapThemeState(getMapTheme())
  }, [])
  
  // Control state
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Studio states
  const [isStudioMode, setIsStudioMode] = useState(true)
  const [isAddStationMode, setIsAddStationMode] = useState(false)
  const [isDrawPathMode, setIsDrawPathMode] = useState(false)
  const [drawnCoordinates, setDrawnCoordinates] = useState<LatLng[]>([])
  const [activeRoutePath, setActiveRoutePath] = useState<LatLng[]>([])
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  
  // Modals / Form inputs
  const [showAddRouteModal, setShowAddRouteModal] = useState(false)
  const [newRouteName, setNewRouteName] = useState('')
  const [newRouteColor, setNewRouteColor] = useState('#2563EB')
  
  const [showAddStationModal, setShowAddStationModal] = useState(false)
  const [newStationName, setNewStationName] = useState('')
  const [newStationOrder, setNewStationOrder] = useState(1)
  const [pendingStationCoords, setPendingStationCoords] = useState<{ lat: number, lng: number } | null>(null)

  // Driver form states
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [driverPin, setDriverPin] = useState('')
  const [assignedCaddyId, setAssignedCaddyId] = useState('')
  const [assignedRouteId, setAssignedRouteId] = useState('')

  // Anti-idling alerts list
  const [idleCaddyWarningIds, setIdleCaddyWarningIds] = useState<string[]>([])

  // Caddy CRUD states
  const [showAddCaddyModal, setShowAddCaddyModal] = useState(false)
  const [editingCaddyId, setEditingCaddyId] = useState<string | null>(null)
  const [newCaddyName, setNewCaddyName] = useState('')
  const [newCaddyRoute, setNewCaddyRoute] = useState('')
  const [newCaddyStatus, setNewCaddyStatus] = useState<'OFF_DUTY' | 'IN_MAINTENANCE'>('OFF_DUTY')

  // Fetch all initial data
  const fetchData = async () => {
    try {
      setRefreshing(true)
      
      const { data: routesData } = await supabase.from('routes').select('*')
      const { data: stationsData } = await supabase.from('campus_stations').select('*')
      const { data: routePathsData } = await supabase.from('route_paths').select('*')
      const { data: caddiesData } = await supabase.from('caddies').select('*')
      const { data: adsData } = await supabase.from('ad_banners').select('*')
      const { data: profilesData } = await supabase.from('profiles').select('*').eq('role', 'driver')

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

      if (adsData) setAdBanners(adsData)
      if (profilesData) setDrivers(profilesData)

      if (selectedRouteId && routePathsData && routePathsData.length > 0) {
        const matchingPath = routePathsData.find(p => p.route_id === selectedRouteId)
        if (matchingPath && matchingPath.coordinates) {
          setActiveRoutePath(matchingPath.coordinates as LatLng[])
        } else {
          setActiveRoutePath([])
        }
      } else if (routePathsData && routePathsData.length > 0 && !selectedRouteId) {
        setSelectedRouteId(routesData?.[0]?.id || ROUTES.GATE_1.id)
        setActiveRoutePath(routePathsData[0].coordinates as LatLng[])
      } else {
        setSelectedRouteId(ROUTES.GATE_1.id)
        setActiveRoutePath(ROUTE_PATHS.GATE_1)
      }

    } catch (err) {
      console.error('Failed to sync DB tables:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Seed default SNU campus presets into database (force-overwrites existing data)
  const seedDatabasePresets = async () => {
    try {
      setRefreshing(true)
      
      // 1. Seed Routes
      const defaultRoutes = [
        { id: ROUTES.GATE_1.id, name: ROUTES.GATE_1.name, color: ROUTES.GATE_1.color, is_active: true },
        { id: ROUTES.GATE_2.id, name: ROUTES.GATE_2.name, color: ROUTES.GATE_2.color, is_active: true }
      ]
      await supabase.from('routes').upsert(defaultRoutes)

      // 2. Delete old stations for these routes, then insert fresh coordinates
      await supabase.from('campus_stations').delete().eq('route_id', ROUTES.GATE_1.id)
      await supabase.from('campus_stations').delete().eq('route_id', ROUTES.GATE_2.id)

      const gate1Stations = STATIONS.GATE_1.map((s, idx) => ({
        id: `a1000001-0000-0000-0000-00000000000${idx + 1}`,
        route_id: ROUTES.GATE_1.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        stop_order: s.stop_order,
        waiting_count: 0
      }))
      const gate2Stations = STATIONS.GATE_2.map((s, idx) => ({
        id: `a2000001-0000-0000-0000-00000000001${idx}`,
        route_id: ROUTES.GATE_2.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        stop_order: s.stop_order,
        waiting_count: 0
      }))
      await supabase.from('campus_stations').insert([...gate1Stations, ...gate2Stations])

      // 3. Delete old route paths, then insert fresh polyline coordinates
      await supabase.from('route_paths').delete().eq('route_id', ROUTES.GATE_1.id)
      await supabase.from('route_paths').delete().eq('route_id', ROUTES.GATE_2.id)

      await supabase.from('route_paths').insert([
        { id: 'p1000001-0000-0000-0000-000000000001', route_id: ROUTES.GATE_1.id, coordinates: ROUTE_PATHS.GATE_1 },
        { id: 'p2000001-0000-0000-0000-000000000001', route_id: ROUTES.GATE_2.id, coordinates: ROUTE_PATHS.GATE_2 }
      ])

      // 4. Seed Caddies
      await supabase.from('caddies').upsert([
        { id: 'caddy-1', name: 'Caddy 1', route_id: ROUTES.GATE_1.id, status: 'OFF_DUTY', speed: 0, heading: 0, last_ping: new Date().toISOString() },
        { id: 'caddy-2', name: 'Caddy 2', route_id: ROUTES.GATE_2.id, status: 'OFF_DUTY', speed: 0, heading: 0, last_ping: new Date().toISOString() }
      ])

      alert('Successfully re-seeded database with corrected SNU Campus coordinates for Gate 1 & Gate 2 routes, all stations, and caddies!')
      await fetchData()
    } catch (err: any) {
      alert(`Database seeding notice: ${err.message || err}`)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Real-time Fleet Polling
  useEffect(() => {
    const timer = setInterval(() => {
      fetchData()
    }, FLEET_POLLING_INTERVAL_MS || 4000)
    return () => clearInterval(timer)
  }, [selectedRouteId])

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-caddies-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caddies' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Idling calculations using Turf.js
  useEffect(() => {
    if (caddies.length === 0 || stations.length === 0) return

    const warningIds: string[] = []

    caddies.forEach(caddy => {
      if (caddy.status === 'ON_DUTY' && caddy.speed === 0 && caddy.current_lat && caddy.current_lng) {
        const caddyPoint = turf.point([caddy.current_lng, caddy.current_lat])
        let minDistanceMeters = Infinity
        
        stations.forEach(station => {
          const stationPoint = turf.point([station.lng, station.lat])
          const distanceKm = turf.distance(caddyPoint, stationPoint)
          const distanceMeters = distanceKm * 1000
          if (distanceMeters < minDistanceMeters) {
            minDistanceMeters = distanceMeters
          }
        })

        if (minDistanceMeters > 25) {
          warningIds.push(caddy.id)
        }
      }
    })

    setIdleCaddyWarningIds(warningIds)
  }, [caddies, stations])

  const handleMapClick = (lat: number, lng: number) => {
    if (isAddStationMode) {
      if (!selectedRouteId) {
        alert('Please select a route from the sidebar first.')
        setIsAddStationMode(false)
        return
      }
      setPendingStationCoords({ lat, lng })
      setNewStationOrder(stations.filter(s => s.route_id === selectedRouteId).length + 1)
      setShowAddStationModal(true)
    } else if (isDrawPathMode) {
      setDrawnCoordinates(prev => [...prev, [lat, lng]])
    }
  }

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRouteName) return

    const routeId = `route-${newRouteName.toLowerCase().replace(/\s+/g, '-')}`
    const newRoute = {
      id: routeId,
      name: newRouteName,
      color: newRouteColor,
      is_active: true
    }

    const { error } = await supabase.from('routes').insert([newRoute])
    if (!error) {
      setRoutes([...routes, newRoute])
      setSelectedRouteId(routeId)
      setNewRouteName('')
      setShowAddRouteModal(false)
      fetchData()
    } else {
      alert(`Database Error: ${error.message}`)
    }
  }

  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingStationCoords || !newStationName || !selectedRouteId) return

    const newStation = {
      route_id: selectedRouteId,
      name: newStationName,
      lat: pendingStationCoords.lat,
      lng: pendingStationCoords.lng,
      stop_order: newStationOrder,
      waiting_count: 0
    }

    const { error } = await supabase.from('campus_stations').insert([newStation])
    if (!error) {
      setNewStationName('')
      setPendingStationCoords(null)
      setShowAddStationModal(false)
      setIsAddStationMode(false)
      fetchData()
    } else {
      alert(`Database Error: ${error.message}`)
    }
  }

  const handleStationDragEnd = async (stationId: string, lat: number, lng: number) => {
    const { error } = await supabase
      .from('campus_stations')
      .update({ lat, lng })
      .eq('id', stationId)

    if (!error) {
      setStations(stations.map(s => s.id === stationId ? { ...s, lat, lng } : s))
    } else {
      alert(`Failed to save dragged position: ${error.message}`)
    }
  }

  const handleDeleteStation = async (stationId: string) => {
    if (!confirm('Are you sure you want to delete this station stop?')) return
    const { error } = await supabase.from('campus_stations').delete().eq('id', stationId)
    if (!error) {
      setStations(stations.filter(s => s.id !== stationId))
      fetchData()
    } else {
      alert(`Database Error: ${error.message}`)
    }
  }

  const handleSaveDrawnPath = async () => {
    if (!selectedRouteId) return
    if (drawnCoordinates.length < 2) {
      alert('Please plot at least 2 coordinate points along the campus roads first.')
      return
    }

    const { error } = await supabase
      .from('route_paths')
      .upsert({
        route_id: selectedRouteId,
        coordinates: drawnCoordinates
      }, { onConflict: 'route_id' })

    if (!error) {
      setActiveRoutePath(drawnCoordinates)
      setDrawnCoordinates([])
      setIsDrawPathMode(false)
      alert('Route road coordinates successfully saved to Supabase!')
      fetchData()
    } else {
      alert(`Database Error: ${error.message}`)
    }
  }

  const handleOnboardDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!driverName || !driverPhone || !driverPin || !assignedCaddyId) return

    let cleanPhone = driverPhone.trim().replace(/\s+/g, '')
    if (cleanPhone.startsWith('+91')) {
      cleanPhone = cleanPhone.slice(3)
    } else if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.slice(2)
    }

    const indianPhoneRegex = /^[6-9]\d{9}$/
    if (!indianPhoneRegex.test(cleanPhone)) {
      alert("Invalid Indian mobile number! Please enter a 10-digit number starting with 6-9.")
      return
    }
    const formattedPhone = `+91${cleanPhone}`
    if (!/^\d{4}$/.test(driverPin)) {
      alert('Driver PIN must contain exactly four digits.')
      return
    }

    // Reuse an existing account for this phone number. This makes onboarding
    // idempotent instead of creating a duplicate driver on each submission.
    const { data: existingDriver, error: lookupError } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', formattedPhone)
      .maybeSingle()

    if (lookupError) {
      alert(`Could not check the driver record: ${lookupError.message}`)
      return
    }

    const driverId = existingDriver?.id || crypto.randomUUID()

    const newProfile = {
      id: driverId,
      full_name: driverName,
      phone: formattedPhone,
      pin: driverPin,
      role: 'driver' as const,
    }

    const targetCaddyIds = assignedCaddyId === 'ALL' ? caddies.map(caddy => caddy.id) : [assignedCaddyId]
    const { error: profileError } = await supabase.from('profiles').upsert(newProfile)
    if (profileError) {
      alert(`Driver was not saved: ${profileError.message}`)
      return
    }

    const assignment = {
      current_driver_id: driverId,
      status: 'OFF_DUTY' as const,
      last_ping: new Date().toISOString(),
      ...(assignedCaddyId !== 'ALL' ? { route_id: assignedRouteId || caddies.find(c => c.id === assignedCaddyId)?.route_id || null } : {})
    }
    const { error: assignmentError } = await supabase
      .from('caddies')
      .update(assignment)
      .in('id', targetCaddyIds)

    if (assignmentError) {
      alert(`Driver was saved, but assignment failed: ${assignmentError.message}`)
      return
    }

    setDriverName('')
    setDriverPhone('')
    setDriverPin('')
    setAssignedCaddyId('')
    setAssignedRouteId('')
    await fetchData()
    alert(`Driver ${driverName} has been saved and assigned successfully.`)
  }

  const handleForceEndShift = async (caddyId: string) => {
    if (!confirm(`Emergency Override: Force end shift for caddy ${caddyId}?`)) return

    const { error } = await supabase
      .from('caddies')
      .update({
        status: 'OFF_DUTY',
        speed: 0,
        heading: 0,
        last_ping: new Date().toISOString()
      })
      .eq('id', caddyId)

    if (!error) {
      alert(`Shift successfully ended for ${caddyId}.`)
      fetchData()
    } else {
      alert(`Action failed: ${error.message}`)
    }
  }

  const handleSaveCaddy = async () => {
    if (!newCaddyName) return
    const caddyPayload = {
      id: editingCaddyId || 'caddy-' + Date.now(),
      name: newCaddyName,
      route_id: newCaddyRoute || null,
      status: newCaddyStatus,
      last_ping: new Date().toISOString()
    }

    if (editingCaddyId) {
      const { error } = await supabase
        .from('caddies')
        .update({ name: newCaddyName, route_id: newCaddyRoute || null, status: newCaddyStatus })
        .eq('id', editingCaddyId)

      if (error) {
        console.warn('Supabase update warning, falling back to local state:', error)
      }
      setCaddies(prev => prev.map(c => c.id === editingCaddyId ? { ...c, ...caddyPayload } as any : c))
      setEditingCaddyId(null)
      setShowAddCaddyModal(false)
    } else {
      const { error } = await supabase.from('caddies').insert(caddyPayload)
      if (error) {
        console.warn('Supabase insert warning, falling back to local state:', error)
      }
      setCaddies(prev => [...prev, { ...caddyPayload, current_driver_id: null, current_lat: null, current_lng: null, speed: 0, heading: 0 } as any])
      setShowAddCaddyModal(false)
    }
  }

  const handleDeleteCaddy = async (caddyId: string) => {
    if (!confirm('Are you sure you want to delete this caddy?')) return
    const { error } = await supabase.from('caddies').delete().eq('id', caddyId)
    if (!error) fetchData()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-slate-900/60 backdrop-blur border-b border-slate-800 py-5 px-6 sm:px-12 flex flex-col md:flex-row justify-between items-center gap-4 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 p-2.5 rounded-xl shadow-lg shadow-teal-500/10">
            <ShieldAlert className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
              Shuttle Control Center
            </h1>
            <p className="text-xs text-slate-500">Shiv Nadar University Administration Suite</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-850">
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'studio' 
                ? 'bg-slate-850 text-emerald-400 shadow-md border border-slate-800' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Route className="w-4 h-4" />
            Station & Route Studio
          </button>
          <button
            onClick={() => setActiveTab('fleet')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'fleet' 
                ? 'bg-slate-850 text-emerald-400 shadow-md border border-slate-800' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            Fleet & Drivers
            {idleCaddyWarningIds.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('ads')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === 'ads' 
                ? 'bg-slate-850 text-emerald-400 shadow-md border border-slate-800' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Sponsor CMS
          </button>
        </div>

        {/* Refresh & Theme Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const next = mapTheme === 'dark' ? 'light' : 'dark'
              setMapThemeState(next)
              setMapThemeLS(next)
            }}
            className="p-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
          >
            {mapTheme === 'dark' ? <Sun className="w-4 h-4 text-slate-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
          </button>
          
          <button
            onClick={seedDatabasePresets}
            disabled={refreshing}
            className="px-3 py-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold"
            title="Seed database with SNU Gate 1 & Gate 2 routes and 16 stations"
          >
            <Plus className="w-4 h-4" />
            <span>Seed Database</span>
          </button>

          <button
            onClick={() => fetchData()}
            disabled={refreshing}
            className="p-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all active:scale-95 disabled:opacity-55"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${refreshing ? 'animate-spin text-teal-400' : ''}`} />
          </button>

          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('snu-admin-auth')
              }
              onLogout?.()
            }}
            className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Panel */}
      <main className="flex-1 p-6 sm:p-12 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col justify-center items-center gap-3 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            <span>Fetching real-time records...</span>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            
            {/* LEFT / CONTENT COLUMN */}
            <div className="lg:col-span-8 flex flex-col">
              {activeTab === 'studio' && (
                <div className="flex-1 flex flex-col gap-6">
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-white">Campus Route Designer</h2>
                      <p className="text-xs text-slate-400">Map stops and draw routes directly on SNU campus roads</p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={() => {
                          setIsAddStationMode(!isAddStationMode)
                          setIsDrawPathMode(false)
                        }}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          isAddStationMode 
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' 
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        {isAddStationMode ? 'Adding Station (Click Map)...' : 'Add Station Mode'}
                      </button>

                      {!isDrawPathMode ? (
                        <button
                          onClick={() => {
                            setIsDrawPathMode(true)
                            setIsAddStationMode(false)
                            setDrawnCoordinates([])
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-850 transition-all"
                        >
                          <Route className="w-4 h-4" />
                          Draw Route Path
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-slate-950 border border-rose-500/30 p-1 rounded-xl">
                          <button
                            onClick={handleSaveDrawnPath}
                            className="bg-rose-500 hover:bg-rose-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          >
                            Save Path
                          </button>
                          <button
                            onClick={() => {
                              setDrawnCoordinates([])
                              setIsDrawPathMode(false)
                            }}
                            className="text-slate-400 hover:text-slate-200 px-3 py-1.5 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Leaflet Map Area */}
                  <div className="flex-1 min-h-[480px] rounded-2xl overflow-hidden border border-slate-850 shadow-2xl relative">
                    <AdminMap
                      mapTheme={mapTheme}
                      caddies={caddies}
                      stations={stations}
                      routes={routes}
                      selectedRouteId={selectedRouteId}
                      activeRoutePath={isDrawPathMode ? drawnCoordinates : activeRoutePath}
                      isStudioMode={isStudioMode}
                      onStationDragEnd={handleStationDragEnd}
                      onMapClickAddPoint={handleMapClick}
                      selectedStationId={selectedStationId}
                      onSelectStation={(s) => setSelectedStationId(s.id)}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'fleet' && (
                <div className="space-y-6 flex flex-col h-full">
                  <div className="h-[280px] rounded-2xl overflow-hidden border border-slate-850 shadow-xl relative">
                    <AdminMap
                      mapTheme={mapTheme}
                      caddies={caddies}
                      stations={stations}
                      routes={routes}
                      selectedRouteId={null}
                      activeRoutePath={[]}
                      isStudioMode={false}
                    />
                  </div>

                  <div className="bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden shadow-xl flex-1 flex flex-col">
                    <div className="px-6 py-4.5 border-b border-slate-850 flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-base text-white">Live Fleet Status</h3>
                        <p className="text-xs text-slate-500">Real-time GPS coordinate telemetry</p>
                      </div>
                      <span className="text-xs bg-slate-950 border border-slate-800 px-3 py-1 rounded-full text-slate-400 font-medium">
                        Active Units: {caddies.filter(c => c.status === 'ON_DUTY').length} / {caddies.length}
                      </span>
                    </div>

                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-950/65 text-slate-500 uppercase tracking-wider font-extrabold border-b border-slate-850">
                            <th className="py-4 px-6">Shuttle</th>
                            <th className="py-4 px-6">Status</th>
                            <th className="py-4 px-6">Assigned Route</th>
                            <th className="py-4 px-6">Speed</th>
                            <th className="py-4 px-6">Last GPS Update</th>
                            <th className="py-4 px-6 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/60">
                          {caddies.map((caddy) => {
                            const isWarning = idleCaddyWarningIds.includes(caddy.id)
                            const assignedRoute = routes.find(r => r.id === caddy.route_id)
                            return (
                              <tr key={caddy.id} className="hover:bg-slate-850/30 transition-colors group">
                                <td className="py-4.5 px-6 font-semibold text-slate-200">
                                  <div className="flex flex-col">
                                    <span className="text-white text-sm">{caddy.name}</span>
                                    <span className="text-[10px] text-slate-500 font-mono mt-0.5">{caddy.id}</span>
                                  </div>
                                </td>
                                <td className="py-4.5 px-6">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                                    caddy.status === 'ON_DUTY' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                    caddy.status === 'ON_BREAK' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                    caddy.status === 'IN_MAINTENANCE' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                                    'bg-slate-850 border-slate-800 text-slate-400'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      caddy.status === 'ON_DUTY' ? 'bg-emerald-400 animate-pulse' :
                                      caddy.status === 'ON_BREAK' ? 'bg-amber-400' :
                                      caddy.status === 'IN_MAINTENANCE' ? 'bg-orange-400' : 'bg-slate-500'
                                    }`}></span>
                                    {caddy.status}
                                  </span>
                                </td>
                                <td className="py-4.5 px-6">
                                  {assignedRoute ? (
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full border border-slate-850" style={{ backgroundColor: assignedRoute.color }}></span>
                                      <span className="text-slate-300 font-medium">{assignedRoute.name}</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-500 italic">Unassigned</span>
                                  )}
                                </td>
                                <td className="py-4.5 px-6 font-mono text-slate-300">
                                  {isWarning ? (
                                    <div className="flex items-center gap-1.5 text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/15 animate-pulse">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      Idling Warning (0 km/h)
                                    </div>
                                  ) : (
                                    <span>{caddy.speed} km/h</span>
                                  )}
                                </td>
                                <td className="py-4.5 px-6 text-slate-400 font-mono">
                                  {formatIST(caddy.last_ping)}
                                </td>
                                <td className="py-4.5 px-6 text-right">
                                  {caddy.status !== 'OFF_DUTY' ? (
                                    <button
                                      onClick={() => handleForceEndShift(caddy.id)}
                                      className="py-1.5 px-3 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white rounded-lg transition-all border border-rose-500/15 text-[11px] font-semibold"
                                    >
                                      Force End Shift
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-600 italic">Inactive</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ads' && (
                <div className="bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden shadow-xl flex flex-col h-full">
                  <div className="px-6 py-5 border-b border-slate-850">
                    <h3 className="font-bold text-base text-white">Sponsorship & Ad Campaigns</h3>
                    <p className="text-xs text-slate-400">Track and manage student-facing in-app marketing banners</p>
                  </div>

                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/65 text-slate-500 uppercase tracking-wider font-extrabold border-b border-slate-850">
                          <th className="py-4 px-6">Campaign Info</th>
                          <th className="py-4 px-6">Sponsor</th>
                          <th className="py-4 px-6">Impressions</th>
                          <th className="py-4 px-6">Clicks</th>
                          <th className="py-4 px-6">CTR</th>
                          <th className="py-4 px-6">Status</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/60">
                        {adBanners.map((ad) => {
                          const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0
                          return (
                            <tr key={ad.id} className="hover:bg-slate-850/30 transition-colors">
                              <td className="py-4.5 px-6">
                                <div className="flex items-center gap-3">
                                  <img src={ad.image_url} alt={ad.title} className="w-12 h-8 rounded object-cover border border-slate-800 bg-slate-950" />
                                  <div className="flex flex-col">
                                    <span className="font-bold text-white text-sm">{ad.title}</span>
                                    <a href={ad.target_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-teal-400 hover:underline mt-0.5 truncate max-w-[150px]">
                                      {ad.target_url}
                                    </a>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4.5 px-6 font-medium text-slate-300">{ad.sponsor_name}</td>
                              <td className="py-4.5 px-6 font-mono text-slate-300">{ad.impressions.toLocaleString('en-IN')}</td>
                              <td className="py-4.5 px-6 font-mono text-slate-300">{ad.clicks.toLocaleString('en-IN')}</td>
                              <td className="py-4.5 px-6">
                                <span className={`font-mono font-bold ${ctr > 5 ? 'text-teal-400' : 'text-slate-400'}`}>
                                  {ctr.toFixed(2)}%
                                </span>
                              </td>
                              <td className="py-4.5 px-6">
                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${ad.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                                  {ad.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="py-4.5 px-6 text-right">
                                <button
                                  onClick={async () => {
                                    if (confirm('Delete this banner?')) {
                                      await supabase.from('ad_banners').delete().eq('id', ad.id)
                                      fetchData()
                                    }
                                  }}
                                  className="p-1.5 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 text-rose-400 hover:text-white rounded-lg transition-all"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* RIGHT / SIDEBAR COLUMN */}
            <div className="lg:col-span-4 space-y-6">
              {activeTab === 'studio' && (
                <div className="space-y-6">
                  {/* Route Selector */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5.5 space-y-4.5">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider">Campus Routes</h3>
                      <button
                        onClick={() => setShowAddRouteModal(true)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-slate-950 border border-teal-500/15 rounded-lg text-xs font-semibold transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Route
                      </button>
                    </div>

                    <div className="space-y-2">
                      {routes.map((route) => (
                        <div
                          key={route.id}
                          onClick={() => setSelectedRouteId(route.id)}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedRouteId === route.id
                              ? 'bg-slate-850/80 border-teal-500/40 text-white shadow-lg'
                              : 'bg-slate-950/60 border-slate-850 text-slate-400 hover:bg-slate-850/45 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-3.5 h-3.5 rounded-full border border-slate-900" style={{ backgroundColor: route.color }}></span>
                            <span className="font-semibold text-xs tracking-wide">{route.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">{route.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Route Stations List */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5.5 space-y-4">
                    <div className="border-b border-slate-850 pb-3 flex justify-between items-center">
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider">Designated Stops</h3>
                      <span className="text-xs text-slate-500 bg-slate-950 px-2 py-0.5 rounded font-mono">
                        {selectedRouteId ? stations.filter(s => s.route_id === selectedRouteId).length : 0} stops
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {selectedRouteId ? (
                        stations
                          .filter(s => s.route_id === selectedRouteId)
                          .sort((a, b) => a.stop_order - b.stop_order)
                          .map((station) => (
                            <div key={station.id} className="bg-slate-950 border border-slate-850 rounded-xl p-3 flex justify-between items-center text-xs hover:border-slate-800 transition-all group">
                              <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-slate-400">
                                  {station.stop_order}
                                </span>
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-200">{station.name}</span>
                                  <span className="text-[9px] text-slate-500 font-mono mt-0.5">{station.lat.toFixed(4)}, {station.lng.toFixed(4)}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteStation(station.id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 text-rose-400 hover:text-white rounded-lg transition-all"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                      ) : (
                        <p className="text-xs text-slate-500 text-center py-4">Select a route to display stops</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'fleet' && (
                <div className="space-y-6">
                  {/* Fleet Caddy Manager */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5.5 space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                        <Truck className="w-4 h-4 text-emerald-400" />
                        Manage Fleet Vehicles
                      </h3>
                      <button onClick={() => {
                        setEditingCaddyId(null)
                        setNewCaddyName('')
                        setNewCaddyRoute('')
                        setNewCaddyStatus('OFF_DUTY')
                        setShowAddCaddyModal(true)
                      }} className="flex items-center gap-1 px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-slate-950 border border-teal-500/15 rounded-lg text-xs font-semibold transition-all">
                        <Plus className="w-3.5 h-3.5" /> Add Caddy
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                      {caddies.map((caddy) => (
                        <div key={caddy.id} className="bg-slate-950 border border-slate-850 rounded-xl p-3 flex justify-between items-center group text-xs gap-2">
                          <div>
                            <span className="font-semibold text-slate-200">{caddy.name}</span>
                            {caddy.status === 'IN_MAINTENANCE' && <Wrench className="w-3 h-3 inline ml-1 text-orange-400" />}
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{routes.find(r => r.id === caddy.route_id)?.name || 'Unassigned Route'}</div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <select
                              value={caddy.current_driver_id || ''}
                              onChange={async (e) => {
                                const newDriverId = e.target.value || null
                                const { error } = await supabase.from('caddies').update({ current_driver_id: newDriverId }).eq('id', caddy.id)
                                if (error) {
                                  alert(`Assignment was not saved: ${error.message}`)
                                } else {
                                  setCaddies(prev => prev.map(c => c.id === caddy.id ? { ...c, current_driver_id: newDriverId } as any : c))
                                }
                              }}
                              className="bg-slate-900 border border-slate-800 rounded-lg text-[10px] p-1.5 text-slate-300 focus:outline-none focus:border-teal-500"
                            >
                              <option value="">No Driver Assigned</option>
                              {drivers.map(d => (
                                <option key={d.id} value={d.id}>{d.full_name} ({d.phone.slice(-4)})</option>
                              ))}
                            </select>

                            <button onClick={() => {
                              setEditingCaddyId(caddy.id)
                              setNewCaddyName(caddy.name)
                              setNewCaddyRoute(caddy.route_id || '')
                              setNewCaddyStatus(caddy.status === 'IN_MAINTENANCE' ? 'IN_MAINTENANCE' : 'OFF_DUTY')
                              setShowAddCaddyModal(true)
                            }} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-all">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteCaddy(caddy.id)} className="p-1.5 bg-rose-500/10 hover:bg-rose-600 rounded-lg text-rose-400 hover:text-white transition-all">
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Driver Onboarding */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5.5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
                      <UserPlus className="w-4 h-4 text-emerald-400" />
                      <h3 className="font-bold text-sm text-white uppercase tracking-wider">Onboard Driver</h3>
                    </div>

                    <form onSubmit={handleOnboardDriver} className="space-y-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-medium">Full Name</label>
                        <input
                          type="text"
                          required
                          value={driverName}
                          onChange={(e) => setDriverName(e.target.value)}
                          placeholder="Driver full name"
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-medium">Phone Number</label>
                        <input
                          type="tel"
                          required
                          value={driverPhone}
                          onChange={(e) => setDriverPhone(e.target.value)}
                          placeholder="10-digit mobile (e.g. 9876543210)"
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-medium">Driver Login PIN (4 Digits)</label>
                        <input
                          type="text"
                          pattern="\d{4}"
                          maxLength={4}
                          required
                          value={driverPin}
                          onChange={(e) => setDriverPin(e.target.value)}
                          placeholder="1234"
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-medium">Assign Caddy</label>
                        <select
                          required
                          value={assignedCaddyId}
                          onChange={(e) => setAssignedCaddyId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
                        >
                          <option value="">Select Caddy</option>
                          <option value="ALL">All caddies (driver chooses vehicle at login)</option>
                          {caddies.map(caddy => (
                            <option key={caddy.id} value={caddy.id}>{caddy.name} ({caddy.id})</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="submit"
                        className="w-full mt-2 py-3 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold rounded-xl shadow-lg transition-all"
                      >
                        Onboard & Deploy Driver
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* --- ADD CADDY MODAL --- */}
      {showAddCaddyModal && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">{editingCaddyId ? 'Edit Caddy' : 'Create Caddy'}</h3>
              <button onClick={() => setShowAddCaddyModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">✕</button>
            </div>
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400 font-medium">Caddy Name</label>
                <input type="text" value={newCaddyName} onChange={e => setNewCaddyName(e.target.value)} className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100" />
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-400 font-medium">Assigned Route</label>
                <select value={newCaddyRoute} onChange={e => setNewCaddyRoute(e.target.value)} className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100">
                  <option value="">No Route</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-slate-400 font-medium">Status</label>
                <select value={newCaddyStatus} onChange={e => setNewCaddyStatus(e.target.value as any)} className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100">
                  <option value="OFF_DUTY">OFF_DUTY</option>
                  <option value="IN_MAINTENANCE">IN_MAINTENANCE</option>
                </select>
              </div>
              <button onClick={handleSaveCaddy} className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold rounded-xl transition-all">Save Caddy</button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD ROUTE MODAL --- */}
      {showAddRouteModal && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Create Campus Route</h3>
              <button onClick={() => setShowAddRouteModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">✕</button>
            </div>
            <form onSubmit={handleAddRoute} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400 font-medium">Route Name</label>
                <input
                  type="text"
                  required
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  placeholder="e.g. Research Arc Loop"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 font-medium">Map Display Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newRouteColor}
                    onChange={(e) => setNewRouteColor(e.target.value)}
                    className="w-12 h-10 border-0 bg-transparent cursor-pointer rounded-lg overflow-hidden"
                  />
                  <span className="font-mono text-slate-300 uppercase">{newRouteColor}</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold rounded-xl transition-all"
              >
                Create Route
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD STATION MODAL --- */}
      {showAddStationModal && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Configure Campus Stop</h3>
              <button 
                onClick={() => {
                  setShowAddStationModal(false)
                  setPendingStationCoords(null)
                }} 
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveStation} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400 font-medium">Station Name</label>
                <input
                  type="text"
                  required
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="e.g. Block D Engineering"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-medium">Stop Order</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newStationOrder}
                    onChange={(e) => setNewStationOrder(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-100 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-medium">Duty Loop</label>
                  <div className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-slate-300 font-medium select-none truncate">
                    {routes.find(r => r.id === selectedRouteId)?.name || 'None'}
                  </div>
                </div>
              </div>

              {pendingStationCoords && (
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-1">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Captured Coordinates</span>
                  <span className="font-mono text-slate-400 text-xs">
                    {pendingStationCoords.lat.toFixed(5)}, {pendingStationCoords.lng.toFixed(5)}
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold rounded-xl transition-all"
              >
                Onboard Station
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
