'use client'

import { useEffect, useMemo, useState } from 'react'
import type { NycWeatherSnapshot } from '@/lib/weather/nyc'

const NYC_TIME_ZONE = 'America/New_York'
const MINUTE_MS = 60_000
const CLOCK_SYNC_OFFSET_MS = 100
export const CLIENT_WEATHER_REFRESH_MS = 10 * MINUTE_MS

let cachedWeather: NycWeatherSnapshot | null = null
let cachedWeatherUpdatedAt = 0
let weatherRequest: Promise<NycWeatherSnapshot | null> | null = null

export function formatNycTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NYC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function millisecondsUntilNextMinute(date: Date): number {
  return (
    MINUTE_MS -
    (date.getSeconds() * 1000 + date.getMilliseconds()) +
    CLOCK_SYNC_OFFSET_MS
  )
}

export function shouldRefreshWeather(updatedAt: number, now: number): boolean {
  return now - updatedAt >= CLIENT_WEATHER_REFRESH_MS
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

async function loadNycWeather({
  force = false,
}: {
  force?: boolean
} = {}): Promise<NycWeatherSnapshot | null> {
  const now = Date.now()

  if (
    cachedWeather &&
    !force &&
    !shouldRefreshWeather(cachedWeatherUpdatedAt, now)
  ) {
    return cachedWeather
  }

  if (weatherRequest) return weatherRequest

  weatherRequest = fetch('/api/nyc-weather', {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) return cachedWeather

      const snapshot = (await response.json()) as NycWeatherSnapshot

      cachedWeather = snapshot
      cachedWeatherUpdatedAt = Date.now()

      return snapshot
    })
    .catch(() => cachedWeather)
    .finally(() => {
      weatherRequest = null
    })

  return weatherRequest
}

export function FooterNycStatus() {
  const [now, setNow] = useState<Date | null>(null)
  const [weather, setWeather] = useState<NycWeatherSnapshot | null>(null)

  useEffect(() => {
    let timeout: number

    function tick() {
      setNow(new Date())
      timeout = window.setTimeout(tick, millisecondsUntilNextMinute(new Date()))
    }

    tick()

    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    let active = true

    async function refreshWeather(force = false) {
      const snapshot = await loadNycWeather({ force })

      if (active && snapshot) {
        setWeather(snapshot)
      }
    }

    refreshWeather()
    const interval = window.setInterval(
      () => refreshWeather(true),
      CLIENT_WEATHER_REFRESH_MS
    )

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const text = useMemo(() => footerText(now, weather), [now, weather])

  return <p className="font-sans text-xs text-gray-500 md:text-right">{text}</p>
}
