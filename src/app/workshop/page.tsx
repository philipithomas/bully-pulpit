import type { Metadata } from 'next'
import Image from 'next/image'
import { InfinitePostGrid } from '@/components/posts/infinite-post-grid'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'

export const metadata: Metadata = {
  title: 'Workshop',
  description: siteConfig.newsletters.workshop.tagline,
  alternates: { canonical: '/workshop' },
}

export default function WorkshopPage() {
  // Slim DTO for the client component — keeps the raw MDX `content` out of
  // the serialized RSC payload
  const posts = getPostsByNewsletter('workshop')
    .slice(0, 24)
    .map(({ slug, newsletter, frontmatter, excerpt, coverDimensions }) => ({
      slug,
      newsletter,
      frontmatter,
      excerpt,
      coverDimensions,
    }))

  return (
    <div className="bg-offwhite-warm" data-bg="offwhite-warm">
      <div className="bg-gray-850 py-10 md:py-14">
        <div className="container flex flex-col items-center text-center">
          <Image
            src="/images/workshop.svg"
            alt="Workshop"
            width={200}
            height={48}
            className="h-10 md:h-12 w-auto mx-auto workshop-logo-light"
            priority
          />
          <h1 className="sr-only">Workshop</h1>
          <p className="font-serif text-lg text-gray-400 mt-3">
            {siteConfig.newsletters.workshop.tagline}
          </p>
        </div>
      </div>
      <div className="container py-12 md:py-16">
        {/* priorityCount matches the lg:grid-cols-3 top row above the fold */}
        <InfinitePostGrid
          initialPosts={posts}
          newsletter="workshop"
          priorityCount={3}
        />
      </div>
    </div>
  )
}
