import Image from 'next/image'
import Link from 'next/link'
import { accentHoverText } from '@/components/posts/newsletter-accent'
import { coverPreloadAttrs } from '@/lib/content/cover-preload'
import type { Post } from '@/lib/content/types'

// Minimal shape PostCard consumes. Listing pages map full Post objects to
// this before crossing the server→client boundary so the raw MDX body
// (`content`) never lands in the RSC payload.
export type PostSummary = Pick<
  Post,
  'slug' | 'newsletter' | 'frontmatter' | 'excerpt' | 'coverDimensions'
>

export function PostCard({
  post,
  priority = false,
  eager = false,
}: {
  post: PostSummary
  /** Head-preload the cover (LCP candidate, first card only) */
  priority?: boolean
  /** Load the cover eagerly at high fetch priority, without a preload */
  eager?: boolean
}) {
  return (
    <article className="group bg-offwhite-light border border-gray-100 rounded-sm overflow-hidden h-full">
      <Link
        href={`/${post.slug}`}
        className="block h-full"
        {...coverPreloadAttrs(post)}
      >
        {post.frontmatter.coverImage && (
          <div className="relative overflow-hidden aspect-[3/2]">
            <Image
              src={post.frontmatter.coverImage}
              alt={post.frontmatter.coverImageAlt ?? post.frontmatter.title}
              fill
              priority={priority}
              loading={!priority && eager ? 'eager' : undefined}
              // Next 16 priority only preloads; the high fetch priority for
              // above-the-fold cards must be set explicitly
              fetchPriority={priority || eager ? 'high' : undefined}
              className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        )}
        <div className="p-4 md:p-5">
          <time className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500">
            {post.frontmatter.publishedAt}
          </time>
          <h2
            className={`text-lg font-semibold text-gray-950 ${accentHoverText[post.newsletter]} transition-colors duration-500 mt-1`}
          >
            {post.frontmatter.title}
          </h2>
          {(post.frontmatter.subtitle || post.frontmatter.description) && (
            <p className="font-serif text-sm text-gray-600 mt-1">
              {post.frontmatter.subtitle || post.frontmatter.description}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}
