import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TextMessagingConsent } from '@/components/pages/text-messaging-page'
import { SMS_SUBSCRIBE_CONFIRMATION } from '@/lib/phone/sms-subscription-copy'

describe('TextMessagingConsent', () => {
  it('renders a public, complete keyword consent flow', () => {
    const html = renderToStaticMarkup(
      <TextMessagingConsent
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
      />
    )

    expect(html).toContain('href="sms:+12123473190?body=SUBSCRIBE"')
    expect(html).toContain('recurring automated new-post texts')
    expect(html).toContain('Contraption, Workshop, Postcard, and tidbits')
    expect(html).toContain(
      'For a first-time subscription, text SUBSCRIBE, START, or JOIN'
    )
    expect(html).toContain(
      'After sending STOP, text START, UNSTOP, or YES to reactivate'
    )
    expect(html).toContain('Message frequency varies')
    expect(html).toContain('tap Create New Contact')
    expect(html).toContain('Text Bell questions about philipithomas.com')
    expect(html).toContain('Message and data rates may apply')
    expect(html).toContain('Reply STOP to unsubscribe or HELP for help')
    expect(html).toContain('Consent is not a condition of purchase')
    expect(html).toContain('Mobile opt-in data is not shared')
    expect(html).toContain('does not subscribe you')
    expect(html).toContain('href="/terms#text-messaging"')
    expect(html).toContain('href="/privacy#text-messaging"')
    expect(html).toContain(SMS_SUBSCRIBE_CONFIRMATION)
  })
})
