import type { Metadata } from 'next'
import { PostGrid } from '@/components/posts/post-grid'
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
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-gray-950">
            Contraption
          </h1>
          <p className="font-serif text-lg text-gray-600 mt-3">
            {siteConfig.newsletters.contraption.tagline}
          </p>
        </div>
        <PostGrid posts={posts} />
      </div>
    </div>
  )
}
