import Link from 'next/link'
import { ExploreBellButton } from '@/components/discovery/explore-bell-button'
import { type ExploreAccent, getExploreGroups } from '@/lib/discovery/explore'
import { publicAppPage } from '@/lib/public-pages'
import { createPublicPageMetadata } from '@/lib/seo/metadata'

const explorePage = publicAppPage('/explore')

export const metadata = createPublicPageMetadata({
  path: explorePage.path,
  title: explorePage.title,
  description: explorePage.description,
})

const accentClasses: Record<ExploreAccent, string> = {
  forest: 'bg-forest',
  tidbits: 'bg-tidbits-ink',
  walnut: 'bg-walnut',
  indigo: 'bg-indigo',
}

const destinationClassName =
  'group block w-full cursor-pointer py-4 text-left transition-colors hover:text-gray-950 sm:py-5'

function DestinationContents({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: string
}) {
  return (
    <>
      <span className="flex items-baseline justify-between gap-4">
        <span className="font-semibold text-base text-gray-900 transition-colors group-hover:text-gray-950">
          {title}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-gray-400 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-gray-700"
        >
          &rarr;
        </span>
      </span>
      <span className="mt-1.5 block max-w-prose font-serif text-sm text-gray-600 leading-relaxed sm:text-[15px]">
        {description}
      </span>
      {action ? (
        <span className="mt-2 block font-sans text-gray-500 text-xs">
          {action}
        </span>
      ) : null}
    </>
  )
}

export default function ExplorePage() {
  const groups = getExploreGroups()

  return (
    <div className="bg-offwhite" data-bg="offwhite">
      <div className="container py-10 sm:py-14 md:py-20">
        <div className="mx-auto max-w-5xl">
          <header className="max-w-2xl">
            <p className="mb-4 font-sans font-medium text-gray-500 text-sm">
              A map of the archive
            </p>
            <h1 className="font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl">
              Explore
            </h1>
            <p className="mt-5 max-w-xl font-serif text-lg text-gray-700 leading-relaxed sm:text-xl">
              Follow a thread through the writing, photographs, collections, and
              tools gathered here.
            </p>
          </header>

          <div className="mt-12 grid gap-x-12 gap-y-14 md:mt-16 md:grid-cols-2 md:gap-y-16 lg:gap-x-20">
            {groups.map((group) => {
              const headingId = `explore-${group.id}`
              return (
                <section key={group.id} aria-labelledby={headingId}>
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h2
                        id={headingId}
                        className="font-serif text-2xl text-gray-950"
                      >
                        {group.title}
                      </h2>
                      <p className="mt-2 max-w-sm text-sm text-gray-600 leading-relaxed">
                        {group.description}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`mt-2 size-2 shrink-0 ${accentClasses[group.accent]}`}
                    />
                  </div>

                  <ul className="mt-5 space-y-1">
                    {group.destinations.map((destination) => {
                      return (
                        <li
                          key={destination.id}
                          data-explore-destination={destination.id}
                        >
                          {destination.kind === 'bell' ? (
                            <ExploreBellButton className={destinationClassName}>
                              <DestinationContents
                                title={destination.title}
                                description={destination.description}
                                action="Open the assistant"
                              />
                            </ExploreBellButton>
                          ) : (
                            <Link
                              href={destination.href}
                              className={destinationClassName}
                            >
                              <DestinationContents
                                title={destination.title}
                                description={destination.description}
                              />
                            </Link>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>

          <aside className="mt-14 text-sm text-gray-600 leading-relaxed md:mt-20">
            Looking for a particular post? The{' '}
            <Link
              href="/sitemap"
              className="underline decoration-gray-400 underline-offset-4 transition-colors hover:text-gray-950"
            >
              sitemap
            </Link>{' '}
            remains the exhaustive chronological directory.
          </aside>
        </div>
      </div>
    </div>
  )
}
