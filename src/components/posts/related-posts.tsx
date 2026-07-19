import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { accentHoverText } from '@/components/posts/newsletter-accent'
import { coverPreloadAttrs } from '@/lib/content/cover-preload'
import type { Newsletter, Post } from '@/lib/content/types'

const accentBg: Record<Newsletter, string> = {
  contraption: 'bg-forest',
  workshop: 'bg-walnut',
  postcard: 'bg-indigo',
  tidbits: 'bg-tidbits',
  tsundoku: 'bg-sun',
}

interface RelatedPostsProps {
  posts: Post[]
}

export function RelatedPosts({ posts }: RelatedPostsProps) {
  // The grid is a wider visual coda, so it takes the largest break in the
  // end-of-post stack: the sections above step at mt-16 and the related
  // posts breathe further away. The step softens on mobile where the grid
  // stacks to one column.
  return (
    <div className="mx-auto max-w-5xl mt-20 md:mt-28">
      {/* No visible label: whitespace separates the cards from the post.
          The sr-only heading keeps the section named for screen readers. */}
      <h3 className="sr-only">Keep reading</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts.map((post) => {
          return (
            <Link
              key={post.slug}
              href={`/${post.slug}`}
              className="group flex flex-col bg-offwhite-dark border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all duration-500 ease-in-out no-underline"
              {...coverPreloadAttrs(post)}
            >
              {/* Image area */}
              <div className="aspect-video overflow-hidden">
                {post.frontmatter.coverImage ? (
                  <Image
                    src={post.frontmatter.coverImage}
                    alt={
                      post.frontmatter.coverImageAlt ?? post.frontmatter.title
                    }
                    width={600}
                    height={338}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    sizes="(min-width: 768px) 33vw, 100vw"
                  />
                ) : (
                  <div
                    className={`w-full h-full ${accentBg[post.newsletter]}`}
                  />
                )}
              </div>

              {/* Content area */}
              <div className="flex flex-col flex-grow p-5 relative">
                <time className="font-mono text-xs text-gray-500 mb-2">
                  {post.frontmatter.publishedAt}
                </time>
                <h4
                  className={`font-sans text-lg font-semibold text-gray-950 ${accentHoverText[post.newsletter]} transition-colors duration-500 mb-2`}
                >
                  {post.frontmatter.title}
                </h4>
                {post.excerpt && (
                  <p className="font-serif text-sm text-gray-600 line-clamp-3">
                    {post.excerpt}
                  </p>
                )}
                <div className="absolute bottom-4 right-4 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 ease-in-out text-gray-500 w-4 h-4">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
