import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { siteConfig } from '@/lib/config'
import { twilioSecret } from '@/lib/phone/config'
import { siteIdentity } from '@/lib/site-identity'

export const PHONE_IVR_SPEECH_MODEL_ID = 'openai/tts-1'
export const PHONE_IVR_SPEECH_VOICE = 'sage'
export const PHONE_IVR_SPEECH_FORMAT = 'wav'
export const PHONE_IVR_FALLBACK_PROMPTS = {
  goodbye: 'Thank you. Goodbye.',
  greeting: `You have reached the Contraption Company and ${siteIdentity.name}. This is Bell, an AI-generated voice.`,
  menu: 'Press 1 to leave a voicemail. Press 2 to subscribe to recurring new-post texts from philipithomas.com. A new or reactivated subscription includes one Bell contact-card multimedia message. Frequency varies. Message and data rates may apply. Text STOP to unsubscribe or HELP for help.',
  voicemail: 'Leave a message after the tone.',
} as const

export type PhoneIvrFallbackKey = keyof typeof PHONE_IVR_FALLBACK_PROMPTS

const PHONE_IVR_AUDIO_PATH = '/api/phone/ivr-audio'
const PHONE_IVR_AUDIO_SCHEMA_VERSION = 1
const PHONE_IVR_AUDIO_VERSION = [
  PHONE_IVR_SPEECH_MODEL_ID,
  PHONE_IVR_SPEECH_VOICE,
  PHONE_IVR_SPEECH_FORMAT,
  `schema-${PHONE_IVR_AUDIO_SCHEMA_VERSION}`,
].join('\0')
const PHONE_IVR_AUDIO_SIGNING_CONTEXT = 'phone-ivr-audio'
const MAX_PHONE_IVR_TEXT_LENGTH = 2_000

interface PhoneIvrAudioPayload {
  fallback: PhoneIvrFallbackKey
  text: string
  version: string
}

export interface VerifiedPhoneIvrAudioToken {
  etag: string
  fallbackPath: string
  isStaticPrompt: boolean
  text: string
}

function isPhoneIvrFallbackKey(value: unknown): value is PhoneIvrFallbackKey {
  return (
    typeof value === 'string' &&
    Object.hasOwn(PHONE_IVR_FALLBACK_PROMPTS, value)
  )
}

/** Static Sage WAV for a fixed prompt or a dynamic prompt's outage fallback. */
export function phoneIvrFallbackAudioPath(
  fallback: PhoneIvrFallbackKey
): string {
  const prompt = PHONE_IVR_FALLBACK_PROMPTS[fallback]
  const digest = createHash('sha256')
    .update(PHONE_IVR_AUDIO_VERSION)
    .update('\0')
    .update(prompt)
    .digest('hex')
    .slice(0, 12)
  return `/audio/phone/ivr/${fallback}-${digest}.wav`
}

function validPhoneIvrText(text: string): boolean {
  if (
    text.length === 0 ||
    text.length > MAX_PHONE_IVR_TEXT_LENGTH ||
    text !== text.trim()
  ) {
    return false
  }

  return Array.from(text).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint >= 32 && codePoint !== 127
  })
}

function signingKey(): string {
  const secret = twilioSecret()
  if (!secret) throw new Error('TWILIO_SECRET is not configured')
  return secret
}

function tokenSignature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(PHONE_IVR_AUDIO_SIGNING_CONTEXT)
    .update('\0')
    .update(payload)
    .digest()
}

/** Creates a stable, signed URL that Twilio can fetch without webhook auth. */
export function phoneIvrAudioUrl(
  text: string,
  fallback: PhoneIvrFallbackKey
): string {
  if (!validPhoneIvrText(text)) {
    throw new Error('Phone IVR audio text is empty, too long, or malformed')
  }

  const payload = Buffer.from(
    JSON.stringify({ fallback, text, version: PHONE_IVR_AUDIO_VERSION })
  ).toString('base64url')
  const signature = tokenSignature(payload, signingKey()).toString('base64url')
  const url = new URL(PHONE_IVR_AUDIO_PATH, siteConfig.url)
  url.searchParams.set('token', `${payload}.${signature}`)
  return url.toString()
}

/** Verifies and decodes an IVR audio token without accepting arbitrary text. */
export function verifyPhoneIvrAudioToken(
  token: string | null
): VerifiedPhoneIvrAudioToken | null {
  const secret = twilioSecret()
  if (!secret || !token) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, encodedSignature] = parts
  if (
    !payload ||
    !encodedSignature ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]{43}$/.test(encodedSignature)
  ) {
    return null
  }

  const supplied = Buffer.from(encodedSignature, 'base64url')
  const expected = tokenSignature(payload, secret)
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as Partial<PhoneIvrAudioPayload>
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Object.keys(parsed).sort().join(',') !== 'fallback,text,version' ||
      parsed.version !== PHONE_IVR_AUDIO_VERSION ||
      !isPhoneIvrFallbackKey(parsed.fallback) ||
      typeof parsed.text !== 'string' ||
      !validPhoneIvrText(parsed.text)
    ) {
      return null
    }

    return {
      etag: `W/"${encodedSignature}"`,
      fallbackPath: phoneIvrFallbackAudioPath(parsed.fallback),
      isStaticPrompt:
        parsed.text === PHONE_IVR_FALLBACK_PROMPTS[parsed.fallback],
      text: parsed.text,
    }
  } catch {
    return null
  }
}
