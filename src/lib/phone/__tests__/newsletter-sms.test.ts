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
      'New Tsundoku post:\nFirst photo\nhttps://www.philipithomas.com/first-photo?utm_source=sms\n\n(Reply STOP to unsubscribe.)'
    )
  })

  it('labels a Workshop post before its title', () => {
    expect(
      renderNewsletterSms(
        post({
          slug: 'adding-sms-support',
          newsletter: 'workshop',
          frontmatter: {
            ...post().frontmatter,
            title: 'Adding SMS support',
          },
        })
      )
    ).toBe(
      'New Workshop post:\nAdding SMS support\nhttps://www.philipithomas.com/adding-sms-support?utm_source=sms\n\n(Reply STOP to unsubscribe.)'
    )
  })

  it('preserves lowercase tidbits and attaches its cover', () => {
    const tidbitsPost = post({
      slug: 'sfmoma',
      newsletter: 'tidbits',
      frontmatter: {
        ...post().frontmatter,
        title: 'SFMOMA',
        publishedAt: '2026-07-11',
        coverImage: '/images/covers/tidbits/sfmoma.jpg',
      },
    })

    expect(renderNewsletterSms(tidbitsPost)).toBe(
      'New tidbits post:\nSFMOMA\nhttps://www.philipithomas.com/sfmoma?utm_source=sms\n\n(Reply STOP to unsubscribe.)'
    )
    expect(newsletterSmsMediaUrl(tidbitsPost)).toBe(
      'https://www.philipithomas.com/api/phone/newsletter-cover/sfmoma?v=%2Fimages%2Fcovers%2Ftidbits%2Fsfmoma.jpg'
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

  it.each([
    'cover.avif',
    'cover.webp',
  ])('falls back to SMS for a Twilio-incompatible %s cover', (filename) => {
    expect(
      newsletterSmsMediaUrl(
        post({
          frontmatter: {
            ...post().frontmatter,
            coverImage: `/images/covers/tsundoku/${filename}`,
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
