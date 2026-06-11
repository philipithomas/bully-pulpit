import {
  DeleteSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  NotFoundException,
  SESv2Client,
  SendEmailCommand,
} from '@aws-sdk/client-sesv2'
import { siteConfig } from '@/lib/config'
import { buildMimeMessage, type MimeAttachment } from '@/lib/email/mime'

let client: SESv2Client | null = null

/**
 * Lazily-constructed SESv2 client. Credentials come from the AWS SDK default
 * provider chain (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars); region
 * from AWS_REGION (default us-east-1).
 */
function getSesClient(): SESv2Client {
  if (!client) {
    client = new SESv2Client({ region: siteConfig.awsRegion })
  }
  return client
}

/** A plain transactional email (sign-in code, admin notification). */
export async function sendSimpleEmail(input: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  await getSesClient().send(
    new SendEmailCommand({
      FromEmailAddress: siteConfig.sesFromEmail,
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: {
            Data: `${siteConfig.emailSubjectPrefix}${input.subject}`,
            Charset: 'UTF-8',
          },
          Body: {
            Html: { Data: input.html, Charset: 'UTF-8' },
            ...(input.text
              ? { Text: { Data: input.text, Charset: 'UTF-8' } }
              : {}),
          },
        },
      },
    })
  )
}

/**
 * A plain-text email with one file attachment (subscriber backup). SESv2
 * Simple content cannot carry attachments, so this sends Content.Raw with a
 * hand-rolled multipart/mixed MIME message (see @/lib/email/mime).
 */
export async function sendEmailWithAttachment(input: {
  to: string[]
  subject: string
  text: string
  attachment: MimeAttachment
}): Promise<void> {
  const raw = buildMimeMessage({
    from: siteConfig.sesFromEmail,
    to: input.to,
    subject: `${siteConfig.emailSubjectPrefix}${input.subject}`,
    text: input.text,
    attachment: input.attachment,
  })
  await getSesClient().send(
    new SendEmailCommand({
      FromEmailAddress: siteConfig.sesFromEmail,
      Destination: { ToAddresses: input.to },
      Content: { Raw: { Data: raw } },
    })
  )
}

/** Paginates the SES account-level suppression list (bounces/complaints). */
export async function listSuppressedDestinations(): Promise<
  Array<{ email: string; reason: string }>
> {
  const client = getSesClient()
  const result: Array<{ email: string; reason: string }> = []
  let nextToken: string | undefined
  do {
    const resp = await client.send(
      new ListSuppressedDestinationsCommand({ NextToken: nextToken })
    )
    for (const dest of resp.SuppressedDestinationSummaries ?? []) {
      if (dest.EmailAddress) {
        result.push({
          email: dest.EmailAddress,
          reason: dest.Reason ?? 'UNKNOWN',
        })
      }
    }
    nextToken = resp.NextToken
  } while (nextToken)
  return result
}

/**
 * Removes an address from the SES account-level suppression list. SES not
 * knowing the address counts as success: a suppression can exist only locally
 * (cleared in the SES console between polls), and the goal is the end state,
 * not the deletion itself. Anything else rethrows so callers can refuse to
 * clear local state SES would re-create.
 */
export async function deleteSuppressedDestination(
  email: string
): Promise<void> {
  try {
    await getSesClient().send(
      new DeleteSuppressedDestinationCommand({ EmailAddress: email })
    )
  } catch (err) {
    if (err instanceof NotFoundException) return
    throw err
  }
}

/**
 * A newsletter email with a plaintext alternative and the List-Unsubscribe /
 * List-Unsubscribe-Post headers for one-click unsubscribe (RFC 2369 + 8058).
 * SESv2 Simple content supports custom Headers, so no raw MIME is needed.
 */
export async function sendNewsletterEmail(input: {
  to: string
  subject: string
  html: string
  text?: string | null
  previewText?: string | null
  unsubscribeUrl: string
  unsubscribePostUrl?: string | null
}): Promise<void> {
  // Prefer a real plaintext rendering of the body so plaintext-only clients (and
  // spam filters comparing text vs html) get the actual content; fall back to the
  // preview text + subject when no body text is supplied.
  const body =
    input.text?.trim() ||
    (input.previewText
      ? `${input.previewText}\n\n${input.subject}`
      : input.subject)
  // The HTML shell carries an unsubscribe footer and a postal address; mirror
  // both here so the text/plain part stands alone (CAN-SPAM requires the
  // opt-out and the postal address in the message, and spam filters compare
  // the two parts). Appended at send time because the URL is per-recipient.
  // The address lines must match the footer in templates/newsletter-shell.ts.
  const year = new Date().getFullYear()
  const text = `${body}\n\n--\nUnsubscribe: ${input.unsubscribeUrl}\n© ${year}\nThe Contraption Company LLC\n169 Madison Ave. Suite 2174\nNew York, NY 10016 USA`

  // RFC 2369 List-Unsubscribe. The RFC 8058 one-click POST target is only added
  // when a POST URL is supplied (real per-recipient sends). Test sends omit it —
  // they have no per-recipient token, so a one-click POST would 405. When
  // List-Unsubscribe-Post is present, RFC 8058 section 3.1 permits exactly one
  // HTTPS URI in List-Unsubscribe (a receiver may POST to any URI listed, and a
  // POST to the manual landing page unsubscribes nobody), so the manual page URL
  // stays out of the header; the footer link in the body still carries it.
  const headers = input.unsubscribePostUrl
    ? [
        {
          Name: 'List-Unsubscribe',
          Value: `<${input.unsubscribePostUrl}>`,
        },
        { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
      ]
    : [{ Name: 'List-Unsubscribe', Value: `<${input.unsubscribeUrl}>` }]

  await getSesClient().send(
    new SendEmailCommand({
      FromEmailAddress: siteConfig.sesFromEmail,
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: {
            Data: `${siteConfig.emailSubjectPrefix}${input.subject}`,
            Charset: 'UTF-8',
          },
          Body: {
            Html: { Data: input.html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
          Headers: headers,
        },
      },
    })
  )
}
