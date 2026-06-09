import { siteConfig } from '@/lib/config'
import type { NewsletterSlug } from '@/lib/db/queries/subscribers'
import { escapeHtml } from '@/lib/email/escape'

// Preheader padding: zero-width characters that stop email clients from pulling
// body text into the inbox preview after the real preheader. Ported verbatim
// from printing-press's newsletter.html.
const PREHEADER_SPACER = `${'&#8199;&#847; '.repeat(120)}${'&shy; '.repeat(150)}&nbsp;`

function brandHeader(newsletter: NewsletterSlug | '', siteUrl: string): string {
  switch (newsletter) {
    case 'contraption':
      return `<a href="${siteUrl}/contraption" style="text-decoration: none;">
              <img src="${siteUrl}/images/contraption-email.png" alt="Contraption" width="95" height="17" style="height: 17px; width: 95px;">
            </a>`
    case 'workshop':
      return `<a href="${siteUrl}/workshop" style="text-decoration: none;">
              <img src="${siteUrl}/images/workshop-brand-email.png" alt="Workshop" width="87" height="24" style="height: 24px; width: 87px;">
            </a>`
    case 'postcard':
      return `<a href="${siteUrl}/postcard" style="text-decoration: none;">
              <img src="${siteUrl}/images/postcard-email.png" alt="Postcard" width="79" height="18" style="height: 18px; width: 79px;">
            </a>`
    default:
      return `<a href="${siteUrl}" style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #111110; text-decoration: none;">philipithomas.com</a>`
  }
}

/**
 * Wraps already-rendered, transformed body HTML in the responsive newsletter
 * shell (branding header, content cell, footer with unsubscribe). Ported from
 * printing-press's newsletter.html. `content` is trusted, sanitized HTML.
 */
export function renderNewsletterShell(input: {
  content: string
  unsubscribeUrl: string
  newsletter?: NewsletterSlug
  previewText?: string | null
  siteUrl?: string
}): string {
  const siteUrl = input.siteUrl ?? siteConfig.url
  const bgColor = '#ffffff'
  const year = new Date().getFullYear()
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl)
  const previewText = input.previewText ? escapeHtml(input.previewText) : ''

  const preheader = previewText
    ? `<span class="preheader">${previewText}</span>
<div style="display:none; max-height:0; overflow:hidden; mso-hide: all;" aria-hidden="true" role="presentation">${PREHEADER_SPACER}</div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(siteConfig.title)}</title>
<style>
  body { margin: 0; padding: 0; background-color: ${bgColor}; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-halbfett.woff2') format('woff2'); font-weight: 600; font-display: swap; }
  @font-face { font-family: 'Sohne Mono'; src: url('https://fonts.philipithomas.com/klim/soehne-mono-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Tiempos Text'; src: url('https://fonts.philipithomas.com/klim/tiempos-text-regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  .preheader { color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0; }
  .content-cell { overflow-wrap: anywhere; word-break: break-word; }
  .content-cell img { max-width: 100% !important; height: auto !important; }
  @media (max-width: 620px) {
    .content-cell { padding: 24px 20px !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: ${bgColor};">
${preheader}
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${bgColor};">
  <tr>
    <td align="center" style="padding: 40px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
        <tr>
          <td style="padding: 0; text-align: center;">
            ${brandHeader(input.newsletter ?? '', siteUrl)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 0 20px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff;">
        <tr>
          <td class="content-cell" style="padding: 32px; font-family: 'Tiempos Text', Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.6; color: #3B3834; overflow: hidden; word-break: break-word;">
            ${input.content}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 20px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
        <tr>
          <td style="text-align: center; padding: 16px 0;">
            <p style="margin: 0 0 8px; font-size: 11px; color: #9E9A93;">
              <a href="${unsubscribeUrl}" style="color: #9E9A93; text-decoration: underline;">Unsubscribe</a>
            </p>
            <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #9E9A93;">
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
