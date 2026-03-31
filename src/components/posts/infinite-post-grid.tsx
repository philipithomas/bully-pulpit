'use client'

import { PostCard } from '@/components/posts/post-card'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'
import type { Post } from '@/lib/content/types'

export function InfinitePostGrid({
  initialPosts,
  newsletter,
  skip = 0,
}: {
  initialPosts: Post[]
  newsletter: string
  skip?: number
}) {
  const { posts, loading, lastPostRef } = useInfiniteScroll(
    newsletter,
    initialPosts,
    skip
  )

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {posts.map((post, i) => (
          <div
            key={post.slug}
            className="reveal"
            ref={i === posts.length - 1 ? lastPostRef : undefined}
          >
            <PostCard post={post} />
          </div>
        ))}
      </div>
      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      )}
    </>
  )
}
