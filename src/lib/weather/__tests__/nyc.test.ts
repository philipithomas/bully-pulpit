import { describe, expect, it, vi } from 'vitest'
import {
  describeWeatherCode,
  fetchNycWeatherSnapshot,
  openMeteoUrl,
  parseOpenMeteoResponse,
} from '@/lib/weather/nyc'

describe('describeWeatherCode', () => {
  it('maps common WMO weather codes to footer-friendly prose', () => {
    expect(describeWeatherCode(0, true)).toBe('sunny')
    expect(describeWeatherCode(0, false)).toBe('clear')
    expect(describeWeatherCode(2, true)).toBe('partly cloudy')
    expect(describeWeatherCode(61, true)).toBe('rainy')
    expect(describeWeatherCode(95, false)).toBe('stormy')
  })
})

describe('openMeteoUrl', () => {
  it('requests current NYC weather in US units', () => {
    const url = new URL(openMeteoUrl())

    expect(url.hostname).toBe('api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('40.7128')
    expect(url.searchParams.get('longitude')).toBe('-74.006')
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit')
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph')
    expect(url.searchParams.get('timezone')).toBe('America/New_York')
  })
})

describe('parseOpenMeteoResponse', () => {
  it('normalizes the Open-Meteo current conditions payload', () => {
    const snapshot = parseOpenMeteoResponse(
      {
        current: {
          time: '2026-07-08T16:00',
          temperature_2m: 83.4,
          apparent_temperature: 87.2,
          relative_humidity_2m: 61,
          precipitation: 0.004,
          weather_code: 2,
          cloud_cover: 40,
          wind_speed_10m: 7.4,
          is_day: 1,
        },
      },
      new Date('2026-07-08T20:00:00Z')
    )

    expect(snapshot).toEqual({
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
  })

  it('rejects incomplete current conditions', () => {
    expect(() => parseOpenMeteoResponse({ current: {} })).toThrow(
      'Open-Meteo response is missing weather_code'
    )
  })
})

describe('fetchNycWeatherSnapshot', () => {
  it('fetches and parses current conditions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          current: {
            time: '2026-07-08T16:00',
            temperature_2m: 83,
            apparent_temperature: 87,
            relative_humidity_2m: 61,
            precipitation: 0,
            weather_code: 1,
            cloud_cover: 20,
            wind_speed_10m: 7,
            is_day: 1,
          },
        })
      )
    )

    await expect(fetchNycWeatherSnapshot()).resolves.toMatchObject({
      current: {
        temperatureF: 83,
        description: 'mostly sunny',
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.open-meteo.com'),
      expect.objectContaining({
        next: { revalidate: 600 },
        signal: expect.any(AbortSignal),
      })
    )

    vi.unstubAllGlobals()
  })
})
