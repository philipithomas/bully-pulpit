import { describe, expect, it } from 'vitest'
import { chatErrorMessage } from '@/lib/chat/chat-error-message'

describe('chatErrorMessage', () => {
  it('unwraps the 429 rate-limit body thrown by the transport', () => {
    expect(
      chatErrorMessage(
        new Error('{"error":"Too many messages. Please try again later."}')
      )
    ).toBe('Too many messages. Please try again later.')
  })

  it('unwraps the 403 bot-check body', () => {
    expect(chatErrorMessage(new Error('{"error":"Access denied."}'))).toBe(
      'Access denied.'
    )
  })

  it('passes the generic stream error message through unchanged', () => {
    expect(
      chatErrorMessage(new Error('Something went wrong. Please try again.'))
    ).toBe('Something went wrong. Please try again.')
  })

  it('falls back when the message is not JSON', () => {
    expect(chatErrorMessage(new Error('fetch failed'))).toBe(
      'Something went wrong. Please try again.'
    )
  })

  it('falls back when the JSON has an unexpected shape', () => {
    expect(chatErrorMessage(new Error('{"detail":"nope"}'))).toBe(
      'Something went wrong. Please try again.'
    )
    expect(chatErrorMessage(new Error('{"error":42}'))).toBe(
      'Something went wrong. Please try again.'
    )
    expect(chatErrorMessage(new Error('{"error":""}'))).toBe(
      'Something went wrong. Please try again.'
    )
    expect(chatErrorMessage(new Error('["error"]'))).toBe(
      'Something went wrong. Please try again.'
    )
    expect(chatErrorMessage(new Error('null'))).toBe(
      'Something went wrong. Please try again.'
    )
  })

  it('falls back when the message is empty or the value is not an Error', () => {
    expect(chatErrorMessage(new Error(''))).toBe(
      'Something went wrong. Please try again.'
    )
    expect(chatErrorMessage(undefined)).toBe(
      'Something went wrong. Please try again.'
    )
    expect(chatErrorMessage('{"error":"string, not an Error"}')).toBe(
      'Something went wrong. Please try again.'
    )
  })
})
