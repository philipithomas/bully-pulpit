import { siteConfig } from '@/lib/config'
import { getPostBySlug } from '@/lib/content/loader'
import { isNewsletter } from '@/lib/db/queries/subscribers'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { renderFullNewsletter } from '@/lib/email/queued-send'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { sendNewsletterEmail, sendSimpleEmail } from '@/lib/email/ses'
import {
  type ConfirmationPurpose,
  renderConfirmationEmail,
  renderConfirmationText,
} from '@/lib/email/templates/confirmation'
import {
  renderNewSubscriberEmail,
  renderNewsletterOptInEmail,
} from '@/lib/email/templates/new-subscriber'
import {
  isE164,
  ownerPhoneNumber,
  requireSitePhoneNumber,
} from '@/lib/phone/config'
import { renderNewsletterSms } from '@/lib/phone/newsletter-sms'
import { sendSms } from '@/lib/phone/twilio'

export { renderFullNewsletter, sendQueuedEmail } from '@/lib/email/queued-send'

// --- Transactional emails (sent synchronously in the request path) ---

export async function sendConfirmation(
  email: string,
  code: string,
  magicLink: string,
  options?: { purpose?: ConfirmationPurpose; newsletters?: string[] }
): Promise<void> {
  const purpose = options?.purpose ?? 'sign-in'
  const input = { code, magicLink, purpose, newsletters: options?.newsletters }
  await sendSimpleEmail({
    to: email,
    subject:
      purpose === 'confirm'
        ? 'Confirm your subscription to philipithomas.com'
        : 'Your sign-in code for philipithomas.com',
    html: renderConfirmationEmail(input),
    text: renderConfirmationText(input),
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

export async function sendNewsletterOptInNotification(
  email: string,
  newsletter: string
): Promise<void> {
  const html = renderNewsletterOptInEmail({ email, newsletter })
  await sendSimpleEmail({
    to: siteConfig.sesFromEmail,
    subject: `${newsletter} opt-in: ${email}`,
    html,
  })
}

// --- Newsletter rendering ---

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
    text: body.bodyText,
    previewText: body.previewText,
    unsubscribeUrl,
    // Test sends have no per-recipient token, so omit the one-click POST target.
  })
}

/** Sends a single test SMS copy of a post's newsletter to the owner phone. */
export async function sendNewsletterSmsToTestRecipient(input: {
  slug: string
}): Promise<{ sentTo: string }> {
  const to = ownerPhoneNumber()
  if (!to) {
    throw new Error('OWNER_PHONE_NUMBER is not configured')
  }
  if (!isE164(to)) {
    throw new Error('OWNER_PHONE_NUMBER must be an E.164 number')
  }

  const post = getPostBySlug(input.slug)
  if (!post) throw new Error(`Post not found: ${input.slug}`)
  if (!isNewsletter(post.newsletter)) {
    throw new Error(`Post is not a sendable newsletter: ${input.slug}`)
  }

  const body = renderNewsletterSms(post)
  const from = requireSitePhoneNumber()
  try {
    const result = await sendSms({ from, to, body })
    await createTextMessage({
      fromNumber: from,
      toNumber: to,
      body,
      direction: 'outbound',
      twilioSid: result.sid,
      status: result.status,
    })
  } catch (err) {
    await createTextMessage({
      fromNumber: from,
      toNumber: to,
      body,
      direction: 'outbound',
      twilioSid: null,
      status: 'failed',
    })
    throw err
  }

  return { sentTo: to }
}
