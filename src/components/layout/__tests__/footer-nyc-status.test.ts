import { describe, expect, it } from 'vitest'
import {
  CLIENT_WEATHER_REFRESH_MS,
  footerText,
  formatNycTime,
  millisecondsUntilNextMinute,
  shouldRefreshWeather,
} from '@/components/layout/footer-nyc-status'
import type { NycWeatherSnapshot } from '@/lib/weather/nyc'

const weather: NycWeatherSnapshot = {
  location: 'NYC',
  timeZone: 'America/New_York',
  source: 'weather.gov',
  validAt: '2026-07-08T17:00:00-04:00',
  fetchedAt: '2026-07-08T21:00:00.000Z',
  current: {
    temperatureC: 28,
    relativeHumidity: 57,
    precipitationChance: 0,
    dewpointC: 20,
    windSpeedKph: 18,
    description: 'sunny',
    isDay: true,
  },
}

describe('formatNycTime', () => {
  it('uses 24-hour NYC time', () => {
    expect(formatNycTime(new Date('2026-07-08T21:02:00Z'))).toBe('17:02')
  })
})

describe('millisecondsUntilNextMinute', () => {
  it('syncs the clock just after the next minute boundary', () => {
    expect(
      millisecondsUntilNextMinute(new Date('2026-07-08T21:02:45.250Z'))
    ).toBe(14_850)
  })
})

describe('shouldRefreshWeather', () => {
  it('keeps client weather fresh for the refresh window', () => {
    expect(shouldRefreshWeather(1_000, 1_000)).toBe(false)
    expect(
      shouldRefreshWeather(1_000, 1_000 + CLIENT_WEATHER_REFRESH_MS - 1)
    ).toBe(false)
    expect(shouldRefreshWeather(1_000, 1_000 + CLIENT_WEATHER_REFRESH_MS)).toBe(
      true
    )
  })
})

describe('footerText', () => {
  it('uses NYC and Celsius in the footer weather line', () => {
    expect(footerText(new Date('2026-07-08T21:02:00Z'), weather)).toBe(
      'Currently in NYC: 17:02, 28°C and sunny.'
    )
  })
})
