'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { CheckCircle2, XCircle, Database, Settings, RefreshCw, Route, Truck } from 'lucide-react'

export default function TestDbPage() {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const [key, setKey] = useState<string | undefined>(undefined)
  const [isUrlConfigured, setIsUrlConfigured] = useState(false)
  const [isKeyConfigured, setIsKeyConfigured] = useState(false)

  const [routesData, setRoutesData] = useState<any[] | null>(null)
  const [routesError, setRoutesError] = useState<any>(null)
  const [caddiesData, setCaddiesData] = useState<any[] | null>(null)
  const [caddiesError, setCaddiesError] = useState<any>(null)
  const [fetchAttempted, setFetchAttempted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    setUrl(supabaseUrl)
    setKey(supabaseKey)

    const urlConfig = !!supabaseUrl && supabaseUrl !== 'https://your-project-id.supabase.co'
    const keyConfig = !!supabaseKey && supabaseKey !== 'your-anon-public-key'

    setIsUrlConfigured(urlConfig)
    setIsKeyConfigured(keyConfig)

    const runDiagnostics = async () => {
      if (urlConfig && keyConfig) {
        try {
          const supabase = createClient()
          
          // Fetch routes
          const routesResult = await supabase.from('routes').select('*')
          setRoutesData(routesResult.data)
          setRoutesError(routesResult.error)

          // Fetch caddies
          const caddiesResult = await supabase.from('caddies').select('*')
          setCaddiesData(caddiesResult.data)
          setCaddiesError(caddiesResult.error)
          
          setFetchAttempted(true)
        } catch (e: any) {
          setRoutesError(e.message || e)
          setCaddiesError(e.message || e)
          setFetchAttempted(true)
        }
      }
      setLoading(false)
    }

    runDiagnostics()
  }, [])

  // Helper to mask keys for safe display
  const maskValue = (val: string | undefined, type: 'url' | 'key') => {
    if (!val) return 'Not Found (undefined)'
    if (type === 'url') {
      try {
        const parsed = new URL(val)
        return `${parsed.protocol}//${parsed.hostname.substring(0, 4)}...${parsed.hostname.substring(parsed.hostname.length - 12)}`
      } catch {
        return `${val.substring(0, 8)}...`
      }
    }
    return `${val.substring(0, 10)}...${val.substring(val.length - 8)}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-sm gap-2">
        <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
        <span>Resolving environment profiles...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 sm:p-12 flex flex-col items-center">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-500 bg-clip-text text-transparent">
              Supabase Connection Diagnostic
            </h1>
            <p className="text-slate-400 text-sm">
              Real-time connection test and database fetch verification (Client Mode)
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-880 rounded-full px-4 py-1.5 text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${fetchAttempted && !routesError && !caddiesError ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${fetchAttempted && !routesError && !caddiesError ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            {fetchAttempted && !routesError && !caddiesError ? 'Connected' : 'Configuration Pending'}
          </div>
        </div>

        {/* 1. Environment Variable Diagnostics */}
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg text-teal-400">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold">Environment Settings (.env.local)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supabase URL */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-mono">NEXT_PUBLIC_SUPABASE_URL</span>
                {isUrlConfigured ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-full">
                    <XCircle className="w-3.5 h-3.5" /> Missing
                  </span>
                )}
              </div>
              <p className="text-sm font-mono break-all text-slate-300">
                {isUrlConfigured ? maskValue(url, 'url') : 'Not set in environment'}
              </p>
            </div>

            {/* Supabase Anon Key */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
                {isKeyConfigured ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-full">
                    <XCircle className="w-3.5 h-3.5" /> Missing
                  </span>
                )}
              </div>
              <p className="text-sm font-mono break-all text-slate-300">
                {isKeyConfigured ? maskValue(key, 'key') : 'Not set in environment'}
              </p>
            </div>
          </div>

          {(!isUrlConfigured || !isKeyConfigured) && (
            <div className="border border-dashed border-slate-800 bg-slate-950/50 rounded-xl p-5 text-center text-sm text-slate-400">
              <p>Please duplicate <code className="bg-slate-800 px-1.5 py-0.5 rounded text-teal-400">.env.local.example</code> to <code className="bg-slate-800 px-1.5 py-0.5 rounded text-teal-400">.env.local</code> and fill in your Supabase project keys to activate client connection testing.</p>
            </div>
          )}
        </div>

        {/* 2. Database Fetch Diagnostics */}
        {fetchAttempted && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Routes Table Test */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Route className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Routes Fetch Test</h3>
                    <p className="text-xs text-slate-500 font-mono">public.routes</p>
                  </div>
                </div>
                {routesError ? (
                  <span className="text-xs text-rose-400 font-semibold bg-rose-500/10 px-2 py-1 rounded-lg">Failed</span>
                ) : (
                  <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded-lg">Success</span>
                )}
              </div>

              <div className="flex-1">
                {routesError ? (
                  <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-4 text-xs text-rose-400 font-mono space-y-2">
                    <div className="font-semibold">Error Payload:</div>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(routesError, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Seeded Routes ({routesData?.length || 0})</div>
                    <div className="space-y-2">
                      {routesData && routesData.length > 0 ? (
                        routesData.map((route) => (
                          <div key={route.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2.5">
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-800" style={{ backgroundColor: route.color }}></span>
                              <span className="font-medium text-slate-200">{route.name}</span>
                            </div>
                            <span className="text-xs font-mono text-slate-500">{route.id}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Connected, but the `routes` table is empty. Did you run the SQL seed script?</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Caddies Table Test */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Caddies Fetch Test</h3>
                    <p className="text-xs text-slate-500 font-mono">public.caddies</p>
                  </div>
                </div>
                {caddiesError ? (
                  <span className="text-xs text-rose-400 font-semibold bg-rose-500/10 px-2 py-1 rounded-lg">Failed</span>
                ) : (
                  <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded-lg">Success</span>
                )}
              </div>

              <div className="flex-1">
                {caddiesError ? (
                  <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-4 text-xs text-rose-400 font-mono space-y-2">
                    <div className="font-semibold">Error Payload:</div>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(caddiesError, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Active Caddies ({caddiesData?.length || 0})</div>
                    <div className="space-y-2">
                      {caddiesData && caddiesData.length > 0 ? (
                        caddiesData.map((caddy) => (
                          <div key={caddy.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-slate-200 text-sm">{caddy.name}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                caddy.status === 'ON_DUTY' ? 'bg-emerald-500/10 text-emerald-400' :
                                caddy.status === 'ON_BREAK' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {caddy.status}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-slate-500">
                              <span>Route: <code className="text-slate-400">{caddy.route_id || 'unassigned'}</code></span>
                              <span>Pos: <code className="text-slate-400">{caddy.current_lat?.toFixed(4)}, {caddy.current_lng?.toFixed(4)}</code></span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Connected, but the `caddies` table is empty. Did you run the SQL seed script?</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
