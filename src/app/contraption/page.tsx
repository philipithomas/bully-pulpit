import type { Metadata } from 'next'
import Image from 'next/image'
import { InfinitePostGrid } from '@/components/posts/infinite-post-grid'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'

export const metadata: Metadata = {
  title: 'Contraption',
  description: siteConfig.newsletters.contraption.tagline,
}

export default function ContraptionPage() {
  const posts = getPostsByNewsletter('contraption')

  return (
    <div className="bg-offwhite">
      <div className="container py-12 md:py-16">
        <div className="mb-12">
          <Image
            src="/images/contraption.svg"
            alt="Contraption"
            width={300}
            height={48}
            className="h-8 md:h-10 w-auto"
            priority
          />
          <h1 className="sr-only">Contraption</h1>
          <p className="font-serif text-lg text-gray-600 mt-3">
            {siteConfig.newsletters.contraption.tagline}
          </p>
        </div>
        <InfinitePostGrid initialPosts={posts} newsletter="contraption" />
      </div>
    </div>
  )
}
