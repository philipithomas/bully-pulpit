'use client'

import { useEffect, useRef, useState } from 'react'

const UMAMI_VISITS_KEY = 'umami-page-visits'

export function UmamiTagline() {
  const countedRef = useRef(false)
  const [highlight, setHighlight] = useState(false)

  useEffect(() => {
    if (countedRef.current) return
    countedRef.current = true

    try {
      const stored = Number.parseInt(
        sessionStorage.getItem(UMAMI_VISITS_KEY) ?? '0',
        10
      )
      const visits = Math.min(Number.isFinite(stored) ? stored + 1 : 1, 3)
      sessionStorage.setItem(UMAMI_VISITS_KEY, String(visits))
      if (visits !== 2) return

      setHighlight(true)
    } catch {
      // The tagline remains complete when storage is unavailable.
    }
  }, [])

  useEffect(() => {
    if (!highlight) return
    const timeout = window.setTimeout(() => setHighlight(false), 1800)
    return () => window.clearTimeout(timeout)
  }, [highlight])

  return (
    <p className="mt-4 max-w-xl text-balance font-serif text-base leading-relaxed text-gray-600 sm:text-lg">
      Photo journal of city life.{' '}
      <span className={highlight ? 'umami-tagline-nudge' : undefined}>
        Just what lingers.
      </span>
    </p>
  )
}
