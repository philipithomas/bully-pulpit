import { Skeleton } from '@/components/ui/skeleton'

/**
 * Placeholder for the newsletter toggle rows on the account and
 * unsubscribe pages, mirroring the real row layout (logo or name, tagline,
 * checkbox) so the page does not shift when preferences arrive.
 */
export function NewsletterRowsSkeleton() {
  return (
    <div className="space-y-3">
      {['contraption', 'workshop', 'postcard', 'tsundoku'].map((key) => (
        <div
          key={key}
          className="flex items-center justify-between border border-gray-200 bg-white px-4 py-3"
        >
          <span className="flex items-center gap-3">
            <Skeleton className="h-4 w-[76px]" />
            <Skeleton className="hidden h-4 w-44 sm:block" />
          </span>
          <Skeleton className="h-4 w-4" />
        </div>
      ))}
    </div>
  )
}

/**
 * Whole-page placeholder for the preferences screens while the session or
 * unsubscribe token resolves. A static title keeps the page anchored when it
 * is known ("Account"); the unsubscribe page passes none because its final
 * heading depends on the token.
 */
export function PreferencesPageSkeleton({ title }: { title?: string }) {
  return (
    <div className="bg-offwhite min-h-[60vh]">
      <div className="container max-w-lg py-12 md:py-16">
        {title ? (
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950 mb-8">
            {title}
          </h1>
        ) : (
          <Skeleton className="mb-8 h-9 w-56" />
        )}

        <section className="mb-6">
          <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-3">
            Email
          </h2>
          <Skeleton className="h-5 w-56" />
        </section>

        <section className="mb-10">
          <h2 className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-gray-500 mb-4">
            Newsletters
          </h2>
          <NewsletterRowsSkeleton />
        </section>

        <div className="flex items-center justify-between border-t border-gray-200 pt-8">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    </div>
  )
}
