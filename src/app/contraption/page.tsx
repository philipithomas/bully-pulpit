import { format } from 'date-fns'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { InfinitePostGrid } from '@/components/posts/infinite-post-grid'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import type { Post } from '@/lib/content/types'

export const metadata: Metadata = {
  title: 'Contraption',
  description: siteConfig.newsletters.contraption.tagline,
}

function FeaturedCard({ post, large }: { post: Post; large?: boolean }) {
  return (
    <Link
      href={`/${post.slug}`}
      className="relative block group bg-offwhite-light border border-gray-100 rounded-sm overflow-hidden h-full"
    >
      {post.frontmatter.coverImage && (
        <div className="relative overflow-hidden aspect-[3/2]">
          <Image
            src={post.frontmatter.coverImage}
            alt={post.frontmatter.coverImageAlt ?? post.frontmatter.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            priority={large}
            sizes={large ? '(max-width: 1024px) 100vw, 66vw' : '33vw'}
          />
        </div>
      )}
      <div className="p-4 md:p-5">
        <time className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500">
          {format(new Date(post.frontmatter.publishedAt), 'yyyy-MM-dd')}
        </time>
        <h2
          className={`font-semibold tracking-tight text-gray-950 group-hover:text-forest transition-colors duration-300 mt-1 ${large ? 'text-2xl sm:text-3xl' : 'text-lg'}`}
        >
          {post.frontmatter.title}
        </h2>
        {(post.frontmatter.subtitle || post.frontmatter.description) && (
          <p
            className={`font-serif text-gray-600 mt-1 ${large ? 'text-base' : 'text-sm'}`}
          >
            {post.frontmatter.subtitle || post.frontmatter.description}
          </p>
        )}
      </div>
      <span className="absolute bottom-4 right-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <ArrowIcon className="w-5 h-5" />
      </span>
    </Link>
  )
}

export default function ContraptionPage() {
  const posts = getPostsByNewsletter('contraption')
  const featured = posts.slice(0, 3)
  const rest = posts.slice(3)

  return (
    <div className="bg-gray-050" data-bg="gray-050">
      <div className="container py-12 md:py-16">
        {/* Header */}
        <div className="mb-12 md:mb-16 flex flex-col items-center text-center">
          <Image
            src="/images/contraption.svg"
            alt="Contraption"
            width={300}
            height={48}
            className="h-10 md:h-12 w-auto"
            priority
          />
          <h1 className="sr-only">Contraption</h1>
          <p className="font-serif text-lg text-gray-600 mt-3">
            {siteConfig.newsletters.contraption.tagline}
          </p>
        </div>

        {/* Featured section: large left + two stacked right */}
        {featured.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-12 md:mb-16">
            {featured[0] && (
              <div className="lg:col-span-2">
                <FeaturedCard post={featured[0]} large />
              </div>
            )}
            {featured.length > 1 && (
              <div className="flex flex-col gap-6 md:gap-8">
                {featured[1] && <FeaturedCard post={featured[1]} />}
                {featured[2] && <FeaturedCard post={featured[2]} />}
              </div>
            )}
          </div>
        )}

        {/* Remaining posts */}
        {rest.length > 0 && (
          <InfinitePostGrid initialPosts={rest} newsletter="contraption" />
        )}
      </div>
    </div>
  )
}
