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
      location: 'NYC',
      timeZone: 'America/New_York',
      source: 'weather.gov',
      validAt: '2026-07-08T16:00:00-04:00',
      fetchedAt: '2026-07-08T20:00:00.000Z',
      current: {
        temperatureC: 28,
        relativeHumidity: 61,
        precipitationChance: 0,
        dewpointC: 20,
        windSpeedKph: 12,
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
      current: { temperatureC: 28, description: 'partly cloudy' },
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
