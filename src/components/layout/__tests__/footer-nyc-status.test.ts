import { describe, expect, it } from 'vitest'
import {
  footerText,
  formatNycTime,
} from '@/components/layout/footer-nyc-status'
import type { NycWeatherSnapshot } from '@/lib/weather/nyc'

const weather: NycWeatherSnapshot = {
  location: 'NYC',
  timeZone: 'America/New_York',
  source: 'open-meteo',
  observedAt: '2026-07-08T17:00',
  fetchedAt: '2026-07-08T21:00:00.000Z',
  current: {
    temperatureC: 28,
    apparentTemperatureC: 30,
    relativeHumidity: 57,
    precipitationMm: 0,
    cloudCover: 14,
    windSpeedKph: 18,
    weatherCode: 0,
    description: 'sunny',
    isDay: true,
  },
}

describe('formatNycTime', () => {
  it('uses 24-hour NYC time', () => {
    expect(formatNycTime(new Date('2026-07-08T21:02:00Z'))).toBe('17:02')
  })
})

describe('footerText', () => {
  it('uses NYC and Celsius in the footer weather line', () => {
    expect(footerText(new Date('2026-07-08T21:02:00Z'), weather)).toBe(
      'NYC: 17:02, 28°C and sunny.'
    )
  })
})
