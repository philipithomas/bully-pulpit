import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))
vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn((id: string) => id),
}))
vi.mock('@/lib/weather/nyc', () => ({
  fetchNycWeatherSnapshot: vi.fn(),
}))

import { generateText } from 'ai'
import { PHONE_GREETING_MODEL_ID } from '@/lib/chat/bell-model'
import {
  contextualGreetingOptions,
  FALLBACK_GREETING,
  generateGreeting,
} from '@/lib/phone/greeting'
import { fetchNycWeatherSnapshot } from '@/lib/weather/nyc'

const mockedGenerateText = vi.mocked(generateText)
const mockedFetchNycWeatherSnapshot = vi.mocked(fetchNycWeatherSnapshot)

const JULY_FOURTH_EVENING = new Date('2026-07-04T23:00:00Z')
const ORDINARY_AFTERNOON = new Date('2026-03-14T17:00:00Z')

const weather = {
  location: 'NYC' as const,
  timeZone: 'America/New_York' as const,
  source: 'weather.gov' as const,
  validAt: '2026-07-04T19:00:00-04:00',
  fetchedAt: '2026-07-04T23:00:00.000Z',
  current: {
    temperatureC: 19,
    relativeHumidity: 83,
    precipitationChance: 80,
    dewpointC: 16,
    windSpeedKph: 11,
    description: 'rain showers',
    isDay: true,
  },
}

describe('contextualGreetingOptions', () => {
  it('offers only verified holiday, weather, and time greetings', () => {
    expect(contextualGreetingOptions(JULY_FOURTH_EVENING, weather)).toEqual([
      'Happy Independence Day.',
      'Hello from rainy New York City.',
      'Good evening from New York City.',
    ])
  })

  it.each([
    [0, 'New York City'],
    [1, 'NYC'],
    [2, 'New York'],
    [3, 'Brooklyn'],
  ])('rotates the location form across calls at second %i', (second, location) => {
    const now = new Date(ORDINARY_AFTERNOON)
    now.setUTCSeconds(second)

    expect(
      contextualGreetingOptions(now, {
        ...weather,
        current: { ...weather.current, description: 'clear' },
      })
    ).toEqual([`Good afternoon from ${location}.`])
  })

  it('does not offer weather or holiday copy without supporting context', () => {
    expect(
      contextualGreetingOptions(ORDINARY_AFTERNOON, {
        ...weather,
        current: { ...weather.current, description: 'clear' },
      })
    ).toEqual(['Good afternoon from New York City.'])
  })

  it('does not describe forecast uncertainty as current rain or snow', () => {
    expect(
      contextualGreetingOptions(ORDINARY_AFTERNOON, {
        ...weather,
        current: {
          ...weather.current,
          description: 'slight chance rain showers',
        },
      })
    ).toEqual(['Good afternoon from New York City.'])
  })

  it('recognizes vetted snow and Thanksgiving greetings', () => {
    const thanksgivingMorning = new Date('2026-11-26T15:00:00Z')
    expect(
      contextualGreetingOptions(thanksgivingMorning, {
        ...weather,
        current: { ...weather.current, description: 'snow showers' },
      })
    ).toEqual([
      'Happy Thanksgiving.',
      'Hello from snowy New York City.',
      'Good morning from New York City.',
    ])
  })
})

describe('generateGreeting', () => {
  beforeEach(() => {
    mockedFetchNycWeatherSnapshot.mockResolvedValue(weather)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it.each([
    [0, 'Good evening from New York City.'],
    [1, 'Good evening from NYC.'],
    [2, 'Good evening from New York.'],
    [3, 'Good evening from Brooklyn.'],
  ])('adds the fixed company identification after approved opener at second %i: %s', async (second, text) => {
    const now = new Date(JULY_FOURTH_EVENING)
    now.setUTCSeconds(second)
    mockedGenerateText.mockResolvedValueOnce({
      text: `  ${text}  `,
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)

    await expect(generateGreeting(now)).resolves.toBe(
      `${text} ${FALLBACK_GREETING}`
    )
  })

  it('uses the speed-first phone model with NYC time and footer weather', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'Happy Independence Day.',
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)

    await generateGreeting(JULY_FOURTH_EVENING)

    expect(mockedFetchNycWeatherSnapshot).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    })
    const call = mockedGenerateText.mock.calls[0][0]
    expect(call.model).toBe(PHONE_GREETING_MODEL_ID)
    expect(call.reasoning).toBe('none')
    expect(call.providerOptions).toMatchObject({
      openai: { reasoningSummary: null },
      gateway: {
        order: ['openai'],
        zeroDataRetention: true,
        tags: [
          'feature:phone-greeting',
          'surface:phone',
          expect.stringMatching(/^env:(production|preview|development)$/),
        ],
      },
    })
    expect(call.prompt).toContain(
      'Current local date and time: Saturday, July 4, 2026 at 7:00 PM'
    )
    expect(call.prompt).toContain('Current local weather: rain showers, 19°C')
  })

  it('asks the model to select exact receptionist-ready copy', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'Good evening from New York City.',
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)

    await generateGreeting(JULY_FOURTH_EVENING)

    const call = mockedGenerateText.mock.calls[0][0]
    const system = String(call.system)
    expect(system).toContain('professional telephone receptionist')
    expect(system).toContain('Return one sentence from that list exactly')
    expect(system).toContain(
      '"New York City," "NYC," "New York," and "Brooklyn."'
    )
    expect(system).toContain('rotates its local wording across calls')
    expect(system).toContain('Do not substitute a different form')
    expect(system).toContain('Do not rewrite, combine, embellish, or explain')
    expect(system).toContain('Do not add humor, an excuse')
    expect(system).not.toContain('Give a witty, deadpan excuse')

    const prompt = String(call.prompt)
    expect(prompt).toContain('- Happy Independence Day.')
    expect(prompt).toContain('- Hello from rainy New York City.')
    expect(prompt).toContain('- Good evening from New York City.')
  })

  it.each([
    'Nobody can answer because the subway is delayed.',
    'Happy Thanksgiving.',
    'Hello from snowy New York City.',
    'The weather has a flair for drama today.',
    'Leave a message after the tone.',
    'You have reached the Contraption Company and an unexpected caller.',
    'Good evening! It is hilarious outside.',
  ])('drops a model opener outside the verified options: %s', async (text) => {
    // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    mockedGenerateText.mockResolvedValueOnce({ text } as any)

    await expect(generateGreeting(JULY_FOURTH_EVENING)).resolves.toBe(
      FALLBACK_GREETING
    )
  })

  it('falls back to the static greeting when the gateway fails', async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error('gateway down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateGreeting(JULY_FOURTH_EVENING)).resolves.toBe(
      FALLBACK_GREETING
    )
    expect(consoleError).toHaveBeenCalled()
  })

  it('falls back to the static greeting when the gateway call times out', async () => {
    mockedGenerateText.mockRejectedValueOnce(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError'
      )
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateGreeting(JULY_FOURTH_EVENING)).resolves.toBe(
      FALLBACK_GREETING
    )
    expect(consoleError).toHaveBeenCalled()
  })

  it('bounds the gateway call with an abort timeout and no retries', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'Good evening from New York City.',
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)

    await generateGreeting(JULY_FOURTH_EVENING)

    const call = mockedGenerateText.mock.calls[0][0]
    expect(call.abortSignal).toBeInstanceOf(AbortSignal)
    expect(call.maxRetries).toBe(0)
    expect(call.maxOutputTokens).toBe(40)
    expect(call.telemetry).toMatchObject({
      functionId: 'phone-greeting',
      recordInputs: false,
      recordOutputs: false,
    })
  })

  it('falls back when the model returns empty text', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    mockedGenerateText.mockResolvedValueOnce({ text: '   ' } as any)

    await expect(generateGreeting(JULY_FOURTH_EVENING)).resolves.toBe(
      FALLBACK_GREETING
    )
  })

  it('survives a weather fetch failure', async () => {
    mockedFetchNycWeatherSnapshot.mockRejectedValueOnce(
      new Error('network down')
    )
    mockedGenerateText.mockResolvedValueOnce({
      text: 'Good afternoon from New York City.',
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)

    await expect(generateGreeting(ORDINARY_AFTERNOON)).resolves.toBe(
      `Good afternoon from New York City. ${FALLBACK_GREETING}`
    )
    const call = mockedGenerateText.mock.calls[0][0]
    expect(call.prompt).toContain('Current local weather: unknown')
    expect(call.prompt).not.toContain('rainy New York City')
  })
})
