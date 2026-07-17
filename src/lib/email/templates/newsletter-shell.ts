import { siteConfig } from '@/lib/config'
import type { NewsletterSlug } from '@/lib/db/queries/subscribers'
import { escapeHtml } from '@/lib/email/escape'
import { isPhotoNewsletter } from '@/lib/newsletters'

// Preheader padding: zero-width characters that stop email clients from pulling
// body text into the inbox preview after the real preheader. Ported verbatim
// from printing-press's newsletter.html.
const PREHEADER_SPACER = `${'&#8199;&#847; '.repeat(120)}${'&shy; '.repeat(150)}&nbsp;`

// Lightened accent tints for dark mode: the light-mode accents (forest
// #2B4A3E, walnut #6B4D3A, indigo #2C3E6B) disappear against a near-black
// background, so link underlines swap to these in the dark override.
const darkAccentColors: Record<NewsletterSlug, string> = {
  contraption: '#8FB8A5',
  workshop: '#C29B7E',
  postcard: '#97A8D9',
  umami: '#F2712C',
  tsundoku: '#FF7A82',
}
const DEFAULT_DARK_ACCENT = '#A8A49D'
const backgroundColors: Record<NewsletterSlug, string> = {
  contraption: '#ffffff',
  workshop: '#ffffff',
  postcard: '#ffffff',
  umami: '#f1ebe5',
  tsundoku: '#f4f4f2',
}

// Each newsletter wordmark is a solid-ink PNG on transparency. Writing brands
// swap to a cream *-email-dark.png in dark mode. The brighter photo brands use
// one mark in both schemes; that avoids unreliable SVG email support while
// preserving their identifying color.
const wordmarks: Record<
  NewsletterSlug,
  { name: string; file: string; width: number; height: number }
> = {
  contraption: {
    name: 'Contraption',
    file: 'contraption',
    width: 95,
    height: 17,
  },
  workshop: { name: 'Workshop', file: 'workshop-brand', width: 87, height: 24 },
  postcard: { name: 'Postcard', file: 'postcard', width: 79, height: 18 },
  umami: { name: 'umami', file: 'umami', width: 102, height: 24 },
  tsundoku: { name: 'Tsundoku', file: 'tsundoku', width: 157, height: 24 },
}

function brandHeader(newsletter: NewsletterSlug | '', siteUrl: string): string {
  if (newsletter === '') {
    return `<a class="email-brand-text" href="${siteUrl}" style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #111110; text-decoration: none;">philipithomas.com</a>`
  }
  const mark = wordmarks[newsletter]
  const dims = `height: ${mark.height}px; width: ${mark.width}px;`
  if (isPhotoNewsletter(newsletter)) {
    return `<a href="${siteUrl}/${newsletter}" style="text-decoration: none;">
              <img class="email-brand-${newsletter}" src="${siteUrl}/images/${mark.file}-email.png" alt="${mark.name}" width="${mark.width}" height="${mark.height}" style="${dims}">
            </a>`
  }
  return `<a href="${siteUrl}/${newsletter}" style="text-decoration: none;">
              <img class="email-brand-light" src="${siteUrl}/images/${mark.file}-email.png" alt="${mark.name}" width="${mark.width}" height="${mark.height}" style="${dims}">
              <img class="email-brand-dark" src="${siteUrl}/images/${mark.file}-email-dark.png" alt="${mark.name}" width="${mark.width}" height="${mark.height}" style="${dims} display: none;">
            </a>`
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
  const isPhoto = input.newsletter ? isPhotoNewsletter(input.newsletter) : false
  const bgColor = input.newsletter
    ? backgroundColors[input.newsletter]
    : '#ffffff'
  const cardBgColor = isPhoto ? bgColor : '#ffffff'
  const brandPadding = isPhoto ? '36px 20px 28px' : '40px 20px 0'
  const contentPadding = isPhoto ? '0 32px 32px' : '32px'
  const mobileContentPadding = isPhoto ? '0 20px 24px' : '24px 20px'
  const footerPadding = isPhoto ? '12px 20px 28px' : '20px'
  const contentCellClass = isPhoto
    ? `content-cell content-cell-${input.newsletter}`
    : 'content-cell'
  const cardClass = isPhoto
    ? `email-card email-card-${input.newsletter}`
    : 'email-card'
  const photoDarkOverrides = isPhoto
    ? `
    .email-card-${input.newsletter} { background-color: #121110 !important; }
    img.email-brand-${input.newsletter} { display: inline-block !important; opacity: 1 !important; }`
    : ''
  const darkAccent = input.newsletter
    ? darkAccentColors[input.newsletter]
    : DEFAULT_DARK_ACCENT
  const year = new Date().getFullYear()
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl)
  const previewText = input.previewText ? escapeHtml(input.previewText) : ''

  const preheader = previewText
    ? `<span class="preheader">${previewText}</span>
<div style="display:none; max-height:0; overflow:hidden; mso-hide: all;" aria-hidden="true" role="presentation">${PREHEADER_SPACER}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(siteConfig.title)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; background-color: ${bgColor}; font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Sohne'; src: url('https://fonts.philipithomas.com/klim/soehne-halbfett.woff2') format('woff2'); font-weight: 600; font-display: swap; }
  @font-face { font-family: 'Sohne Mono'; src: url('https://fonts.philipithomas.com/klim/soehne-mono-buch.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  @font-face { font-family: 'Tiempos Text'; src: url('https://fonts.philipithomas.com/klim/tiempos-text-regular.woff2') format('woff2'); font-weight: 400; font-display: swap; }
  .preheader { color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0; }
  .content-cell { overflow-wrap: anywhere; word-break: break-word; }
  .content-cell img { max-width: 100% !important; height: auto !important; }
  @media (max-width: 620px) {
    .content-cell { padding: ${mobileContentPadding} !important; }
  }
  /* Dark mode: inline styles stay the light-mode source of truth; these
     overrides re-skin clients that honor prefers-color-scheme (Apple Mail,
     iOS Mail, Outlook web). Warm near-black surfaces, warm light gray text,
     lightened accent underlines. Images keep their colors: no filters. */
  @media (prefers-color-scheme: dark) {
    body, .email-body, .email-bg { background-color: #121110 !important; }
    .email-card { background-color: #1C1A17 !important; }
    .content-cell, .content-cell p, .content-cell li, .content-cell ul, .content-cell ol { color: #D7D3CC !important; }
    .content-cell h1, .content-cell h2, .content-cell h3, .content-cell h4, .content-cell h5, .content-cell h6, .content-cell strong { color: #ECE9E4 !important; }
    .content-cell a { color: #ECE9E4 !important; text-decoration-color: ${darkAccent} !important; }
    .content-cell h1 a, .content-cell h2 a, .content-cell h3 a { color: #ECE9E4 !important; }
    .content-cell blockquote { color: #BEBAB3 !important; border-left-color: #4A463F !important; }
    .content-cell code { background-color: #2A2723 !important; color: #D7D3CC !important; }
    .content-cell pre, .content-cell pre code { background-color: #222120 !important; color: #E0DDD8 !important; }
    .content-cell table { color: #D7D3CC !important; border-top-color: #3A362F !important; }
    .content-cell td, .content-cell th { border-bottom-color: #3A362F !important; }
    .content-cell hr { border-top-color: #3A362F !important; }
    .content-cell img { opacity: 0.92; }
    .email-footer p, .email-footer a { color: #A8A49D !important; }
    img.email-brand-light { display: none !important; }
    img.email-brand-dark { display: inline-block !important; }
    a.email-brand-text { color: #ECE9E4 !important; }${photoDarkOverrides}
  }
</style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: ${bgColor};">
${preheader}
<table class="email-bg" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${bgColor};">
  <tr>
    <td align="center" style="padding: ${brandPadding};">
      <!--[if mso]>
      <table border="0" cellpadding="0" cellspacing="0" width="600" align="center"><tr><td>
      <![endif]-->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
        <tr>
          <td style="padding: 0; text-align: center;">
            ${brandHeader(input.newsletter ?? '', siteUrl)}
          </td>
        </tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 0 20px;">
      <!--[if mso]>
      <table border="0" cellpadding="0" cellspacing="0" width="600" align="center"><tr><td>
      <![endif]-->
      <table class="${cardClass}" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: ${cardBgColor};">
        <tr>
          <td class="${contentCellClass}" style="padding: ${contentPadding}; font-family: 'Tiempos Text', Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.6; color: #3B3834; overflow: hidden; word-break: break-word;">
            ${input.content}
          </td>
        </tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: ${footerPadding};">
      <!--[if mso]>
      <table border="0" cellpadding="0" cellspacing="0" width="600" align="center"><tr><td>
      <![endif]-->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
        <tr>
          <td class="email-footer" style="text-align: center; padding: 16px 0;">
            <p style="margin: 0 0 8px; font-size: 11px; color: #9E9A93;">
              <a href="${unsubscribeUrl}" style="color: #9E9A93; text-decoration: underline;">Unsubscribe</a>
            </p>
            <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #9E9A93;">
              &copy; ${year}<br>
              The Contraption Company LLC<br>
              169 Madison Ave. Suite 2174<br>
              New York, NY 10016 USA
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
