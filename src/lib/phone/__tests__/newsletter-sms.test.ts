import { describe, expect, it } from 'vitest'
import type { Post } from '@/lib/content/types'
import {
  newsletterSmsMediaUrl,
  renderNewsletterSms,
} from '@/lib/phone/newsletter-sms'

function post(input?: Partial<Post>): Post {
  return {
    slug: 'first-photo',
    newsletter: 'tsundoku',
    frontmatter: {
      title: 'First photo',
      publishedAt: '2026-06-24',
      coverImage: '/images/covers/tsundoku/selfie.jpg',
      coverImageAlt: 'A mirror selfie',
      featured: false,
      draft: false,
    },
    content: '',
    excerpt: '',
    ...input,
  }
}

describe('newsletter SMS', () => {
  it('renders the attributed post link and compliance footer', () => {
    expect(renderNewsletterSms(post())).toBe(
      'Tsundoku: First photo\nhttps://www.philipithomas.com/first-photo?utm_source=sms\n\nReply STOP to unsubscribe.'
    )
  })

  it('attaches a versioned normalized cover for photography newsletters', () => {
    expect(newsletterSmsMediaUrl(post())).toBe(
      'https://www.philipithomas.com/api/phone/newsletter-cover/first-photo?v=%2Fimages%2Fcovers%2Ftsundoku%2Fselfie.jpg'
    )
  })

  it('does not attach covers for ordinary newsletters', () => {
    expect(
      newsletterSmsMediaUrl(post({ newsletter: 'contraption' }))
    ).toBeUndefined()
  })

  it('falls back to SMS when a photography post has no cover', () => {
    expect(
      newsletterSmsMediaUrl(
        post({
          frontmatter: {
            title: 'No cover',
            publishedAt: '2026-06-24',
            featured: false,
            draft: false,
          },
        })
      )
    ).toBeUndefined()
  })

  it('falls back to SMS when a cover cannot use the normalized local route', () => {
    expect(
      newsletterSmsMediaUrl(
        post({
          frontmatter: {
            ...post().frontmatter,
            coverImage: 'https://images.example.com/cover.jpg',
          },
        })
      )
    ).toBeUndefined()
  })

  it('rejects a cover path that escapes the public images directory', () => {
    expect(
      newsletterSmsMediaUrl(
        post({
          frontmatter: {
            ...post().frontmatter,
            coverImage: '/images/../private/cover.jpg',
          },
        })
      )
    ).toBeUndefined()
  })
})
