import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'

// Voicemail greeting generation. Ported from junk-drawer's
// TwilioVoicemailController#generate_dynamic_greeting, rewritten on the AI
// Gateway (same gateway credits as Bell, no BYOK) instead of a direct OpenAI
// client.

export const FALLBACK_GREETING =
  'You have reached the Contraption Company. Leave a message after the tone.'

// Twilio gives voice webhooks 15 seconds to respond before playing an
// application error to the caller. The weather fetch is capped at 2 seconds,
// so an 8 second cap on the gateway call leaves comfortable headroom for the
// route to render TwiML with the fallback greeting instead.
const GREETING_TIMEOUT_MS = 8_000

const SYSTEM_PROMPT = `You write voicemail greetings for the Contraption Company. Generate ONLY the greeting text, nothing else. Keep it to 1-2 sentences. Professional but with dry/cheeky humor.

Company tagline: Crafting digital tools.

Style: Give a witty, deadpan excuse for why nobody can answer. Keep it PC/professional but playful. Love of irony, sarcasm, and self-deprecation.

Time-based excuses:
- Late night (9pm-5am): Keep it creative.
- Morning (5am-12pm): Could mention coffee not kicked in yet
- Lunch (11:30am-1:30pm): 'It is lunch time, so nobody can answer the phone.'
- Afternoon/Evening: Normal greeting or mild excuse

NYC flavor (use occasionally): subway delays, bodega run, stuck in Times Square tourist traffic, waiting for the L train

Weather-based (use when relevant): rainy day making it hard to get to the subway, rare sunny winter day everyone's outside, too hot to function, snow day vibes

Special dates: Pi Day, tax day, first day of summer, etc. can get playful mentions.

Inside jokes that could be mixed in:
- Owner is Philip, who likes coffee brewed via aeropress
- Projects include Postcard (blogging software), Junk Drawer (internal app), Booklet (async community app), Trivet (Ghost blog plugin), QuesoGPT (photo chatbot with Philip's dog), Workshop (blog about work in progress), Toolbox (mac mini hosting all the projects), Press (Print Edition - blog posts by mail, maybe say have you considered subscribing to the print edition?), and Bell (the AI assistant).

Rules:
- ALWAYS say 'You have reached the Contraption Company' or 'at the Contraption Company office' - never just 'at the Contraption Company' (that is not a place)
- NEVER use 'we' or 'our' (no royal we) - say 'nobody' or rephrase
- Keep it professional enough for business and brief.
- The greeting is spoken by a text-to-speech voice, so write plain prose with no markup, emoji, or stage directions.
- Always end with: 'Leave a message after the tone.'`

/** Current NYC weather from wttr.in, or "unknown" if it cannot be fetched fast. */
async function fetchNycWeather(): Promise<string> {
  try {
    const response = await fetch('https://wttr.in/New+York?format=%c+%t+%w', {
      signal: AbortSignal.timeout(2_000),
    })
    if (!response.ok) return 'unknown'
    return (await response.text()).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

function nycNow(now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now)
}

/**
 * Generates a fresh, context-aware greeting for an incoming call. Any failure
 * (gateway outage, budget exhaustion, timeout) falls back to a static
 * greeting so the call always proceeds to recording.
 */
export async function generateGreeting(
  now: Date = new Date()
): Promise<string> {
  try {
    const weather = await fetchNycWeather()
    const { text } = await generateText({
      model: gateway('anthropic/claude-haiku-4.5'),
      maxOutputTokens: 200,
      temperature: 1.0,
      abortSignal: AbortSignal.timeout(GREETING_TIMEOUT_MS),
      maxRetries: 0,
      experimental_telemetry: { isEnabled: true, functionId: 'phone-greeting' },
      system: SYSTEM_PROMPT,
      prompt: `Current date and time in New York: ${nycNow(now)}\nCurrent weather: ${weather}`,
    })
    const greeting = text.trim()
    return greeting || FALLBACK_GREETING
  } catch (err) {
    console.error('Failed to generate voicemail greeting:', err)
    return FALLBACK_GREETING
  }
}
