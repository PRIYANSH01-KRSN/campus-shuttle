'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import AdminPortal from '@/components/AdminPortal'
import { ShieldAlert, RefreshCw, Lock } from 'lucide-react'

export default function AdminPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  useEffect(() => {
    const verifyAdminSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setIsAdminAuthenticated(false)
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()
      setIsAdminAuthenticated(profile?.role === 'admin')
      setLoading(false)
    }
    void verifyAdminSession()
  }, [])

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError(null)
    const cleanInput = email.trim().toLowerCase()
    const cleanSecret = password.trim()

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanInput,
        password: cleanSecret,
      })

      if (error || !data.user) {
        setLoginError('Invalid administrator email or password.')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError || profile?.role !== 'admin') {
        await supabase.auth.signOut()
        setLoginError('This account is not authorized to access the admin portal.')
        return
      }

      setIsAdminAuthenticated(true)
    } catch {
      setLoginError('Unable to sign in. Check your connection and try again.')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsAdminAuthenticated(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 text-sm gap-3 font-sans">
        <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
        <span>Verifying admin clearance...</span>
      </div>
    )
  }

  if (isAdminAuthenticated) {
    return <AdminPortal onLogout={handleLogout} />
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100 selection:bg-teal-500 selection:text-slate-950">
      
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full bg-teal-500/5 blur-[120px] animate-pulse"></div>
        <div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-blue-500/5 blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10 bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex bg-teal-500/10 border border-teal-500/20 p-3.5 rounded-2xl text-teal-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-white">Admin Control Center</h2>
            <p className="text-xs text-slate-400">Use your authorized administrator credentials.</p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleAdminLogin} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">Administrator email</label>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors font-mono"
            />
          </div>

          {loginError && (
            <div className="bg-rose-950/40 border border-rose-900/40 text-rose-400 p-3 rounded-xl text-xs font-medium text-center">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full py-3.5 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-teal-500/10 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Sign In to Dashboard
          </button>
        </form>

      </div>
    </div>
  )
}
