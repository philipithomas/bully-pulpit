import {
  ListSuppressedDestinationsCommand,
  SESv2Client,
  SendEmailCommand,
} from '@aws-sdk/client-sesv2'
import { siteConfig } from '@/lib/config'

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
}): Promise<void> {
  await getSesClient().send(
    new SendEmailCommand({
      FromEmailAddress: siteConfig.sesFromEmail,
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: input.html, Charset: 'UTF-8' } },
        },
      },
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
  // The HTML shell carries an unsubscribe footer; mirror it here so the
  // text/plain part has a visible opt-out (CAN-SPAM, and spam filters compare
  // the two parts). Appended at send time because the URL is per-recipient.
  const text = `${body}\n\n—\nUnsubscribe: ${input.unsubscribeUrl}`

  // RFC 2369 List-Unsubscribe. The RFC 8058 one-click POST target is only added
  // when a POST URL is supplied (real per-recipient sends). Test sends omit it —
  // they have no per-recipient token, so a one-click POST would 405.
  const headers = input.unsubscribePostUrl
    ? [
        {
          Name: 'List-Unsubscribe',
          Value: `<${input.unsubscribePostUrl}>, <${input.unsubscribeUrl}>`,
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
          Subject: { Data: input.subject, Charset: 'UTF-8' },
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
