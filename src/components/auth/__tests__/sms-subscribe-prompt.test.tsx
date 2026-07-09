import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SmsSubscribePrompt } from '@/components/auth/sms-subscribe-prompt'

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
})
