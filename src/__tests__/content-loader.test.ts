import { describe, expect, it } from 'vitest'
import {
  getAllPosts,
  getPageBySlug,
  getPages,
  getPostBySlug,
  getPostsByNewsletter,
} from '@/lib/content/loader'

describe('content loader', () => {
  it('loads all posts', () => {
    const posts = getAllPosts()
    expect(posts.length).toBeGreaterThan(0)
  })

  it('loads contraption posts', () => {
    const posts = getPostsByNewsletter('contraption')
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      expect(post.newsletter).toBe('contraption')
    }
  })

  it('loads workshop posts', () => {
    const posts = getPostsByNewsletter('workshop')
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      expect(post.newsletter).toBe('workshop')
    }
  })

  it('loads postcard posts', () => {
    const posts = getPostsByNewsletter('postcard')
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      expect(post.newsletter).toBe('postcard')
    }
  })

  it('finds post by slug', () => {
    const post = getPostBySlug('hello-contraption')
    expect(post).not.toBeNull()
    expect(post!.frontmatter.title).toBe('Building in Public')
  })

  it('loads pages', () => {
    const pages = getPages()
    expect(pages.length).toBeGreaterThan(0)
  })

  it('finds page by slug', () => {
    const page = getPageBySlug('terms')
    expect(page).not.toBeNull()
    expect(page!.frontmatter.title).toBe('Terms of Service')
  })

  it('returns null for missing slug', () => {
    expect(getPostBySlug('nonexistent')).toBeNull()
  })

  it('posts are sorted by date descending', () => {
    const posts = getAllPosts()
    for (let i = 1; i < posts.length; i++) {
      expect(
        new Date(posts[i - 1].frontmatter.publishedAt).getTime()
      ).toBeGreaterThanOrEqual(
        new Date(posts[i].frontmatter.publishedAt).getTime()
      )
    }
  })
})
