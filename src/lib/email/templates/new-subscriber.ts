import { escapeHtml } from '@/lib/email/escape'

/** Admin notification sent on a subscriber's first confirmation. Ported from new_subscriber.html. */
export function renderNewSubscriberEmail(input: {
  email: string
  name?: string | null
  source?: string | null
}): string {
  const email = escapeHtml(input.email)
  const year = new Date().getFullYear()

  const nameBlock = input.name
    ? `<p class="email-muted" style="margin: 0 0 4px; font-size: 13px; color: #7E7A73;">Name:</p>
                  <p style="margin: 0 0 16px; font-size: 17px; font-weight: 600; color: #111110;">${escapeHtml(input.name)}</p>`
    : ''

  const sourceBlock = input.source
    ? `<p class="email-muted" style="margin: 0 0 4px; font-size: 13px; color: #7E7A73;">Source:</p>
                  <p style="margin: 0 0 16px; font-size: 17px; font-weight: 600; color: #111110;">${escapeHtml(input.source)}</p>`
    : `<p class="email-muted" style="margin: 0 0 16px; font-size: 13px; color: #7E7A73;">Source: Direct</p>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>New subscriber: ${email}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; background-color: #F5F3F0; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-halbfett.woff2') format('woff2'); font-weight: 600; font-display: swap; }
  /* Dark mode: inline styles stay the light-mode source of truth; these
     overrides re-skin clients that honor prefers-color-scheme. */
  @media (prefers-color-scheme: dark) {
    body, .email-body, .email-bg { background-color: #121110 !important; }
    .email-card { background-color: #1C1A17 !important; }
    .email-panel { background-color: #262220 !important; }
    .email-card h1 { color: #ECE9E4 !important; }
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
            <h1 style="margin: 0 0 24px; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 22px; font-weight: 600; color: #111110; line-height: 1.3;">New subscriber</h1>
            <table class="email-panel" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F5F3F0; border-radius: 4px;">
              <tr>
                <td style="padding: 20px 24px;">
                  ${nameBlock}
                  <p class="email-muted" style="margin: 0 0 4px; font-size: 13px; color: #7E7A73;">Email:</p>
                  <p style="margin: 0 0 16px; font-size: 17px; font-weight: 600; color: #111110;">${email}</p>
                  ${sourceBlock}
                </td>
              </tr>
            </table>
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
