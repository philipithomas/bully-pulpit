'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Post } from '@/lib/content/types'

interface PostApiResponse {
  slug: string
  newsletter: string
  title: string
  description?: string
  publishedAt: string
  coverImage?: string
  excerpt: string
}

export function useInfiniteScroll(
  newsletter?: string,
  initialPosts: Post[] = [],
  skip = 0
) {
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const lastPostRef = useCallback(
    (node: HTMLElement | null) => {
      if (loading) return
      if (observerRef.current) observerRef.current.disconnect()

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore) {
            setPage((p) => p + 1)
          }
        },
        { rootMargin: '150px' }
      )

      if (node) observerRef.current.observe(node)
    },
    [loading, hasMore]
  )

  useEffect(() => {
    if (page === 1) return // Initial posts already loaded

    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: '24',
    })
    if (newsletter) params.set('newsletter', newsletter)
    if (skip) params.set('skip', String(skip))

    fetch(`/api/posts?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.posts.length === 0) {
          setHasMore(false)
        } else {
          setPosts((prev) => {
            const seen = new Set(prev.map((p) => p.slug))
            const newPosts = data.posts
              .filter((p: PostApiResponse) => !seen.has(p.slug))
              .map((p: PostApiResponse) => ({
                slug: p.slug,
                newsletter: p.newsletter,
                frontmatter: {
                  title: p.title,
                  description: p.description,
                  publishedAt: p.publishedAt,
                  coverImage: p.coverImage,
                },
                content: '',
                excerpt: p.excerpt,
              }))
            return [...prev, ...newPosts]
          })
          if (data.meta.page >= data.meta.totalPages) {
            setHasMore(false)
          }
        }
      })
      .finally(() => setLoading(false))
  }, [page, newsletter, skip])

  return { posts, loading, hasMore, lastPostRef }
}
