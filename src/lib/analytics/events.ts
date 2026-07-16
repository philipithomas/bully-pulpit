import { track } from '@vercel/analytics'
import type { BellSuggestionKind } from '@/lib/chat/starter-questions'
import type { Newsletter } from '@/lib/content/types'
import { acceptingSubscriptionNewsletters } from '@/lib/newsletters'

export type AnalyticsPrimitive = string | number | boolean | null | undefined

export type AnalyticsNewsletter =
  | Newsletter
  | 'all'
  | 'multiple'
  | 'page'
  | 'unspecified'
  | 'unknown'

export type AnalyticsPlacement =
  | 'homepage'
  | 'post_footer'
  | 'newsletter_page'
  | 'sign_in_modal'
  | 'onboarding'
  | 'member_menu'
  | 'account'
  | 'unknown'

export type AnalyticsPageType =
  | 'home'
  | 'post'
  | 'newsletter'
  | 'content_page'
  | 'photography'
  | 'other'

export type QueryLengthBucket = '2-9' | '10-24' | '25-49' | '50+'
export type ResultCountBucket = '0' | '1-3' | '4-9' | '10+'
export type DurationBucket =
  | 'under_250ms'
  | '250-499ms'
  | '500-999ms'
  | '1-2s'
  | '3s_plus'
export type TurnBucket = '1' | '2' | '3-5' | '6-10' | '11+'

export interface AnalyticsEventProperties {
  'Search completed': {
    surface: 'site_search' | 'photography'
    query_length: QueryLengthBucket
    result_count: ResultCountBucket
    search_mode: 'hybrid' | 'lexical' | 'unknown'
    duration: DurationBucket
  }
  'Search result selected': {
    surface: 'site_search' | 'photography'
    rank: number
    result_type: 'post' | 'page' | 'image' | 'unknown'
    newsletter: AnalyticsNewsletter
  }
  'Search asked Bell': {
    had_results: boolean
    search_mode: 'hybrid' | 'lexical' | 'unknown'
  }
  'Newsletter signup submitted': {
    method: 'email' | 'google'
    placement: AnalyticsPlacement
    newsletter: AnalyticsNewsletter
    signed_in: boolean
  }
  'Newsletter verification sent': {
    method: 'email'
    placement: AnalyticsPlacement
    newsletter: AnalyticsNewsletter
    new_subscriber: boolean
  }
  'Newsletter signup completed': {
    method: 'email_code' | 'email_link' | 'google'
    placement: AnalyticsPlacement
    newsletter: AnalyticsNewsletter
    new_subscriber: boolean
  }
  'Newsletter preference submitted': {
    placement: AnalyticsPlacement
    newsletter: Newsletter
    subscribed: boolean
  }
  'Newsletter preference changed': {
    placement: AnalyticsPlacement
    newsletter: Newsletter
    subscribed: boolean
  }
  'SMS signup opened': {
    placement: AnalyticsPlacement
    newsletter: AnalyticsNewsletter
  }
  'Bell opened': {
    entry_source: 'header' | 'search' | 'onboarding' | 'other'
    signed_in: boolean
    page_type: AnalyticsPageType
  }
  'Bell message submitted': {
    surface: 'web'
    source: 'composer' | 'search_handoff' | 'suggestion'
    signed_in: boolean
    turn: TurnBucket
  }
  'Bell suggestion selected': {
    page_type: AnalyticsPageType
    suggestion: BellSuggestionKind
  }
  'Bell stopped': {
    surface: 'web'
    turn: TurnBucket
  }
  'Bell regenerated': {
    surface: 'web'
    turn: TurnBucket
  }
  'Bell new conversation': {
    surface: 'web'
    previous_turns: TurnBucket
  }
  'Bell citation selected': {
    surface: 'web' | 'sms'
    destination_type: 'post' | 'page' | 'image' | 'external' | 'unknown'
    newsletter: AnalyticsNewsletter
  }
  'Bell feedback submitted': {
    surface: 'web'
    rating: 'helpful' | 'not_helpful'
    turn: TurnBucket
    had_sources: boolean
  }
  'Bell reply finished': {
    surface: 'web' | 'sms'
    outcome: 'success' | 'error' | 'stopped'
    duration: DurationBucket
    finish_reason:
      | 'stop'
      | 'length'
      | 'content_filter'
      | 'tool_calls'
      | 'error'
      | 'other'
      | 'unknown'
    tool_used: boolean
    turn: TurnBucket
  }
}

export type AnalyticsEventName = keyof AnalyticsEventProperties

export type ClientAnalyticsEventName = Exclude<
  AnalyticsEventName,
  | 'Newsletter verification sent'
  | 'Newsletter preference changed'
  | 'Bell reply finished'
>

// Completion can be recorded from the server for code/Google verification or
// from the token-free landing page after a magic-link redirect. The other
// server events remain authoritative-only.
export type ServerAnalyticsEventName =
  | 'Newsletter verification sent'
  | 'Newsletter signup completed'
  | 'Newsletter preference changed'
  | 'Bell reply finished'

export function trackClientEvent<Name extends ClientAnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name]
): void {
  track(name, properties as Record<string, AnalyticsPrimitive>)
}

export function bucketQueryLength(length: number): QueryLengthBucket {
  if (length < 10) return '2-9'
  if (length < 25) return '10-24'
  if (length < 50) return '25-49'
  return '50+'
}

export function bucketResultCount(count: number): ResultCountBucket {
  if (count <= 0) return '0'
  if (count <= 3) return '1-3'
  if (count <= 9) return '4-9'
  return '10+'
}

export function bucketDuration(milliseconds: number): DurationBucket {
  if (milliseconds < 250) return 'under_250ms'
  if (milliseconds < 500) return '250-499ms'
  if (milliseconds < 1_000) return '500-999ms'
  if (milliseconds < 3_000) return '1-2s'
  return '3s_plus'
}

export function bucketTurn(turn: number): TurnBucket {
  if (turn <= 1) return '1'
  if (turn === 2) return '2'
  if (turn <= 5) return '3-5'
  if (turn <= 10) return '6-10'
  return '11+'
}

const ANALYTICS_PLACEMENTS = new Set<AnalyticsPlacement>([
  'homepage',
  'post_footer',
  'newsletter_page',
  'sign_in_modal',
  'onboarding',
  'member_menu',
  'account',
  'unknown',
])

export function parseAnalyticsPlacement(value: unknown): AnalyticsPlacement {
  return typeof value === 'string' &&
    ANALYTICS_PLACEMENTS.has(value as AnalyticsPlacement)
    ? (value as AnalyticsPlacement)
    : 'unknown'
}

export function summarizeNewsletters(
  newsletters: readonly string[] | undefined
): AnalyticsNewsletter {
  if (!newsletters || newsletters.length === 0) return 'unspecified'
  const unique = new Set(newsletters)
  if (
    unique.size === acceptingSubscriptionNewsletters.length &&
    acceptingSubscriptionNewsletters.every((newsletter) =>
      unique.has(newsletter)
    )
  ) {
    return 'all'
  }
  if (unique.size > 1) return 'multiple'
  const [newsletter] = unique
  if (
    newsletter === 'contraption' ||
    newsletter === 'workshop' ||
    newsletter === 'postcard' ||
    newsletter === 'umami' ||
    newsletter === 'tsundoku'
  ) {
    return newsletter
  }
  return 'unknown'
}

export function parseAnalyticsNewsletter(value: unknown): AnalyticsNewsletter {
  if (
    value === 'contraption' ||
    value === 'workshop' ||
    value === 'postcard' ||
    value === 'umami' ||
    value === 'tsundoku' ||
    value === 'page' ||
    value === 'all' ||
    value === 'multiple' ||
    value === 'unspecified'
  ) {
    return value
  }
  return 'unknown'
}

export function analyticsPageType(pathname: string): AnalyticsPageType {
  if (pathname === '/') return 'home'
  if (pathname === '/photography') return 'photography'
  if (
    pathname === '/contraption' ||
    pathname === '/workshop' ||
    pathname === '/postcard' ||
    pathname === '/umami' ||
    pathname === '/tsundoku'
  ) {
    return 'newsletter'
  }
  if (
    [
      '/audio',
      '/blogroll',
      '/colophon',
      '/contact',
      '/contraptions',
      '/diction',
      '/media',
      '/policies',
      '/privacy',
      '/terms',
    ].includes(pathname)
  ) {
    return 'content_page'
  }
  if (pathname.split('/').filter(Boolean).length === 1) return 'post'
  return 'other'
}
