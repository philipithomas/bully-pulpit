import { SetNewsletter } from '@/components/layout/newsletter-context'
import { CollectionIndex } from '@/components/pages/collection-index'
import { JsonLd } from '@/components/seo/json-ld'
import type { CollectionDefinition } from '@/lib/collections/model'
import type { Page } from '@/lib/content/types'

export function CollectionPage({
  collection,
  page,
}: {
  collection: CollectionDefinition
  page: Page
}) {
  return (
    <article className="bg-gray-050" data-bg="gray-050">
      <SetNewsletter newsletter={null} />
      <JsonLd type="webpage" page={page} />

      <div className="container py-12 md:py-16 lg:py-20">
        <header className="max-w-4xl">
          <p className="font-sans font-medium text-brass text-sm">
            Collected vocabulary
          </p>
          <h1 className="mt-3 font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-7xl">
            {collection.title}
          </h1>
          <p className="mt-6 max-w-2xl font-serif text-gray-700 text-xl leading-relaxed sm:text-2xl">
            {collection.description}
          </p>
        </header>

        <CollectionIndex collection={collection} />
      </div>
    </article>
  )
}
