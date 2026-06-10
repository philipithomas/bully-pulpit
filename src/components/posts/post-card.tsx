import { format, parseISO } from 'date-fns'
import Image from 'next/image'
import Link from 'next/link'
import type { Post } from '@/lib/content/types'

// Minimal shape PostCard consumes. Listing pages map full Post objects to
// this before crossing the server→client boundary so the raw MDX body
// (`content`) never lands in the RSC payload.
export type PostSummary = Pick<
  Post,
  'slug' | 'newsletter' | 'frontmatter' | 'excerpt'
>

export function PostCard({
  post,
  priority = false,
}: {
  post: PostSummary
  priority?: boolean
}) {
  return (
    <article className="group bg-offwhite-light border border-gray-100 rounded-sm overflow-hidden h-full">
      <Link href={`/${post.slug}`} className="block h-full">
        {post.frontmatter.coverImage && (
          <div className="relative overflow-hidden aspect-[3/2]">
            <Image
              src={post.frontmatter.coverImage}
              alt={post.frontmatter.coverImageAlt ?? post.frontmatter.title}
              fill
              priority={priority}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        )}
        <div className="p-4 md:p-5">
          <time className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500">
            {format(parseISO(post.frontmatter.publishedAt), 'yyyy-MM-dd')}
          </time>
          <h2 className="text-lg font-semibold text-gray-950 group-hover:text-forest transition-colors mt-1">
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
