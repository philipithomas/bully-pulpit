import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/weather/nyc', () => ({
  fetchNycWeatherSnapshot: vi.fn(),
}))

import { GET } from '@/app/api/nyc-weather/route'
import { fetchNycWeatherSnapshot } from '@/lib/weather/nyc'

const mockedFetchNycWeatherSnapshot = vi.mocked(fetchNycWeatherSnapshot)

describe('GET /api/nyc-weather', () => {
  beforeEach(() => {
    mockedFetchNycWeatherSnapshot.mockReset()
  })

  it('returns cached weather context', async () => {
    mockedFetchNycWeatherSnapshot.mockResolvedValue({
      location: 'New York',
      timeZone: 'America/New_York',
      source: 'open-meteo',
      observedAt: '2026-07-08T16:00',
      fetchedAt: '2026-07-08T20:00:00.000Z',
      current: {
        temperatureF: 83,
        apparentTemperatureF: 87,
        relativeHumidity: 61,
        precipitationIn: 0,
        cloudCover: 40,
        windSpeedMph: 7,
        weatherCode: 2,
        description: 'partly cloudy',
        isDay: true,
      },
    })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=60, s-maxage=600, stale-while-revalidate=1800'
    )
    await expect(response.json()).resolves.toMatchObject({
      current: { temperatureF: 83, description: 'partly cloudy' },
    })
  })

  it('fails without caching when weather is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedFetchNycWeatherSnapshot.mockRejectedValue(new Error('upstream down'))

    const response = await GET()

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Weather unavailable',
    })
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
