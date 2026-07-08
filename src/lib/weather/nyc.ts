const NYC_LATITUDE = 40.7128
const NYC_LONGITUDE = -74.006
const NYC_TIME_ZONE = 'America/New_York'
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

export interface NycWeatherSnapshot {
  location: 'New York'
  timeZone: typeof NYC_TIME_ZONE
  source: 'open-meteo'
  observedAt: string
  fetchedAt: string
  current: {
    temperatureF: number
    apparentTemperatureF: number
    relativeHumidity: number
    precipitationIn: number
    cloudCover: number
    windSpeedMph: number
    weatherCode: number
    description: string
    isDay: boolean
  }
}

interface OpenMeteoResponse {
  current?: {
    time?: unknown
    temperature_2m?: unknown
    apparent_temperature?: unknown
    relative_humidity_2m?: unknown
    precipitation?: unknown
    weather_code?: unknown
    cloud_cover?: unknown
    wind_speed_10m?: unknown
    is_day?: unknown
  }
}

function numberFrom(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Open-Meteo response is missing ${name}`)
  }

  return value
}

function stringFrom(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Open-Meteo response is missing ${name}`)
  }

  return value
}

function round(value: number, digits = 0): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

export function describeWeatherCode(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'sunny' : 'clear'
  if (code === 1) return isDay ? 'mostly sunny' : 'mostly clear'
  if (code === 2) return 'partly cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'foggy'
  if (code >= 51 && code <= 57) return 'drizzling'
  if (code >= 61 && code <= 67) return 'rainy'
  if (code >= 71 && code <= 77) return 'snowy'
  if (code >= 80 && code <= 82) return 'showery'
  if (code === 85 || code === 86) return 'snowy'
  if (code >= 95 && code <= 99) return 'stormy'

  return 'unsettled'
}

export function openMeteoUrl(): string {
  const url = new URL(OPEN_METEO_URL)
  url.searchParams.set('latitude', String(NYC_LATITUDE))
  url.searchParams.set('longitude', String(NYC_LONGITUDE))
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
      'is_day',
    ].join(',')
  )
  url.searchParams.set('temperature_unit', 'fahrenheit')
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('precipitation_unit', 'inch')
  url.searchParams.set('timezone', NYC_TIME_ZONE)

  return url.toString()
}

export function parseOpenMeteoResponse(
  payload: OpenMeteoResponse,
  fetchedAt = new Date()
): NycWeatherSnapshot {
  const current = payload.current

  if (!current) {
    throw new Error('Open-Meteo response is missing current conditions')
  }

  const weatherCode = numberFrom(current.weather_code, 'weather_code')
  const isDay = numberFrom(current.is_day, 'is_day') === 1

  return {
    location: 'New York',
    timeZone: NYC_TIME_ZONE,
    source: 'open-meteo',
    observedAt: stringFrom(current.time, 'time'),
    fetchedAt: fetchedAt.toISOString(),
    current: {
      temperatureF: round(numberFrom(current.temperature_2m, 'temperature_2m')),
      apparentTemperatureF: round(
        numberFrom(current.apparent_temperature, 'apparent_temperature')
      ),
      relativeHumidity: round(
        numberFrom(current.relative_humidity_2m, 'relative_humidity_2m')
      ),
      precipitationIn: round(
        numberFrom(current.precipitation, 'precipitation'),
        2
      ),
      cloudCover: round(numberFrom(current.cloud_cover, 'cloud_cover')),
      windSpeedMph: round(numberFrom(current.wind_speed_10m, 'wind_speed_10m')),
      weatherCode,
      description: describeWeatherCode(weatherCode, isDay),
      isDay,
    },
  }
}

export async function fetchNycWeatherSnapshot(): Promise<NycWeatherSnapshot> {
  const response = await fetch(openMeteoUrl(), {
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(2_000),
  })

  if (!response.ok) {
    throw new Error(`Open-Meteo returned ${response.status}`)
  }

  return parseOpenMeteoResponse(await response.json())
}
