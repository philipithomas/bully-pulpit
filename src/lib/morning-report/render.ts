import { escapeHtml } from '@/lib/email/escape'
import { toVercelImageUrl } from '@/lib/email/images'
import type {
  MorningReportContent,
  MorningReportCopy,
} from '@/lib/morning-report/content'
import { siteIdentity } from '@/lib/site-identity'

function link(url: string, text: string): string {
  return `<a href="${escapeHtml(url)}" style="color:#2B4A3E;text-decoration:underline;">${escapeHtml(text)}</a>`
}

export function renderMorningReport(
  content: MorningReportContent,
  copy: MorningReportCopy
): { html: string; text: string } {
  const anniversaryHeading = (years: number) =>
    `${years === 1 ? 'One year' : `${years} years`} ago today`
  const history = content.anniversaries.length
    ? content.anniversaries
        .map(
          (post) =>
            `<h3 style="margin:20px 0 6px;font-size:16px;">${anniversaryHeading(post.yearsAgo)}</h3><p style="margin:0 0 6px;">${link(post.url, post.title)}</p><p style="margin:0;color:#625e58;">${escapeHtml(post.excerpt)}</p>`
        )
        .join('')
    : '<p>No earlier posts were published on this date.</p>'
  const itemHtml = (item: MorningReportContent['word']) =>
    `<p style="margin:0 0 8px;font-size:20px;">${link(item.url, item.term)}</p><p style="margin:0;">${escapeHtml(item.definition)}${item.suffix ? ` ${escapeHtml(item.suffix)}` : ''}</p>${item.reference ? `<p style="margin:8px 0 0;font-size:14px;">${link(item.reference.href, item.reference.label)}</p>` : ''}`
  const photo = content.photo
  const imageUrl = photo
    ? toVercelImageUrl(siteIdentity.productionUrl, photo.image, 640)
    : null
  const displayDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${content.date}T12:00:00Z`))
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(copy.subject)}</title><style>@media(prefers-color-scheme:dark){body,.email-bg{background:#121110!important}.email-card{background:#1c1a17!important;color:#ece9e4!important}.email-card p{color:#ece9e4!important}.email-card a{color:#b7cbbb!important}}</style></head><body style="margin:0;background:#f5f3f0;"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(copy.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background:#f5f3f0;"><tr><td align="center" style="padding:24px 12px;"><!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-card" style="max-width:640px;background:#ffffff;color:#3b3834;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.6;"><tr><td style="padding:28px 24px;"><p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:13px;color:#625e58;">${escapeHtml(displayDate)} · New York</p><h1 style="margin:0 0 20px;font-size:30px;font-weight:normal;">Morning report</h1><p>${escapeHtml(copy.introduction)}</p><h2 style="margin:28px 0 12px;font-size:23px;font-weight:normal;">On this day</h2>${history}<h2 style="margin:28px 0 12px;font-size:23px;font-weight:normal;">Word of the day</h2>${itemHtml(content.word)}<h2 style="margin:28px 0 12px;font-size:23px;font-weight:normal;">Contraption of the day</h2>${itemHtml(content.contraption)}${photo ? `<h2 style="margin:28px 0 12px;font-size:23px;font-weight:normal;">Photo of the day</h2><a href="${escapeHtml(photo.url)}"><img src="${escapeHtml(imageUrl!)}" alt="${escapeHtml(photo.alt)}" width="592" style="display:block;width:100%;max-width:592px;height:auto;border:0;"></a><p style="margin:12px 0 4px;">${link(photo.url, photo.title)}</p><p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#625e58;">${escapeHtml(photo.caption)}</p>` : ''}<p style="border-top:1px solid #e0ddd8;margin:28px 0 0;padding-top:16px;font-family:Arial,sans-serif;font-size:12px;color:#625e58;">A daily selection for the site administrators. ${link(siteIdentity.productionUrl, 'Visit the site')}</p></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`
  const itemText = (title: string, item: MorningReportContent['word']) =>
    [
      title,
      item.term,
      item.definition,
      item.suffix,
      item.url,
      item.reference?.href,
    ]
      .filter(Boolean)
      .join('\n')
  const text = [
    `Morning report · ${content.date} · New York`,
    copy.introduction,
    'On this day',
    content.anniversaries.length
      ? content.anniversaries
          .map(
            (post) =>
              `${anniversaryHeading(post.yearsAgo)}\n${post.title}\n${post.excerpt}\n${post.url}`
          )
          .join('\n\n')
      : 'No earlier posts were published on this date.',
    itemText('Word of the day', content.word),
    itemText('Contraption of the day', content.contraption),
    photo
      ? `Photo of the day\n${photo.title}\n${photo.alt}\n${photo.caption}\n${photo.url}`
      : null,
    `A daily selection for the site administrators.\n${siteIdentity.productionUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return { html, text }
}
