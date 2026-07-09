import { SetNewsletter } from '@/components/layout/newsletter-context'
import { StargazingTable } from '@/components/pages/stargazing-table'
import { JsonLd } from '@/components/seo/json-ld'
import type { Page } from '@/lib/content/types'
import {
  stargazingFavorites,
  stargazingRestaurants,
  stargazingStats,
} from '@/lib/stargazing/restaurants'

const MICHELIN_GUIDE_URL = 'https://guide.michelin.com/en/restaurants'
const WORLDS_BEST_URL =
  'https://www.theworlds50best.com/restaurants/best-in-the-world/previous-list/'
const RULE_LINK_CLASS =
  'underline decoration-gray-300 underline-offset-2 hover:text-gray-950 hover:decoration-gray-900'

const countingRules = [
  {
    id: 'once',
    content: 'I count each restaurant once, no matter how often I return.',
  },
  {
    id: 'michelin',
    content: (
      <>
        Michelin stars reflect the rating in the{' '}
        <a
          href={MICHELIN_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={RULE_LINK_CLASS}
        >
          Michelin Guide
        </a>{' '}
        at the time I visited, with some grace for nearby promotions and places
        the Guide reached later.
      </>
    ),
  },
  {
    id: 'world',
    content: (
      <>
        World rankings reflect the list in the{' '}
        <a
          href={WORLDS_BEST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={RULE_LINK_CLASS}
        >
          World’s 50 Best archives
        </a>{' '}
        at the time I visited.
      </>
    ),
  },
]

export function StargazingPage({ page }: { page: Page }) {
  return (
    <article className="bg-gray-050" data-bg="gray-050">
      <SetNewsletter newsletter={null} />
      <JsonLd type="webpage" page={page} />

      <div className="container py-12 md:py-16 lg:py-20">
        <header className="max-w-4xl">
          <h1 className="font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-7xl">
            {page.frontmatter.title}
          </h1>
          <p className="mt-6 max-w-2xl font-serif text-gray-700 text-xl leading-relaxed sm:text-2xl">
            I enjoy fine dining as a lens to explore local culture and
            craftspeople performing at the highest level.
          </p>
        </header>

        <p className="my-12 max-w-4xl font-serif text-2xl text-gray-950 leading-snug sm:text-3xl md:my-16 md:text-4xl">
          I have eaten at{' '}
          <span className="font-mono font-semibold text-forest tabular-nums">
            {stargazingStats.starredRestaurants}
          </span>{' '}
          Michelin-starred restaurants, totaling{' '}
          <span className="font-mono font-semibold text-walnut tabular-nums">
            {stargazingStats.stars}
          </span>{' '}
          stars.{' '}
          <span className="font-mono font-semibold text-indigo tabular-nums">
            {stargazingStats.numberOneRestaurants}
          </span>{' '}
          were ranked No. 1 in the world when I visited.
        </p>

        <section className="grid gap-7 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-12">
          <div>
            {/* biome-ignore lint/correctness/useUniqueElementIds: stable indexed section anchor */}
            <h2
              id="how-i-count"
              className="scroll-mt-14 font-sans font-semibold text-2xl text-gray-950 tracking-tight"
            >
              How I count
            </h2>
            <p className="mt-2 font-mono text-gray-500 text-xs">
              {stargazingStats.restaurants} restaurants, one line each
            </p>
          </div>
          <div className="max-w-3xl">
            <ol className="space-y-5">
              {countingRules.map((rule, index) => (
                <li key={rule.id} className="flex gap-4">
                  <span className="mt-1 shrink-0 font-mono text-brass text-xs">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="font-serif text-gray-700 text-lg leading-relaxed">
                    {rule.content}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* biome-ignore lint/correctness/useUniqueElementIds: stable search-result anchor */}
        <div id="restaurants" className="mt-14 scroll-mt-14 md:mt-20">
          <StargazingTable restaurants={stargazingRestaurants} />
        </div>

        <section className="mt-16 max-w-3xl md:mt-24">
          {/* biome-ignore lint/correctness/useUniqueElementIds: stable indexed section anchor */}
          <h2
            id="my-personal-top-list"
            className="scroll-mt-14 font-sans font-semibold text-2xl text-gray-950 tracking-tight"
          >
            My personal top list
          </h2>
          <ol className="mt-6 grid gap-x-12 gap-y-4 sm:grid-cols-2">
            {stargazingFavorites.map((restaurant, index) => (
              <li key={restaurant} className="flex items-baseline gap-3">
                <span className="font-mono text-brass text-xs">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="font-serif text-gray-700 text-lg">
                  {restaurant}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  )
}
