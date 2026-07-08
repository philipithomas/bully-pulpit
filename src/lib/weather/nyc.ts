const NYC_LATITUDE = 40.7128
const NYC_LONGITUDE = -74.006
const NYC_TIME_ZONE = 'America/New_York'
const NWS_API_URL = 'https://api.weather.gov'
const NWS_USER_AGENT =
  'philipithomas.com (https://www.philipithomas.com/contact)'

export interface NycWeatherSnapshot {
  location: 'NYC'
  timeZone: typeof NYC_TIME_ZONE
  source: 'weather.gov'
  validAt: string
  fetchedAt: string
  current: {
    temperatureC: number
    relativeHumidity: number | null
    precipitationChance: number | null
    dewpointC: number | null
    windSpeedKph: number | null
    description: string
    isDay: boolean
  }
}

interface NwsPointResponse {
  properties?: {
    forecastHourly?: unknown
  }
}

interface NwsHourlyForecastResponse {
  properties?: {
    periods?: unknown
  }
}

interface NwsForecastPeriod {
  startTime?: unknown
  temperature?: unknown
  temperatureUnit?: unknown
  shortForecast?: unknown
  windSpeed?: unknown
  isDaytime?: unknown
  probabilityOfPrecipitation?: {
    value?: unknown
  }
  relativeHumidity?: {
    value?: unknown
  }
  dewpoint?: {
    value?: unknown
  }
}

function numberFrom(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Weather.gov response is missing ${name}`)
  }

  return value
}

function optionalNumberFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringFrom(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Weather.gov response is missing ${name}`)
  }

  return value
}

function booleanFrom(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Weather.gov response is missing ${name}`)
  }

  return value
}

function round(value: number): number {
  return Math.round(value)
}

function normalizeForecastDescription(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

export function nwsPointUrl(): string {
  return `${NWS_API_URL}/points/${NYC_LATITUDE},${NYC_LONGITUDE}`
}

export function nwsHourlyForecastUrl(url: string): string {
  const forecastUrl = new URL(url)
  forecastUrl.searchParams.set('units', 'si')

  return forecastUrl.toString()
}

export function parseNwsPointResponse(payload: NwsPointResponse): string {
  return stringFrom(payload.properties?.forecastHourly, 'forecastHourly')
}

export function parseNwsHourlyForecastResponse(
  payload: NwsHourlyForecastResponse,
  fetchedAt = new Date()
): NycWeatherSnapshot {
  const periods = payload.properties?.periods

  if (!Array.isArray(periods) || periods.length === 0) {
    throw new Error('Weather.gov response is missing hourly forecast periods')
  }

  const current = periods[0] as NwsForecastPeriod
  const temperatureUnit = stringFrom(current.temperatureUnit, 'temperatureUnit')

  if (temperatureUnit !== 'C') {
    throw new Error(`Weather.gov returned unexpected unit ${temperatureUnit}`)
  }

  return {
    location: 'NYC',
    timeZone: NYC_TIME_ZONE,
    source: 'weather.gov',
    validAt: stringFrom(current.startTime, 'startTime'),
    fetchedAt: fetchedAt.toISOString(),
    current: {
      temperatureC: round(numberFrom(current.temperature, 'temperature')),
      relativeHumidity: optionalNumberFrom(current.relativeHumidity?.value),
      precipitationChance: optionalNumberFrom(
        current.probabilityOfPrecipitation?.value
      ),
      dewpointC: optionalNumberFrom(current.dewpoint?.value),
      windSpeedKph: parseNwsWindSpeedKph(current.windSpeed),
      description: normalizeForecastDescription(
        stringFrom(current.shortForecast, 'shortForecast')
      ),
      isDay: booleanFrom(current.isDaytime, 'isDaytime'),
    },
  }
}

export function parseNwsWindSpeedKph(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = value.match(/\d+/)
  return match ? Number(match[0]) : null
}

async function fetchNwsJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/geo+json',
      'User-Agent': NWS_USER_AGENT,
    },
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(2_000),
  })

  if (!response.ok) {
    throw new Error(`Weather.gov returned ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function fetchNycWeatherSnapshot(): Promise<NycWeatherSnapshot> {
  const point = await fetchNwsJson<NwsPointResponse>(nwsPointUrl())
  const forecastUrl = nwsHourlyForecastUrl(parseNwsPointResponse(point))
  const forecast = await fetchNwsJson<NwsHourlyForecastResponse>(forecastUrl)

  return parseNwsHourlyForecastResponse(forecast)
}
