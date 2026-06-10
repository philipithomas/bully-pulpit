import { escapeHtml } from '@/lib/email/escape'

// Phone notification emails (voicemail, missed call, inbound SMS). Ported
// from junk-drawer's VoicemailMailer / MissedCallMailer / SmsMailer views,
// restyled on the warm palette to match the other transactional templates.

/** "2026-06-10 14:23 UTC" — ISO-8601 date and time, minute precision. */
function formatTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function detailRow(label: string, value: string): string {
  return `<p class="email-muted" style="margin: 0 0 4px; font-size: 13px; color: #7E7A73;">${escapeHtml(label)}:</p>
                  <p style="margin: 0 0 16px; font-size: 17px; font-weight: 600; color: #111110;">${escapeHtml(value)}</p>`
}

/**
 * Shared admin-notification shell: heading, a detail panel, and an optional
 * free-text section (transcription or message body). Includes the dark mode
 * meta tags and prefers-color-scheme overrides; inline styles stay the
 * light-mode source of truth.
 */
function renderPhoneNotification(input: {
  title: string
  heading: string
  details: Array<[label: string, value: string]>
  sectionTitle?: string
  sectionBody?: string
  footnote?: string
}): string {
  const year = new Date().getFullYear()
  const details = input.details
    .map(([label, value]) => detailRow(label, value))
    .join('\n                  ')
  const section =
    input.sectionTitle && input.sectionBody
      ? `<h2 style="margin: 24px 0 8px; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 16px; font-weight: 600; color: #111110;">${escapeHtml(input.sectionTitle)}</h2>
            <p style="margin: 0 0 16px; font-family: 'Tiempos Text', Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #3B3834;">${escapeHtml(input.sectionBody)}</p>`
      : ''
  const footnote = input.footnote
    ? `<p class="email-muted" style="margin: 8px 0 0; font-size: 13px; line-height: 1.5; color: #7E7A73;">${escapeHtml(input.footnote)}</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.title)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; background-color: #F5F3F0; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-halbfett.woff2') format('woff2'); font-weight: 600; font-display: swap; }
  @font-face { font-family: 'Tiempos Text'; src: url('https://fonts.philipithomas.com/klim/tiempos-text-regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  /* Dark mode: inline styles stay the light-mode source of truth; these
     overrides re-skin clients that honor prefers-color-scheme. */
  @media (prefers-color-scheme: dark) {
    body, .email-body, .email-bg { background-color: #121110 !important; }
    .email-card { background-color: #1C1A17 !important; }
    .email-panel { background-color: #262220 !important; }
    .email-card h1, .email-card h2 { color: #ECE9E4 !important; }
    .email-card p { color: #ECE9E4 !important; }
    .email-card p.email-muted { color: #A8A49D !important; }
    .email-divider { border-top-color: #3A362F !important; }
  }
</style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #F5F3F0;">
<table class="email-bg" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F3F0;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <table class="email-card" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 4px;">
        <tr>
          <td style="padding: 40px 40px 20px;">
            <h1 style="margin: 0 0 24px; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 22px; font-weight: 600; color: #111110; line-height: 1.3;">${escapeHtml(input.heading)}</h1>
            <table class="email-panel" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F5F3F0; border-radius: 4px;">
              <tr>
                <td style="padding: 20px 24px;">
                  ${details}
                </td>
              </tr>
            </table>
            ${section}
            ${footnote}
          </td>
        </tr>
        <tr>
          <td class="email-divider" style="padding: 20px 40px 32px; border-top: 1px solid #E0DDD8;">
            <p class="email-muted" style="margin: 0; font-size: 11px; line-height: 1.5; color: #9E9A93; text-align: center;">
              &copy; ${year} The Contraption Company LLC<br>
              169 Madison Ave. Suite 2174, New York, NY 10016 USA
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

function renderPhoneNotificationText(input: {
  heading: string
  details: Array<[label: string, value: string]>
  sectionTitle?: string
  sectionBody?: string
  footnote?: string
}): string {
  const lines = [
    input.heading,
    '',
    ...input.details.map(([label, value]) => `${label}: ${value}`),
  ]
  if (input.sectionTitle && input.sectionBody) {
    lines.push('', `${input.sectionTitle}:`, input.sectionBody)
  }
  if (input.footnote) {
    lines.push('', input.footnote)
  }
  return lines.join('\n')
}

// --- Voicemail ---

export type VoicemailEmailInput = {
  from: string
  to: string
  toLabel: string
  durationSeconds: string
  transcription: string
  receivedAt: Date
}

function voicemailContent(input: VoicemailEmailInput) {
  return {
    heading: 'New voicemail',
    details: [
      ['From', input.from],
      ['To', `${input.to} (${input.toLabel})`],
      ['Duration', `${input.durationSeconds} seconds`],
      ['Received', formatTimestamp(input.receivedAt)],
    ] as Array<[string, string]>,
    sectionTitle: 'Transcription',
    sectionBody: input.transcription,
    footnote: 'The audio recording is attached.',
  }
}

export function renderVoicemailEmail(input: VoicemailEmailInput): string {
  return renderPhoneNotification({
    title: `Voicemail from ${input.from}`,
    ...voicemailContent(input),
  })
}

export function renderVoicemailText(input: VoicemailEmailInput): string {
  return renderPhoneNotificationText(voicemailContent(input))
}

// --- Missed call ---

export type MissedCallEmailInput = {
  from: string
  to: string
  toLabel: string
  greeting: string
  receivedAt: Date
}

function missedCallContent(input: MissedCallEmailInput) {
  return {
    heading: 'Incoming call',
    details: [
      ['From', input.from],
      ['To', `${input.to} (${input.toLabel})`],
      ['Received', formatTimestamp(input.receivedAt)],
    ] as Array<[string, string]>,
    sectionTitle: 'Greeting played',
    sectionBody: input.greeting,
    footnote:
      'If the caller leaves a voicemail, a transcription follows in a separate email.',
  }
}

export function renderMissedCallEmail(input: MissedCallEmailInput): string {
  return renderPhoneNotification({
    title: `Missed call from ${input.from}`,
    ...missedCallContent(input),
  })
}

export function renderMissedCallText(input: MissedCallEmailInput): string {
  return renderPhoneNotificationText(missedCallContent(input))
}

// --- Inbound SMS ---

export type IncomingSmsEmailInput = {
  from: string
  to: string
  toLabel: string
  body: string
  receivedAt: Date
}

function incomingSmsContent(input: IncomingSmsEmailInput) {
  return {
    heading: 'New text message',
    details: [
      ['From', input.from],
      ['To', `${input.to} (${input.toLabel})`],
      ['Received', formatTimestamp(input.receivedAt)],
    ] as Array<[string, string]>,
    sectionTitle: 'Message',
    sectionBody: input.body,
  }
}

export function renderIncomingSmsEmail(input: IncomingSmsEmailInput): string {
  return renderPhoneNotification({
    title: `SMS from ${input.from}`,
    ...incomingSmsContent(input),
  })
}

export function renderIncomingSmsText(input: IncomingSmsEmailInput): string {
  return renderPhoneNotificationText(incomingSmsContent(input))
}
