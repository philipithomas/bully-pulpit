import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { accentHoverText } from '@/components/posts/newsletter-accent'
import { coverPreloadAttrs } from '@/lib/content/cover-preload'
import type { Post } from '@/lib/content/types'

/** Matches the photo gallery's swipe direction, including circular endpoints. */
export function PhotoPostNavigation({
  older,
  newer,
}: {
  older: Post | null
  newer: Post | null
}) {
  if (!older || !newer) return null

  return (
    <nav aria-label="Photo navigation" className="mx-auto mt-16 max-w-2xl">
      <div className="grid grid-cols-2 gap-8">
        <PhotoNavCell post={newer} direction="newer" />
        <PhotoNavCell post={older} direction="older" />
      </div>
    </nav>
  )
}

function PhotoNavCell({
  post,
  direction,
}: {
  post: Post
  direction: 'older' | 'newer'
}) {
  const isOlder = direction === 'older'
  const arrowClass = `h-3.5 w-3.5 transition-all duration-500 ease-in-out ${
    accentHoverText[post.newsletter]
  } ${isOlder ? 'group-hover:translate-x-1' : 'group-hover:-translate-x-1'}`

  return (
    <Link
      href={`/${post.slug}#photo`}
      className={`group flex flex-col no-underline ${isOlder ? 'items-end text-right' : ''}`}
      {...coverPreloadAttrs(post)}
    >
      <span className="mb-2 flex items-center gap-2 font-sans text-sm text-gray-500">
        {isOlder ? (
          <>
            Older
            <ArrowRight aria-hidden="true" className={arrowClass} />
          </>
        ) : (
          <>
            <ArrowLeft aria-hidden="true" className={arrowClass} />
            Newer
          </>
        )}
      </span>
      <span
        className={`text-pretty font-sans text-lg font-semibold text-gray-950 ${accentHoverText[post.newsletter]} transition-colors duration-500`}
      >
        {post.frontmatter.title}
      </span>
    </Link>
  )
}
