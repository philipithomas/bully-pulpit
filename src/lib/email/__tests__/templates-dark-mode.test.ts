import { describe, expect, it } from 'vitest'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { renderFullNewsletter } from '@/lib/email/send'
import { renderConfirmationEmail } from '@/lib/email/templates/confirmation'
import { renderNewSubscriberEmail } from '@/lib/email/templates/new-subscriber'
import { renderNewsletterShell } from '@/lib/email/templates/newsletter-shell'

const COLOR_SCHEME_META = '<meta name="color-scheme" content="light dark">'
const SUPPORTED_META =
  '<meta name="supported-color-schemes" content="light dark">'
const DARK_MEDIA_QUERY = '@media (prefers-color-scheme: dark)'

/** The dark-mode media block of a rendered template, for snapshotting. */
function extractDarkBlock(html: string): string {
  const start = html.indexOf(DARK_MEDIA_QUERY)
  const end = html.indexOf('</style>')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return html.slice(start, end).trimEnd()
}

describe('newsletter shell dark mode', () => {
  const baseInput = {
    content: '<p>Hello</p>',
    unsubscribeUrl: 'https://www.philipithomas.com/unsubscribe',
    siteUrl: 'https://www.philipithomas.com',
  }

  it('declares color-scheme meta tags', () => {
    const html = renderNewsletterShell(baseInput)
    expect(html).toContain(COLOR_SCHEME_META)
    expect(html).toContain(SUPPORTED_META)
    expect(html).toContain(
      ':root { color-scheme: light dark; supported-color-schemes: light dark; }'
    )
  })

  it('uses a lightened accent per newsletter in the dark override', () => {
    const darkAccents = {
      contraption: '#8FB8A5',
      workshop: '#C29B7E',
      postcard: '#97A8D9',
      tidbits: '#F41986',
    } as const
    for (const [newsletter, accent] of Object.entries(darkAccents)) {
      const html = renderNewsletterShell({
        ...baseInput,
        newsletter: newsletter as keyof typeof darkAccents,
      })
      expect(html).toContain(`text-decoration-color: ${accent} !important;`)
    }
    // No newsletter: falls back to the warm gray accent.
    const html = renderNewsletterShell(baseInput)
    expect(html).toContain('text-decoration-color: #A8A49D !important;')
  })

  it('keeps light-mode inline styles as the source of truth', () => {
    const html = renderNewsletterShell({
      ...baseInput,
      newsletter: 'contraption',
    })
    // Light-mode surfaces and text colors stay inline and unchanged.
    expect(html).toContain(
      '<body class="email-body" style="margin: 0; padding: 0; background-color: #ffffff;">'
    )
    expect(html).toContain('max-width: 600px; background-color: #ffffff;')
    expect(html).toContain('color: #3B3834;')
    // Dark overrides live only inside the media query, marked !important.
    expect(html).toContain(
      '.email-card { background-color: #1C1A17 !important; }'
    )
  })

  it('renders Tsundoku on a single light surface with the colored wordmark', () => {
    const html = renderNewsletterShell({
      ...baseInput,
      newsletter: 'tsundoku',
    })
    expect(html).toContain(
      '<body class="email-body" style="margin: 0; padding: 0; background-color: #f4f4f2;">'
    )
    expect(html).toContain(
      'class="email-card email-card-tsundoku" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #f4f4f2;"'
    )
    expect(html).toContain(
      '<td class="content-cell content-cell-tsundoku" style="padding: 0 32px 32px;'
    )
    expect(html).toContain('class="email-brand-tsundoku"')
    expect(html).toContain('/images/tsundoku-email.png')
    expect(html).not.toContain('/images/tsundoku-email-dark.png')
  })

  it('keeps the Tsundoku wordmark colored in dark mode', () => {
    const html = renderNewsletterShell({
      ...baseInput,
      newsletter: 'tsundoku',
    })
    expect(extractDarkBlock(html)).toContain(
      'img.email-brand-tsundoku { display: inline-block !important; opacity: 1 !important; }'
    )
    expect(extractDarkBlock(html)).toContain(
      '.email-card-tsundoku { background-color: #121110 !important; }'
    )
  })

  it('renders tidbits with its photo shell and lowercase cochineal wordmark', () => {
    const html = renderNewsletterShell({
      ...baseInput,
      newsletter: 'tidbits',
    })
    expect(html).toContain(
      '<body class="email-body" style="margin: 0; padding: 0; background-color: #f6eae9;">'
    )
    expect(html).toContain(
      'class="email-card email-card-tidbits" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #f6eae9;"'
    )
    expect(html).toContain(
      '<td class="content-cell content-cell-tidbits" style="padding: 0 32px 32px;'
    )
    expect(html).toContain(
      'class="email-brand-tidbits" src="https://www.philipithomas.com/images/tidbits-email.png" alt="tidbits"'
    )
    expect(html).not.toContain('/images/tidbits-email-dark.png')
    expect(extractDarkBlock(html)).toContain(
      '.email-card-tidbits { background-color: #121110 !important; }'
    )
  })

  it('snapshots the dark-mode style block', () => {
    const html = renderNewsletterShell({
      ...baseInput,
      newsletter: 'contraption',
    })
    expect(extractDarkBlock(html)).toMatchSnapshot()
  })
})

describe('full newsletter render for a real post', () => {
  it('keeps the dark block and meta tags through the body transforms', async () => {
    const post = getPostsByNewsletter('contraption')[0]
    expect(post).toBeDefined()
    const body = await buildEmailBodyHtml(post)
    const html = renderFullNewsletter({
      bodyHtml: body.html,
      newsletter: 'contraption',
      previewText: body.previewText,
      unsubscribeUrl: 'https://www.philipithomas.com/unsubscribe',
    })
    // Meta tags and the dark override block survive the full pipeline:
    // rehype-sanitize runs on the markdown body only, before the shell wraps it.
    expect(html).toContain(COLOR_SCHEME_META)
    expect(html).toContain(SUPPORTED_META)
    expect(html).toContain(DARK_MEDIA_QUERY)
    expect(html.match(/<style>/g)).toHaveLength(1)
    // Light-mode inline styles from the body renderer are untouched.
    expect(html).toContain('color: #3b3834;')
    expect(html).toContain('color: #111110;')
    // The contraption dark accent is wired into the override.
    expect(html).toContain('text-decoration-color: #8FB8A5 !important;')
    // Images are never inverted or filtered in dark mode.
    expect(html).not.toContain('filter:')
  })
})

describe('confirmation email dark mode', () => {
  const html = renderConfirmationEmail({
    code: '123456',
    magicLink: 'https://www.philipithomas.com/api/auth/magic?token=abc',
  })

  it('declares color-scheme meta tags and a dark override block', () => {
    expect(html).toContain(COLOR_SCHEME_META)
    expect(html).toContain(SUPPORTED_META)
    expect(html).toContain(DARK_MEDIA_QUERY)
  })

  it('keeps light-mode inline styles and inverts the button in dark', () => {
    expect(html).toContain(
      '<body class="email-body" style="margin: 0; padding: 0; background-color: #F5F3F0;">'
    )
    expect(html).toContain(
      'class="email-button" href="https://www.philipithomas.com/api/auth/magic?token=abc" style="display: inline-block; background-color: #111110; color: #ffffff;'
    )
    expect(html).toContain(
      '.email-card a.email-button { background-color: #ECE9E4 !important; color: #121110 !important; }'
    )
  })

  it('snapshots the dark-mode style block', () => {
    expect(extractDarkBlock(html)).toMatchSnapshot()
  })
})

describe('new subscriber email dark mode', () => {
  const html = renderNewSubscriberEmail({
    email: 'reader@example.com',
    name: 'Reader',
    source: 'workshop',
  })

  it('declares color-scheme meta tags and a dark override block', () => {
    expect(html).toContain(COLOR_SCHEME_META)
    expect(html).toContain(SUPPORTED_META)
    expect(html).toContain(DARK_MEDIA_QUERY)
  })

  it('keeps light-mode inline styles and dims muted labels in dark', () => {
    expect(html).toContain(
      '<body class="email-body" style="margin: 0; padding: 0; background-color: #F5F3F0;">'
    )
    expect(html).toContain(
      '<p class="email-muted" style="margin: 0 0 4px; font-size: 13px; color: #7E7A73;">Email:</p>'
    )
    expect(html).toContain(
      '.email-card p.email-muted { color: #A8A49D !important; }'
    )
  })

  it('snapshots the dark-mode style block', () => {
    expect(extractDarkBlock(html)).toMatchSnapshot()
  })
})
