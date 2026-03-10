import type { Metadata } from 'next'
import { PostGrid } from '@/components/posts/post-grid'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'

export const metadata: Metadata = {
  title: 'Workshop',
  description: siteConfig.newsletters.workshop.tagline,
}

export default function WorkshopPage() {
  const posts = getPostsByNewsletter('workshop')

  return (
    <div className="bg-offwhite-warm">
      <div className="bg-gray-850 py-10 md:py-14">
        <div className="container">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white">
            Workshop
          </h1>
          <p className="font-serif text-lg text-gray-400 mt-3">
            {siteConfig.newsletters.workshop.tagline}
          </p>
        </div>
      </div>
      <div className="container py-12 md:py-16">
        <PostGrid posts={posts} />
      </div>
    </div>
  )
}
