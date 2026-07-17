import { describe, expect, it } from 'vitest'
import {
  analyticsPageType,
  bucketDuration,
  bucketQueryLength,
  bucketResultCount,
  bucketTurn,
  parseAnalyticsNewsletter,
  parseAnalyticsPlacement,
  summarizeNewsletters,
} from '@/lib/analytics/events'

describe('analytics buckets', () => {
  it('keeps search measurements low cardinality', () => {
    expect(bucketQueryLength(2)).toBe('2-9')
    expect(bucketQueryLength(10)).toBe('10-24')
    expect(bucketQueryLength(50)).toBe('50+')
    expect(bucketResultCount(0)).toBe('0')
    expect(bucketResultCount(4)).toBe('4-9')
    expect(bucketResultCount(50)).toBe('10+')
    expect(bucketDuration(249)).toBe('under_250ms')
    expect(bucketDuration(999)).toBe('500-999ms')
    expect(bucketDuration(3_000)).toBe('3s_plus')
    expect(bucketTurn(1)).toBe('1')
    expect(bucketTurn(4)).toBe('3-5')
    expect(bucketTurn(99)).toBe('11+')
  })
})

describe('analytics dimensions', () => {
  it('rejects arbitrary placement values', () => {
    expect(parseAnalyticsPlacement('homepage')).toBe('homepage')
    expect(parseAnalyticsPlacement('onboarding')).toBe('onboarding')
    expect(parseAnalyticsPlacement('reader@example.com')).toBe('unknown')
    expect(parseAnalyticsPlacement(null)).toBe('unknown')
  })

  it('accepts only the fixed newsletter vocabulary', () => {
    expect(parseAnalyticsNewsletter('all')).toBe('all')
    expect(parseAnalyticsNewsletter('contraption')).toBe('contraption')
    expect(parseAnalyticsNewsletter('page')).toBe('page')
    expect(parseAnalyticsNewsletter('reader@example.com')).toBe('unknown')
  })

  it('summarizes newsletters without creating combinations as dimensions', () => {
    expect(summarizeNewsletters(undefined)).toBe('unspecified')
    expect(summarizeNewsletters(['workshop'])).toBe('workshop')
    expect(summarizeNewsletters(['workshop', 'postcard'])).toBe('multiple')
    expect(
      summarizeNewsletters(['contraption', 'workshop', 'postcard', 'umami'])
    ).toBe('all')
  })

  it('classifies pages into a small fixed vocabulary', () => {
    expect(analyticsPageType('/')).toBe('home')
    expect(analyticsPageType('/tsundoku')).toBe('newsletter')
    expect(analyticsPageType('/umami')).toBe('newsletter')
    expect(analyticsPageType('/photography')).toBe('photography')
    expect(analyticsPageType('/privacy')).toBe('content_page')
    expect(analyticsPageType('/a-post')).toBe('post')
    expect(analyticsPageType('/api/search')).toBe('other')
  })
})
