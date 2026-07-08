'use client'

import { useEffect, useMemo, useState } from 'react'
import type { NycWeatherSnapshot } from '@/lib/weather/nyc'

const NYC_TIME_ZONE = 'America/New_York'

function formatNycTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NYC_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function footerText(
  now: Date | null,
  weather: NycWeatherSnapshot | null
): string {
  if (!now) return 'New York'

  const time = formatNycTime(now)

  if (!weather) return `New York: ${time}.`

  return `New York: ${time}, ${weather.current.temperatureF}\u00b0F and ${weather.current.description}.`
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

  return <p className="text-xs text-gray-500 md:text-right">{text}</p>
}
