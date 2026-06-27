import { describe, expect, it } from 'vitest'
import { getAdjacentPosts, getPostsByNewsletter } from '@/lib/content/loader'
import { NEWSLETTERS } from '@/lib/content/types'

describe('getAdjacentPosts', () => {
  // Posts from getPostsByNewsletter sort newest first.
  const contraption = getPostsByNewsletter('contraption')

  it('has enough contraption posts to test both ends and the middle', () => {
    expect(contraption.length).toBeGreaterThanOrEqual(3)
  })

  it('newest post has no next and the second-newest as previous', () => {
    const newest = contraption[0]
    const { previous, next } = getAdjacentPosts(newest.slug)
    expect(next).toBeNull()
    expect(previous?.slug).toBe(contraption[1].slug)
  })

  it('oldest post has no previous and the second-oldest as next', () => {
    const oldest = contraption[contraption.length - 1]
    const { previous, next } = getAdjacentPosts(oldest.slug)
    expect(previous).toBeNull()
    expect(next?.slug).toBe(contraption[contraption.length - 2].slug)
  })

  it('middle post links to both neighbors in sorted order', () => {
    const middle = contraption[1]
    const { previous, next } = getAdjacentPosts(middle.slug)
    expect(next?.slug).toBe(contraption[0].slug)
    expect(previous?.slug).toBe(contraption[2].slug)
  })

  it('previous is older and next is newer', () => {
    const middle = contraption[1]
    const { previous, next } = getAdjacentPosts(middle.slug)
    const middleTime = new Date(middle.frontmatter.publishedAt).getTime()
    expect(
      new Date(previous!.frontmatter.publishedAt).getTime()
    ).toBeLessThanOrEqual(middleTime)
    expect(
      new Date(next!.frontmatter.publishedAt).getTime()
    ).toBeGreaterThanOrEqual(middleTime)
  })

  it('stays within the same newsletter', () => {
    // The loader reads MDX from disk on every call, so sample the ends
    // and the middle of each newsletter instead of every post.
    for (const newsletter of NEWSLETTERS) {
      const posts = getPostsByNewsletter(newsletter)
      const samples = [
        posts[0],
        posts[Math.floor(posts.length / 2)],
        posts[posts.length - 1],
      ]
      for (const post of samples) {
        const { previous, next } = getAdjacentPosts(post.slug)
        if (previous) expect(previous.newsletter).toBe(newsletter)
        if (next) expect(next.newsletter).toBe(newsletter)
      }
    }
  })

  it('returns nulls for an unknown slug', () => {
    expect(getAdjacentPosts('this-slug-does-not-exist')).toEqual({
      previous: null,
      next: null,
    })
  })
})
