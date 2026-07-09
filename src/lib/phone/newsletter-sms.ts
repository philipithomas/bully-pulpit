import { siteConfig } from '@/lib/config'
import type { Post } from '@/lib/content/types'

const MAX_SMS_BODY_LENGTH = 1500
const STOP_FOOTER = 'Reply STOP to unsubscribe.'

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
  const prefix = `${newsletter}: `
  const title = trimForSms(
    post.frontmatter.title,
    MAX_SMS_BODY_LENGTH - prefix.length - suffix.length
  )
  return `${prefix}${title}${suffix}`
}
