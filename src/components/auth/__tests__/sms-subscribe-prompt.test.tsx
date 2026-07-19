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
        homepageLabel="SMS (all newsletters)"
        variant="homepage"
      />
    )

    expect(html).toContain(' or ')
    expect(html).toContain('>SMS (all newsletters)</button>')
    expect(html).not.toContain('>SMS (all newsletters)</button>.')
    expect(html).not.toContain('Or, ')
  })

  it('renders a standalone CTA without connective copy', () => {
    const html = renderToStaticMarkup(
      <SmsSubscribePrompt
        analyticsPlacement="newsletter_page"
        newsletter="tidbits"
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
        triggerClassName="btn-newsletter"
        triggerLabel="Subscribe by SMS"
        variant="standalone"
      />
    )

    expect(html).toContain('>Subscribe by SMS</button>')
    expect(html).toContain('btn-newsletter')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain('Or, ')
    expect(html).not.toContain(' or ')
    expect(html).not.toContain('>Subscribe by SMS</button>.')
  })

  it('renders a bare secondary link for custom surrounding copy', () => {
    const html = renderToStaticMarkup(
      <SmsSubscribePrompt
        analyticsPlacement="newsletter_page"
        newsletter="tidbits"
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
        triggerLabel="SMS"
        variant="link"
      />
    )

    expect(html).toContain('>SMS</button>')
    expect(html).toContain('underline')
    expect(html).not.toContain('Or, ')
    expect(html).not.toContain(' or ')
    expect(html).not.toContain('>SMS</button>.')
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

    expect(html).toContain(
      'to receive recurring automated new-post texts for every active newsletter'
    )
    expect(html).not.toContain('to consent to recurring automated')
    expect(html).toContain('The Contraption Company LLC')
    expect(html).toContain('new or reactivated signup')
    expect(html).toContain('save to your contacts')
    expect(html).toContain('text Bell questions about')
    expect(html).toContain('philipithomas.com')
    expect(html).toContain('Message and data rates may apply')
    expect(html).toContain('Reply STOP')
    expect(html).toContain('HELP for help')
    expect(html).toContain('If you previously replied STOP')
    expect(html).toContain('href="sms:+12123473190?body=START"')
    expect(html).toContain('or UNSTOP instead')
    expect(html).toContain('Consent is not a condition of purchase')
    expect(html).toContain('block text-gray-800')
    expect(html).toContain('mt-6 block text-sm text-gray-500')
    expect(html).not.toContain('border-t')
    expect(html).toContain('href="/terms#text-messaging"')
    expect(html).toContain('href="/privacy#text-messaging"')
  })
})
