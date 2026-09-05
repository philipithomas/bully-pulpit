import { describe, expect, it, vi } from 'vitest'
import { getPostBySlug } from '@/lib/content/loader'
import { renderFullNewsletter, sendQueuedEmail } from '@/lib/email/queued-send'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { renderNewsletterPreview, sendNewsletterToOne } from '@/lib/email/send'
import { sendNewsletterEmail } from '@/lib/email/ses'
import { tidbitsAsset, tidbitsPaletteForPost } from '@/lib/tidbits/palette'

vi.mock('@/lib/email/ses', () => ({
  sendNewsletterEmail: vi.fn(),
  sendSimpleEmail: vi.fn(),
}))

describe('Tidbits color from preview through delivery', () => {
  it.each([
    'kaffe',
    'lamps',
    'copenhagen-sunset',
    'cycling',
    'jackknife',
  ])('%s keeps its issue palette in preview, test send, queue, and retry', async (slug) => {
    const post = getPostBySlug(slug)!
    const palette = tidbitsPaletteForPost(slug)
    const body = await buildEmailBodyHtml(post)
    const preview = await renderNewsletterPreview(slug)
    expect(preview?.html).toContain(`background-color: ${palette.paper};`)
    expect(preview?.html).toContain(tidbitsAsset(palette, 'email'))
    expect(preview?.html).toContain(tidbitsAsset(palette, 'email-dark'))
    expect(preview?.html).toContain(
      `text-decoration-color: ${palette.dark} !important;`
    )
    expect(preview?.html).toContain('color: #6b6760;')
    expect(preview?.html).not.toMatch(/color: #(7E7A73|9E9A93);/)

    await sendNewsletterToOne({ slug, email: 'reader@example.com' })
    expect(vi.mocked(sendNewsletterEmail).mock.lastCall?.[0].html).toBe(
      preview?.html
    )

    const row = {
      postSlug: slug,
      email: 'reader@example.com',
      subject: body.subject,
      htmlContent: body.html,
      textContent: body.bodyText,
      newsletter: 'tidbits',
      previewText: body.previewText,
      unsubscribeToken: 'test-token',
    }
    await sendQueuedEmail(row)
    const sent = vi.mocked(sendNewsletterEmail).mock.lastCall?.[0].html
    expect(
      sent?.replaceAll('/unsubscribe?token=test-token', '/unsubscribe')
    ).toBe(preview?.html)
    await sendQueuedEmail(row)
    expect(vi.mocked(sendNewsletterEmail).mock.lastCall?.[0].html).toBe(sent)

    const linkedBody = renderFullNewsletter({
      bodyHtml: '<p><a href="/contact">Contact</a></p>',
      postSlug: slug,
      newsletter: 'tidbits',
      unsubscribeUrl: '/unsubscribe',
    })
    expect(linkedBody).toContain(`text-decoration-color: ${palette.ink};`)
  })
})
