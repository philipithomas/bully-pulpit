import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  SmsSubscribeDisclosure,
  SmsSubscribePrompt,
} from '@/components/auth/sms-subscribe-prompt'

const noop = () => {}

describe('SmsSubscribePrompt', () => {
  it('renders an understated form trigger without the compliance copy inline', () => {
    const html = renderToStaticMarkup(
      <SmsSubscribePrompt
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
      />
    )

    expect(html).toContain('Or, ')
    expect(html).toContain('>subscribe via SMS</button>.')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain('Message frequency varies')
  })

  it('renders the concise homepage trigger', () => {
    const html = renderToStaticMarkup(
      <SmsSubscribePrompt
        analyticsPlacement="homepage"
        newsletter="all"
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
        variant="homepage"
      />
    )

    expect(html).toContain(' or ')
    expect(html).toContain('>SMS</button>')
    expect(html).not.toContain('>SMS</button>.')
    expect(html).not.toContain('Or, ')
  })

  it('renders nothing without a configured phone number', () => {
    const html = renderToStaticMarkup(<SmsSubscribePrompt />)

    expect(html).toBe('')
  })

  it('renders the complete consent disclosure and policy links', () => {
    const html = renderToStaticMarkup(
      <SmsSubscribeDisclosure
        displayNumber="+1 212 347 3190"
        onSmsOpen={noop}
        phoneNumber="+12123473190"
      />
    )

    expect(html).toContain('to receive recurring automated new-post texts')
    expect(html).not.toContain('to consent to recurring automated')
    expect(html).toContain('The Contraption Company LLC')
    expect(html).toContain('new or reactivated signup')
    expect(html).toContain('save to your contacts')
    expect(html).toContain('text Bell questions about')
    expect(html).toContain('philipithomas.com')
    expect(html).toContain('Message and data rates may apply')
    expect(html).toContain('Reply STOP')
    expect(html).toContain('HELP for help')
    expect(html).toContain('Consent is not a condition of purchase')
    expect(html).toContain('block text-gray-800')
    expect(html).toContain('border-t border-gray-200 pt-4')
    expect(html).toContain('href="/terms#text-messaging"')
    expect(html).toContain('href="/privacy#text-messaging"')
  })
})
