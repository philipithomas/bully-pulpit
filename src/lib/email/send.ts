import { siteConfig } from '@/lib/config'
import { getPostBySlug } from '@/lib/content/loader'
import { isNewsletter, type NewsletterSlug } from '@/lib/db/queries/subscribers'
import { transformEmailBody } from '@/lib/email/content-transforms'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { sendNewsletterEmail, sendSimpleEmail } from '@/lib/email/ses'
import { renderConfirmationEmail } from '@/lib/email/templates/confirmation'
import { renderNewSubscriberEmail } from '@/lib/email/templates/new-subscriber'
import { renderNewsletterShell } from '@/lib/email/templates/newsletter-shell'

// --- Transactional emails (sent synchronously in the request path) ---

export async function sendConfirmation(
  email: string,
  code: string,
  magicLink: string
): Promise<void> {
  const html = renderConfirmationEmail({ code, magicLink })
  await sendSimpleEmail({
    to: email,
    subject: 'Your sign-in code for philipithomas.com',
    html,
  })
}

export async function sendNewSubscriberNotification(
  email: string,
  name?: string | null,
  source?: string | null
): Promise<void> {
  const html = renderNewSubscriberEmail({ email, name, source })
  await sendSimpleEmail({
    to: siteConfig.sesFromEmail,
    subject: `New subscriber: ${email}`,
    html,
  })
}

// --- Newsletter rendering ---

/** Wraps the rendered body in the shell after applying the body transforms. */
export function renderFullNewsletter(input: {
  bodyHtml: string
  newsletter?: NewsletterSlug
  previewText?: string | null
  unsubscribeUrl: string
}): string {
  const content = transformEmailBody(input.bodyHtml, input.newsletter)
  return renderNewsletterShell({
    content,
    unsubscribeUrl: input.unsubscribeUrl,
    newsletter: input.newsletter,
    previewText: input.previewText,
  })
}

/** Full rendered newsletter HTML for a post, for the admin preview iframe. */
export async function renderNewsletterPreview(slug: string): Promise<{
  subject: string
  previewText: string
  newsletter: string
  html: string
} | null> {
  const post = getPostBySlug(slug)
  if (!post) return null
  const newsletter = isNewsletter(post.newsletter) ? post.newsletter : undefined
  const body = await buildEmailBodyHtml(post)
  const html = renderFullNewsletter({
    bodyHtml: body.html,
    newsletter,
    previewText: body.previewText,
    unsubscribeUrl: `${siteConfig.url}/unsubscribe`,
  })
  return {
    subject: body.subject,
    previewText: body.previewText,
    newsletter: post.newsletter,
    html,
  }
}

/** Sends a single test copy of a post's newsletter to one address. */
export async function sendNewsletterToOne(input: {
  email: string
  slug: string
}): Promise<void> {
  const post = getPostBySlug(input.slug)
  if (!post) throw new Error(`Post not found: ${input.slug}`)
  const newsletter = isNewsletter(post.newsletter) ? post.newsletter : undefined
  const body = await buildEmailBodyHtml(post)
  const unsubscribeUrl = `${siteConfig.url}/unsubscribe`
  const html = renderFullNewsletter({
    bodyHtml: body.html,
    newsletter,
    previewText: body.previewText,
    unsubscribeUrl,
  })
  await sendNewsletterEmail({
    to: input.email,
    subject: body.subject,
    html,
    previewText: body.previewText,
    unsubscribeUrl,
    unsubscribePostUrl: unsubscribeUrl,
  })
}

/** Renders and sends one queued email_sends row. Throws on SES failure. */
export async function sendQueuedEmail(row: {
  email: string
  subject: string | null
  htmlContent: string | null
  newsletter: string | null
  previewText: string | null
  unsubscribeToken: string
}): Promise<void> {
  const newsletter =
    row.newsletter && isNewsletter(row.newsletter) ? row.newsletter : undefined
  const unsubscribeUrl = `${siteConfig.url}/unsubscribe?token=${row.unsubscribeToken}`
  const unsubscribePostUrl = `${siteConfig.url}/api/unsubscribe/${row.unsubscribeToken}`
  const html = renderFullNewsletter({
    bodyHtml: row.htmlContent ?? '',
    newsletter,
    previewText: row.previewText,
    unsubscribeUrl,
  })
  await sendNewsletterEmail({
    to: row.email,
    subject: row.subject ?? '',
    html,
    previewText: row.previewText,
    unsubscribeUrl,
    unsubscribePostUrl,
  })
}
