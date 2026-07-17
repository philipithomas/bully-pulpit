import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SendClient } from '@/app/printing-press/send/[slug]/send-client'

describe('SendClient', () => {
  it('shows both delivery-channel counts when SMS eligibility is zero', () => {
    const html = renderToStaticMarkup(
      <SendClient
        slug="example-post"
        adminEmail="admin@example.com"
        subject="Example post"
        previewText="A test issue"
        newsletter="contraption"
        previewHtml="<p>Preview</p>"
        initialEligible={1}
        initialSmsEligible={0}
        initialStats={{
          total: 0,
          sent: 0,
          pending: 0,
          failed: 0,
          skipped: 0,
        }}
        initialActive={false}
        sendingEnabled={true}
      />
    )

    expect(html).toContain(
      'Ready for 1 email subscriber and 0 SMS subscribers.'
    )
  })
})
