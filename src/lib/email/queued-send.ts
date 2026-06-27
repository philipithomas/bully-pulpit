import { siteConfig } from '@/lib/config'
import { isNewsletter, type NewsletterSlug } from '@/lib/db/queries/subscribers'
import { transformEmailBody } from '@/lib/email/content-transforms'
import { sendNewsletterEmail } from '@/lib/email/ses'
import { renderNewsletterShell } from '@/lib/email/templates/newsletter-shell'

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

/** Renders and sends one queued email_sends row. Throws on SES failure. */
export async function sendQueuedEmail(row: {
  email: string
  subject: string | null
  htmlContent: string | null
  textContent: string | null
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
    text: row.textContent,
    previewText: row.previewText,
    unsubscribeUrl,
    unsubscribePostUrl,
  })
}
