'use client'

import { PostCard, type PostSummary } from '@/components/posts/post-card'
import { Spinner } from '@/components/ui/spinner'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'

export function InfinitePostGrid({
  initialPosts,
  newsletter,
  skip = 0,
  priorityCount = 0,
}: {
  initialPosts: PostSummary[]
  newsletter: string
  skip?: number
  priorityCount?: number
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
            ref={i === posts.length - 1 ? lastPostRef : undefined}
          >
            <PostCard
              post={post}
              priority={i === 0 && priorityCount > 0}
              eager={i < priorityCount}
            />
          </div>
        ))}
      </div>
      {loading && (
        <div role="status" className="flex justify-center py-8">
          <Spinner className="h-6 w-6 text-gray-500" />
          <span className="sr-only">Loading more posts</span>
        </div>
      )}
    </>
  )
}
