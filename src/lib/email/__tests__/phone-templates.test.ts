import { describe, expect, it } from 'vitest'
import {
  renderIncomingSmsEmail,
  renderIncomingSmsText,
  renderMissedCallEmail,
  renderMissedCallText,
  renderSmsSignupEmail,
  renderSmsSignupText,
  renderVoicemailEmail,
  renderVoicemailText,
} from '@/lib/email/templates/phone'

const receivedAt = new Date('2026-06-10T14:23:45Z')

const DARK_MEDIA_QUERY = '@media (prefers-color-scheme: dark)'

/** The dark-mode media block of a rendered template, for snapshotting. */
function extractDarkBlock(html: string): string {
  const start = html.indexOf(DARK_MEDIA_QUERY)
  const end = html.indexOf('</style>')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return html.slice(start, end).trimEnd()
}

describe('voicemail email', () => {
  const input = {
    from: '+15551234567',
    to: '+12123473190',
    toLabel: 'NYC',
    durationSeconds: '42',
    transcription: 'Hey Philip, call me back about the <thing> & stuff.',
    metadata: {
      callSid: 'CA123',
      callerName: 'Jane Caller',
      fromCity: 'San Francisco',
      fromState: 'CA',
      fromZip: '94105',
    },
    receivedAt,
  }

  it('renders details and the escaped transcription', () => {
    const html = renderVoicemailEmail(input)
    expect(html).toContain('New voicemail')
    expect(html).toContain('+15551234567')
    expect(html).toContain('+12123473190 (NYC)')
    expect(html).toContain('42 seconds')
    expect(html).toContain('San Francisco, CA')
    expect(html).toContain('Jane Caller')
    expect(html).toContain('94105')
    expect(html).toContain('CA123')
    expect(html).toContain('2026-06-10 14:23 UTC')
    expect(html).toContain(
      'Hey Philip, call me back about the &lt;thing&gt; &amp; stuff.'
    )
    expect(html).toContain('The audio recording is attached.')
  })

  it('declares dark mode support', () => {
    const html = renderVoicemailEmail(input)
    expect(html).toContain('<meta name="color-scheme" content="light dark">')
    expect(html).toContain(
      '<meta name="supported-color-schemes" content="light dark">'
    )
    expect(html).toContain(
      ':root { color-scheme: light dark; supported-color-schemes: light dark; }'
    )
    expect(html).toContain(DARK_MEDIA_QUERY)
  })

  it('keeps light-mode inline styles as the source of truth', () => {
    const html = renderVoicemailEmail(input)
    expect(html).toContain(
      '<body class="email-body" style="margin: 0; padding: 0; background-color: #F5F3F0;">'
    )
    expect(html).toContain(
      '.email-card { background-color: #1C1A17 !important; }'
    )
    expect(html).toContain(
      '.email-card p.email-muted { color: #A8A49D !important; }'
    )
  })

  it('snapshots the dark-mode style block', () => {
    // All three phone notifications share the same shell, so one snapshot
    // covers the voicemail, missed call, and SMS templates.
    expect(extractDarkBlock(renderVoicemailEmail(input))).toMatchSnapshot()
  })

  it('mirrors the content in plaintext', () => {
    const text = renderVoicemailText(input)
    expect(text).toContain('From: +15551234567')
    expect(text).toContain('To: +12123473190 (NYC)')
    expect(text).toContain('Origin: San Francisco, CA')
    expect(text).toContain('Caller name: Jane Caller')
    expect(text).toContain('ZIP: 94105')
    expect(text).toContain('Call SID: CA123')
    expect(text).toContain('Transcription:')
    expect(text).toContain(
      'Hey Philip, call me back about the <thing> & stuff.'
    )
  })
})

describe('missed call email', () => {
  const input = {
    from: '+15551234567',
    to: '+14159157592',
    toLabel: 'SF',
    greeting: 'You have reached the Contraption Company office.',
    metadata: {
      callSid: 'CA456',
      callerName: 'Sam Caller',
      fromCity: 'Brooklyn',
      fromState: 'NY',
      fromZip: '11201',
    },
    receivedAt,
  }

  it('renders details and the greeting that was played', () => {
    const html = renderMissedCallEmail(input)
    expect(html).toContain('Incoming call')
    expect(html).toContain('+14159157592 (SF)')
    expect(html).toContain('Brooklyn, NY')
    expect(html).toContain('Sam Caller')
    expect(html).toContain('11201')
    expect(html).toContain('CA456')
    expect(html).toContain('You have reached the Contraption Company office.')
  })

  it('mirrors the content in plaintext', () => {
    const text = renderMissedCallText(input)
    expect(text).toContain('Incoming call')
    expect(text).toContain('Origin: Brooklyn, NY')
    expect(text).toContain('Caller name: Sam Caller')
    expect(text).toContain('ZIP: 11201')
    expect(text).toContain('Call SID: CA456')
    expect(text).toContain('Greeting played:')
  })
})

describe('incoming sms email', () => {
  const input = {
    from: '+15551234567',
    to: '+12123473190',
    toLabel: 'NYC',
    body: 'Running late, be there in 10 <minutes>',
    bellResponse: '[Bell AI] Take the A <train>.',
    receivedAt,
  }

  it('renders the escaped message and Bell response', () => {
    const html = renderIncomingSmsEmail(input)
    expect(html).toContain('New text message')
    expect(html).toContain('Running late, be there in 10 &lt;minutes&gt;')
    expect(html).toContain('Bell reply')
    expect(html).toContain('[Bell AI] Take the A &lt;train&gt;.')
    expect(html).not.toContain('Twilio did not confirm')
  })

  it('mirrors the content in plaintext', () => {
    const text = renderIncomingSmsText(input)
    expect(text).toContain('Message:')
    expect(text).toContain('Running late, be there in 10 <minutes>')
    expect(text).toContain('Bell reply:')
    expect(text).toContain('[Bell AI] Take the A <train>.')
  })

  it('makes a failed Bell reply explicit', () => {
    const text = renderIncomingSmsText({ ...input, bellReplyFailed: true })

    expect(text).toContain('Bell reply:')
    expect(text).toContain('Twilio did not confirm the Bell reply.')
  })

  it('keeps the immediate no-reply notification shape', () => {
    const html = renderIncomingSmsEmail({
      ...input,
      bellResponse: undefined,
      bellReplyFailed: undefined,
    })

    expect(html).toContain('Running late, be there in 10 &lt;minutes&gt;')
    expect(html).not.toContain('Bell reply')
  })
})

describe('sms signup email', () => {
  const input = {
    phoneNumber: '+14155551234',
    to: '+12123473190',
    toLabel: 'NYC',
    source: 'voice-menu' as const,
    metadata: {
      callSid: 'CA123',
      callerName: 'Jane Caller',
      areaCode: '415',
      areaDescription: 'San Francisco, CA',
    },
    receivedAt,
  }

  it('renders source, caller metadata, and area-code context', () => {
    const html = renderSmsSignupEmail(input)
    expect(html).toContain('New SMS subscriber')
    expect(html).toContain('Pressed 2 during a phone call')
    expect(html).toContain('Area code 415: San Francisco, CA')
    expect(html).toContain('Jane Caller')
    expect(html).toContain('CA123')
  })

  it('mirrors the content in plaintext', () => {
    const text = renderSmsSignupText(input)
    expect(text).toContain('New SMS subscriber')
    expect(text).toContain('Source: Pressed 2 during a phone call')
    expect(text).toContain('Origin: Area code 415: San Francisco, CA')
  })
})
