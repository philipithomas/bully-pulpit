import { describe, expect, it, vi } from 'vitest'
import {
  fetchNycWeatherSnapshot,
  nwsHourlyForecastUrl,
  nwsPointUrl,
  parseNwsHourlyForecastResponse,
  parseNwsPointResponse,
  parseNwsWindSpeedKph,
} from '@/lib/weather/nyc'

describe('nwsPointUrl', () => {
  it('requests the NYC Weather.gov point metadata', () => {
    const url = new URL(nwsPointUrl())

    expect(url.hostname).toBe('api.weather.gov')
    expect(url.pathname).toBe('/points/40.7128,-74.006')
  })
})

describe('nwsHourlyForecastUrl', () => {
  it('requests metric hourly forecast data', () => {
    expect(
      nwsHourlyForecastUrl(
        'https://api.weather.gov/gridpoints/OKX/33,42/forecast/hourly'
      )
    ).toBe(
      'https://api.weather.gov/gridpoints/OKX/33,42/forecast/hourly?units=si'
    )
  })
})

describe('parseNwsPointResponse', () => {
  it('extracts the hourly forecast URL', () => {
    expect(
      parseNwsPointResponse({
        properties: {
          forecastHourly:
            'https://api.weather.gov/gridpoints/OKX/33,42/forecast/hourly',
        },
      })
    ).toBe('https://api.weather.gov/gridpoints/OKX/33,42/forecast/hourly')
  })
})

describe('parseNwsHourlyForecastResponse', () => {
  it('normalizes the Weather.gov current hourly period', () => {
    const snapshot = parseNwsHourlyForecastResponse(
      {
        properties: {
          periods: [
            {
              startTime: '2026-07-08T19:00:00-04:00',
              temperature: 25,
              temperatureUnit: 'C',
              probabilityOfPrecipitation: { value: 0 },
              dewpoint: { value: 20 },
              relativeHumidity: { value: 74 },
              windSpeed: '17 km/h',
              shortForecast: 'Clear',
              isDaytime: false,
            },
          ],
        },
      },
      new Date('2026-07-08T23:13:44Z')
    )

    expect(snapshot).toEqual({
      location: 'NYC',
      timeZone: 'America/New_York',
      source: 'weather.gov',
      validAt: '2026-07-08T19:00:00-04:00',
      fetchedAt: '2026-07-08T23:13:44.000Z',
      current: {
        temperatureC: 25,
        relativeHumidity: 74,
        precipitationChance: 0,
        dewpointC: 20,
        windSpeedKph: 17,
        description: 'clear',
        isDay: false,
      },
    })
  })

  it('rejects non-metric temperatures', () => {
    expect(() =>
      parseNwsHourlyForecastResponse({
        properties: {
          periods: [
            {
              startTime: '2026-07-08T19:00:00-04:00',
              temperature: 77,
              temperatureUnit: 'F',
              shortForecast: 'Clear',
              isDaytime: false,
            },
          ],
        },
      })
    ).toThrow('Weather.gov returned unexpected unit F')
  })
})

describe('parseNwsWindSpeedKph', () => {
  it('extracts the numeric km/h wind speed', () => {
    expect(parseNwsWindSpeedKph('17 km/h')).toBe(17)
    expect(parseNwsWindSpeedKph('')).toBeNull()
  })
})

describe('fetchNycWeatherSnapshot', () => {
  it('fetches point metadata and then the metric hourly forecast', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            properties: {
              forecastHourly:
                'https://api.weather.gov/gridpoints/OKX/33,42/forecast/hourly',
            },
          })
        )
        .mockResolvedValueOnce(
          Response.json({
            properties: {
              periods: [
                {
                  startTime: '2026-07-08T19:00:00-04:00',
                  temperature: 25,
                  temperatureUnit: 'C',
                  shortForecast: 'Clear',
                  windSpeed: '17 km/h',
                  isDaytime: false,
                },
              ],
            },
          })
        )
    )

    await expect(fetchNycWeatherSnapshot()).resolves.toMatchObject({
      source: 'weather.gov',
      current: {
        temperatureC: 25,
        description: 'clear',
      },
    })

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.weather.gov/points/40.7128,-74.006',
      expect.objectContaining({
        cache: 'force-cache',
        headers: expect.objectContaining({
          Accept: 'application/geo+json',
          'User-Agent': expect.stringContaining('philipithomas.com'),
        }),
        next: { revalidate: 600 },
        signal: expect.any(AbortSignal),
      })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.weather.gov/gridpoints/OKX/33,42/forecast/hourly?units=si',
      expect.objectContaining({
        cache: 'force-cache',
        headers: expect.objectContaining({
          Accept: 'application/geo+json',
          'User-Agent': expect.stringContaining('philipithomas.com'),
        }),
        next: { revalidate: 600 },
        signal: expect.any(AbortSignal),
      })
    )

    vi.unstubAllGlobals()
  })
})
