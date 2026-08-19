'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { 
  Lock, Phone, Delete, RefreshCw, Key, ShieldAlert, 
  UserCheck, AlertTriangle, Play, Square, Wifi, WifiOff, Volume2
} from 'lucide-react'
import DriverShift from './DriverShift'

interface Profile {
  id: string
  full_name: string
  phone: string
  role: 'admin' | 'driver' | 'student'
  pin?: string
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

// Open IndexedDB Buffer database
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject('Not in browser')
    const request = indexedDB.open('CaddyTelemetryBuffer', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('pings')) {
        db.createObjectStore('pings', { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export default function DriverPortal() {
  const supabase = createClient()
  
  // Auth state
  const [driverProfile, setDriverProfile] = useState<Profile | null>(null)
  const [assignedCaddy, setAssignedCaddy] = useState<Caddy | null>(null)
  const [availableCaddies, setAvailableCaddies] = useState<Caddy[]>([])
  const [phoneNumber, setPhoneNumber] = useState('')
  const [pin, setPin] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'phone' | 'pin'>('phone')

  // Real-time duty data
  const [stations, setStations] = useState<Station[]>([])
  const [offlineBufferCount, setOfflineBufferCount] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  
  // Cache reference to compare waiting counts
  const prevWaitingCounts = useRef<Record<string, number>>({})

  // Update online status from browser events
  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    
    // Check initial buffer count
    checkBufferCount()

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  // Synthesize double beep sound chime for pickup alarms
  const playPickupChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return
      const ctx = new AudioContextClass()
      
      // Tone 1: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.value = 523.25
      gain1.gain.setValueAtTime(0.15, ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start()
      osc1.stop(ctx.currentTime + 0.15)
      
      // Tone 2: E5 (659.25 Hz) after 100ms
      setTimeout(() => {
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.value = 659.25
        gain2.gain.setValueAtTime(0.15, ctx.currentTime)
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.20)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start()
        osc2.stop(ctx.currentTime + 0.20)
      }, 100)
    } catch (err) {
      console.log('Audio chime blocked by browser autoplay rules:', err)
    }
  }

  // Count buffered offline telemetry pings
  const checkBufferCount = async () => {
    try {
      const db = await openDB()
      const tx = db.transaction('pings', 'readonly')
      const store = tx.objectStore('pings')
      const countReq = store.count()
      countReq.onsuccess = () => {
        setOfflineBufferCount(countReq.result)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Poll stations database to match waiting counts and trigger pickup chimes
  const fetchRouteStations = async (routeId: string) => {
    const { data, error } = await supabase
      .from('campus_stations')
      .select('*')
      .eq('route_id', routeId)
      .order('stop_order', { ascending: true })

    if (!error && data) {
      setStations(data)
      
      // Check if waiting counts increased on any station
      let playSound = false
      data.forEach((station: Station) => {
        const prevCount = prevWaitingCounts.current[station.id] ?? 0
        if (station.waiting_count > prevCount) {
          playSound = true
        }
        // Save current count
        prevWaitingCounts.current[station.id] = station.waiting_count
      })

      if (playSound) {
        playPickupChime()
      }
    }
  }

  // Poller trigger while logged in
  useEffect(() => {
    if (!driverProfile || !assignedCaddy?.route_id) return
    
    fetchRouteStations(assignedCaddy.route_id)
    
    const interval = setInterval(() => {
      fetchRouteStations(assignedCaddy.route_id!)
      checkBufferCount()
    }, 4000)

    return () => clearInterval(interval)
  }, [driverProfile, assignedCaddy])

  // Sync IndexedDB offline pings back to Supabase when reconnected
  useEffect(() => {
    if (isOnline && offlineBufferCount > 0 && driverProfile && assignedCaddy) {
      syncOfflinePings()
    }
  }, [isOnline, offlineBufferCount, driverProfile, assignedCaddy])

  const syncOfflinePings = async () => {
    try {
      const db = await openDB()
      const tx = db.transaction('pings', 'readonly')
      const store = tx.objectStore('pings')
      
      const getAllReq = store.getAll()
      getAllReq.onsuccess = async () => {
        const bufferedPings = getAllReq.result
        if (bufferedPings.length === 0) return

        console.log(`Syncing ${bufferedPings.length} offline telemetry updates...`)
        
        // Push the latest ping from the buffer to update current caddy tracking state
        const latestPing = bufferedPings[bufferedPings.length - 1]
        
        const { error } = await supabase
          .from('caddies')
          .update({
            current_lat: latestPing.lat,
            current_lng: latestPing.lng,
            speed: latestPing.speed,
            heading: latestPing.heading,
            status: latestPing.status,
            last_ping: latestPing.last_ping
          })
          .eq('id', assignedCaddy!.id)

        if (!error) {
          // Clear IndexedDB buffer on successful sync
          const clearTx = db.transaction('pings', 'readwrite')
          clearTx.objectStore('pings').clear()
          setOfflineBufferCount(0)
          console.log('Telemetry buffer synced successfully.')
        }
      }
    } catch (e) {
      console.error('Failed to sync IndexedDB buffer:', e)
    }
  }

  // Numeric keypad inputs
  const handleKeyPress = (num: string) => {
    setAuthError(null)
    if (activeTab === 'phone') {
      if (phoneNumber.length < 10) {
        setPhoneNumber(prev => prev + num)
      }
    } else {
      if (pin.length < 4) {
        setPin(prev => prev + num)
      }
    }
  }

  const handleDelete = () => {
    if (activeTab === 'phone') {
      setPhoneNumber(prev => prev.slice(0, -1))
    } else {
      setPin(prev => prev.slice(0, -1))
    }
  }

  // Keypad Auth Action
  const handleLoginSubmit = async () => {
    const indianPhoneRegex = /^[6-9]\d{9}$/
    if (!indianPhoneRegex.test(phoneNumber)) {
      setAuthError('Phone number must be a valid 10-digit mobile number starting with 6-9 (e.g. 9876543210).')
      return
    }
    if (pin.length !== 4) {
      setAuthError('Please enter your 4-digit security PIN.')
      return
    }

    setLoading(true)
    setAuthError(null)

    try {
      const dbPhone = `+91${phoneNumber}`
      // 1. Check profile matching phone and pin
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('phone', dbPhone)
        .eq('pin', pin)
        .eq('role', 'driver')
        .maybeSingle()

      if (error) {
        setAuthError(`Authentication error: ${error.message}`)
        setLoading(false)
        return
      }

      if (!profile) {
        setAuthError('Invalid Phone Number or PIN. Access Denied.')
        setLoading(false)
        return
      }

      // 2. A driver may only operate caddies assigned by an administrator.
      const { data: caddiesData } = await supabase
        .from('caddies')
        .select('*')

      const assignedList = caddiesData ? caddiesData.filter((c: any) => c.current_driver_id === profile.id) : []
      if (assignedList.length === 0) {
        setAuthError('Your account has no caddy assignment. Please contact the transport administrator.')
        return
      }
      const caddiesToOffer = assignedList

      setDriverProfile(profile)
      setAvailableCaddies(caddiesToOffer)
      // With more than one assignment, require the driver to deliberately
      // choose today's vehicle rather than silently taking the first one.
      setAssignedCaddy(caddiesToOffer.length === 1 ? caddiesToOffer[0] : null)
    } catch (err: any) {
      setAuthError(`Connection error: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  // Logout Driver Action
  const handleLogout = async () => {
    // End a running shift without deleting the administrator's assignment.
    if (assignedCaddy && assignedCaddy.status !== 'OFF_DUTY') {
      await supabase
        .from('caddies')
        .update({ status: 'OFF_DUTY', speed: 0, heading: 0, current_lat: null, current_lng: null })
        .eq('id', assignedCaddy.id)
    }
    setDriverProfile(null)
    setAssignedCaddy(null)
    setPhoneNumber('')
    setPin('')
    setActiveTab('phone')
  }

  // Render post-auth driver shift controls
  if (driverProfile) {
    return (
      <DriverShift
        profile={driverProfile}
        caddy={assignedCaddy}
        availableCaddies={availableCaddies}
        stations={stations}
        isOnline={isOnline}
        offlineBufferCount={offlineBufferCount}
        onLogout={handleLogout}
        onCaddyStatusChange={(updatedCaddy) => setAssignedCaddy(updatedCaddy)}
        onTelemetryLogged={async (ping) => {
          // Buffer telemetry to IndexedDB (called when offline OR when Supabase push fails)
          try {
            const db = await openDB()
            const tx = db.transaction('pings', 'readwrite')
            tx.objectStore('pings').add(ping)
            setOfflineBufferCount(prev => prev + 1)
          } catch (e) {
            console.error('Failed to buffer telemetry ping:', e)
          }
        }}
      />
    )
  }

  // Render Mobile PIN Keypad Gate Lock
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none items-center justify-between p-6">
      
      {/* Header Info */}
      <div className="w-full max-w-sm text-center py-4 space-y-2">
        <div className="inline-flex bg-teal-500/10 border border-teal-500/20 p-3 rounded-2xl text-teal-400">
          <Lock className="w-6 h-6 animate-pulse" />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold tracking-tight text-white">Driver Terminal Login</h1>
          <p className="text-[11px] text-slate-500 font-medium">Mount device on dashboard before entering PIN</p>
        </div>
      </div>

      {/* Inputs visual panel */}
      <div className="w-full max-w-sm space-y-4">
        
        {/* Toggle Inputs Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-slate-900 border border-slate-850 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('phone')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'phone' ? 'bg-slate-800 text-teal-400 font-bold' : 'text-slate-500'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            Phone
          </button>
          <button
            onClick={() => setActiveTab('pin')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'pin' ? 'bg-slate-800 text-teal-400 font-bold' : 'text-slate-500'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            4-Digit PIN
          </button>
        </div>

        {/* Display Fields */}
        <div className="space-y-3">
          {activeTab === 'phone' ? (
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[70px]">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Driver Phone Number</span>
              <span className="text-xl font-mono tracking-widest text-teal-300 font-extrabold">
                {phoneNumber ? `+91 ${phoneNumber}` : 'ENTER NUMBER'}
              </span>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[70px]">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Enter Security PIN</span>
              <div className="flex gap-4.5 mt-1.5">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`w-3.5 h-3.5 rounded-full border border-slate-800 ${
                    pin.length > i ? 'bg-teal-400' : 'bg-slate-950'
                  }`}></div>
                ))}
              </div>
            </div>
          )}
        </div>

        {authError && (
          <div className="bg-rose-950/40 border border-rose-900/40 text-rose-400 p-3 rounded-2xl text-xs font-semibold text-center leading-relaxed">
            {authError}
          </div>
        )}
      </div>

      {/* Keys Layout (Numeric Keypad Grid) */}
      <div className="w-full max-w-xs grid grid-cols-3 gap-3 my-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
          <button
            key={num}
            onClick={() => handleKeyPress(num)}
            className="h-14 bg-slate-900 hover:bg-slate-850 active:bg-slate-800 border border-slate-850 rounded-2xl flex items-center justify-center text-lg font-bold font-mono text-slate-100 transition-all active:scale-90"
          >
            {num}
          </button>
        ))}
        <button
          onClick={handleDelete}
          className="h-14 bg-slate-950 hover:bg-slate-900 border border-slate-900 text-slate-400 hover:text-slate-200 rounded-2xl flex items-center justify-center transition-all"
        >
          <Delete className="w-5 h-5" />
        </button>
        <button
          onClick={() => handleKeyPress('0')}
          className="h-14 bg-slate-900 hover:bg-slate-850 active:bg-slate-800 border border-slate-850 rounded-2xl flex items-center justify-center text-lg font-bold font-mono text-slate-100 transition-all active:scale-90"
        >
          0
        </button>
        <button
          onClick={handleLoginSubmit}
          disabled={loading || phoneNumber.length < 10 || pin.length < 4}
          className="h-14 bg-teal-500 hover:bg-teal-600 text-slate-950 rounded-2xl flex items-center justify-center font-black tracking-wide text-xs transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'CONFIRM'}
        </button>
      </div>

      {/* Simulator Quick Help */}
      <div className="w-full max-w-sm text-center text-[10px] text-slate-600 leading-relaxed border-t border-slate-900 pt-4">
        Go to the <a href="/admin?bypass=true" className="text-teal-500/70 hover:underline">Admin Portal (Fleet Tab)</a> to onboard a driver profile and set their phone and 4-digit PIN before attempting login.
      </div>

    </div>
  )
}
