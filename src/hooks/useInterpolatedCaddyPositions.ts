'use client'

import { useEffect, useRef, useState } from 'react'

type PositionedCaddy = {
  id: string
  current_lat: number | null
  current_lng: number | null
  heading: number
}

const ANIMATION_DURATION_MS = 2500

const bearingBetween = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const toDegrees = (value: number) => (value * 180) / Math.PI
  const deltaLng = toRadians(toLng - fromLng)
  const y = Math.sin(deltaLng) * Math.cos(toRadians(toLat))
  const x = Math.cos(toRadians(fromLat)) * Math.sin(toRadians(toLat)) - Math.sin(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.cos(deltaLng)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

/** Slides each incoming GPS coordinate across the normal telemetry interval. */
export function useInterpolatedCaddyPositions<T extends PositionedCaddy>(caddies: T[], duration = ANIMATION_DURATION_MS): T[] {
  const displayedRef = useRef(new Map<string, T>())
  const latestRef = useRef(caddies)
  const frameRef = useRef<number | null>(null)
  const [displayed, setDisplayed] = useState<T[]>(caddies)

  useEffect(() => {
    latestRef.current = caddies
    const startedAt = performance.now()
    const starts = new Map(displayedRef.current)

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      // Ease in/out prevents an abrupt start or stop at every packet boundary.
      const eased = progress * progress * (3 - 2 * progress)
      const next = latestRef.current.map((caddy) => {
        const previous = starts.get(caddy.id)
        if (!previous || previous.current_lat === null || previous.current_lng === null || caddy.current_lat === null || caddy.current_lng === null) return caddy

        const lat = previous.current_lat + (caddy.current_lat - previous.current_lat) * eased
        const lng = previous.current_lng + (caddy.current_lng - previous.current_lng) * eased
        const hasMoved = previous.current_lat !== caddy.current_lat || previous.current_lng !== caddy.current_lng
        return {
          ...caddy,
          current_lat: lat,
          current_lng: lng,
          heading: hasMoved ? bearingBetween(previous.current_lat, previous.current_lng, caddy.current_lat, caddy.current_lng) : caddy.heading,
        }
      }) as T[]

      displayedRef.current = new Map(next.map(caddy => [caddy.id, caddy]))
      setDisplayed(next)
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [caddies, duration])

  return displayed
}
