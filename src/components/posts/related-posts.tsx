import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import type { Newsletter, Post } from '@/lib/content/types'

const accentClasses = {
  forest: { bg: 'bg-forest', hoverText: 'group-hover:text-forest' },
  walnut: { bg: 'bg-walnut', hoverText: 'group-hover:text-walnut' },
  indigo: { bg: 'bg-indigo', hoverText: 'group-hover:text-indigo' },
} as const

const newsletterColor: Record<Newsletter, keyof typeof accentClasses> = {
  contraption: 'forest',
  workshop: 'walnut',
  postcard: 'indigo',
}

interface RelatedPostsProps {
  posts: Post[]
}

export function RelatedPosts({ posts }: RelatedPostsProps) {
  return (
    <div className="mx-auto max-w-5xl mt-16">
      <h3 className="font-sans text-xs font-semibold tracking-[0.15em] uppercase text-gray-500 mb-8">
        Keep reading
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts.map((post) => {
          const color = newsletterColor[post.newsletter]
          const accent = accentClasses[color]

          return (
            <a
              key={post.slug}
              href={`/${post.slug}`}
              className="group flex flex-col bg-offwhite-dark border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all duration-500 ease-in-out no-underline"
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
                  <div className={`w-full h-full ${accent.bg}`} />
                )}
              </div>

              {/* Content area */}
              <div className="flex flex-col flex-grow p-5 border-t border-gray-100 relative">
                <time className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-2">
                  {format(new Date(post.frontmatter.publishedAt), 'yyyy-MM-dd')}
                </time>
                <h4
                  className={`font-sans text-lg font-semibold text-gray-950 ${accent.hoverText} transition-colors duration-500 mb-2`}
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
            </a>
          )
        })}
      </div>
    </div>
  )
}
