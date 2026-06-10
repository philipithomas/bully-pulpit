import { escapeHtml } from '@/lib/email/escape'

/**
 * 'confirm' for a new or still-unconfirmed subscription, 'sign-in' for a
 * returning confirmed member. Same OTP and magic-link mechanics; only the copy
 * changes.
 */
export type ConfirmationPurpose = 'confirm' | 'sign-in'

export type ConfirmationInput = {
  code: string
  magicLink: string
  purpose?: ConfirmationPurpose
  /** Newsletter display names the confirm copy mentions, e.g. ['Contraption', 'Postcard']. */
  newsletters?: string[]
}

/** Joins names per the colophon list style: "A", "A and B", "A, B, and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

const SITE_LINK_HTML =
  '<a href="https://www.philipithomas.com" style="color: #3B3834; text-decoration: none; font-weight: 600;">philipithomas.com</a>'

type Copy = {
  title: string
  introHtml: string
  introText: string
  linkLineHtml: string
  linkLineText: string
  buttonLabel: string
  footer: string
}

function copyFor(input: ConfirmationInput): Copy {
  if ((input.purpose ?? 'sign-in') === 'confirm') {
    const list = joinNames(input.newsletters ?? [])
    return {
      title: 'Confirm your subscription',
      introHtml: list
        ? `Thanks for subscribing to ${escapeHtml(list)} at ${SITE_LINK_HTML}. Enter this code to confirm your subscription:`
        : `Thanks for subscribing to ${SITE_LINK_HTML}. Enter this code to confirm your subscription:`,
      introText: list
        ? `Thanks for subscribing to ${list} at philipithomas.com. Enter this code to confirm your subscription:`
        : 'Thanks for subscribing to philipithomas.com. Enter this code to confirm your subscription:',
      linkLineHtml: 'Or click the link below to confirm directly:',
      linkLineText: 'Or use this link to confirm directly:',
      buttonLabel: 'Confirm subscription',
      footer:
        'This code expires in 15 minutes. If you did not sign up, you can safely ignore this email and you will not receive any newsletters.',
    }
  }
  return {
    title: 'Your sign-in code',
    introHtml: `Your sign-in code for ${SITE_LINK_HTML} is:`,
    introText: 'Your sign-in code for philipithomas.com is:',
    linkLineHtml: 'Or click the link below to sign in directly:',
    linkLineText: 'Or use this link to sign in directly:',
    buttonLabel: 'Sign in now',
    footer:
      'This code expires in 15 minutes. If you did not request this, you can safely ignore this email.',
  }
}

/** Confirmation / sign-in email with a 6-digit code and a magic link. Ported from confirmation.html. */
export function renderConfirmationEmail(input: ConfirmationInput): string {
  const code = escapeHtml(input.code)
  const magicLink = escapeHtml(input.magicLink)
  const copy = copyFor(input)
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${copy.title}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; background-color: #F5F3F0; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-halbfett.woff2') format('woff2'); font-weight: 600; font-display: swap; }
  @font-face { font-family: 'Sohne Mono'; src: url('https://fonts.philipithomas.com/klim/soehne-mono-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  /* Dark mode: inline styles stay the light-mode source of truth; these
     overrides re-skin clients that honor prefers-color-scheme. */
  @media (prefers-color-scheme: dark) {
    body, .email-body, .email-bg { background-color: #121110 !important; }
    .email-card { background-color: #1C1A17 !important; }
    .email-card p { color: #D7D3CC !important; }
    .email-card a, .email-card span { color: #ECE9E4 !important; }
    .email-card p.email-muted { color: #A8A49D !important; }
    .email-card a.email-button { background-color: #ECE9E4 !important; color: #121110 !important; }
    .email-divider { border-top-color: #3A362F !important; }
  }
</style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #F5F3F0;">
<table class="email-bg" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F3F0;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <!--[if mso]>
      <table border="0" cellpadding="0" cellspacing="0" width="540" align="center"><tr><td>
      <![endif]-->
      <table class="email-card" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 4px;">
        <tr>
          <td style="padding: 40px 40px 20px;">
            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5; color: #3B3834;">
              Hey,
            </p>
            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5; color: #3B3834;">
              ${copy.introHtml}
            </p>
            <div style="text-align: center; padding: 20px 0 28px;">
              <span style="font-family: 'Sohne Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 32px; font-weight: 600; letter-spacing: 0.3em; color: #111110;">${code}</span>
            </div>
            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5; color: #3B3834;">
              ${copy.linkLineHtml}
            </p>
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding: 0 0 28px;">
                  <a class="email-button" href="${magicLink}" style="display: inline-block; background-color: #111110; color: #ffffff; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px;">${copy.buttonLabel} &rarr;</a>
                </td>
              </tr>
            </table>
            <p class="email-muted" style="margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: #7E7A73;">
              ${copy.footer}
            </p>
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
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`
}

/**
 * Plaintext alternative for the confirmation / sign-in email. Built from the
 * RAW code and link (escapeHtml belongs only to the HTML part) and mirrors the
 * HTML's full content — spam filters compare the two parts for consistency.
 */
export function renderConfirmationText(input: ConfirmationInput): string {
  const copy = copyFor(input)
  const year = new Date().getFullYear()
  return [
    'Hey,',
    '',
    copy.introText,
    '',
    input.code,
    '',
    copy.linkLineText,
    '',
    input.magicLink,
    '',
    copy.footer,
    '',
    '--',
    `© ${year} The Contraption Company LLC`,
    '169 Madison Ave. Suite 2174, New York, NY 10016 USA',
  ].join('\n')
}
