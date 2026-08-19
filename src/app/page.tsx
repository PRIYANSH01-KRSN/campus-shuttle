'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/utils/supabase/client'
import { RefreshCw } from 'lucide-react'
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const handleRedirect = async () => {
      // 1. If running inside native Capacitor environment (driver app APK)
      if (Capacitor.isNativePlatform()) {
        router.replace('/driver')
        return
      }

      // 2. On the web environment
      try {
        // Instantiate supabase client inside useEffect to avoid build-time static prerendering errors
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

          if (profile) {
            if (profile.role === 'driver') {
              router.replace('/driver')
              return
            } else if (profile.role === 'admin') {
              router.replace('/admin')
              return
            }
          }
        }
      } catch (err) {
        console.error('Redirect verification failed:', err)
      }

      // Fallback: If no session, or if role is student/unknown, redirect to student dashboard
      router.replace('/student')
    }

    handleRedirect()
  }, [router])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans gap-3">
      <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
      <span className="text-xs text-slate-500 font-medium tracking-wide">Loading SNU Caddy Hub...</span>
    </div>
  )
}
