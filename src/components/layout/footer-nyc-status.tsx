'use client'

import { useEffect, useMemo, useState } from 'react'
import type { NycWeatherSnapshot } from '@/lib/weather/nyc'

const NYC_TIME_ZONE = 'America/New_York'

export function formatNycTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NYC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function footerText(
  now: Date | null,
  weather: NycWeatherSnapshot | null
): string {
  if (!now) return 'Currently in NYC'

  const time = formatNycTime(now)

  if (!weather) return `Currently in NYC: ${time}.`

  return `Currently in NYC: ${time}, ${weather.current.temperatureC}\u00b0C and ${weather.current.description}.`
}

export function FooterNycStatus() {
  const [now, setNow] = useState<Date | null>(null)
  const [weather, setWeather] = useState<NycWeatherSnapshot | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = window.setInterval(() => setNow(new Date()), 30_000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadWeather() {
      try {
        const response = await fetch('/api/nyc-weather', {
          credentials: 'same-origin',
          signal: controller.signal,
        })

        if (!response.ok) return

        setWeather((await response.json()) as NycWeatherSnapshot)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    loadWeather()

    return () => controller.abort()
  }, [])

  const text = useMemo(() => footerText(now, weather), [now, weather])

  return <p className="font-mono text-xs text-gray-500 md:text-right">{text}</p>
}
