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
        enabled
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
        enabled
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

  it('renders nothing when the feature is disabled', () => {
    const html = renderToStaticMarkup(
      <SmsSubscribePrompt enabled={false} phoneNumber="+12123473190" />
    )

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

    expect(html).toContain('recurring automated new-post texts')
    expect(html).toContain('The Contraption Company LLC')
    expect(html).toContain('new or reactivated signup')
    expect(html).toContain('Message and data rates may apply')
    expect(html).toContain('Reply STOP')
    expect(html).toContain('HELP for help')
    expect(html).toContain('Consent is not a condition of purchase')
    expect(html).toContain('href="/terms#text-messaging"')
    expect(html).toContain('href="/privacy#text-messaging"')
  })
})
