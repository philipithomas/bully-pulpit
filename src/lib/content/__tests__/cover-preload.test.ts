import { describe, expect, it } from 'vitest'
import {
  coverPreloadAttrs,
  POST_COVER_SIZES,
  postCoverSizes,
} from '@/lib/content/cover-preload'

describe('post cover preload sizing', () => {
  it('uses the portrait Tidbits cap for the image and hover preload', () => {
    const post = {
      newsletter: 'tidbits',
      frontmatter: { coverImage: '/images/covers/tidbits/jackknife.jpg' },
      coverDimensions: { width: 3360, height: 5120 },
    }
    const sizes =
      '(max-width: 640px) calc(100vw - 2rem), min(calc(100vw - 4rem), 52.5svh)'

    expect(postCoverSizes(post)).toBe(sizes)
    expect(coverPreloadAttrs(post)['data-cover-sizes']).toBe(sizes)
  })

  it('preserves the existing landscape cover sizes', () => {
    const post = {
      newsletter: 'tidbits',
      frontmatter: { coverImage: '/images/covers/tidbits/swivel.jpg' },
      coverDimensions: { width: 5120, height: 2926 },
    }

    expect(postCoverSizes(post)).toBe(POST_COVER_SIZES)
    expect(coverPreloadAttrs(post)['data-cover-sizes']).toBe(POST_COVER_SIZES)
  })
})
