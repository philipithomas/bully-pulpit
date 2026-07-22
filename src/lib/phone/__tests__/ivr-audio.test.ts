import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PHONE_IVR_FALLBACK_PROMPTS,
  type PhoneIvrFallbackKey,
  phoneIvrAudioUrl,
  phoneIvrFallbackAudioPath,
  verifyPhoneIvrAudioToken,
} from '@/lib/phone/ivr-audio'

beforeEach(() => {
  process.env.TWILIO_SECRET = 'test-twilio-auth-token'
})

afterEach(() => {
  delete process.env.TWILIO_SECRET
})

describe('phone IVR audio tokens', () => {
  it('round-trips exact text through a stable signed URL', () => {
    const text = 'This is Bell, an AI-generated voice.'
    const first = phoneIvrAudioUrl(text, 'greeting')
    const second = phoneIvrAudioUrl(text, 'greeting')
    const token = new URL(first).searchParams.get('token')

    expect(first).toBe(second)
    expect(first).toContain('/api/phone/ivr-audio?token=')
    expect(first).not.toContain(text)
    expect(verifyPhoneIvrAudioToken(token)).toMatchObject({
      fallbackPath: phoneIvrFallbackAudioPath('greeting'),
      isStaticPrompt: false,
      text,
    })
  })

  it('recognizes exact committed prompts without a live model call', () => {
    const token = new URL(
      phoneIvrAudioUrl(PHONE_IVR_FALLBACK_PROMPTS.goodbye, 'goodbye')
    ).searchParams.get('token')

    expect(verifyPhoneIvrAudioToken(token)?.isStaticPrompt).toBe(true)
  })

  it('rejects a modified signature', () => {
    const token =
      new URL(
        phoneIvrAudioUrl('Thank you. Goodbye.', 'goodbye')
      ).searchParams.get('token') ?? ''
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`

    expect(verifyPhoneIvrAudioToken(tampered)).toBeNull()
  })

  it('rejects missing secrets and malformed text', () => {
    expect(() => phoneIvrAudioUrl('', 'goodbye')).toThrow(
      'empty, too long, or malformed'
    )
    expect(() => phoneIvrAudioUrl('Line one\nLine two', 'goodbye')).toThrow(
      'empty, too long, or malformed'
    )

    delete process.env.TWILIO_SECRET
    expect(() => phoneIvrAudioUrl('Hello.', 'goodbye')).toThrow(
      'TWILIO_SECRET is not configured'
    )
    expect(verifyPhoneIvrAudioToken('payload.signature')).toBeNull()
  })

  it.each(
    Object.keys(PHONE_IVR_FALLBACK_PROMPTS) as PhoneIvrFallbackKey[]
  )('has a committed WAV fallback for %s', async (fallback) => {
    const audio = await readFile(
      path.join(
        process.cwd(),
        'public',
        phoneIvrFallbackAudioPath(fallback).slice(1)
      )
    )

    expect(audio.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(audio.subarray(8, 12).toString('ascii')).toBe('WAVE')
  })
})
