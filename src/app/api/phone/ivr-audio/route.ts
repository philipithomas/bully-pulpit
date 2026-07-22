import { gateway } from '@ai-sdk/gateway'
import { generateSpeech } from 'ai'
import {
  PHONE_IVR_SPEECH_FORMAT,
  PHONE_IVR_SPEECH_MODEL_ID,
  PHONE_IVR_SPEECH_VOICE,
  verifyPhoneIvrAudioToken,
} from '@/lib/phone/ivr-audio'

const PHONE_IVR_SPEECH_TIMEOUT_MS = 8_000
const PHONE_IVR_AUDIO_CACHE_CONTROL =
  'public, max-age=31536000, s-maxage=31536000, immutable'
const PHONE_IVR_FALLBACK_CACHE_CONTROL =
  'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
const MAX_PHONE_IVR_STATIC_AUDIO_BYTES = 2 * 1024 * 1024
const phoneIvrSpeechModel = gateway.speechModel(PHONE_IVR_SPEECH_MODEL_ID)

function errorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

function isWaveAudio(audio: Uint8Array): boolean {
  return (
    audio.byteLength >= 12 &&
    Buffer.from(audio.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(audio.subarray(8, 12)).toString('ascii') === 'WAVE'
  )
}

async function staticAudioResponse(
  request: Request,
  input: { cacheControl: string; etag: string; path: string }
): Promise<Response> {
  const fallback = await fetch(new URL(input.path, request.url), {
    cache: 'force-cache',
  })
  if (!fallback.ok) {
    throw new Error(`Static IVR fallback returned ${fallback.status}`)
  }
  const audio = new Uint8Array(await fallback.arrayBuffer())
  if (
    audio.byteLength > MAX_PHONE_IVR_STATIC_AUDIO_BYTES ||
    !isWaveAudio(audio)
  ) {
    throw new Error('Static IVR fallback was not a valid WAV')
  }
  return new Response(audio.buffer, {
    headers: {
      'Cache-Control': input.cacheControl,
      'Content-Type': 'audio/wav',
      'Content-Length': String(audio.byteLength),
      ETag: input.etag,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  })
}

/** Signed Twilio <Play> target for Bell's AI-generated phone IVR voice. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.searchParams.size !== 1 || !url.searchParams.has('token')) {
    return errorResponse('Invalid audio token', 401)
  }

  const verified = verifyPhoneIvrAudioToken(url.searchParams.get('token'))
  if (!verified) return errorResponse('Invalid audio token', 401)

  const cacheHeaders = {
    'Cache-Control': PHONE_IVR_AUDIO_CACHE_CONTROL,
    ETag: verified.etag,
  }
  if (request.headers.get('if-none-match') === verified.etag) {
    return new Response(null, { status: 304, headers: cacheHeaders })
  }

  if (verified.isStaticPrompt) {
    try {
      return await staticAudioResponse(request, {
        cacheControl: PHONE_IVR_AUDIO_CACHE_CONTROL,
        etag: verified.etag,
        path: verified.fallbackPath,
      })
    } catch (err) {
      console.error('[phone/ivr-audio] Static prompt failed:', err)
    }
  }

  try {
    const { audio, warnings } = await generateSpeech({
      model: phoneIvrSpeechModel,
      text: verified.text,
      voice: PHONE_IVR_SPEECH_VOICE,
      outputFormat: PHONE_IVR_SPEECH_FORMAT,
      abortSignal: AbortSignal.timeout(PHONE_IVR_SPEECH_TIMEOUT_MS),
      maxRetries: 1,
    })
    if (warnings.length > 0) {
      console.warn('[phone/ivr-audio] Speech generation warnings:', warnings)
    }
    const audioBytes = Uint8Array.from(audio.uint8Array)
    if (audio.mediaType !== 'audio/wav' || !isWaveAudio(audioBytes)) {
      throw new Error(`Unexpected speech audio type: ${audio.mediaType}`)
    }

    return new Response(audioBytes.buffer, {
      headers: {
        ...cacheHeaders,
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    })
  } catch (err) {
    console.error('[phone/ivr-audio] Speech generation failed:', err)
    try {
      return await staticAudioResponse(request, {
        cacheControl: PHONE_IVR_FALLBACK_CACHE_CONTROL,
        etag: verified.etag.replace(/"$/, '-fallback"'),
        path: verified.fallbackPath,
      })
    } catch (fallbackError) {
      console.error('[phone/ivr-audio] Static fallback failed:', fallbackError)
      return errorResponse('Speech generation unavailable', 503)
    }
  }
}
