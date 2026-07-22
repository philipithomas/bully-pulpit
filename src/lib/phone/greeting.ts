import { generateText } from 'ai'
import {
  getPhoneGreetingProviderOptions,
  phoneGreetingModel,
} from '@/lib/chat/bell-model'
import { PHONE_IVR_FALLBACK_PROMPTS } from '@/lib/phone/ivr-audio'
import {
  fetchNycWeatherSnapshot,
  type NycWeatherSnapshot,
} from '@/lib/weather/nyc'

// Voicemail greeting generation. Ported from junk-drawer's
// TwilioVoicemailController#generate_dynamic_greeting, rewritten on the AI
// Gateway instead of a direct provider client.

export const FALLBACK_GREETING = PHONE_IVR_FALLBACK_PROMPTS.greeting

// Twilio gives voice webhooks 15 seconds to respond before playing an
// application error to the caller. The shared weather fetch gets one 2 second
// deadline across both Weather.gov requests, so an 8 second cap on the gateway
// call leaves headroom for the route to render the fallback greeting.
const WEATHER_TIMEOUT_MS = 2_000
const GREETING_TIMEOUT_MS = 8_000
const NYC_TIME_ZONE = 'America/New_York'
const NYC_LOCATION_FORMS = ['New York City', 'NYC', 'New York', 'Brooklyn']

const SYSTEM_PROMPT = `Select one short opening sentence for a professional telephone receptionist in New York.

The application supplies a list of approved sentences derived from the verified local time, vetted holiday, and current Weather.gov conditions. Return one sentence from that list exactly as written.

The application rotates its local wording across calls among "New York City," "NYC," "New York," and "Brooklyn." The supplied options already use the location form selected for this call. Do not substitute a different form.

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

function locationForm(now: Date): string {
  return NYC_LOCATION_FORMS[now.getUTCSeconds() % NYC_LOCATION_FORMS.length]
}

function weatherGreeting(
  weather: NycWeatherSnapshot | null,
  location: string
): string | null {
  if (!weather) return null

  const description = weather.current.description.toLocaleLowerCase('en-US')
  if (/chance|possible|likely/.test(description)) return null

  if (/snow|flurr|blizzard|sleet|wintry/.test(description)) {
    return `Hello from snowy ${location}.`
  }
  if (/rain|drizzle|shower|thunderstorm/.test(description)) {
    return `Hello from rainy ${location}.`
  }

  return null
}

function timeGreeting(now: Date, location: string): string {
  const { hour } = nycCalendar(now)
  let opening = 'Hello'

  if (hour >= 5 && hour < 12) opening = 'Good morning'
  if (hour >= 12 && hour < 17) opening = 'Good afternoon'
  if (hour >= 17) opening = 'Good evening'

  return `${opening} from ${location}.`
}

export function contextualGreetingOptions(
  now: Date,
  weather: NycWeatherSnapshot | null
): string[] {
  const location = locationForm(now)

  return Array.from(
    new Set(
      [
        holidayGreeting(now),
        weatherGreeting(weather, location),
        timeGreeting(now, location),
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
      model: phoneGreetingModel,
      reasoning: 'none',
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
      prompt: `Current local date and time: ${nycNow(now)}\nCurrent local weather: ${weatherDescription}\nApproved opening sentences:\n${options.map((option) => `- ${option}`).join('\n')}`,
    })
    const context = selectedGreeting(text, options)
    return context ? `${context} ${FALLBACK_GREETING}` : FALLBACK_GREETING
  } catch (err) {
    console.error('Failed to generate voicemail greeting:', err)
    return FALLBACK_GREETING
  }
}
