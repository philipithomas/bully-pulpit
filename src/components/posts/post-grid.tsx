import { PostCard } from '@/components/posts/post-card'
import type { Post } from '@/lib/content/types'

export function PostGrid({ posts }: { posts: Post[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
      {posts.map((post) => (
        <div key={post.slug} className="reveal">
          <PostCard post={post} />
        </div>
      ))}
    </div>
  )
}
