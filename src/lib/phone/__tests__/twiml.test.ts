import { afterAll, describe, expect, it } from 'vitest'
import {
  phoneIvrFallbackAudioPath,
  verifyPhoneIvrAudioToken,
} from '@/lib/phone/ivr-audio'
import {
  connectCallTwiml,
  emptyTwiml,
  escapeXml,
  goodbyeTwiml,
  mediaMessageTwiml,
  messagesTwiml,
  messageTwiml,
  playAndHangupTwiml,
  twimlResponse,
  voiceMenuTwiml,
  voicemailTwiml,
} from '@/lib/phone/twiml'

const originalTwilioSecret = process.env.TWILIO_SECRET
process.env.TWILIO_SECRET = 'test-twilio-auth-token'

afterAll(() => {
  if (originalTwilioSecret === undefined) delete process.env.TWILIO_SECRET
  else process.env.TWILIO_SECRET = originalTwilioSecret
})

function playedTexts(xml: string): string[] {
  return Array.from(xml.matchAll(/<Play>([^<]+)<\/Play>/g), ([, rawUrl]) => {
    const token = new URL(rawUrl.replaceAll('&amp;', '&')).searchParams.get(
      'token'
    )
    const verified = verifyPhoneIvrAudioToken(token)
    expect(verified).not.toBeNull()
    return verified?.text ?? ''
  })
}

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
      'https://philipithomas.com/api/phone/recording-status?caller=%2B15551234567',
    recordingCompleteUrl:
      'https://philipithomas.com/api/phone/recording-complete',
  })

  it('plays the greeting and voicemail instruction from signed audio urls', () => {
    expect(xml).not.toContain('<Say')
    expect(xml).toContain('<Play>')
    expect(xml).toContain('/api/phone/ivr-audio?token=')
    expect(playedTexts(xml)).toEqual([
      'You have reached the Contraption Company & friends.',
      'Leave a message after the tone.',
    ])
  })

  it('records with escaped callback urls', () => {
    expect(xml).toContain('maxLength="120"')
    expect(xml).toContain(
      'recordingStatusCallback="https://philipithomas.com/api/phone/recording-status?caller=%2B15551234567"'
    )
    expect(xml).toContain(
      'action="https://philipithomas.com/api/phone/recording-complete"'
    )
  })

  it('can start voicemail without repeating a contextual greeting', () => {
    const instructionOnly = voicemailTwiml({
      recordingStatusUrl: 'https://philipithomas.com/recording-status',
      recordingCompleteUrl: 'https://philipithomas.com/recording-complete',
    })

    expect(instructionOnly.match(/<Play>/g)).toHaveLength(1)
    expect(playedTexts(instructionOnly)).toEqual([
      'Leave a message after the tone.',
    ])
  })
})

describe('voiceMenuTwiml', () => {
  const xml = voiceMenuTwiml({
    greeting: 'You have reached the Contraption Company.',
    menuActionUrl: 'https://philipithomas.com/api/phone/voice-menu',
    recordingStatusUrl:
      'https://philipithomas.com/api/phone/recording-status?caller=%2B15551234567',
    recordingCompleteUrl:
      'https://philipithomas.com/api/phone/recording-complete',
  })

  it('collects a single keypad choice before the voicemail fallback', () => {
    expect(xml).toContain(
      '<Gather action="https://philipithomas.com/api/phone/voice-menu" method="POST" input="dtmf" numDigits="1" timeout="6">'
    )
    expect(playedTexts(xml)).toEqual([
      'You have reached the Contraption Company.',
      'Press 1 to leave a voicemail. Press 2 to subscribe to recurring new-post texts from philipithomas.com. A new or reactivated subscription includes one Bell contact-card multimedia message. Frequency varies. Message and data rates may apply. Text STOP to unsubscribe or HELP for help.',
      'Leave a message after the tone.',
    ])
    expect(xml).not.toContain('<Say')
    expect(xml).toContain('<Record maxLength="120"')
  })
})

describe('goodbyeTwiml', () => {
  it('thanks the caller and hangs up', () => {
    const xml = goodbyeTwiml()
    expect(playedTexts(xml)).toEqual(['Thank you. Goodbye.'])
    expect(xml).toContain('<Hangup/>')
  })
})

describe('playAndHangupTwiml', () => {
  it('plays the exact signed static outcome and hangs up', () => {
    const xml = playAndHangupTwiml('subscribed')
    const rawUrl = xml.match(/<Play>([^<]+)<\/Play>/)?.[1] ?? ''
    const token = new URL(rawUrl.replaceAll('&amp;', '&')).searchParams.get(
      'token'
    )
    expect(playedTexts(xml)).toEqual([
      'You are subscribed to new-post texts from philipithomas.com. Text STOP to unsubscribe or HELP for help. Goodbye.',
    ])
    expect(verifyPhoneIvrAudioToken(token)).toMatchObject({
      fallbackPath: phoneIvrFallbackAudioPath('subscribed'),
      isStaticPrompt: true,
    })
    expect(xml).not.toContain('You are subscribed')
    expect(xml).toContain('<Hangup/>')
  })
})

describe('emptyTwiml', () => {
  it('returns an empty response document', () => {
    expect(emptyTwiml()).toContain('<Response></Response>')
  })
})

describe('messageTwiml', () => {
  it('replies with escaped SMS body text', () => {
    const xml = messageTwiml('Subscribed & ready.')
    expect(xml).toContain('<Message>Subscribed &amp; ready.</Message>')
  })
})

describe('mediaMessageTwiml', () => {
  it('replies with an MMS body and media attachment', () => {
    const xml = mediaMessageTwiml({
      body: 'Meet Bell & add the contact.',
      mediaUrl: 'https://www.philipithomas.com/bell.vcf?source=sms&v=1',
    })

    expect(xml).toContain('<Body>Meet Bell &amp; add the contact.</Body>')
    expect(xml).toContain(
      '<Media>https://www.philipithomas.com/bell.vcf?source=sms&amp;v=1</Media>'
    )
  })

  it('xml-escapes values before interpolation', () => {
    const xml = mediaMessageTwiml({
      body: '<Bell> says "hello"',
      mediaUrl: 'https://example.com/<bell>.vcf?owner=Philip&kind=contact',
    })

    expect(xml).not.toContain('<Bell>')
    expect(xml).not.toContain('<bell>')
    expect(xml).toContain('&lt;Bell&gt; says &quot;hello&quot;')
    expect(xml).toContain(
      'https://example.com/&lt;bell&gt;.vcf?owner=Philip&amp;kind=contact'
    )
  })
})

describe('messagesTwiml', () => {
  it('keeps a confirmation SMS ahead of an onboarding MMS', () => {
    const xml = messagesTwiml([
      { body: 'Subscribed.' },
      {
        body: 'Meet Bell.',
        mediaUrl: 'https://www.philipithomas.com/bell.vcf',
      },
    ])

    expect(xml.indexOf('<Message>Subscribed.</Message>')).toBeLessThan(
      xml.indexOf('<Body>Meet Bell.</Body>')
    )
    expect(xml.match(/<Message>/g)).toHaveLength(2)
    expect(xml).toContain(
      '<Media>https://www.philipithomas.com/bell.vcf</Media>'
    )
  })
})

describe('connectCallTwiml', () => {
  it('dials the target with the caller id', () => {
    const xml = connectCallTwiml({
      target: '+15551234567',
      callerId: '+12123473190',
    })
    expect(xml).toContain('<Dial callerId="+12123473190">+15551234567</Dial>')
  })

  it('xml-escapes both values', () => {
    const xml = connectCallTwiml({
      target: '"><Hangup/>',
      callerId: '&evil',
    })
    expect(xml).not.toContain('<Hangup/>')
    expect(xml).toContain('callerId="&amp;evil"')
    expect(xml).toContain('&quot;&gt;&lt;Hangup/&gt;')
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
