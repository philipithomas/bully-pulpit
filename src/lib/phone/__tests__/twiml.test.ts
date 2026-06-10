import { describe, expect, it } from 'vitest'
import {
  emptyTwiml,
  escapeXml,
  goodbyeTwiml,
  twimlResponse,
  voicemailTwiml,
} from '@/lib/phone/twiml'

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;'
    )
  })

  it('passes plain text through', () => {
    expect(escapeXml('Leave a message after the tone.')).toBe(
      'Leave a message after the tone.'
    )
  })
})

describe('voicemailTwiml', () => {
  const xml = voicemailTwiml({
    greeting: 'You have reached the Contraption Company & friends.',
    recordingStatusUrl:
      'https://philipithomas.com/api/phone/recording-status?secret=s&caller=%2B15551234567',
    recordingCompleteUrl:
      'https://philipithomas.com/api/phone/recording-complete?secret=s',
  })

  it('speaks the greeting with a Polly neural voice', () => {
    expect(xml).toContain(
      '<Say voice="Polly.Matthew-Neural">You have reached the Contraption Company &amp; friends.</Say>'
    )
  })

  it('records with escaped callback urls', () => {
    expect(xml).toContain('maxLength="120"')
    expect(xml).toContain(
      'recordingStatusCallback="https://philipithomas.com/api/phone/recording-status?secret=s&amp;caller=%2B15551234567"'
    )
    expect(xml).toContain(
      'action="https://philipithomas.com/api/phone/recording-complete?secret=s"'
    )
  })
})

describe('goodbyeTwiml', () => {
  it('thanks the caller and hangs up', () => {
    const xml = goodbyeTwiml()
    expect(xml).toContain('Thank you. Goodbye.')
    expect(xml).toContain('<Hangup/>')
  })
})

describe('emptyTwiml', () => {
  it('returns an empty response document', () => {
    expect(emptyTwiml()).toContain('<Response></Response>')
  })
})

describe('twimlResponse', () => {
  it('sets xml content type and no-store caching', async () => {
    const response = twimlResponse(emptyTwiml())
    expect(response.headers.get('Content-Type')).toBe('text/xml; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(await response.text()).toContain('<Response></Response>')
  })
})
