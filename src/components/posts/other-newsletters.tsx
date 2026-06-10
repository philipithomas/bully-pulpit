import { NewsletterRow } from '@/components/newsletters/newsletter-row'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'

/**
 * Quiet cross-promotion block at the end of a post: a line of lead-in prose
 * and the two newsletters the reader is not currently reading, each linking
 * to its index page. No signup form here; the subscribe CTA above has one.
 */
export function OtherNewsletters({ current }: { current: Newsletter }) {
  const others = Object.values(siteConfig.newsletters).filter(
    (nl) => nl.slug !== current
  )

  return (
    <aside className="mx-auto max-w-2xl mt-12">
      <p className="font-serif text-sm text-gray-500 mb-6">
        I also write two other newsletters:
      </p>
      <div className="space-y-4">
        {others.map((nl) => (
          <NewsletterRow key={nl.slug} newsletter={nl} />
        ))}
      </div>
    </aside>
  )
}
