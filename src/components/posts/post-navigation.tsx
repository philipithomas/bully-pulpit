import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { accentHoverText } from '@/components/posts/newsletter-accent'
import { coverPreloadAttrs } from '@/lib/content/cover-preload'
import type { Post } from '@/lib/content/types'

interface PostNavigationProps {
  previous: Post | null
  next: Post | null
}

/**
 * Quiet previous/next navigation between posts in the same newsletter.
 * Previous is the older post, next is the newer one. When only one
 * neighbor exists it renders alone at full width, with no empty cell.
 */
export function PostNavigation({ previous, next }: PostNavigationProps) {
  if (!previous && !next) return null

  const both = previous && next

  return (
    <nav
      aria-label="Adjacent posts"
      className="mx-auto max-w-2xl border-t border-gray-200 mt-12 pt-8"
    >
      <div
        className={
          both ? 'grid grid-cols-1 sm:grid-cols-2 gap-8' : 'grid grid-cols-1'
        }
      >
        {previous && <NavCell post={previous} direction="previous" />}
        {next && <NavCell post={next} direction="next" />}
      </div>
    </nav>
  )
}

function NavCell({
  post,
  direction,
}: {
  post: Post
  direction: 'previous' | 'next'
}) {
  const isNext = direction === 'next'
  // The arrow nudges toward its direction and takes the newsletter accent on
  // hover, tying the directional cue to the tinted title beneath it.
  const arrowClass = `w-3.5 h-3.5 transition-all duration-500 ease-in-out ${
    accentHoverText[post.newsletter]
  } ${isNext ? 'group-hover:translate-x-1' : 'group-hover:-translate-x-1'}`

  return (
    <Link
      href={`/${post.slug}`}
      rel={isNext ? 'next' : 'prev'}
      className={`group flex flex-col no-underline ${
        isNext ? 'sm:items-end sm:text-right' : ''
      }`}
      {...coverPreloadAttrs(post)}
    >
      <span className="flex items-center gap-2 font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-2">
        {isNext ? (
          <>
            Next
            <ArrowRight aria-hidden="true" className={arrowClass} />
          </>
        ) : (
          <>
            <ArrowLeft aria-hidden="true" className={arrowClass} />
            Previous
          </>
        )}
      </span>
      <span
        className={`font-sans text-lg font-semibold text-gray-950 text-pretty ${accentHoverText[post.newsletter]} transition-colors duration-500`}
      >
        {post.frontmatter.title}
      </span>
    </Link>
  )
}
