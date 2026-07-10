import { generateText } from 'ai'
import {
  bellModel,
  bellReasoning,
  getPhoneGreetingProviderOptions,
} from '@/lib/chat/bell-model'
import { siteIdentity } from '@/lib/site-identity'
import {
  fetchNycWeatherSnapshot,
  type NycWeatherSnapshot,
} from '@/lib/weather/nyc'

// Voicemail greeting generation. Ported from junk-drawer's
// TwilioVoicemailController#generate_dynamic_greeting, rewritten on the AI
// Gateway instead of a direct provider client.

export const FALLBACK_GREETING = `You have reached the Contraption Company and ${siteIdentity.name}.`

// Twilio gives voice webhooks 15 seconds to respond before playing an
// application error to the caller. The shared weather fetch gets one 2 second
// deadline across both Weather.gov requests, so an 8 second cap on the gateway
// call leaves headroom for the route to render the fallback greeting.
const WEATHER_TIMEOUT_MS = 2_000
const GREETING_TIMEOUT_MS = 8_000
const NYC_TIME_ZONE = 'America/New_York'

const SYSTEM_PROMPT = `Select one short opening sentence for a professional telephone receptionist in New York City.

The application supplies an ordered list of approved sentences derived from the verified local time, vetted holiday, and current Weather.gov conditions. Return one sentence from that list exactly as written. Prefer the first option unless another supplied option sounds more natural.

The approved options are already calm, welcoming, professional, inclusive, and politically neutral. Do not rewrite, combine, embellish, or explain them. Do not add humor, an excuse for the unanswered call, company identification, an IVR instruction, quotation marks, emoji, or commentary.

The application adds "${FALLBACK_GREETING}" and then starts either the IVR menu or voicemail.`

async function nycWeatherContext(): Promise<NycWeatherSnapshot | null> {
  try {
    return await fetchNycWeatherSnapshot({
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

function nycNow(now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NYC_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now)
}

function nycCalendar(now: Date): {
  month: number
  day: number
  weekday: string
  hour: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NYC_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: value('weekday'),
    hour: Number(value('hour')),
  }
}

function holidayGreeting(now: Date): string | null {
  const { month, day, weekday } = nycCalendar(now)

  if (month === 1 && day === 1) return 'Happy New Year.'
  if (month === 7 && day === 4) return 'Happy Independence Day.'
  if (month === 11 && weekday === 'Thursday' && day >= 22 && day <= 28) {
    return 'Happy Thanksgiving.'
  }

  return null
}

function weatherGreeting(weather: NycWeatherSnapshot | null): string | null {
  if (!weather) return null

  const description = weather.current.description.toLocaleLowerCase('en-US')
  if (/chance|possible|likely/.test(description)) return null

  if (/snow|flurr|blizzard|sleet|wintry/.test(description)) {
    return 'Hello from snowy New York City.'
  }
  if (/rain|drizzle|shower|thunderstorm/.test(description)) {
    return 'Hello from rainy New York City.'
  }

  return null
}

function timeGreeting(now: Date): string {
  const { hour } = nycCalendar(now)

  if (hour >= 5 && hour < 12) return 'Good morning from New York City.'
  if (hour >= 12 && hour < 17) return 'Good afternoon from New York City.'
  if (hour >= 17) return 'Good evening from New York City.'
  return 'Hello from New York City.'
}

export function contextualGreetingOptions(
  now: Date,
  weather: NycWeatherSnapshot | null
): string[] {
  return Array.from(
    new Set(
      [
        holidayGreeting(now),
        weatherGreeting(weather),
        timeGreeting(now),
      ].filter((value): value is string => Boolean(value))
    )
  )
}

function selectedGreeting(text: string, options: string[]): string | null {
  const normalized = text.trim().replace(/\s+/g, ' ')
  return options.includes(normalized) ? normalized : null
}

/**
 * Generates a fresh, context-aware greeting for an incoming call. Any failure
 * (gateway outage, budget exhaustion, timeout) falls back to a static
 * greeting so the call always proceeds to the IVR or voicemail.
 */
export async function generateGreeting(
  now: Date = new Date()
): Promise<string> {
  try {
    const weather = await nycWeatherContext()
    const options = contextualGreetingOptions(now, weather)
    const weatherDescription = weather
      ? `${weather.current.description}, ${weather.current.temperatureC}°C`
      : 'unknown'
    const { text } = await generateText({
      model: bellModel,
      reasoning: bellReasoning,
      providerOptions: getPhoneGreetingProviderOptions(),
      maxOutputTokens: 40,
      abortSignal: AbortSignal.timeout(GREETING_TIMEOUT_MS),
      maxRetries: 0,
      runtimeContext: { surface: 'phone' },
      telemetry: {
        isEnabled: true,
        functionId: 'phone-greeting',
        recordInputs: false,
        recordOutputs: false,
        includeRuntimeContext: { surface: true },
      },
      system: SYSTEM_PROMPT,
      prompt: `Current date and time in New York City: ${nycNow(now)}\nCurrent weather in New York City: ${weatherDescription}\nApproved opening sentences, in preference order:\n${options.map((option) => `- ${option}`).join('\n')}`,
    })
    const context = selectedGreeting(text, options)
    return context ? `${context} ${FALLBACK_GREETING}` : FALLBACK_GREETING
  } catch (err) {
    console.error('Failed to generate voicemail greeting:', err)
    return FALLBACK_GREETING
  }
}
