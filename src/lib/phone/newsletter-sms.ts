import { siteConfig } from '@/lib/config'
import type { Post } from '@/lib/content/types'
import { newsletterUsesCoverMms } from '@/lib/newsletters'

const MAX_SMS_BODY_LENGTH = 1500
const STOP_FOOTER = '(Reply STOP to unsubscribe.)'
const MMS_COVER_IMAGE_PATH = /^\/images\/[^?#\\]+\.(?:jpe?g|png)$/i
const MAX_MMS_COVER_PATH_LENGTH = 512

function trimForSms(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 3) return value.slice(0, maxLength)
  return `${value.slice(0, maxLength - 3).trimEnd()}...`
}

function postUrl(post: Post): string {
  const url = new URL(`/${post.slug}`, siteConfig.url)
  url.searchParams.set('utm_source', 'sms')
  return url.toString()
}

export function renderNewsletterSms(post: Post): string {
  const newsletter = siteConfig.newsletters[post.newsletter].name
  const url = postUrl(post)
  const suffix = `\n${url}\n\n${STOP_FOOTER}`
  const prefix = `New ${newsletter} post:\n`
  const title = trimForSms(
    post.frontmatter.title,
    MAX_SMS_BODY_LENGTH - prefix.length - suffix.length
  )
  return `${prefix}${title}${suffix}`
}

/**
 * Public, optimized JPEG or PNG rendition used by Twilio for photography-
 * newsletter MMS. Versioning the URL with the source path prevents a renamed
 * cover from reusing a stale CDN object while keeping every recipient on one
 * cache key.
 */
export function newsletterSmsMediaUrl(post: Post): string | undefined {
  const coverImage = post.frontmatter.coverImage
  if (
    !isNewsletterMmsCoverPath(coverImage) ||
    !newsletterUsesCoverMms(post.newsletter)
  ) {
    return undefined
  }

  const url = new URL(
    `/api/phone/newsletter-cover/${encodeURIComponent(post.slug)}`,
    siteConfig.url
  )
  url.searchParams.set('v', coverImage)
  return url.toString()
}

export function isNewsletterMmsCoverPath(
  coverImage: string | null | undefined
): coverImage is string {
  if (
    !coverImage ||
    coverImage.length > MAX_MMS_COVER_PATH_LENGTH ||
    !MMS_COVER_IMAGE_PATH.test(coverImage)
  ) {
    return false
  }

  return coverImage
    .split('/')
    .slice(2)
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}
